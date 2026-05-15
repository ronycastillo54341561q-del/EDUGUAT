const db = require('../config/db');
const { cargarReglasAnio, resolverParaAlumno } = require('../utils/configPagosResolver');

const MESES_ORD = ['enero','febrero','marzo','abril','mayo','junio',
                   'julio','agosto','septiembre','octubre','noviembre','diciembre'];

/* ─── Consulta financiera ─────────────────────────────────────────────────
   Params:
     anio       – año a analizar
     operador   – 'mayor' | 'igual' | 'menor' | 'sin'
     mes_ref    – número 1-12 de referencia
     tac / horario / laboratorio / dia – filtros adicionales
   Lógica:
     mayor  → alumno tiene al menos un mes pagado > mes_ref
     igual  → alumno tiene el mes mes_ref pagado
     menor  → alumno tiene pagos, pero NINGUNO >= mes_ref
     sin    → sin filtro por pagos (devuelve todos los alumnos que pasen
              los filtros TAC/horario/día/laboratorio)
─────────────────────────────────────────────────────────────────────────── */
const getReporteFinanciero = async (req, res) => {
  const anio        = parseInt(req.query.anio)     || new Date().getFullYear();
  const operador    = req.query.operador            || 'igual';
  const mesRef      = parseInt(req.query.mes_ref)  || (new Date().getMonth() + 1);
  const tac         = req.query.tac        || '';
  const horario     = req.query.horario    || '';
  const laboratorio = req.query.laboratorio|| '';
  const dia         = req.query.dia        || '';

  const aConds  = ["al.estado='activo'"];
  const aParams = [];
  if (tac)         { aConds.push('al.tac=?');         aParams.push(tac); }
  if (horario)     { aConds.push('al.horario=?');      aParams.push(horario); }
  if (laboratorio) { aConds.push('al.laboratorio=?');  aParams.push(laboratorio); }
  if (dia)         { aConds.push('(al.dia_clases1=? OR al.dia_clases2=?)'); aParams.push(dia, dia); }

  // FIELD() devuelve 1-12 según posición en MESES_ORD (0 si no está).
  // Usamos LOWER(TRIM()) para tolerar casing/espacios distintos en datos
  // importados (ej. 'Enero', 'ENERO ', etc).
  const fieldExpr = `FIELD(LOWER(TRIM(m.mes)),'enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre')`;

  try {
    // Paso 1: obtener todos los alumnos activos con lista de números de meses pagados.
    // Un mes acreditado (gratis/beca) cuenta como pagado para efectos del filtro.
    const [rows] = await db.query(`
      SELECT
        al.id, al.clave, al.codigo_estudiante, al.nombre, al.apellido,
        al.telefono, al.encargado, al.establecimiento, al.tac,
        al.dia_clases1, al.dia_clases2, al.horario, al.laboratorio, al.cuota_mensual,
        GROUP_CONCAT(
          CASE WHEN (m.pagado=1 OR m.acreditado=1) AND m.anulado=0 AND ${fieldExpr} > 0
          THEN ${fieldExpr} END
          ORDER BY ${fieldExpr}
        ) AS meses_pagados_nums
      FROM alumnos al
      LEFT JOIN mensualidades m ON al.id=m.alumno_id AND m.anio=?
      WHERE ${aConds.join(' AND ')}
      GROUP BY al.id, al.clave, al.codigo_estudiante, al.nombre, al.apellido,
               al.telefono, al.encargado, al.establecimiento, al.tac,
               al.dia_clases1, al.dia_clases2, al.horario, al.laboratorio, al.cuota_mensual
      ORDER BY al.apellido, al.nombre
    `, [anio, ...aParams]);

    // Paso 2: parsear meses pagados y aplicar filtro
    const parsed = rows.map(r => ({
      ...r,
      _pagados: (r.meses_pagados_nums || '')
        .split(',').map(Number).filter(n => n > 0),
    }));

    let alumnos;
    if (operador === 'sin')
      // Sin filtro por pagos: solo aplican los filtros TAC/horario/día/lab.
      alumnos = parsed;
    else if (operador === 'mayor')
      alumnos = parsed.filter(a => a._pagados.some(m => m > mesRef));
    else if (operador === 'igual')
      alumnos = parsed.filter(a => a._pagados.includes(mesRef));
    else // menor
      alumnos = parsed.filter(a => !a._pagados.some(m => m >= mesRef));

    if (!alumnos.length) return res.json([]);
    const ids = alumnos.map(a => a.id);
    const idPh = ids.map(() => '?').join(',');

    // Paso 3: pagos anuales completos
    const [pagos] = await db.query(`
      SELECT alumno_id, mes, monto, pagado, anulado, no_recibo, fecha_pago,
             COALESCE(descuento_100, 0) AS descuento_100
      FROM mensualidades
      WHERE anio=? AND alumno_id IN (${idPh})
      ORDER BY FIELD(mes,'enero','febrero','marzo','abril','mayo','junio',
        'julio','agosto','septiembre','octubre','noviembre','diciembre')
    `, [anio, ...ids]);

    // Paso 4: asistencia anual completa
    const [asistencias] = await db.query(`
      SELECT alumno_id, mes, semana, estado
      FROM asistencia_semanal
      WHERE anio=? AND alumno_id IN (${idPh})
      ORDER BY alumno_id, mes, semana
    `, [anio, ...ids]);

    // Indexar pagos: { alumno_id: { 'enero': {...}, 'febrero': {...} } }
    const pagosMap = {};
    for (const p of pagos) {
      if (!pagosMap[p.alumno_id]) pagosMap[p.alumno_id] = {};
      pagosMap[p.alumno_id][p.mes] = {
        monto: parseFloat(p.monto),
        pagado: Boolean(p.pagado),
        anulado: Boolean(p.anulado),
        descuento: Boolean(p.descuento_100),
        no_recibo: p.no_recibo || '',
        fecha_pago: p.fecha_pago ? String(p.fecha_pago).slice(0,10) : null,
      };
    }

    // Indexar asistencia: { alumno_id: { mes_num: { semana: estado } } }
    const asistMap = {};
    for (const a of asistencias) {
      if (!asistMap[a.alumno_id]) asistMap[a.alumno_id] = {};
      if (!asistMap[a.alumno_id][a.mes]) asistMap[a.alumno_id][a.mes] = {};
      asistMap[a.alumno_id][a.mes][a.semana] = a.estado;
    }

    res.json(alumnos.map(a => ({
      id: a.id,
      clave: a.clave,
      codigo_estudiante: a.codigo_estudiante,
      nombre: a.nombre, apellido: a.apellido,
      telefono: a.telefono, encargado: a.encargado,
      establecimiento: a.establecimiento, tac: a.tac,
      dia_clases1: a.dia_clases1, dia_clases2: a.dia_clases2,
      horario: a.horario, laboratorio: a.laboratorio,
      cuota_mensual: parseFloat(a.cuota_mensual),
      pagados_rango: Number(a.pagados_rango),
      pendientes_rango: Number(a.pendientes_rango),
      pagos: pagosMap[a.id] || {},
      asistencia: asistMap[a.id] || {},
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al generar reporte financiero' });
  }
};

const buscarAlumnos = async (req, res) => {
  const q = `%${req.query.q || ''}%`;
  try {
    const [rows] = await db.query(
      `SELECT id, clave, codigo_estudiante, nombre, apellido, estado
       FROM alumnos
       WHERE nombre LIKE ? OR apellido LIKE ?
          OR CONCAT(nombre,' ',apellido) LIKE ?
          OR CONCAT(apellido,' ',nombre) LIKE ?
          OR clave LIKE ?
          OR codigo_estudiante LIKE ?
       ORDER BY apellido, nombre
       LIMIT 10`,
      [q, q, q, q, q, q]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error en búsqueda' });
  }
};

const getReporteAlumno = async (req, res) => {
  const { id } = req.params;
  const anio = parseInt(req.query.anio) || new Date().getFullYear();
  try {
    const [alumnoRows] = await db.query(
      `SELECT a.*, u.email FROM alumnos a
       LEFT JOIN usuarios u ON a.usuario_id = u.id
       WHERE a.id = ?`,
      [id]
    );
    if (!alumnoRows.length) return res.status(404).json({ message: 'Alumno no encontrado' });
    const alumno = alumnoRows[0];
    delete alumno.password;

    const [mecNotas] = await db.query(
      `SELECT * FROM mecanografia_notas WHERE alumno_id = ? ORDER BY anio DESC`,
      [id]
    );

    const [tacNotas] = await db.query(
      `SELECT * FROM notas_tac_anual WHERE alumno_id = ? ORDER BY anio ASC`,
      [id]
    );

    const [dipNotas] = await db.query(
      `SELECT * FROM diplomado_notas WHERE alumno_id = ? ORDER BY anio ASC, materia ASC`,
      [id]
    );

    const [pagos] = await db.query(
      `SELECT * FROM mensualidades WHERE alumno_id = ? AND anio = ?
       ORDER BY FIELD(mes,'enero','febrero','marzo','abril','mayo','junio',
       'julio','agosto','septiembre','octubre','noviembre','diciembre')`,
      [id, anio]
    );

    // Anota cada pago con esperado/multiplicador según la config del año.
    // Esto permite al frontend ocultar meses que no se cobran (ej. diciembre).
    const reglas = await cargarReglasAnio(anio);
    const cfg = resolverParaAlumno(alumno, reglas);
    for (const p of pagos) {
      const mesNum = MESES_ORD.indexOf(p.mes) + 1;
      const c = cfg[mesNum] || { esperado: true, multiplicador: 1 };
      p.esperado = c.esperado;
      p.multiplicador = c.multiplicador;
    }

    // La asistencia se filtra por el AÑO del reporte (no por el año actual
    // del sistema): si el usuario genera el reporte de Juan para 2024, debe
    // ver la asistencia de 2024.
    const [asistencia] = await db.query(
      `SELECT mes, semana, estado FROM asistencia_semanal
       WHERE alumno_id = ? AND anio = ?
       ORDER BY mes ASC, semana ASC`,
      [id, anio]
    );

    // Catálogo de diplomados con sus exámenes para que el frontend arme las
    // columnas reales de cada diplomado (en vez de tener una lista cableada
    // que no incluye, p. ej., "Windows" cuando ese examen sí existe en la
    // configuración).  Tolerante a entornos donde aún no existan las tablas.
    let diplomadosCatalogo = [];
    try {
      const [dips] = await db.query(
        `SELECT id, nombre FROM dip_diplomados WHERE activo=1 ORDER BY id`
      );
      const [exs] = await db.query(
        `SELECT diplomado_id, nombre, orden FROM dip_examenes
          WHERE activo=1 ORDER BY diplomado_id, orden, id`
      );
      const examMap = {};
      for (const e of exs) (examMap[e.diplomado_id] ||= []).push({ nombre: e.nombre, orden: e.orden });
      diplomadosCatalogo = dips.map(d => ({ ...d, examenes: examMap[d.id] || [] }));
    } catch (_) { /* tablas pueden no existir aún */ }

    res.json({
      alumno,
      mecanografia: mecNotas,
      tac: tacNotas,
      diplomados: dipNotas,
      diplomadosCatalogo,
      pagos,
      asistencia,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al generar reporte' });
  }
};

module.exports = { buscarAlumnos, getReporteAlumno, getReporteFinanciero };
