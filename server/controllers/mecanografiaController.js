const db = require('../config/db');
const { log } = require('../utils/bitacora');

// Resumen: todos los alumnos con cantidad de lecciones completadas
const getResumenMecanografia = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT
        al.id, al.nombre, al.apellido, al.clave, al.codigo_estudiante,
        al.estado, al.horario, al.laboratorio, al.dia_clases1, al.dia_clases2,
        COUNT(m.id) as total_lecciones,
        COUNT(CASE WHEN m.completada = 1 THEN 1 END) as lecciones_completadas,
        MAX(m.leccion) as ultima_leccion
      FROM alumnos al
      LEFT JOIN mecanografia m ON al.id = m.alumno_id
      GROUP BY al.id
      ORDER BY al.id ASC
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al obtener resumen de mecanografía' });
  }
};

// Lecciones de un alumno específico
const getLeccionesPorAlumno = async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM mecanografia WHERE alumno_id = ? ORDER BY leccion ASC',
      [req.params.alumno_id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Error al obtener lecciones' });
  }
};

// Agregar lección
const agregarLeccion = async (req, res) => {
  const { alumno_id, leccion, punteo, fecha, completada } = req.body;
  try {
    const [result] = await db.query(
      'INSERT INTO mecanografia (alumno_id, leccion, punteo, fecha, completada) VALUES (?, ?, ?, ?, ?)',
      [alumno_id, leccion, punteo, fecha, completada ? 1 : 0]
    );
    res.status(201).json({ message: 'Lección agregada correctamente', id: result.insertId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al agregar lección' });
  }
};

// Editar lección
const editarLeccion = async (req, res) => {
  const { leccion, punteo, fecha, completada } = req.body;
  try {
    await db.query(
      'UPDATE mecanografia SET leccion=?, punteo=?, fecha=?, completada=? WHERE id=?',
      [leccion, punteo, fecha, completada ? 1 : 0, req.params.id]
    );
    res.json({ message: 'Lección actualizada correctamente' });
  } catch (err) {
    res.status(500).json({ message: 'Error al actualizar lección' });
  }
};

// Eliminar lección
const eliminarLeccion = async (req, res) => {
  try {
    await db.query('DELETE FROM mecanografia WHERE id=?', [req.params.id]);
    res.json({ message: 'Lección eliminada correctamente' });
  } catch (err) {
    res.status(500).json({ message: 'Error al eliminar lección' });
  }
};

const MEC_COLS = ['l1','l2','l3','l4','l5','l6','l7','l8','l9','l10',
                  'l11','l12','l13','l14','l15','l16','l17','l18','l19','l20','examen'];

const getMecanografiaGrid = async (req, res) => {
  const anio = parseInt(req.query.anio) || new Date().getFullYear();
  const estado = req.query.estado !== undefined ? req.query.estado : 'activo';
  const conds = [], params = [];
  if (estado !== '') { conds.push('al.estado=?'); params.push(estado); }
  if (req.query.horario)     { conds.push('al.horario=?');     params.push(req.query.horario); }
  if (req.query.laboratorio) { conds.push('al.laboratorio=?'); params.push(req.query.laboratorio); }
  // dia + dia2 cubre el filtro de combo "lunes-miércoles 10:00 a 11:30":
  // se exige que el primer día coincida con dia_clases1 y, si viene dia2,
  // que dia_clases2 también lo haga. Si no llega dia2, se acepta que el
  // alumno tenga sólo un día de clase.
  if (req.query.dia && req.query.dia2) {
    conds.push('al.dia_clases1=? AND al.dia_clases2=?');
    params.push(req.query.dia, req.query.dia2);
  } else if (req.query.dia) {
    conds.push('(al.dia_clases1=? OR al.dia_clases2=?)');
    params.push(req.query.dia, req.query.dia);
  }
  const where = conds.join(' AND ') || '1=1';
  try {
    const [alumnos] = await db.query(`
      SELECT al.id, al.clave, al.codigo_estudiante, al.nombre, al.apellido,
             al.estado, al.horario, al.laboratorio, al.dia_clases1, al.dia_clases2
      FROM alumnos al WHERE ${where} ORDER BY al.id ASC
    `, params);
    if (!alumnos.length) return res.json([]);
    const ids = alumnos.map(a => a.id);
    const [notas] = await db.query(
      `SELECT * FROM mecanografia_notas WHERE anio=? AND alumno_id IN (${ids.map(() => '?').join(',')})`,
      [anio, ...ids]
    );
    const notasMap = {};
    for (const n of notas) notasMap[n.alumno_id] = n;
    res.json(alumnos.map(a => ({ ...a, notas: notasMap[a.id] || {} })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al obtener grid de mecanografía' });
  }
};

const guardarMecanografiaGrid = async (req, res) => {
  const { anio, cambios } = req.body;
  if (!anio || !Array.isArray(cambios) || !cambios.length)
    return res.status(400).json({ message: 'Datos inválidos' });
  const byAlumno = {};
  for (const c of cambios) {
    if (!byAlumno[c.alumno_id]) byAlumno[c.alumno_id] = {};
    byAlumno[c.alumno_id][c.campo] = (c.valor !== '' && c.valor != null) ? parseInt(c.valor, 10) : null;
  }
  try {
    for (const [alumno_id, fields] of Object.entries(byAlumno)) {
      const cols = Object.keys(fields).filter(c => MEC_COLS.includes(c));
      if (!cols.length) continue;
      await db.query(
        `INSERT INTO mecanografia_notas (alumno_id, anio, ${cols.join(',')})
         VALUES (?, ?, ${cols.map(() => '?').join(',')})
         ON DUPLICATE KEY UPDATE ${cols.map(c => `${c}=VALUES(${c})`).join(',')}`,
        [alumno_id, anio, ...cols.map(c => fields[c])]
      );
    }
    log(req, 'guardar', 'Mecanografía', `Notas mecanografía guardadas: ${cambios.length} cambios año ${anio}`);
    res.json({ ok: true, total: cambios.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al guardar notas' });
  }
};

module.exports = {
  getResumenMecanografia,
  getLeccionesPorAlumno,
  agregarLeccion,
  editarLeccion,
  eliminarLeccion,
  getMecanografiaGrid,
  guardarMecanografiaGrid
};
