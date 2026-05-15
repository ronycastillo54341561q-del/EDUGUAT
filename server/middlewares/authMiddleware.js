const jwt = require('jsonwebtoken');
const { runWithSede, pools, getPool } = require('../config/db');

const ROLES_BASE = new Set(['admin','alumno','oficina','maestro']);

// Inactividad máxima permitida sin actividad antes de cerrar la sesión.
const INACTIVITY_MS = 10 * 60 * 1000;

const verifyToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ message: 'Token requerido' });

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return res.status(403).json({ message: 'Token inválido o expirado' });
  }

  req.user = decoded;

  // Retrocompatibilidad: tokens viejos emitidos antes de multi-sede no
  // traen "sede".  Los tratamos como Sistec Flores (sistema_escolar).
  const sede = decoded.sede && pools[decoded.sede] ? decoded.sede : 'sistema_escolar';
  req.user.sede = sede;

  // Ejecuta el resto del pipeline dentro del contexto de la sede.
  // Cualquier `db.query(...)` en controllers aterriza en el pool correcto.
  return runWithSede(sede, async () => {
    try {
      const pool = getPool(sede);
      const [[row]] = await pool.query(
        'SELECT session_jti, last_activity, activo FROM usuarios WHERE id = ?',
        [decoded.id]
      );

      if (!row || row.activo === 0) {
        return res.status(401).json({ message: 'Usuario inactivo o no encontrado' });
      }

      // Sesión única: si el jti del token no coincide con el "vivo" en BD,
      // significa que el usuario hizo login en otro dispositivo o cerró sesión.
      if (decoded.jti && row.session_jti && decoded.jti !== row.session_jti) {
        return res.status(401).json({
          message: 'Tu sesión fue cerrada porque iniciaste sesión en otro dispositivo',
          code: 'SESSION_REPLACED',
        });
      }
      if (decoded.jti && !row.session_jti) {
        return res.status(401).json({
          message: 'Sesión finalizada',
          code: 'SESSION_ENDED',
        });
      }

      // Timeout por inactividad: si llevamos más de INACTIVITY_MS sin
      // actividad, expulsamos al usuario y limpiamos el jti.
      if (row.last_activity) {
        const idle = Date.now() - new Date(row.last_activity).getTime();
        if (idle > INACTIVITY_MS) {
          await pool.query(
            'UPDATE usuarios SET session_jti = NULL, last_activity = NULL WHERE id = ?',
            [decoded.id]
          );
          return res.status(401).json({
            message: 'Sesión cerrada por inactividad',
            code: 'SESSION_IDLE',
          });
        }
      }

      // Renueva last_activity (refresca el timer de inactividad).
      await pool.query('UPDATE usuarios SET last_activity = NOW() WHERE id = ?', [decoded.id]);

      next();
    } catch (err) {
      console.error('verifyToken session check:', err.message);
      next();
    }
  });
};

// Resuelve el rol "efectivo" para chequeos de permisos a nivel de ruta:
// - Si el usuario tiene un rol base (admin/oficina/maestro/alumno), lo
//   devuelve tal cual.
// - Si tiene un rol personalizado, devuelve su `base_rol` (heredado).
// El resultado se cachea en req para no consultar la BD múltiples veces.
const resolverRolEfectivo = async (req) => {
  if (req._rolEfectivo) return req._rolEfectivo;
  if (ROLES_BASE.has(req.user.rol)) {
    req._rolEfectivo = req.user.rol;
    return req._rolEfectivo;
  }
  try {
    const pool = getPool(req.user.sede);
    const [[rol]] = await pool.query(
      'SELECT base_rol, activo FROM roles_custom WHERE slug = ?',
      [req.user.rol]
    );
    if (!rol || !rol.activo) {
      req._rolEfectivo = null;
      return null;
    }
    req._rolEfectivo = rol.base_rol;
    return rol.base_rol;
  } catch {
    req._rolEfectivo = null;
    return null;
  }
};

const verifyRole = (...roles) => {
  return async (req, res, next) => {
    const efectivo = await resolverRolEfectivo(req);
    if (!efectivo || !roles.includes(efectivo)) {
      return res.status(403).json({ message: 'No tienes permisos para esto' });
    }
    next();
  };
};

module.exports = { verifyToken, verifyRole, resolverRolEfectivo };
