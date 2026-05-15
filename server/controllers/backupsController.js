// ╔═══════════════════════════════════════════════════════════════════════╗
// ║  backupsController.js                                                 ║
// ║                                                                       ║
// ║  Endpoints HTTP para gestionar backups del sistema.  Las rutas se     ║
// ║  protegen con verifyToken + verifyRole('admin') desde routes.         ║
// ║                                                                       ║
// ║  IMPORTANTE — multi-sede:                                             ║
// ║  La tabla `backups` vive en la base META (`eduguat_meta`), NO en la   ║
// ║  base de la sede del request.  Por eso usamos `getMetaPool()` directo ║
// ║  en lugar del proxy `db.query` (que se enruta por AsyncLocalStorage). ║
// ╚═══════════════════════════════════════════════════════════════════════╝

const fs   = require('fs');
const fsp  = require('fs/promises');
const path = require('path');

const { getMetaPool } = require('../config/db');
const { crearBackup } = require('../utils/backupRunner');
const { log }         = require('../utils/bitacora');

/**
 * POST /api/backups
 * Dispara un nuevo backup MANUAL.  El usuario que apretó el botón
 * queda registrado en `usuario_id` / `usuario_nombre`.
 */
const crear = async (req, res) => {
  try {
    const r = await crearBackup({
      tipo: 'manual',
      usuario: req.user,
    });

    // Bitácora — nota que esta entrada queda en la sede del usuario que
    // apretó el botón (db.query se enruta por su sede via middleware).
    await log(req, 'crear', 'backups',
      `Backup manual creado: ${r.filename} (${formatBytes(r.size)})`);

    res.status(201).json({
      message: 'Backup creado correctamente',
      backup: r,
    });
  } catch (err) {
    console.error('backups.crear:', err);
    // Aunque el runner ya registró el intento fallido en la tabla,
    // avisamos al admin con un mensaje claro.
    await log(req, 'crear', 'backups',
      `Error al crear backup: ${err.message}`).catch(() => {});
    res.status(500).json({
      message: 'Error al crear el backup',
      detalle: err.message,
    });
  }
};

/**
 * GET /api/backups
 * Devuelve el historial completo, más nuevos primero.
 */
const listar = async (_req, res) => {
  try {
    const pool = getMetaPool();
    const [rows] = await pool.query(
      `SELECT id, filename, filepath, size_bytes, tipo, estado,
              error_msg, drive_file_id, drive_link, drive_status,
              usuario_id, usuario_nombre, created_at
         FROM backups
        ORDER BY created_at DESC, id DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error('backups.listar:', err);
    res.status(500).json({ message: 'Error al listar backups' });
  }
};

/**
 * GET /api/backups/:id/download
 * Envía el archivo .sql.gz al navegador.  Si el archivo local ya fue
 * purgado (>30 días) avisamos con 410 Gone — en Fase 2 podremos ofrecer
 * un fallback para descargar desde Drive.
 */
const descargar = async (req, res) => {
  const { id } = req.params;
  try {
    const pool = getMetaPool();
    const [rows] = await pool.query(
      'SELECT id, filename, filepath FROM backups WHERE id = ?',
      [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Backup no encontrado' });
    }
    const { filename, filepath } = rows[0];

    if (!filepath) {
      return res.status(410).json({
        message: 'El archivo local ya fue purgado (más de 30 días). ' +
                 'Buscalo en Google Drive.',
      });
    }
    if (!fs.existsSync(filepath)) {
      // El registro dice que existe pero el disco no — sincronizamos
      // la tabla para no volver a engañar al usuario.
      await pool.query('UPDATE backups SET filepath = NULL WHERE id = ?', [id]);
      return res.status(410).json({
        message: 'El archivo ya no está en disco. Buscalo en Google Drive.',
      });
    }

    // res.download maneja Content-Type, Content-Disposition y el stream.
    res.download(filepath, filename, (err) => {
      if (err) console.error('backups.descargar:', err);
    });

    log(req, 'descargar', 'backups', `Descargó backup ${filename}`)
      .catch(() => {});
  } catch (err) {
    console.error('backups.descargar:', err);
    res.status(500).json({ message: 'Error al descargar el backup' });
  }
};

/**
 * DELETE /api/backups/:id
 * Borra el archivo local (si existe) y la fila de la tabla.
 * Nota: NO borra la copia de Google Drive — eso lo decidimos a propósito
 * para tener una red de seguridad "off-site" aunque el admin se equivoque.
 */
const eliminar = async (req, res) => {
  const { id } = req.params;
  try {
    const pool = getMetaPool();
    const [rows] = await pool.query(
      'SELECT id, filename, filepath FROM backups WHERE id = ?',
      [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Backup no encontrado' });
    }
    const { filename, filepath } = rows[0];

    // Intenta borrar el archivo físico.  Si no existe, ignoramos el error.
    if (filepath) {
      try { await fsp.unlink(filepath); }
      catch (e) {
        if (e.code !== 'ENOENT') throw e;
      }
    }

    await pool.query('DELETE FROM backups WHERE id = ?', [id]);
    await log(req, 'eliminar', 'backups', `Eliminó backup ${filename}`);
    res.json({ message: 'Backup eliminado' });
  } catch (err) {
    console.error('backups.eliminar:', err);
    res.status(500).json({ message: 'Error al eliminar el backup' });
  }
};

// ─────────────────────────────────────────────────────────────────────────
// Helper: formatea bytes a "1.23 MB" — solo para el mensaje de bitácora.
// El frontend ya tiene su propio formateador (más completo).
// ─────────────────────────────────────────────────────────────────────────
const formatBytes = (bytes) => {
  if (!bytes) return '0 B';
  const u = ['B','KB','MB','GB','TB'];
  const i = Math.min(u.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return (bytes / Math.pow(1024, i)).toFixed(2) + ' ' + u[i];
};

module.exports = { crear, listar, descargar, eliminar };
