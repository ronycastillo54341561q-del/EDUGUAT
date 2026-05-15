// ╔══════════════════════════════════════════════════════════════════════╗
// ║  dump-all.js                                                          ║
// ║                                                                       ║
// ║  Exporta TODAS las bases del sistema (eduguat_meta + cada sede) a     ║
// ║  archivos .sql en server/sql/dump/.  La lista de sedes NO se cablea:  ║
// ║  se lee de eduguat_meta.sedes, igual que hace el servidor al arrancar,║
// ║  así salen las 8 (o las que haya) y no solo las del init-sedes.sql.   ║
// ║                                                                       ║
// ║  Uso:  cd server  &&  npm run db:dump                                 ║
// ╚══════════════════════════════════════════════════════════════════════╝

const fs   = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const mysql = require('mysql2/promise');
require('dotenv').config();

const HOST = process.env.DB_HOST     || '127.0.0.1';
const PORT = Number(process.env.DB_PORT) || 3306;
const USER = process.env.DB_USER     || 'root';
const PASS = process.env.DB_PASSWORD || '';
const META_DB = 'eduguat_meta';

const OUT_DIR = path.resolve(__dirname, '..', 'sql', 'dump');

(async () => {
  // 1) Lee la lista real de sedes desde la base meta.
  let sedeIds = [];
  try {
    const conn = await mysql.createConnection({
      host: HOST, port: PORT, user: USER, password: PASS, database: META_DB,
    });
    const [rows] = await conn.query('SELECT id FROM sedes ORDER BY created_at ASC');
    sedeIds = rows.map(r => r.id);
    await conn.end();
  } catch (err) {
    console.error(`No pude leer ${META_DB}.sedes: ${err.message}`);
    console.error('¿Está corriendo MySQL local y existe eduguat_meta?');
    process.exit(1);
  }

  // La base meta también se exporta (guarda el registro de sedes).
  const databases = [META_DB, ...sedeIds];
  console.log(`Bases a exportar (${databases.length}): ${databases.join(', ')}`);

  fs.mkdirSync(OUT_DIR, { recursive: true });

  // mysqldump lee la contraseña de MYSQL_PWD → no aparece en la línea de
  // comando ni causa problemas de comillas/caracteres especiales.
  const env = { ...process.env, MYSQL_PWD: PASS };

  let ok = 0;
  for (const db of databases) {
    const outFile = path.join(OUT_DIR, `${db}.sql`);
    const args = [
      `-h${HOST}`, `-P${PORT}`, `-u${USER}`,
      '--databases', db,            // incluye CREATE DATABASE + USE
      '--single-transaction',       // dump consistente sin lockear
      '--routines', '--triggers', '--events',
      '--no-tablespaces',           // evita necesitar privilegio PROCESS
      '--set-gtid-purged=OFF',      // importable en MySQL gestionado (Railway)
      '--default-character-set=utf8mb4',
    ];

    process.stdout.write(`  → ${db} ... `);
    const r = spawnSync('mysqldump', args, {
      env,
      encoding: 'buffer',
      maxBuffer: 1024 * 1024 * 512, // 512 MB por si alguna base es grande
    });

    if (r.status !== 0) {
      console.log('ERROR');
      console.error(r.stderr ? r.stderr.toString() : r.error?.message);
      continue;
    }
    fs.writeFileSync(outFile, r.stdout);
    const mb = (fs.statSync(outFile).size / 1048576).toFixed(2);
    console.log(`OK (${mb} MB) → sql/dump/${db}.sql`);
    ok++;
  }

  // 2) Deja una guía de importación junto a los dumps.
  const guia = [
    'IMPORTAR EN RAILWAY',
    '===================',
    '',
    'Variables del servicio MySQL de Railway (pestaña Variables / Connect):',
    '  MYSQLHOST, MYSQLPORT, MYSQLUSER, MYSQLPASSWORD',
    '',
    'Opción A — script automático (recomendado):',
    '  Define en server/.env estas 4 variables apuntando a Railway:',
    '    RW_DB_HOST=...  RW_DB_PORT=...  RW_DB_USER=root  RW_DB_PASSWORD=...',
    '  Luego:  npm run db:restore',
    '',
    'Opción B — manual, una por una (PowerShell, dentro de server/sql/dump):',
    '  $env:MYSQL_PWD="<MYSQLPASSWORD>"',
    ...databases.map(db =>
      `  Get-Content ${db}.sql | mysql -h <MYSQLHOST> -P <MYSQLPORT> -u root`),
    '',
    'No necesitas crear las bases a mano: cada .sql trae su CREATE DATABASE.',
  ].join('\n');
  fs.writeFileSync(path.join(OUT_DIR, 'IMPORTAR-RAILWAY.txt'), guia, 'utf8');

  console.log(`\nListo: ${ok}/${databases.length} bases exportadas en ${OUT_DIR}`);
  console.log('Lee sql/dump/IMPORTAR-RAILWAY.txt para subirlas a Railway.');
  process.exit(ok === databases.length ? 0 : 1);
})();
