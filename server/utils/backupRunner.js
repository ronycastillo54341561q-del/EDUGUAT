// ╔═══════════════════════════════════════════════════════════════════════╗
// ║  backupRunner.js                                                      ║
// ║                                                                       ║
// ║  Orquesta la creación de un backup completo del sistema:              ║
// ║   1) Genera (en JS, sin binarios externos) un volcado SQL de TODAS    ║
// ║      las bases del sistema (sedes registradas + eduguat_meta) a un    ║
// ║      único stream.                                                    ║
// ║   2) Comprime ese stream "al vuelo" con gzip para ahorrar espacio     ║
// ║      (un dump SQL plano puede ser 5–10× más grande que el .gz).       ║
// ║   3) Guarda el archivo en /server/backups/.                           ║
// ║   4) Registra el backup en la tabla `backups` de eduguat_meta.        ║
// ║   5) Borra archivos locales con más de 30 días (Drive sigue intacto). ║
// ║                                                                       ║
// ║  Uso típico:                                                          ║
// ║     const r = await crearBackup({ tipo: 'manual', usuario: req.user });║
// ║     // r = { id, filename, size, ok: true }                           ║
// ╚═══════════════════════════════════════════════════════════════════════╝

const mysql           = require('mysql2');
const fs              = require('fs');
const fsp             = require('fs/promises');
const path            = require('path');
const zlib            = require('zlib');
const { Readable }    = require('stream');
const { pipeline }    = require('stream/promises');

const { getMetaPool, SEDES, META_DB, ensurePool } = require('../config/db');
const { limpiarBackupsAntiguos }      = require('./backupCleanup');
const googleDrive                     = require('./googleDrive');

// Carpeta donde viven los .sql.gz locales.  La creamos al vuelo si no existe.
// path.resolve(__dirname, '..', 'backups') => <proyecto>/server/backups
const BACKUPS_DIR = path.resolve(__dirname, '..', 'backups');

// Extension única para que sea fácil identificar/listar.
const EXT = '.sql.gz';

// Cuántas filas traemos por lote al volcar una tabla.  Evita cargar tablas
// enormes completas en memoria; cada lote se serializa y libera enseguida.
const BATCH_ROWS = 1000;

/**
 * Devuelve el pool mysql2 (modo promise) correcto para una base:
 *   - eduguat_meta → el pool meta dedicado.
 *   - cualquier sede → su pool (lo crea si aún no existía).
 * Reutilizamos los pools que ya mantiene config/db.js para no abrir
 * conexiones nuevas en cada backup.
 */
const poolDe = (dbName) =>
  (dbName === META_DB ? getMetaPool() : ensurePool(dbName));

/**
 * Devuelve la lista de bases de datos que entran en cada backup:
 *   - todas las sedes registradas en memoria (semilla + dinámicas)
 *   - + eduguat_meta (la base "registro" que guarda la lista de sedes
 *     y la tabla `backups`).  Si no la respaldamos, perderíamos el
 *     registro de academias en una restauración.
 *
 *  Nota: leemos `SEDES` directamente porque se actualiza en tiempo real
 *  cuando un super-admin crea una academia nueva.
 */
const getDatabasesABackup = () => {
  const dbs = SEDES.map(s => s.id);
  if (!dbs.includes(META_DB)) dbs.push(META_DB);
  return dbs;
};

/**
 * Genera un nombre de archivo único basado en la fecha/hora local.
 * Formato: eduguat-backup-YYYYMMDD-HHMMSS.sql.gz
 *   - Es ordenable alfabéticamente (= ordenable por fecha) sin parsear.
 *   - No tiene caracteres conflictivos (':' rompe en Windows).
 */
const generarNombre = (tipo) => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp =
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  return `eduguat-${tipo}-${stamp}${EXT}`;
};

/**
 * Asegura que /server/backups/ exista.  `recursive: true` no lanza error
 * si ya existe (idempotente).
 */
const asegurarCarpeta = async () => {
  await fsp.mkdir(BACKUPS_DIR, { recursive: true });
};

/**
 * Generador asíncrono que va produciendo el texto SQL del backup completo,
 * base por base.  Al ser un generador, nunca tenemos todo el dump en
 * memoria: cada `yield` se comprime y escribe a disco antes de seguir.
 *
 * Por cada base de datos emite, en orden:
 *   1) CREATE DATABASE IF NOT EXISTS + USE  (restaurar desde cero).
 *   2) Por cada tabla base: DROP + CREATE TABLE (vía SHOW CREATE TABLE,
 *      idéntico a lo que haría mysqldump) y sus filas en INSERTs por lotes.
 *   3) Vistas, procedimientos/funciones y triggers.
 *
 * Equivale a `mysqldump --databases --routines --triggers` pero usando
 * la conexión mysql2 que ya tenemos — sin depender de ningún binario
 * externo (Railway no trae el cliente de MySQL).
 *
 * @param {string[]} databases  bases a volcar
 */
