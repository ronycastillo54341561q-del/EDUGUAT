const db = require('../config/db');
const { log } = require('../utils/bitacora');

// `extras` se persiste como JSON: [{ nombre, descripcion }, ...]
const parseExtras = (raw) => {
  if (!raw) return [];
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
};

const list = async (_req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT id, nombre, tipo, resolucion, fecha, ubicacion, extras, activo
         FROM instituciones
        ORDER BY nombre`
    );
    res.json(rows.map(r => ({ ...r, extras: parseExtras(r.extras) })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al listar instituciones' });
  }
};

const crear = async (req, res) => {
  const {
    nombre, tipo = '', resolucion = '', fecha = null,
    ubicacion = '', extras = [], activo = 1,
  } = req.body;
  if (!nombre || !String(nombre).trim())
    return res.status(400).json({ message: 'Nombre es requerido' });
  try {
    const [r] = await db.query(
      `INSERT INTO instituciones
         (nombre, tipo, resolucion, fecha, ubicacion, extras, activo)
       VALUES (?,?,?,?,?,?,?)`,
      [
        String(nombre).trim(), tipo || '', resolucion || '',
        fecha || null, ubicacion || '',
        JSON.stringify(Array.isArray(extras) ? extras : []),
        activo ? 1 : 0,
      ]
    );
    log(req, 'crear', 'Instituciones', `Institución: ${nombre}`);
    res.json({ ok: true, id: r.insertId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al crear institución' });
  }
};

const actualizar = async (req, res) => {
  const { id } = req.params;
  const {
    nombre, tipo = '', resolucion = '', fecha = null,
    ubicacion = '', extras = [], activo = 1,
  } = req.body;
  if (!nombre || !String(nombre).trim())
    return res.status(400).json({ message: 'Nombre es requerido' });
  try {
    await db.query(
      `UPDATE instituciones
          SET nombre=?, tipo=?, resolucion=?, fecha=?, ubicacion=?, extras=?, activo=?
        WHERE id=?`,
      [
        String(nombre).trim(), tipo || '', resolucion || '',
        fecha || null, ubicacion || '',
        JSON.stringify(Array.isArray(extras) ? extras : []),
        activo ? 1 : 0, id,
      ]
    );
    log(req, 'editar', 'Instituciones', `Institución ID ${id}: ${nombre}`);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al actualizar institución' });
  }
};

const eliminar = async (req, res) => {
  const { id } = req.params;
  try {
    await db.query('DELETE FROM instituciones WHERE id=?', [id]);
    log(req, 'eliminar', 'Instituciones', `Institución ID ${id}`);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al eliminar institución' });
  }
};

module.exports = { list, crear, actualizar, eliminar };
