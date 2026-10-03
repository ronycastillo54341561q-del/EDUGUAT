// Panel de plataforma (academias.eduguat.com) — gestión de inquilinos por
// el dueño de EduGuat, separada de cualquier sede.
//
// Aislamiento:
//   - Las cuentas viven en `eduguat_meta.plataforma_admins`, no en ninguna sede.
//   - Los tokens se firman con una clave DERIVADA de JWT_SECRET, así un token
//     de plataforma no pasa `verifyToken` de las sedes y viceversa.
//   - Sólo lee metadatos de `eduguat_meta.sedes`.  Lo único que escribe dentro
//     de una sede es la tabla `usuarios` (alta del admin inicial vía
//     bootstrapSede y restablecer contraseña de un admin).

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { SEDES, sedesMeta, pools, getMetaPool, getPool } = require('../config/db');
const {
  insertarSede, actualizarSede, actualizarActivo, MODULOS_INSTITUCION_DEFAULT,
} = require('../utils/sedeRegistry');
const { bootstrapSede } = require('../utils/sedeBootstrap');
const { MODULOS_DISPONIBLES } = require('./academiasController');

const PLATAFORMA_SECRET = () =>
  crypto.createHmac('sha256', String(process.env.JWT_SECRET || '')).update('eduguat-plataforma').digest('hex');

// Bases de MySQL que nunca pueden usarse como id de sede.
const RESERVADAS = new Set([
  'eduguat_meta', 'mysql', 'information_schema', 'performance_schema', 'sys',
]);

const EXTRA_LABELS = {
  nominas: 'Nóminas', horarios: 'Horarios', roles: 'Roles', constancias: 'Constancias',
};
const CATALOGO = [
  ...MODULOS_DISPONIBLES,
  ...MODULOS_INSTITUCION_DEFAULT
    .filter(id => !MODULOS_DISPONIBLES.some(m => m.id === id))
    .map(id => ({ id, label: EXTRA_LABELS[id] || id })),
];
const IDS_VALIDOS = new Set(CATALOGO.map(m => m.id));

const slugify = (s) => String(s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '')
  .slice(0, 60);

const idValido = (id) => /^[a-z][a-z0-9_]{2,59}$/.test(id);
const emailValido = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

const sanitizarModulos = (raw) => {
  if (!Array.isArray(raw)) return null;
  const limpios = raw.filter(m => IDS_VALIDOS.has(m));
  return limpios.length ? limpios : null;
};

// Contraseña legible para dictar por teléfono: sin 0/O/1/l/I.
const generarPassword = () => {
  const abc = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(12);
  return Array.from(bytes, b => abc[b % abc.length]).join('');
};

// ── Auth ────────────────────────────────────────────────────────────────

// Freno simple a fuerza bruta: 8 intentos fallidos por IP cada 15 min.
const intentos = new Map();
const VENTANA_MS = 15 * 60 * 1000;
const bloqueado = (ip) => {
  const r = intentos.get(ip);
  if (!r || Date.now() - r.desde > VENTANA_MS) return false;
  return r.n >= 8;
};
const fallo = (ip) => {
  const r = intentos.get(ip);
  if (!r || Date.now() - r.desde > VENTANA_MS) intentos.set(ip, { n: 1, desde: Date.now() });
  else r.n += 1;
};

