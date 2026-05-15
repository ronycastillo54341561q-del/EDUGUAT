const db = require('../config/db');
const { log } = require('../utils/bitacora');

// Todos los alumnos con su nota de diplomado
const getNotasDiplomados = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT
        al.id as alumno_id, al.nombre, al.apellido, al.clave, al.codigo_estudiante,
        al.estado, al.horario, al.laboratorio, al.dia_clases1, al.dia_clases2,
        al.diplomado,
        nd.id, nd.nota, nd.descripcion, nd.fecha
      FROM alumnos al
      LEFT JOIN notas_diplomados nd ON al.id = nd.alumno_id
      ORDER BY al.id ASC
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al obtener notas de diplomados' });
  }
};

// Guardar o actualizar nota de diplomado de un alumno
const guardarNotaDiplomado = async (req, res) => {
  const { alumno_id, nota, descripcion, fecha } = req.body;
  try {
    // Verificar si ya tiene nota
    const [existentes] = await db.query(
      'SELECT id FROM notas_diplomados WHERE alumno_id = ?',
      [alumno_id]
    );

    if (existentes.length > 0) {
      await db.query(
        'UPDATE notas_diplomados SET nota=?, descripcion=?, fecha=? WHERE alumno_id=?',
        [nota, descripcion || null, fecha || null, alumno_id]
      );
    } else {
      const [alumno] = await db.query('SELECT diplomado FROM alumnos WHERE id=?', [alumno_id]);
      await db.query(
        'INSERT INTO notas_diplomados (alumno_id, diplomado, nota, descripcion, fecha) VALUES (?, ?, ?, ?, ?)',
        [alumno_id, alumno[0]?.diplomado || '', nota, descripcion || null, fecha || null]
      );
    }
    res.json({ message: 'Nota de diplomado guardada correctamente' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al guardar nota de diplomado' });
  }
};

const getNotasDiplomadosAnual = async (req, res) => {
  const anio = parseInt(req.query.anio) || new Date().getFullYear();
  const estado = req.query.estado !== undefined ? req.query.estado : 'activo';
  const conds = [], params = [];
  if (estado !== '') { conds.push('al.estado=?'); params.push(estado); }
  if (req.query.horario)     { conds.push('al.horario=?');     params.push(req.query.horario); }
  if (req.query.laboratorio) { conds.push('al.laboratorio=?'); params.push(req.query.laboratorio); }
  if (req.query.dia)         { conds.push('(al.dia_clases1=? OR al.dia_clases2=?)'); params.push(req.query.dia, req.query.dia); }
  const where = conds.join(' AND ') || '1=1';
  try {
    const [alumnos] = await db.query(`
      SELECT al.id, al.clave, al.codigo_estudiante, al.nombre, al.apellido,
             al.estado, al.horario, al.laboratorio, al.dia_clases1, al.dia_clases2, al.diplomado
      FROM alumnos al WHERE ${where} ORDER BY al.id ASC
    `, params);
    if (!alumnos.length) return res.json([]);
    const ids = alumnos.map(a => a.id);
    const [notas] = await db.query(
      `SELECT alumno_id, materia, nota FROM diplomado_notas WHERE anio=? AND alumno_id IN (${ids.map(() => '?').join(',')})`,
      [anio, ...ids]
    );
    // Para soportar histórico (alumnos que cambiaron de diplomado entre años)
    // y exámenes con nombre duplicado entre diplomados (ej. "Parcial"),
    // necesitamos saber a qué diplomado pertenece cada nota.
    //
    // - Si el examen sólo existe en un diplomado, usamos ese.
    // - Si existe en varios, preferimos el diplomado ACTUAL del alumno
    //   (alumno.diplomado); si no coincide con ninguno, caemos al primero.
    //
    // Esto evita que la nota de "Parcial" de un alumno de Programador
    // aparezca también como histórica bajo Operador (o viceversa).
    let examPorDip = new Map();           // examName(lower) → [{diplomado_id, diplomado_nombre}]
    let diplomadosCatalogo = [];          // [{id, nombre}] para que el frontend
                                          // pueda nombrar pestañas históricas.
    try {
      const [exs] = await db.query(
        `SELECT e.nombre AS materia, e.diplomado_id, d.nombre AS diplomado_nombre
           FROM dip_examenes e JOIN dip_diplomados d ON d.id = e.diplomado_id
          WHERE e.activo=1 AND d.activo=1`
      );
      for (const r of exs) {
        const k = String(r.materia || '').trim().toLowerCase();
        if (!examPorDip.has(k)) examPorDip.set(k, []);
        examPorDip.get(k).push({
          diplomado_id: r.diplomado_id,
          diplomado_nombre: r.diplomado_nombre,
        });
      }
      const [dips] = await db.query(
        `SELECT id, nombre FROM dip_diplomados ORDER BY id`
      );
      diplomadosCatalogo = dips;
    } catch (_) { /* tablas pueden no existir todavía */ }

    const normDip = (s) => String(s || '').trim().toLowerCase();
    const alumnosById = new Map(alumnos.map(a => [a.id, a]));

    const notasMap = {};        // alumno_id → { materia: nota }
    const porDipMap = {};       // alumno_id → { diplomado_id: { materia: nota } }
    for (const n of notas) {
      if (!notasMap[n.alumno_id]) notasMap[n.alumno_id] = {};
      notasMap[n.alumno_id][n.materia] = n.nota;
      const k = String(n.materia || '').trim().toLowerCase();
      const candidatos = examPorDip.get(k) || [];
      let dipId;
      if (candidatos.length === 1) {
        dipId = candidatos[0].diplomado_id;
      } else if (candidatos.length > 1) {
        const al = alumnosById.get(n.alumno_id);
        const dipAlumno = normDip(al?.diplomado);
        const match = candidatos.find(c => normDip(c.diplomado_nombre) === dipAlumno);
        dipId = (match || candidatos[0]).diplomado_id;
      }
      if (dipId) {
        if (!porDipMap[n.alumno_id]) porDipMap[n.alumno_id] = {};
        if (!porDipMap[n.alumno_id][dipId]) porDipMap[n.alumno_id][dipId] = {};
        porDipMap[n.alumno_id][dipId][n.materia] = n.nota;
      }
    }
    res.json(alumnos.map(a => ({
      ...a,
      notas: notasMap[a.id] || {},
      notasPorDiplomado: porDipMap[a.id] || {},
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al obtener notas de diplomados' });
  }
};

const guardarNotasDiplomadosAnual = async (req, res) => {
  const { anio, cambios } = req.body;
  if (!anio || !Array.isArray(cambios) || !cambios.length)
    return res.status(400).json({ message: 'Datos inválidos' });
  try {
    for (const c of cambios) {
      if (c.nota === '' || c.nota == null) {
        await db.query('DELETE FROM diplomado_notas WHERE alumno_id=? AND anio=? AND materia=?', [c.alumno_id, anio, c.materia]);
      } else {
        await db.query(
          `INSERT INTO diplomado_notas (alumno_id, anio, materia, nota) VALUES (?,?,?,?)
           ON DUPLICATE KEY UPDATE nota=VALUES(nota)`,
          [c.alumno_id, anio, c.materia, parseInt(c.nota, 10)]
        );
      }
    }
    log(req, 'guardar', 'Diplomados', `Notas diplomados guardadas: ${cambios.length} cambios año ${anio}`);
    res.json({ ok: true, total: cambios.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al guardar notas de diplomados' });
  }
};

module.exports = { getNotasDiplomados, guardarNotaDiplomado, getNotasDiplomadosAnual, guardarNotasDiplomadosAnual };
