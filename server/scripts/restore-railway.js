// ╔══════════════════════════════════════════════════════════════════════╗
// ║  restore-railway.js                                                   ║
// ║                                                                       ║
// ║  Importa todos los .sql de server/sql/dump/ a una base destino        ║
// ║  (Railway).  Cada dump trae su CREATE DATABASE, así que crea las      ║
// ║  bases solo — no hay que prepararlas a mano.                          ║
// ║                                                                       ║
// ║  Requiere en server/.env (apuntando al MySQL de Railway):             ║
// ║    RW_DB_HOST  RW_DB_PORT  RW_DB_USER  RW_DB_PASSWORD                  ║
// ║                                                                       ║
// ║  Uso:  cd server  &&  npm run db:restore                              ║
// ╚══════════════════════════════════════════════════════════════════════╝

const fs   = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
require('dotenv').config();

const HOST = process.env.RW_DB_HOST;
const PORT = Number(process.env.RW_DB_PORT) || 3306;
const USER = process.env.RW_DB_USER || 'root';
const PASS = process.env.RW_DB_PASSWORD;

const DUMP_DIR = path.resolve(__dirname, '..', 'sql', 'dump');

if (!HOST || !PASS) {
  console.error('Faltan RW_DB_HOST / RW_DB_PASSWORD en server/.env');
  console.error('Cópialas desde la pestaña Variables del MySQL de Railway.');
  process.exit(1);
}

if (!fs.existsSync(DUMP_DIR)) {
  console.error(`No existe ${DUMP_DIR}. Corre primero:  npm run db:dump`);
  process.exit(1);
}

// Importa eduguat_meta primero (registro de sedes) y luego el resto.
const files = fs.readdirSync(DUMP_DIR)
  .filter(f => f.endsWith('.sql'))
  .sort((a, b) => (a === 'eduguat_meta.sql' ? -1 : b === 'eduguat_meta.sql' ? 1 : a.localeCompare(b)));

if (!files.length) {
  console.error('No hay archivos .sql en sql/dump/. Corre:  npm run db:dump');
  process.exit(1);
}

console.log(`Importando ${files.length} bases a Railway (${HOST}:${PORT})`);
const env = { ...process.env, MYSQL_PWD: PASS };

let ok = 0;
for (const file of files) {
  const full = path.join(DUMP_DIR, file);
  process.stdout.write(`  → ${file} ... `);
  const r = spawnSync(
    'mysql',
    [`-h${HOST}`, `-P${PORT}`, `-u${USER}`, '--default-character-set=utf8mb4'],
    { env, input: fs.readFileSync(full), encoding: 'buffer',
      maxBuffer: 1024 * 1024 * 512 }
  );
  if (r.status !== 0) {
    console.log('ERROR');
    console.error(r.stderr ? r.stderr.toString() : r.error?.message);
    continue;
  }
  console.log('OK');
  ok++;
}

console.log(`\nListo: ${ok}/${files.length} bases importadas a Railway.`);
process.exit(ok === files.length ? 0 : 1);
