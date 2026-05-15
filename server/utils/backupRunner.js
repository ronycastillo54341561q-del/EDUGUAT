// ╔═══════════════════════════════════════════════════════════════════════╗
// ║  backupRunner.js                                                      ║
// ║                                                                       ║
// ║  Orquesta la creación de un backup completo del sistema:              ║
// ║   1) Lanza `mysqldump` para volcar TODAS las bases de datos del       ║
// ║      sistema (todas las sedes registradas + eduguat_meta) a un        ║
// ║      único stream SQL.                                                ║
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

const { spawn }       = require('child_process');
const fs              = require('fs');
const fsp             = require('fs/promises');
const path            = require('path');
const zlib            = require('zlib');
const { pipeline }    = require('stream/promises');

const { getMetaPool, SEDES, META_DB } = require('../config/db');
const { limpiarBackupsAntiguos }      = require('./backupCleanup');
const googleDrive                     = require('./googleDrive');

// Carpeta donde viven los .sql.gz locales.  La creamos al vuelo si no existe.
// path.resolve(__dirname, '..', 'backups') => <proyecto>/server/backups
const BACKUPS_DIR = path.resolve(__dirname, '..', 'backups');

// Extension única para que sea fácil identificar/listar.
const EXT = '.sql.gz';

/**
 * Resuelve la ruta efectiva al binario `mysqldump`.  Esta función existe
 * porque es muy fácil que un estudiante (¡o cualquiera!) ponga en .env la
 * ruta a la CARPETA `bin` en vez de al .exe — y `spawn` no expande eso,
 * tira ENOENT.  Detectamos el caso y completamos la ruta.
 *
 * Casos:
 *   1) MYSQLDUMP_PATH no seteado     → 'mysqldump' (busca en PATH)
 *   2) Es un archivo existente       → tal cual
 *   3) Es una carpeta existente      → carpeta + 'mysqldump[.exe]'
 *   4) No existe (ruta inválida)     → tal cual (spawn dará ENOENT claro)
 */
const resolveMysqldumpCmd = () => {
  const raw = process.env.MYSQLDUMP_PATH;
  if (!raw) return 'mysqldump';
  try {
    const stat = fs.statSync(raw);
    if (stat.isDirectory()) {
      const bin = process.platform === 'win32' ? 'mysqldump.exe' : 'mysqldump';
      return path.join(raw, bin);
    }
    return raw;
  } catch {
    return raw;
  }
};

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
 * Corre mysqldump y conecta su stdout a un archivo .gz.
 *
 * Detalles importantes:
 *   - El password se pasa por la variable de entorno MYSQL_PWD del proceso
 *     hijo, NO como argumento (-p<pwd>).  Si lo ponemos en argv, queda
 *     visible en `ps`/Task Manager para cualquier usuario del sistema.
 *   - --single-transaction abre una transacción consistente sin
 *     bloquear escrituras (ideal para InnoDB, que es el motor por
 *     defecto de MySQL 8).
 *   - --routines, --triggers, --events incluyen procedimientos,
 *     triggers y eventos; sin estos flags el backup quedaría incompleto.
 *   - --databases <a> <b>  vuelca varias BDs en el mismo archivo
 *     incluyendo los CREATE DATABASE — esencial para restaurar todo
 *     el sistema desde cero.
 *
 * @param {string} filepath  ruta destino del .sql.gz
 * @param {string[]} databases  bases a volcar
 */
const ejecutarDump = (filepath, databases) => {
  // Resuelve dónde está mysqldump.  Toleramos tres formatos en .env:
  //   - Sin variable        → confiamos en el PATH del sistema.
  //   - Ruta a un archivo   → la usamos tal cual (ej: ...\bin\mysqldump.exe).
  //   - Ruta a una carpeta  → le agregamos el binario al final.  En
  //     Windows el ejecutable se llama mysqldump.exe; en Linux/Mac es
  //     simplemente mysqldump.
  // Si la ruta no existe, devolvemos el string igual y dejamos que
  // spawn falle con ENOENT — el mensaje queda claro en la tabla.
  const cmd = resolveMysqldumpCmd();

  const args = [
    '-h', process.env.DB_HOST || 'localhost',
    '-u', process.env.DB_USER || 'root',
    '--single-transaction',
    '--routines',
    '--triggers',
    '--events',
    '--default-character-set=utf8mb4',
    '--databases', ...databases,
  ];

  const child = spawn(cmd, args, {
    env: {
      ...process.env,
      // mysqldump lee MYSQL_PWD si no se le pasa -p.  Es la forma
      // recomendada por la documentación oficial para no exponer la clave.
      MYSQL_PWD: process.env.DB_PASSWORD || '',
    },
    // En Windows necesitamos shell=false (default) para que spawn no
    // interprete caracteres especiales del password.
    windowsHide: true,
  });

  // Acumula stderr — lo usamos como mensaje de error si el proceso falla.
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

  const archivo = fs.createWriteStream(filepath);
  const gzip    = zlib.createGzip({ level: 6 }); // 6 = balance velocidad/ratio

  // Pipeline: stdout(mysqldump) → gzip → archivo en disco.
  // `pipeline` cierra todos los streams correctamente si alguno falla.
  const pipelinePromise = pipeline(child.stdout, gzip, archivo);

  // Promesa que se resuelve cuando el proceso hijo termina con código 0
  // o se rechaza con el stderr capturado.
  const procesoPromise = new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) return resolve();
      reject(new Error(
        `mysqldump terminó con código ${code}. ` +
        (stderr.trim() || 'Sin detalle de error en stderr.')
      ));
    });
  });

  // Esperamos AMBAS: la descarga completa y el cierre limpio del proceso.
  return Promise.all([pipelinePromise, procesoPromise]);
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
