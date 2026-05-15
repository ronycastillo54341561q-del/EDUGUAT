const db = require('../config/db');
const { log } = require('../utils/bitacora');

const parseJSON = (val, fallback) => {
  if (val == null) return fallback;
  if (typeof val === 'object') return val;
  try { return JSON.parse(val); } catch { return fallback; }
};

const serialize = (row) => ({
  ...row,
  activo: row.activo !== 0,
  columnas: parseJSON(row.columnas, []),
  filas:    parseJSON(row.filas, []),
});

// Días que una tabla desactivada permanece en "papelera" antes de borrarse.
const DIAS_RETENCION = 7;

// Purga las tablas que llevan más de DIAS_RETENCION días desactivadas.
// Se ejecuta de forma oportunista al listar para no depender de un cron.
const purgarVencidas = async () => {
  try {
    await db.query(
      `DELETE FROM mis_tablas
        WHERE activo = 0
          AND desactivado_at IS NOT NULL
          AND desactivado_at < (NOW() - INTERVAL ? DAY)`,
      [DIAS_RETENCION]
    );
  } catch (err) {
    console.error('purgarVencidas:', err.message);
  }
};

// GET /api/mis-tablas?activo=1|0|all  (default: solo activas)
const listar = async (req, res) => {
  try {
    await purgarVencidas();
    const filtro = String(req.query.activo ?? '1');
    let where = '';
    const params = [];
    if (filtro === '1') {
      where = 'WHERE activo = 1';
    } else if (filtro === '0') {
      where = 'WHERE activo = 0';
    }
    const [rows] = await db.query(
      `SELECT id, nombre, descripcion, encabezado, activo, desactivado_at,
              created_at, updated_at
         FROM mis_tablas
         ${where}
         ORDER BY updated_at DESC`,
      params
    );
    res.json(rows.map(r => ({ ...r, activo: r.activo !== 0 })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al listar tablas' });
  }
};

// GET /api/mis-tablas/:id
const obtener = async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM mis_tablas WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ message: 'Tabla no encontrada' });
    res.json(serialize(rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al obtener tabla' });
  }
};

// GET /api/mis-tablas/_alumnos/filtrar  -> devuelve alumnos según filtros
// Query params: horario, laboratorio, dia, tac, diplomado, establecimiento, estado
const alumnosFiltrados = async (req, res) => {
  try {
    const { horario, laboratorio, dia, tac, diplomado, establecimiento, estado } = req.query;
    const where = [];
    const params = [];
    if (estado)          { where.push('a.estado = ?');          params.push(estado); }
    if (horario)         { where.push('a.horario = ?');         params.push(horario); }
    if (laboratorio)     { where.push('a.laboratorio = ?');     params.push(laboratorio); }
    if (dia)             { where.push('(a.dia_clases1 = ? OR a.dia_clases2 = ?)'); params.push(dia, dia); }
    if (tac)             { where.push('a.tac = ?');             params.push(tac); }
    if (diplomado)       { where.push('a.diplomado = ?');       params.push(diplomado); }
    if (establecimiento) { where.push('a.establecimiento = ?'); params.push(establecimiento); }

    const sql = `
      SELECT a.id, a.clave, a.codigo_estudiante, a.nombre, a.apellido, a.fecha_inicio, a.fecha_nacimiento,
             a.encargado, a.telefono, a.diplomado, a.tac, a.direccion, a.establecimiento,
             a.observaciones, a.dia_clases1, a.dia_clases2, a.horario, a.laboratorio,
             a.estado, a.cuota_mensual, u.email
      FROM alumnos a
      LEFT JOIN usuarios u ON a.usuario_id = u.id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY a.apellido ASC, a.nombre ASC
    `;
    const [rows] = await db.query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al filtrar alumnos' });
  }
};

