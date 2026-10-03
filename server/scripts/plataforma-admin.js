// Crea o actualiza una cuenta del panel de plataforma (academias.eduguat.com).
//
//   node scripts/plataforma-admin.js <correo> ["Nombre visible"]
//
// Pide la contraseña por la terminal sin mostrarla.  Si el correo ya existe,
// sólo cambia la contraseña (y cierra su sesión abierta).

require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });
const readline = require('readline');
const bcrypt = require('bcryptjs');
const { getMetaPool } = require('../config/db');
const { bootstrapMeta } = require('../utils/sedeRegistry');

const preguntarOculto = (texto) => new Promise((resolve) => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  rl._writeToOutput = (s) => { if (s.includes(texto)) rl.output.write(s); };
  rl.question(texto, (r) => { rl.close(); process.stdout.write('\n'); resolve(r); });
});

(async () => {
  const email = String(process.argv[2] || '').trim().toLowerCase();
  const nombre = process.argv[3] || 'Dueño EduGuat';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error('Uso: node scripts/plataforma-admin.js <correo> ["Nombre"]');
    process.exit(1);
  }
  const p1 = await preguntarOculto('Contraseña (mín. 10 caracteres): ');
  if (p1.length < 10) { console.error('Muy corta.'); process.exit(1); }
  const p2 = await preguntarOculto('Repite la contraseña: ');
  if (p1 !== p2) { console.error('No coinciden.'); process.exit(1); }

  await bootstrapMeta();
  const hash = await bcrypt.hash(p1, 12);
  const pool = getMetaPool();
  const [r] = await pool.query(
    `INSERT INTO plataforma_admins (nombre, email, password) VALUES (?,?,?)
     ON DUPLICATE KEY UPDATE password = VALUES(password), session_jti = NULL, activo = 1`,
    [nombre, email, hash]
  );
  console.log(r.affectedRows === 1 ? `Cuenta creada: ${email}` : `Contraseña actualizada: ${email}`);
  process.exit(0);
})().catch((err) => { console.error(err.message); process.exit(1); });
