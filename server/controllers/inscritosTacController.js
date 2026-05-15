// Inscripciones TAC por año y nivel (1, 2 o 3).
//
// Lista los alumnos que pertenecen al nivel solicitado para un año dado:
// 1) los que actualmente tienen ese nivel en `alumnos.tac` (extrayendo
//    el primer número del campo, así "01", "TAC 1", "1" o "Tac1" cuentan
//    como nivel 1), y 2) los que tienen un registro histórico en
//    `inscritos_tac` para ese (anio, nivel) — esto preserva la historia
//    cuando un alumno cambia de TAC1 a TAC2 entre años.
//
// El estado se persiste por (alumno_id, anio, tac) en `inscritos_tac`
// y por defecto (sin registro) se considera 'no_inscrito'.

const db = require('../config/db');
const { log } = require('../utils/bitacora');

const ESTADOS_VALIDOS = new Set(['inscrito', 'no_inscrito', 'pendiente']);

const parseNivel = (v) => {
  const n = parseInt(v, 10);
  return [1, 2, 3].includes(n) ? n : null;
};

const parseAnio = (v) => {
  const n = parseInt(v, 10);
  return n >= 2000 && n <= 2100 ? n : null;
};

// GET /api/inscritos-tac?anio=2026&tac=1
const listar = async (req, res) => {
  const anio = parseAnio(req.query.anio);
  const tac  = parseNivel(req.query.tac);
  if (!anio || !tac) {
    return res.status(400).json({ message: 'Parámetros anio y tac (1|2|3) requeridos' });
  }

  try {
    const [rows] = await db.query(`
      SELECT
        a.id,
        a.clave,
        a.codigo_estudiante,
        a.nombre,
        a.apellido,
        a.dia_clases1,
        a.dia_clases2,
        a.horario,
        a.tac AS tac_actual,
        a.estado                              AS alumno_estado,
        COALESCE(it.estado, 'no_inscrito')   AS estado,
        it.fecha_actualizacion,
        it.observaciones
      FROM alumnos a
      LEFT JOIN inscritos_tac it
        ON it.alumno_id = a.id AND it.anio = ? AND it.tac = ?
      WHERE
        CAST(REGEXP_SUBSTR(a.tac, '[0-9]+') AS UNSIGNED) = ?
        OR it.id IS NOT NULL
      ORDER BY a.apellido, a.nombre
    `, [anio, tac, tac]);
    res.json(rows);
  } catch (err) {
    console.error('listar inscritos_tac error:', err);
    res.status(500).json({ message: 'Error al cargar inscritos TAC' });
  }
};

// PUT /api/inscritos-tac/:alumno_id  body: { anio, tac, estado, observaciones }
const upsert = async (req, res) => {
  const alumno_id = parseInt(req.params.alumno_id, 10);
  const anio = parseAnio(req.body?.anio);
  const tac  = parseNivel(req.body?.tac);
  const estado = String(req.body?.estado || '').trim();
  const observaciones = req.body?.observaciones != null
    ? String(req.body.observaciones)
    : null;

  if (!alumno_id || !anio || !tac) {
    return res.status(400).json({ message: 'alumno_id, anio y tac son requeridos' });
  }
  if (!ESTADOS_VALIDOS.has(estado)) {
    return res.status(400).json({ message: 'estado inválido (inscrito | no_inscrito | pendiente)' });
  }

  try {
    const [exists] = await db.query('SELECT id FROM alumnos WHERE id = ?', [alumno_id]);
    if (exists.length === 0) {
      return res.status(404).json({ message: 'Alumno no encontrado' });
    }

    await db.query(`
      INSERT INTO inscritos_tac (alumno_id, anio, tac, estado, fecha_actualizacion, observaciones)
      VALUES (?, ?, ?, ?, NOW(), ?)
      ON DUPLICATE KEY UPDATE
        estado = VALUES(estado),
        fecha_actualizacion = NOW(),
        observaciones = VALUES(observaciones)
    `, [alumno_id, anio, tac, estado, observaciones]);

    const [[row]] = await db.query(`
      SELECT estado, fecha_actualizacion, observaciones
      FROM inscritos_tac
      WHERE alumno_id = ? AND anio = ? AND tac = ?
    `, [alumno_id, anio, tac]);

    log(req, 'editar', 'InscritosTac',
        `Alumno ${alumno_id} → ${estado} (TAC${tac} ${anio})`);

    res.json({ alumno_id, anio, tac, ...row });
  } catch (err) {
    console.error('upsert inscritos_tac error:', err);
    res.status(500).json({ message: 'Error al actualizar inscripción' });
  }
};

// GET /api/inscritos-tac/anios — lista de años con datos (para el selector)
const listarAnios = async (_req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT DISTINCT anio FROM inscritos_tac ORDER BY anio DESC
    `);
    res.json(rows.map(r => r.anio));
  } catch (err) {
    console.error('listarAnios inscritos_tac error:', err);
    res.status(500).json({ message: 'Error al cargar años' });
  }
};

module.exports = { listar, upsert, listarAnios };
