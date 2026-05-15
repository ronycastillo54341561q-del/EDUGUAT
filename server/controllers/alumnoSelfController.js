const db = require('../config/db');

// Devuelve el id del alumno asociado al usuario logueado.
const helper = async (usuario_id) => {
  const [rows] = await db.query('SELECT id FROM alumnos WHERE usuario_id=?', [usuario_id]);
  if (rows.length === 0) throw new Error('ALUMNO_NOT_FOUND');
  return rows[0].id;
};

const handleErr = (err, res, msg) => {
  if (err.message === 'ALUMNO_NOT_FOUND') {
    return res.status(404).json({ message: 'Alumno no encontrado' });
  }
  console.error(msg, err);
  res.status(500).json({ message: msg });
};

const getMiPerfil = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT a.*, u.email
         FROM alumnos a
         JOIN usuarios u ON a.usuario_id = u.id
        WHERE a.usuario_id = ?`,
      [req.user.id]
    );
    if (rows.length === 0) return res.status(404).json({ message: 'Alumno no encontrado' });
    res.json(rows[0]);
  } catch (err) {
    handleErr(err, res, 'Error al obtener perfil');
  }
};

// Asistencia semanal del año (12 meses × 5 semanas, char x/e/p/f).
const getMiAsistencia = async (req, res) => {
  const anio = parseInt(req.query.anio) || new Date().getFullYear();
  try {
    const alumno_id = await helper(req.user.id);
    const [rows] = await db.query(
      `SELECT mes, semana, estado FROM asistencia_semanal
        WHERE alumno_id=? AND anio=?
        ORDER BY mes, semana`,
      [alumno_id, anio]
    );
    res.json(rows);
  } catch (err) {
    handleErr(err, res, 'Error al obtener asistencia');
  }
};

const getMisMensualidades = async (req, res) => {
  const anio = parseInt(req.query.anio) || new Date().getFullYear();
  try {
    const alumno_id = await helper(req.user.id);
    const [rows] = await db.query(
      `SELECT * FROM mensualidades WHERE alumno_id=? AND anio=?
        ORDER BY FIELD(mes,'enero','febrero','marzo','abril','mayo','junio',
                          'julio','agosto','septiembre','octubre','noviembre','diciembre')`,
      [alumno_id, anio]
    );
    res.json(rows);
  } catch (err) {
    handleErr(err, res, 'Error al obtener mensualidades');
  }
};

// Notas TAC anuales (4 notas) + notas de diplomado por materia.
const getMisNotas = async (req, res) => {
  const anio = parseInt(req.query.anio) || new Date().getFullYear();
  try {
    const alumno_id = await helper(req.user.id);
    const [tacRows] = await db.query(
      'SELECT nota1, nota2, nota3, nota4 FROM notas_tac_anual WHERE alumno_id=? AND anio=?',
      [alumno_id, anio]
    );
    const [dipRows] = await db.query(
      'SELECT materia, nota FROM diplomado_notas WHERE alumno_id=? AND anio=? ORDER BY id',
      [alumno_id, anio]
    );
    res.json({
      tac:        tacRows[0] || null,
      diplomado:  dipRows,
      anio,
    });
  } catch (err) {
    handleErr(err, res, 'Error al obtener notas');
  }
};

// Lecciones de mecanografía: 20 lecciones + examen, una sola fila por año.
const getMisMecanografia = async (req, res) => {
  const anio = parseInt(req.query.anio) || new Date().getFullYear();
  try {
    const alumno_id = await helper(req.user.id);
    const [rows] = await db.query(
      'SELECT * FROM mecanografia_notas WHERE alumno_id=? AND anio=?',
      [alumno_id, anio]
    );
    res.json({ anio, notas: rows[0] || null });
  } catch (err) {
    handleErr(err, res, 'Error al obtener mecanografía');
  }
};

// Resumen agregado para el dashboard.
const getDashboard = async (req, res) => {
  const anio = parseInt(req.query.anio) || new Date().getFullYear();
  try {
    const alumno_id = await helper(req.user.id);

    // Perfil mínimo
    const [[perfil]] = await db.query(
      `SELECT a.id, a.clave, a.codigo_estudiante, a.nombre, a.apellido, a.diplomado, a.tac,
              a.horario, a.laboratorio, a.dia_clases1, a.dia_clases2, a.estado,
              a.cuota_mensual, u.email
         FROM alumnos a JOIN usuarios u ON a.usuario_id=u.id
        WHERE a.usuario_id=?`,
      [req.user.id]
    );

    // Asistencia (semanal)
    const [asistRows] = await db.query(
      `SELECT estado, COUNT(*) AS total
         FROM asistencia_semanal
        WHERE alumno_id=? AND anio=?
        GROUP BY estado`,
      [alumno_id, anio]
    );
    const asist = { x: 0, e: 0, p: 0, f: 0, total: 0 };
    for (const r of asistRows) {
      const k = (r.estado || '').toLowerCase();
      if (asist[k] !== undefined) asist[k] = r.total;
      asist.total += r.total;
    }
    const presentes = asist.x + asist.e + asist.p;
    asist.pct = asist.total > 0 ? Math.round((presentes / asist.total) * 100) : null;

    // Mensualidades
    const [mensRows] = await db.query(
      `SELECT pagado, anulado, descuento_100, monto, monto_abonado
         FROM mensualidades WHERE alumno_id=? AND anio=?`,
      [alumno_id, anio]
    );
    const pagos = {
      total: mensRows.length,
      pagadas: 0, pendientes: 0, anuladas: 0, descuento: 0,
      con_abono: 0,
      total_pagado: 0, total_pendiente: 0, total_abonado: 0,
    };
    for (const m of mensRows) {
      const monto = Number(m.monto) || 0;
      const abonado = Number(m.monto_abonado) || 0;
      if (m.anulado)              { pagos.anuladas++; }
      else if (m.descuento_100)   { pagos.descuento++; }
      else if (m.pagado)          { pagos.pagadas++; pagos.total_pagado += monto; }
      else                        {
        pagos.pendientes++;
        pagos.total_pendiente += Math.max(0, monto - abonado);
        if (abonado > 0) { pagos.con_abono++; pagos.total_abonado += abonado; }
      }
    }

    // Notas TAC promedio (sólo notas presentes)
    const [tacRows] = await db.query(
      'SELECT nota1, nota2, nota3, nota4 FROM notas_tac_anual WHERE alumno_id=? AND anio=? LIMIT 1',
      [alumno_id, anio]
    );
    const tac = tacRows[0] || null;
    const tacVals = ['nota1','nota2','nota3','nota4']
      .map(k => tac?.[k]).filter(v => v !== null && v !== undefined && v !== '');
    const tacProm = tacVals.length
      ? +(tacVals.reduce((s, v) => s + Number(v), 0) / tacVals.length).toFixed(2)
      : null;

    // Notas diplomado (promedio de las materias con nota)
    const [dipNotas] = await db.query(
      'SELECT nota FROM diplomado_notas WHERE alumno_id=? AND anio=? AND nota IS NOT NULL',
      [alumno_id, anio]
    );
    const dipVals = dipNotas.map(n => Number(n.nota)).filter(v => !isNaN(v));
    const dipProm = dipVals.length
      ? +(dipVals.reduce((s, v) => s + v, 0) / dipVals.length).toFixed(2)
      : null;

    // Mecanografía: cuántas lecciones tienen nota
    const [mecRows] = await db.query(
      'SELECT * FROM mecanografia_notas WHERE alumno_id=? AND anio=? LIMIT 1',
      [alumno_id, anio]
    );
    const mec = mecRows[0] || null;
    const mecCols = ['l1','l2','l3','l4','l5','l6','l7','l8','l9','l10',
                     'l11','l12','l13','l14','l15','l16','l17','l18','l19','l20'];
    const mecCompletadas = mecCols.filter(k => mec?.[k] !== null && mec?.[k] !== undefined).length;
    const mecVals = mecCols.map(k => mec?.[k]).filter(v => v !== null && v !== undefined).map(Number);
    const mecProm = mecVals.length
      ? +(mecVals.reduce((s, v) => s + v, 0) / mecVals.length).toFixed(2)
      : null;
    const mecExamen = mec?.examen != null ? Number(mec.examen) : null;

    res.json({
      anio,
      perfil,
      asistencia: asist,
      pagos,
      notas: {
        tac:        { promedio: tacProm, notas: tac || null },
        diplomado:  { promedio: dipProm, total_materias: dipVals.length },
      },
      mecanografia: {
        completadas: mecCompletadas,
        total: mecCols.length,
        promedio: mecProm,
        examen: mecExamen,
      },
    });
  } catch (err) {
    handleErr(err, res, 'Error al obtener dashboard');
  }
};

module.exports = {
  getMiPerfil,
  getMiAsistencia,
  getMisMensualidades,
  getMisNotas,
  getMisMecanografia,
  getDashboard,
};