const login = async (req, res) => {
  const ip = req.headers['x-real-ip'] || req.ip;
  if (bloqueado(ip)) {
    return res.status(429).json({ message: 'Demasiados intentos. Espera 15 minutos.' });
  }
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  if (!email || !password) return res.status(400).json({ message: 'Correo y contraseña requeridos' });

  try {
    const [[admin]] = await getMetaPool().query(
      'SELECT id, nombre, email, password, activo FROM plataforma_admins WHERE email = ?', [email]
    );
    const ok = admin && admin.activo && await bcrypt.compare(password, admin.password);
    if (!ok) {
      fallo(ip);
      return res.status(401).json({ message: 'Credenciales incorrectas' });
    }
    intentos.delete(ip);
    const jti = crypto.randomUUID();
    await getMetaPool().query(
      'UPDATE plataforma_admins SET session_jti = ?, last_login = NOW() WHERE id = ?', [jti, admin.id]
    );
    const token = jwt.sign(
      { id: admin.id, nombre: admin.nombre, scope: 'plataforma', jti },
      PLATAFORMA_SECRET(),
      { expiresIn: '8h' }
    );
    res.json({ token, admin: { id: admin.id, nombre: admin.nombre, email: admin.email } });
  } catch (err) {
    console.error('plataforma login error:', err);
    res.status(500).json({ message: 'Error al iniciar sesión' });
  }
};

const verifyPlataforma = async (req, res, next) => {
  const token = (req.headers.authorization || '').split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Token requerido' });
  let decoded;
  try {
    decoded = jwt.verify(token, PLATAFORMA_SECRET());
  } catch {
    return res.status(401).json({ message: 'Sesión inválida o expirada' });
  }
  if (decoded.scope !== 'plataforma') return res.status(401).json({ message: 'Sesión inválida' });
  try {
    const [[row]] = await getMetaPool().query(
      'SELECT activo, session_jti FROM plataforma_admins WHERE id = ?', [decoded.id]
    );
    if (!row || !row.activo || row.session_jti !== decoded.jti) {
      return res.status(401).json({ message: 'Sesión finalizada' });
    }
  } catch (err) {
    console.error('verifyPlataforma error:', err);
    return res.status(500).json({ message: 'Error de autenticación' });
  }
  req.plataforma = decoded;
  next();
};

const me = (req, res) => res.json({ id: req.plataforma.id, nombre: req.plataforma.nombre });

const logout = async (req, res) => {
  await getMetaPool().query('UPDATE plataforma_admins SET session_jti = NULL WHERE id = ?', [req.plataforma.id]);
  res.json({ ok: true });
};

// ── Sedes ───────────────────────────────────────────────────────────────

const modulos = (_req, res) => res.json({
  catalogo: CATALOGO,
  institucionDefault: MODULOS_INSTITUCION_DEFAULT,
});

const listar = async (_req, res) => {
  try {
    const [rows] = await getMetaPool().query(
      'SELECT id, nombre, tipo, info, activo, modulos, email_admin, created_at FROM sedes ORDER BY created_at ASC'
    );
    res.json(rows.map(r => ({
      id: r.id,
      nombre: r.nombre,
      tipo: r.tipo === 'institucion' ? 'institucion' : 'academia',
      info: r.info,
      activo: !!r.activo,
      modulos: sedesMeta[r.id]?.modulos ?? null,
      email_admin: r.email_admin,
      created_at: r.created_at,
      cargada: !!pools[r.id],
    })));
  } catch (err) {
    console.error('plataforma listar error:', err);
    res.status(500).json({ message: 'Error al listar sedes' });
  }
};

const crear = async (req, res) => {
  const b = req.body || {};
  const nombre = String(b.nombre || '').trim();
  const tipo = b.tipo === 'institucion' ? 'institucion' : 'academia';
  const id = String(b.id || slugify(nombre));
  const email = String(b.email_admin || '').trim().toLowerCase();
  const password = String(b.admin_password || '') || generarPassword();

  if (!nombre) return res.status(400).json({ message: 'Nombre requerido' });
  if (!idValido(id)) {
    return res.status(400).json({
      message: 'ID inválido: minúsculas, números y guion bajo (3-60, empieza con letra)',
    });
  }
  if (!emailValido(email)) return res.status(400).json({ message: 'Correo del administrador inválido' });
  if (password.length < 8) return res.status(400).json({ message: 'La contraseña debe tener al menos 8 caracteres' });
  if (RESERVADAS.has(id) || pools[id]) return res.status(409).json({ message: 'Ya existe una sede con ese ID' });

  try {
    // El servidor MySQL es compartido con otras apps: jamás inicializamos
    // el esquema encima de una base que ya exista.
    const [existe] = await getMetaPool().query(
      'SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?', [id]
    );
    if (existe.length) {
      return res.status(409).json({ message: `Ya existe una base de datos llamada "${id}". Usa otro ID.` });
    }

    await insertarSede({
      id, nombre, tipo,
      info: b.info ? String(b.info) : null,
      modulos: sanitizarModulos(b.modulos),
      email_admin: email,
    });
    await bootstrapSede(id, { email, password, nombre: `Admin ${nombre}` });

    console.log(`[plataforma] ${req.plataforma.nombre} creó ${tipo} ${id}`);
    res.status(201).json({ id, nombre, tipo, email_admin: email, password });
  } catch (err) {
    console.error('plataforma crear error:', err);
    res.status(500).json({ message: 'No se pudo crear: ' + err.message });
  }
};

