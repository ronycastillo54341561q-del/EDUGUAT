// Registro de academias (sedes) en la base meta `eduguat_meta`.
//
// Cada fila guarda:
//   - id           identificador interno y nombre de la base de datos MySQL
//   - nombre       etiqueta visible
//   - activo       1/0; las inactivas no aparecen en el selector ni permiten login
//   - modulos      JSON con la lista de módulos habilitados (null = todos)
//   - email_admin  email del admin principal (informativo / recuperación)
//
// Las sedes "semilla" se registran automáticamente la primera vez que
// arranca el servidor (INSERT IGNORE) para no romper instalaciones
// existentes y para garantizar que una base meta fresca quede poblada
// con las 8 sedes operativas.  A partir de ahí la lista es 100% dinámica:
// el servidor lee SIEMPRE `eduguat_meta.sedes` y bootstrappea lo que
// encuentre allí (incluidas sedes creadas después desde la UI).

const mysql = require('mysql2/promise');
const {
  META_DB, getMetaPool, registerSede, SEDES, sedesMeta,
} = require('../config/db');
const { bootstrapSede } = require('./sedeBootstrap');

const SEMILLAS = [
  { id: 'm_lozano',             nombre: 'M Lozano' },
  { id: 'sistec_jutiapa',       nombre: 'Sistec Jutiapa' },
  { id: 'sistema_escolar',      nombre: 'Sistec Flores' },
  { id: 'sistec_flores_oficial', nombre: 'Sistec Flores Oficial' },
  { id: 'm_lozano_genova',      nombre: 'M Lozano Génova' },
  { id: 'testimport1',          nombre: 'Test Import 1' },
  { id: 'sistec_xela',          nombre: 'Sistec Xela' },
  { id: 'sistec_jalapa',        nombre: 'Sistec Jalapa' },
];

