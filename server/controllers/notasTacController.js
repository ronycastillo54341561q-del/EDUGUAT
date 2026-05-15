const db = require('../config/db');
const { log } = require('../utils/bitacora');

// Todos los alumnos con sus notas TAC
const getNotasTac = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT
        al.id as alumno_id, al.nombre, al.apellido, al.clave, al.codigo_estudiante,
        al.estado, al.horario, al.laboratorio, al.dia_clases1, al.dia_clases2,
        al.establecimiento, al.tac,
        nt.id, nt.unidad1, nt.unidad2, nt.unidad3, nt.unidad4, nt.promedio
      FROM alumnos al
      LEFT JOIN notas_tac nt ON al.id = nt.alumno_id
      ORDER BY al.id ASC
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al obtener notas TAC' });
  }
};

// Guardar o actualizar notas TAC de un alumno (upsert)
const guardarNotasTac = async (req, res) => {
  const { unidad1, unidad2, unidad3, unidad4 } = req.body;
  const { alumno_id } = req.params;
  try {
    await db.query(`
      INSERT INTO notas_tac (alumno_id, unidad1, unidad2, unidad3, unidad4)
      VALUES (?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        unidad1 = VALUES(unidad1),
        unidad2 = VALUES(unidad2),
        unidad3 = VALUES(unidad3),
        unidad4 = VALUES(unidad4)
    `, [alumno_id, unidad1 || null, unidad2 || null, unidad3 || null, unidad4 || null]);
    res.json({ message: 'Notas TAC guardadas correctamente' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al guardar notas TAC' });
  }
};

const TAC_COLS = ['nota1','nota2','nota3','nota4'];

const getNotasTacAnual = async (req, res) => {
  const anio = parseInt(req.query.anio) || new Date().getFullYear();
  const estado = req.query.estado !== undefined ? req.query.estado : 'activo';
  const conds = [], params = [];
  if (estado !== '') { conds.push('al.estado=?'); params.push(estado); }
  if (req.query.horario)     { conds.push('al.horario=?');     params.push(req.query.horario); }
  if (req.query.laboratorio) { conds.push('al.laboratorio=?'); params.push(req.query.laboratorio); }
  if (req.query.dia)         { conds.push('(al.dia_clases1=? OR al.dia_clases2=?)'); params.push(req.query.dia, req.query.dia); }
  if (req.query.tac)         { conds.push('al.tac=?');         params.push(req.query.tac); }
  if (req.query.establecimiento) { conds.push('al.establecimiento=?'); params.push(req.query.establecimiento); }
  const where = conds.join(' AND ') || '1=1';
  try {
    const [alumnos] = await db.query(`
      SELECT al.id, al.clave, al.codigo_estudiante, al.nombre, al.apellido,
             al.estado, al.horario, al.laboratorio, al.dia_clases1, al.dia_clases2,
             al.tac, al.establecimiento
      FROM alumnos al WHERE ${where} ORDER BY al.id ASC
    `, params);
    if (!alumnos.length) return res.json([]);
    const ids = alumnos.map(a => a.id);
    const [notas] = await db.query(
      `SELECT alumno_id, tac, nota1, nota2, nota3, nota4
         FROM notas_tac_anual
        WHERE anio=? AND alumno_id IN (${ids.map(() => '?').join(',')})`,
      [anio, ...ids]
    );
    // Agrupamos por (alumno, tac) para soportar varias filas de notas por
    // alumno/año (una por TAC).  El frontend selecciona el bucket del TAC
    // activo según la pestaña.
    const notasMap = {};
    for (const n of notas) {
      const t = n.tac || '';
      // Si las 4 notas están en NULL, la fila es residuo de un guardado
      // anterior (o de pestaña abierta sin valor) — la ignoramos para que
      // el alumno NO aparezca en esa pestaña sin razón.
      const tieneAlguna = [n.nota1, n.nota2, n.nota3, n.nota4]
        .some(v => v !== null && v !== undefined && v !== '');
      if (!tieneAlguna) continue;
      if (!notasMap[n.alumno_id]) notasMap[n.alumno_id] = {};
      notasMap[n.alumno_id][t] = {
        nota1: n.nota1, nota2: n.nota2, nota3: n.nota3, nota4: n.nota4,
      };
    }
    res.json(alumnos.map(a => {
      const buckets = notasMap[a.id] || {};
      // Compatibilidad: `notas` apunta al bucket del TAC del alumno o, en su
      // defecto, al primero disponible.  Esto evita romper consumidores
      // antiguos que aún leen `a.notas` (ej. exportadores PDF).
      const propio = (a.tac && buckets[a.tac]) ? buckets[a.tac]
                  : (Object.values(buckets)[0] || {});
      return { ...a, notasPorTac: buckets, notas: propio };
    }));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al obtener notas TAC anuales' });
  }
};

const guardarNotasTacAnual = async (req, res) => {
  const { anio, cambios } = req.body;
  if (!anio || !Array.isArray(cambios) || !cambios.length)
    return res.status(400).json({ message: 'Datos inválidos' });
  // Agrupamos por (alumno, tac) — un mismo alumno puede tener cambios en
  // varios TAC en el mismo guardado.
  const byKey = {};
  for (const c of cambios) {
    const tac = (c.tac || '').toString();
    const k = `${c.alumno_id}__${tac}`;
    if (!byKey[k]) byKey[k] = { alumno_id: c.alumno_id, tac, fields: {} };
    byKey[k].fields[c.campo] = (c.valor !== '' && c.valor != null) ? parseInt(c.valor, 10) : null;
  }
  try {
    for (const { alumno_id, tac, fields } of Object.values(byKey)) {
      const cols = Object.keys(fields).filter(c => TAC_COLS.includes(c));
      if (!cols.length) continue;
      await db.query(
        `INSERT INTO notas_tac_anual (alumno_id, anio, tac, ${cols.join(',')})
         VALUES (?, ?, ?, ${cols.map(() => '?').join(',')})
         ON DUPLICATE KEY UPDATE ${cols.map(c => `${c}=VALUES(${c})`).join(',')}`,
        [alumno_id, anio, tac || null, ...cols.map(c => fields[c])]
      );
    }
    log(req, 'guardar', 'Notas TAC', `Notas TAC guardadas: ${cambios.length} cambios año ${anio}`);
    res.json({ ok: true, total: cambios.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al guardar notas TAC' });
  }
};

module.exports = { getNotasTac, guardarNotasTac, getNotasTacAnual, guardarNotasTacAnual };
