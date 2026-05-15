// ╔═══════════════════════════════════════════════════════════════════════╗
// ║  backupCleanup.js                                                     ║
// ║                                                                       ║
// ║  Borra archivos .sql.gz locales con más de N días de antigüedad.      ║
// ║  La copia de Google Drive NO se toca — Drive es nuestra retención     ║
// ║  "fría" (a largo plazo) y el disco local es solo retención "caliente" ║
// ║  para descargas rápidas desde el panel.                               ║
// ║                                                                       ║
// ║  Importante: solo borramos los ARCHIVOS, no las filas de la tabla     ║
// ║  `backups`.  El historial sigue mostrando el backup, pero con el      ║
// ║  archivo local marcado como ausente cuando el frontend intente bajar. ║
// ╚═══════════════════════════════════════════════════════════════════════╝

const fs   = require('fs/promises');
const path = require('path');
const { getMetaPool } = require('../config/db');

// Días que conservamos los .sql.gz en disco.  Si querés cambiarlo,
// editá esta constante (o expónla en .env si en algún momento querés
// configurarlo sin tocar código).
const RETENCION_DIAS = 30;

const MS_POR_DIA = 1000 * 60 * 60 * 24;

/**
 * Recorre la carpeta de backups y borra los archivos .sql.gz cuya fecha
 * de modificación es anterior al límite.  Además, marca el `filepath`
 * como NULL en la tabla `backups` para que el frontend sepa que el
 * archivo local ya no está disponible para descarga directa.
 */
const limpiarBackupsAntiguos = async (dir) => {
  // Si la carpeta no existe (primera ejecución), no hay nada que limpiar.
  let entradas;
  try {
    entradas = await fs.readdir(dir);
  } catch (err) {
    if (err.code === 'ENOENT') return { borrados: 0 };
    throw err;
  }

  const corte = Date.now() - RETENCION_DIAS * MS_POR_DIA;
  const borrados = [];

  for (const nombre of entradas) {
    if (!nombre.endsWith('.sql.gz')) continue;
    const ruta = path.join(dir, nombre);
    try {
      const stat = await fs.stat(ruta);
      if (stat.mtimeMs < corte) {
        await fs.unlink(ruta);
        borrados.push(nombre);
      }
    } catch {
      // Si no podemos leer/borrar un archivo individual seguimos con
      // el siguiente — la limpieza nunca debe romper el flujo principal.
    }
  }

  // Sincroniza la tabla: los registros cuyo archivo se acaba de borrar
  // pasan a tener filepath = NULL.  Así el botón "Descargar" del front
  // puede mostrar "no disponible localmente" sin consultar el disco.
  if (borrados.length) {
    const pool = getMetaPool();
    const placeholders = borrados.map(() => '?').join(',');
    await pool.query(
      `UPDATE backups SET filepath = NULL
        WHERE filename IN (${placeholders})`,
      borrados
    );
  }

  return { borrados: borrados.length };
};

module.exports = {
  limpiarBackupsAntiguos,
  RETENCION_DIAS,
};