const bootstrapMeta = async () => {
  // Crea la base meta si no existe (sin usar el pool — éste apunta a META_DB).
  const admin = await mysql.createConnection({
    host:     process.env.DB_HOST,
    port:     Number(process.env.DB_PORT) || 3306,
    user:     process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  });
  try {
    await admin.query(
      `CREATE DATABASE IF NOT EXISTS \`${META_DB}\` ` +
      `DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
  } finally {
    await admin.end();
  }

  const pool = getMetaPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sedes (
      id           VARCHAR(80) PRIMARY KEY,
      nombre       VARCHAR(150) NOT NULL,
      info         TEXT NULL,
      activo       TINYINT(1)   NOT NULL DEFAULT 1,
      modulos      LONGTEXT NULL,
      email_admin  VARCHAR(150) NULL,
      created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  // Migración para instalaciones previas sin la columna `info`.
  try { await pool.query('ALTER TABLE sedes ADD COLUMN info TEXT NULL AFTER nombre'); }
  catch (_) { /* ya existe */ }

  // ─────────────────────────────────────────────────────────────────────
  // Tabla `backups` — historial de respaldos del sistema completo.
  // Vive en eduguat_meta porque cada backup cubre TODAS las sedes (es
  // global, no por-sede).  Las columnas drive_* las dejamos preparadas
  // para Fase 2 aunque todavía no se usen, así no migramos después.
  // ─────────────────────────────────────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS backups (
      id              INT AUTO_INCREMENT PRIMARY KEY,
      filename        VARCHAR(255) NOT NULL,
      filepath        VARCHAR(500) NULL,
      size_bytes      BIGINT NOT NULL DEFAULT 0,
      tipo            ENUM('manual','automatico') NOT NULL DEFAULT 'manual',
      estado          ENUM('ok','error') NOT NULL DEFAULT 'ok',
      error_msg       TEXT NULL,
      drive_file_id   VARCHAR(255) NULL,
      drive_link      VARCHAR(500) NULL,
      drive_status    ENUM('pendiente','ok','error') NOT NULL DEFAULT 'pendiente',
      usuario_id      INT NULL,
      usuario_nombre  VARCHAR(150) NULL,
      created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_created_at (created_at),
      INDEX idx_tipo (tipo)
    )
  `);

  // Inserta las semillas si todavía no están en el registro
  for (const { id, nombre } of SEMILLAS) {
    await pool.query(
      'INSERT IGNORE INTO sedes (id, nombre, activo, modulos) VALUES (?,?,1,NULL)',
      [id, nombre]
    );
  }
};

const cargarSedes = async () => {
  const pool = getMetaPool();
  const [rows] = await pool.query(
    'SELECT id, nombre, info, activo, modulos, email_admin FROM sedes ORDER BY created_at ASC'
  );
  // Limpia el array global y vuelve a poblarlo con los datos del registro.
  SEDES.length = 0;
  for (const r of rows) {
    registerSede({
      id: r.id, nombre: r.nombre, info: r.info,
      activo: r.activo, modulos: r.modulos,
      email_admin: r.email_admin,
    });
  }
  return rows;
};

const insertarSede = async ({ id, nombre, info, modulos, email_admin }) => {
  const pool = getMetaPool();
  await pool.query(
    'INSERT INTO sedes (id, nombre, info, activo, modulos, email_admin) VALUES (?,?,?,1,?,?)',
    [id, nombre, info || null, modulos ? JSON.stringify(modulos) : null, email_admin || null]
  );
  registerSede({ id, nombre, info: info || null, activo: 1, modulos: modulos || null, email_admin });
};

const actualizarActivo = async (id, activo) => {
  const pool = getMetaPool();
  await pool.query('UPDATE sedes SET activo = ? WHERE id = ?', [activo ? 1 : 0, id]);
  if (sedesMeta[id]) sedesMeta[id].activo = !!activo;
};

const actualizarSede = async (id, { nombre, info, modulos, email_admin }) => {
  const pool = getMetaPool();
  const sets = [];
  const args = [];
  if (nombre !== undefined)      { sets.push('nombre = ?');      args.push(nombre); }
  if (info !== undefined)        { sets.push('info = ?');        args.push(info || null); }
  if (modulos !== undefined)     { sets.push('modulos = ?');     args.push(modulos ? JSON.stringify(modulos) : null); }
  if (email_admin !== undefined) { sets.push('email_admin = ?'); args.push(email_admin || null); }
  if (!sets.length) return;
  args.push(id);
  await pool.query(`UPDATE sedes SET ${sets.join(', ')} WHERE id = ?`, args);
  if (sedesMeta[id]) {
    if (nombre !== undefined)      sedesMeta[id].nombre = nombre;
    if (info !== undefined)        sedesMeta[id].info = info || null;
    if (modulos !== undefined)     sedesMeta[id].modulos = modulos || null;
    if (email_admin !== undefined) sedesMeta[id].email_admin = email_admin || null;
    const idx = SEDES.findIndex(s => s.id === id);
    if (idx >= 0 && nombre !== undefined) SEDES[idx] = { id, nombre };
  }
};

// Orquestador completo que se ejecuta al arrancar el servidor:
//   1) asegura la base meta y su tabla `sedes` (con las 8 semillas)
//   2) lee TODAS las sedes desde `eduguat_meta.sedes` y las registra
//      en memoria (cada una obtiene su pool vía registerSede→ensurePool)
//   3) para CADA sede crea su BD/esquema si no existen e inicializa el
//      admin por defecto.
//
// Los errores se loguean por sede pero nunca detienen el arranque: si
// una sede falla (BD caída, credenciales, etc.) las demás siguen.
// Loguea TODO lo relevante de un error.  Para errores de mysql2 el
// `.message` suele venir vacío y la causa real está en code/errno/
// sqlMessage — por eso volcamos el error completo y sus campos SQL.
const logError = (label, err) => {
  console.error(`${label}:`, {
    message:    err && err.message,
    code:       err && err.code,
    errno:      err && err.errno,
    sqlState:   err && err.sqlState,
    sqlMessage: err && err.sqlMessage,
    stack:      err && err.stack,
  });
  console.error(`${label} (raw):`, err);
};

const bootstrapTodasLasSedes = async () => {
  try {
    await bootstrapMeta();
  } catch (err) {
    logError('bootstrapMeta error', err);
  }

  let rows = [];
  try {
    rows = await cargarSedes();
  } catch (err) {
    logError('cargarSedes error', err);
  }

  for (const { id } of rows) {
    try {
      await bootstrapSede(id);
      console.log(`  [${id}] sede inicializada`);
    } catch (err) {
      logError(`Error al inicializar sede ${id}`, err);
    }
  }
  return rows;
};

module.exports = {
  bootstrapMeta,
  cargarSedes,
  bootstrapTodasLasSedes,
  insertarSede,
  actualizarActivo,
  actualizarSede,
};