const editar = async (req, res) => {
  const { id } = req.params;
  if (!pools[id]) return res.status(404).json({ message: 'Sede no encontrada' });
  const b = req.body || {};
  const patch = {};
  if (b.nombre !== undefined) {
    patch.nombre = String(b.nombre).trim();
    if (!patch.nombre) return res.status(400).json({ message: 'El nombre no puede estar vacío' });
  }
  if (b.info !== undefined) patch.info = b.info ? String(b.info) : null;
  if (b.modulos !== undefined) patch.modulos = sanitizarModulos(b.modulos);
  try {
    await actualizarSede(id, patch);
    res.json({ ok: true });
  } catch (err) {
    console.error('plataforma editar error:', err);
    res.status(500).json({ message: 'No se pudo actualizar' });
  }
};

const cambiarActivo = async (req, res) => {
  const { id } = req.params;
  if (!pools[id]) return res.status(404).json({ message: 'Sede no encontrada' });
  try {
    await actualizarActivo(id, !!req.body?.activo);
    res.json({ id, activo: !!req.body?.activo });
  } catch (err) {
    console.error('plataforma activo error:', err);
    res.status(500).json({ message: 'No se pudo actualizar el estado' });
  }
};

// ── Admins de una sede (única escritura dentro de la BD de la sede) ─────

const listarAdmins = async (req, res) => {
  const { id } = req.params;
  if (!pools[id]) return res.status(404).json({ message: 'Sede no encontrada' });
  try {
    const [rows] = await getPool(id).query(
      "SELECT id, nombre, email, activo FROM usuarios WHERE rol = 'admin' ORDER BY id"
    );
    res.json(rows.map(r => ({ ...r, activo: r.activo !== 0 })));
  } catch (err) {
    console.error('plataforma admins error:', err);
    res.status(500).json({ message: 'No se pudieron leer los administradores' });
  }
};

const restablecerPassword = async (req, res) => {
  const { id, userId } = req.params;
  if (!pools[id]) return res.status(404).json({ message: 'Sede no encontrada' });
  const password = String(req.body?.password || '') || generarPassword();
  if (password.length < 8) return res.status(400).json({ message: 'La contraseña debe tener al menos 8 caracteres' });
  try {
    const hash = await bcrypt.hash(password, 10);
    // session_jti = NULL cierra la sesión abierta con la contraseña anterior.
    const [r] = await getPool(id).query(
      "UPDATE usuarios SET password = ?, session_jti = NULL WHERE id = ? AND rol = 'admin'",
      [hash, userId]
    );
    if (!r.affectedRows) return res.status(404).json({ message: 'Administrador no encontrado' });
    console.log(`[plataforma] ${req.plataforma.nombre} restableció admin ${userId} de ${id}`);
    res.json({ password });
  } catch (err) {
    console.error('plataforma reset error:', err);
    res.status(500).json({ message: 'No se pudo restablecer la contraseña' });
  }
};

module.exports = {
  login, verifyPlataforma, me, logout,
  modulos, listar, crear, editar, cambiarActivo,
  listarAdmins, restablecerPassword,
};