async function* generarSQL(databases) {
  const ts = new Date().toISOString();
  yield `-- EduGuat backup (generador JS) — ${ts}\n`;
  yield `-- Bases: ${databases.join(', ')}\n`;
  yield `SET NAMES utf8mb4;\nSET FOREIGN_KEY_CHECKS = 0;\nSET SQL_MODE = 'NO_AUTO_VALUE_ON_ZERO';\n`;

  for (const db of databases) {
    const pool = poolDe(db);
    yield `\n\n-- ╔══════════════════════════════════════════════════╗\n`;
    yield `-- ║  Base de datos: ${db}\n`;
    yield `-- ╚══════════════════════════════════════════════════╝\n`;
    yield `CREATE DATABASE IF NOT EXISTS \`${db}\` `
        + `/*!40100 DEFAULT CHARACTER SET utf8mb4 */;\n`;
    yield `USE \`${db}\`;\n`;

    // --- Tablas base: esquema + datos -----------------------------------
    const [tablas] = await pool.query(
      "SHOW FULL TABLES WHERE Table_type = 'BASE TABLE'"
    );
    for (const fila of tablas) {
      const tabla = Object.values(fila)[0]; // 1ª col = Tables_in_<db>

      const [[crt]] = await pool.query(`SHOW CREATE TABLE \`${tabla}\``);
      yield `\nDROP TABLE IF EXISTS \`${tabla}\`;\n`;
      yield `${crt['Create Table']};\n`;

      const [[{ n }]] = await pool.query(
        `SELECT COUNT(*) AS n FROM \`${tabla}\``
      );
      for (let off = 0; off < n; off += BATCH_ROWS) {
        const [rows] = await pool.query(
          `SELECT * FROM \`${tabla}\` LIMIT ${BATCH_ROWS} OFFSET ${off}`
        );
        if (!rows.length) break;
        const cols = Object.keys(rows[0])
          .map((c) => `\`${c}\``)
          .join(', ');
        const tuplas = rows
          .map(
            (r) =>
              '(' +
              Object.values(r)
                .map((v) => mysql.escape(v)) // escapa null/fechas/blobs OK
                .join(', ') +
              ')'
          )
          .join(',\n');
        yield `INSERT INTO \`${tabla}\` (${cols}) VALUES\n${tuplas};\n`;
      }
    }

    // --- Vistas ----------------------------------------------------------
    const [vistas] = await pool.query(
      "SHOW FULL TABLES WHERE Table_type = 'VIEW'"
    );
    for (const fila of vistas) {
      const vista = Object.values(fila)[0];
      const [[cv]] = await pool.query(`SHOW CREATE VIEW \`${vista}\``);
      yield `\nDROP VIEW IF EXISTS \`${vista}\`;\n${cv['Create View']};\n`;
    }

    // --- Procedimientos y funciones -------------------------------------
    for (const tipo of ['PROCEDURE', 'FUNCTION']) {
      const [rutinas] = await pool.query(
        `SHOW ${tipo} STATUS WHERE Db = ?`,
        [db]
      );
      for (const rut of rutinas) {
        const [[cr]] = await pool.query(
          `SHOW CREATE ${tipo} \`${rut.Name}\``
        );
        const clave = tipo === 'PROCEDURE' ? 'Create Procedure' : 'Create Function';
        const cuerpo = cr[clave];
        if (!cuerpo) continue;
        yield `\nDROP ${tipo} IF EXISTS \`${rut.Name}\`;\n`;
        yield `DELIMITER ;;\n${cuerpo} ;;\nDELIMITER ;\n`;
      }
    }

    // --- Triggers --------------------------------------------------------
    const [triggers] = await pool.query('SHOW TRIGGERS');
    for (const tg of triggers) {
      yield `\nDROP TRIGGER IF EXISTS \`${tg.Trigger}\`;\n`;
      yield `DELIMITER ;;\n`;
      yield `CREATE TRIGGER \`${tg.Trigger}\` ${tg.Timing} ${tg.Event} `
          + `ON \`${tg.Table}\` FOR EACH ROW ${tg.Statement} ;;\n`;
      yield `DELIMITER ;\n`;
    }
  }

  yield `\nSET FOREIGN_KEY_CHECKS = 1;\n-- Fin del backup\n`;
}

/**
 * Genera el dump en JS y lo escribe comprimido a disco:
 *   generador SQL → gzip → archivo .sql.gz
 * `pipeline` cierra y limpia todos los streams aunque alguno falle.
 *
 * @param {string} filepath  ruta destino del .sql.gz
 * @param {string[]} databases  bases a volcar
 */
const ejecutarDump = (filepath, databases) => {
  const archivo = fs.createWriteStream(filepath);
  const gzip    = zlib.createGzip({ level: 6 }); // 6 = balance velocidad/ratio
  return pipeline(Readable.from(generarSQL(databases)), gzip, archivo);
};

/**
 * Punto de entrada principal.  Orquesta todo el flujo y devuelve el
 * registro recién creado en la tabla `backups`.
 *
 * @param {Object} opts
 * @param {'manual'|'automatico'} opts.tipo  cómo se disparó el backup
 * @param {Object} [opts.usuario]            req.user — null si vino del cron
 * @returns {{ id, filename, filepath, size, tipo, ok, error? }}
 */
