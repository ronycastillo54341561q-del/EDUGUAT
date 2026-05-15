const db = require('../config/db');

const DEFAULTS = {
  inst_nombre:    'EDUGUAT',
  inst_direccion: 'Ciudad de Guatemala, Guatemala',
  inst_telefono:  'Tel: 2222-3333',
  inst_email:     '',
};

const getConfig = async (req, res) => {
  try {
    const [rows] = await db.query('SELECT clave, valor FROM configuracion');
    const cfg = { ...DEFAULTS };
    for (const r of rows) cfg[r.clave] = r.valor ?? '';
    res.json(cfg);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al obtener configuración' });
  }
};

const updateConfig = async (req, res) => {
  const pares = req.body; // { clave: valor, ... }
  if (!pares || typeof pares !== 'object')
    return res.status(400).json({ message: 'Body debe ser un objeto clave-valor' });
  try {
    for (const [clave, valor] of Object.entries(pares)) {
      await db.query(
        `INSERT INTO configuracion (clave, valor) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE valor = VALUES(valor)`,
        [clave, valor ?? '']
      );
    }
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al guardar configuración' });
  }
};

module.exports = { getConfig, updateConfig };
