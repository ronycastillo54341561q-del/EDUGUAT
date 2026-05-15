const db = require('../config/db');

const getBitacora = async (req, res) => {
  const { modulo, accion, desde, hasta, q, page = 1, limit = 100 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  const conds = [], params = [];
  if (modulo) { conds.push('modulo = ?');           params.push(modulo); }
  if (accion)  { conds.push('accion = ?');           params.push(accion); }
  if (desde)   { conds.push('created_at >= ?');      params.push(desde + ' 00:00:00'); }
  if (hasta)   { conds.push('created_at <= ?');      params.push(hasta + ' 23:59:59'); }
  if (q)       { conds.push('(descripcion LIKE ? OR usuario_nombre LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }

  const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';

  try {
    const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM bitacora ${where}`, params);
    const [rows] = await db.query(
      `SELECT * FROM bitacora ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );
    res.json({ total, rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al obtener bitácora' });
  }
};

const getModulos = async (req, res) => {
  try {
    const [rows] = await db.query('SELECT DISTINCT modulo FROM bitacora ORDER BY modulo');
    res.json(rows.map(r => r.modulo));
  } catch (err) {
    res.status(500).json({ message: 'Error' });
  }
};

module.exports = { getBitacora, getModulos };