const crearBackup = async ({ tipo = 'manual', usuario = null } = {}) => {
  await asegurarCarpeta();

  const filename = generarNombre(tipo);
  const filepath = path.join(BACKUPS_DIR, filename);
  const dbs      = getDatabasesABackup();
  const pool     = getMetaPool();

  let size = 0;
  let ok   = false;
  let errorMsg = null;

  // Variables para Drive — se llenan después del dump exitoso.
  let driveFileId = null;
  let driveLink   = null;
  let driveStatus = 'pendiente'; // 'pendiente' | 'ok' | 'error'

  try {
    // 1) Volcado + compresión.
    await ejecutarDump(filepath, dbs);

    // 2) Tamaño final del archivo en disco (en bytes).  Lo guardamos
    //    para mostrar "12.4 MB" en la tabla del frontend.
    const stat = await fsp.stat(filepath);
    size = stat.size;
    ok   = true;
  } catch (err) {
    errorMsg = err.message || String(err);
    // Si el archivo quedó a medio escribir, lo borramos para no
    // ensuciar la carpeta con archivos corruptos.
    try { await fsp.unlink(filepath); } catch { /* puede no existir */ }
  }

  // 3) Subida a Google Drive — solo si el dump local fue exitoso Y las
  //    credenciales OAuth están configuradas.  Si Drive falla, NO
  //    afectamos el estado del backup local: el .sql.gz ya está en
  //    disco y eso es lo importante.  Solo marcamos drive_status='error'
  //    para que el admin lo vea en la tabla.
  if (ok) {
    if (googleDrive.isConfigured()) {
      console.log(`[backup] Subiendo ${filename} a Google Drive...`);
      try {
        const t0 = Date.now();
        const r  = await googleDrive.subirArchivo(filepath, filename);
        driveFileId = r.fileId;
        driveLink   = r.webViewLink;
        driveStatus = 'ok';
        console.log(`[backup] Subida OK en ${Date.now() - t0}ms — fileId=${r.fileId}`);
      } catch (e) {
        console.error('[backup] googleDrive.subirArchivo:', e.message);
        driveStatus = 'error';
        if (!errorMsg) errorMsg = `Drive: ${e.message}`;
      }
    } else {
      // Diagnóstico: si está acá es que falta alguna env-var.  Imprimimos
      // cuál falta para que sea fácil corregir sin adivinar.
      const faltan = [];
      if (!process.env.GOOGLE_CLIENT_ID)        faltan.push('GOOGLE_CLIENT_ID');
      if (!process.env.GOOGLE_CLIENT_SECRET)    faltan.push('GOOGLE_CLIENT_SECRET');
      if (!process.env.GOOGLE_REFRESH_TOKEN)    faltan.push('GOOGLE_REFRESH_TOKEN');
      if (!process.env.GOOGLE_DRIVE_FOLDER_ID)  faltan.push('GOOGLE_DRIVE_FOLDER_ID');
      else if (process.env.GOOGLE_DRIVE_FOLDER_ID.startsWith('REEMPLAZAR'))
        faltan.push('GOOGLE_DRIVE_FOLDER_ID (todavía es el placeholder)');
      console.warn(
        `[backup] Drive no configurado, salto subida. ` +
        `Variables faltantes: ${faltan.join(', ') || '(ninguna detectada — revisar reinicio del backend)'}`
      );
    }
  }

  // 4) Registro en la tabla `backups` de eduguat_meta — siempre
  //    insertamos, incluso si falló, para que quede traza del intento.
  const [r] = await pool.query(
    `INSERT INTO backups
       (filename, filepath, size_bytes, tipo, estado, error_msg,
        drive_file_id, drive_link, drive_status,
        usuario_id, usuario_nombre)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [
      filename,
      ok ? filepath : null,                 // sin archivo si falló
      size,
      tipo,
      ok ? 'ok' : 'error',
      errorMsg,
      driveFileId,
      driveLink,
      driveStatus,
      usuario?.id || null,
      usuario?.nombre || (tipo === 'automatico' ? 'Sistema (cron)' : 'Sistema'),
    ]
  );

  // 4) Limpieza de archivos > 30 días (no bloquea la respuesta si falla).
  limpiarBackupsAntiguos(BACKUPS_DIR).catch((e) => {
    console.error('limpiarBackupsAntiguos:', e.message);
  });

  if (!ok) {
    // Re-lanzamos para que el controller responda 500 al frontend, pero el
    // registro de error YA quedó en la tabla.
    const e = new Error(errorMsg || 'Error desconocido en backup');
    e.backupId = r.insertId;
    throw e;
  }

  return {
    id: r.insertId,
    filename,
    filepath,
    size,
    tipo,
    ok: true,
    drive: {
      status: driveStatus,
      fileId: driveFileId,
      link:   driveLink,
    },
  };
};

module.exports = {
  crearBackup,
  BACKUPS_DIR,
};
