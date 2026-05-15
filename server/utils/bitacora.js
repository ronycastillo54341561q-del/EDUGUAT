const db = require('../config/db');

const log = async (req, accion, modulo, descripcion) => {
  try {
    const ip = (req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim();
    await db.query(
      'INSERT INTO bitacora (usuario_id, usuario_nombre, accion, modulo, descripcion, ip) VALUES (?,?,?,?,?,?)',
      [req.user?.id || null, req.user?.nombre || 'Sistema', accion, modulo, descripcion, ip || 'local']
    );
  } catch { /* silencioso — la bitácora nunca bloquea la operación principal */ }
};

module.exports = { log };