// POST /api/mis-tablas
// body: { nombre, descripcion, encabezado, columnas: [{key,label,tipo}], filas: [{...}] }
const crear = async (req, res) => {
  const { nombre, descripcion = '', encabezado = '', columnas = [], filas = [] } = req.body;
  if (!nombre || !nombre.trim()) return res.status(400).json({ message: 'El nombre es obligatorio' });
  try {
    const [result] = await db.query(
      'INSERT INTO mis_tablas (nombre, descripcion, encabezado, columnas, filas) VALUES (?,?,?,?,?)',
      [nombre.trim(), descripcion, encabezado, JSON.stringify(columnas), JSON.stringify(filas)]
    );
    log(req, 'crear', 'Mis Tablas', `Tabla creada: ${nombre}`);
    res.status(201).json({ id: result.insertId, message: 'Tabla creada' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al crear tabla' });
  }
};

// PUT /api/mis-tablas/:id
const actualizar = async (req, res) => {
  const { nombre, descripcion = '', encabezado = '', columnas, filas } = req.body;
  if (!nombre || !nombre.trim()) return res.status(400).json({ message: 'El nombre es obligatorio' });
  try {
    // No permitir editar contenido de una tabla desactivada (debe reactivarse primero).
    const [[meta]] = await db.query('SELECT activo FROM mis_tablas WHERE id = ?', [req.params.id]);
    if (!meta) return res.status(404).json({ message: 'Tabla no encontrada' });
    if (meta.activo === 0) {
      return res.status(409).json({ message: 'Reactiva la tabla antes de editarla' });
    }

    await db.query(
      `UPDATE mis_tablas
         SET nombre = ?, descripcion = ?, encabezado = ?, columnas = ?, filas = ?
       WHERE id = ?`,
      [
        nombre.trim(),
        descripcion,
        encabezado,
        JSON.stringify(columnas || []),
        JSON.stringify(filas || []),
        req.params.id
      ]
    );
    log(req, 'editar', 'Mis Tablas', `Tabla editada ID ${req.params.id}: ${nombre}`);
    res.json({ message: 'Tabla actualizada' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al actualizar tabla' });
  }
};

// DELETE /api/mis-tablas/:id  → soft-delete (desactivar).
// La tabla queda 7 días en papelera y luego se elimina automáticamente.
const eliminar = async (req, res) => {
  try {
    const [r] = await db.query(
      'UPDATE mis_tablas SET activo = 0, desactivado_at = NOW() WHERE id = ? AND activo = 1',
      [req.params.id]
    );
    if (r.affectedRows === 0) {
      return res.status(404).json({ message: 'Tabla no encontrada o ya estaba desactivada' });
    }
    log(req, 'desactivar', 'Mis Tablas', `Tabla desactivada ID ${req.params.id}`);
    res.json({ message: 'Tabla desactivada', dias_retencion: DIAS_RETENCION });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al desactivar tabla' });
  }
};

// POST /api/mis-tablas/:id/reactivar
const reactivar = async (req, res) => {
  try {
    const [r] = await db.query(
      'UPDATE mis_tablas SET activo = 1, desactivado_at = NULL WHERE id = ? AND activo = 0',
      [req.params.id]
    );
    if (r.affectedRows === 0) {
      return res.status(404).json({ message: 'Tabla no encontrada o ya estaba activa' });
    }
    log(req, 'reactivar', 'Mis Tablas', `Tabla reactivada ID ${req.params.id}`);
    res.json({ message: 'Tabla reactivada' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al reactivar tabla' });
  }
};

// DELETE /api/mis-tablas/:id/eliminar  → eliminación definitiva (sólo si está desactivada)
const eliminarDefinitivo = async (req, res) => {
  try {
    const [r] = await db.query(
      'DELETE FROM mis_tablas WHERE id = ? AND activo = 0',
      [req.params.id]
    );
    if (r.affectedRows === 0) {
      return res.status(409).json({ message: 'Sólo se puede eliminar una tabla desactivada' });
    }
    log(req, 'eliminar', 'Mis Tablas', `Tabla eliminada definitivamente ID ${req.params.id}`);
    res.json({ message: 'Tabla eliminada definitivamente' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al eliminar tabla' });
  }
};

module.exports = {
  listar, obtener, crear, actualizar,
  eliminar, reactivar, eliminarDefinitivo,
  alumnosFiltrados,
  DIAS_RETENCION,
};
