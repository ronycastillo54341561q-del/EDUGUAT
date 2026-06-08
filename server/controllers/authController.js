const { getPool, runWithSede, pools, SEDES, sedesMeta } = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const ROLES_BASE = new Set(['admin','alumno','oficina','maestro']);
const BASE_OVERRIDABLE = new Set(['admin','oficina','maestro']);

// Lee overrides de permisos para un rol base desde el pool de la sede.
// Devuelve array de { modulo, can_view, can_edit, can_export }.
const cargarBaseOverrides = async (pool, slug) => {
  if (!BASE_OVERRIDABLE.has(slug)) return [];
  try {
    const [rows] = await pool.query(
      'SELECT modulo, can_view, can_edit, can_export FROM role_permisos_base WHERE rol_slug = ?',
      [slug]
    );
    return rows.map(r => ({
      modulo: r.modulo,
      can_view:   !!r.can_view,
      can_edit:   !!r.can_edit,
      can_export: !!r.can_export,
    }));
  } catch {
    return [];
  }
};

// Lee el rol custom (slug, permisos, horario) usando el pool de la sede.
const cargarRolCustom = async (pool, slug) => {
  const [[rol]] = await pool.query(
    'SELECT id, slug, nombre, activo FROM roles_custom WHERE slug = ?',
    [slug]
  );
  if (!rol) return null;
  const [permisos] = await pool.query(
    'SELECT modulo, can_view, can_edit, can_export FROM role_permisos WHERE rol_id = ?',
    [rol.id]
  );
  const [[horario]] = await pool.query(
    'SELECT dias, hora_inicio, hora_fin, activo FROM role_horarios WHERE rol_id = ?',
    [rol.id]
  );
  return {
    id: rol.id,
    slug: rol.slug,
    nombre: rol.nombre,
    activo: !!rol.activo,
    permisos: permisos.map(p => ({
      modulo: p.modulo,
      can_view:   !!p.can_view,
      can_edit:   !!p.can_edit,
      can_export: !!p.can_export,
    })),
    horario: horario ? {
      dias:        horario.dias,
      hora_inicio: horario.hora_inicio,
      hora_fin:    horario.hora_fin,
      activo:      !!horario.activo,
    } : null,
  };
};

// Devuelve true si la fecha (Date) cae dentro del horario configurado.
// `dias` es CSV con valores 0..6 (0=Domingo, 1=Lunes, ..., 6=Sábado).
const dentroDeHorario = (horario, ahora = new Date()) => {
  if (!horario || !horario.activo) return true;
  const dia = ahora.getDay(); // 0..6
  const dias = String(horario.dias || '').split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
  if (dias.length && !dias.includes(dia)) return false;

  const toMin = (hhmm) => {
    const [h, m] = String(hhmm).split(':').map(n => parseInt(n, 10) || 0);
    return h * 60 + m;
  };
  const ahoraMin = ahora.getHours() * 60 + ahora.getMinutes();
  const ini = toMin(horario.hora_inicio);
  const fin = toMin(horario.hora_fin);
  if (ini <= fin) return ahoraMin >= ini && ahoraMin <= fin;
  // Cruce de medianoche (ej. 22:00 → 02:00)
  return ahoraMin >= ini || ahoraMin <= fin;
};

const login = async (req, res) => {
  const { email, password, sede } = req.body;

  // Validación de sede: debe existir en nuestra lista
  const sedeId = sede && pools[sede] ? sede : null;
  if (!sedeId) {
    return res.status(400).json({ message: 'Sede no válida o no especificada' });
  }

  // La sede debe estar activa.  Las semillas que aún no se hayan
  // registrado en la meta se consideran activas por defecto.
  const meta = sedesMeta[sedeId];
  if (meta && meta.activo === false) {
    return res.status(403).json({ message: 'Esta sede está deshabilitada' });
  }

  try {
    const pool = getPool(sedeId);
    const [rows] = await pool.query(
      'SELECT * FROM usuarios WHERE email = ? AND activo = 1',
      [email]
    );

    if (rows.length === 0)
      return res.status(401).json({ message: 'Credenciales incorrectas' });

    const usuario = rows[0];
    const passwordValido = await bcrypt.compare(password, usuario.password);

    if (!passwordValido)
      return res.status(401).json({ message: 'Credenciales incorrectas' });

    // Si el usuario tiene un rol personalizado (no base), validamos que
    // el rol exista, esté activo y que el login se intente dentro del
    // horario configurado. El rol "admin" nunca tiene restricción de
    // horario (failsafe para evitar bloquearse del sistema).
    let rolCustom = null;
    let rolOverrides = null;
    if (!ROLES_BASE.has(usuario.rol)) {
      rolCustom = await cargarRolCustom(pool, usuario.rol);
      if (!rolCustom || !rolCustom.activo) {
        return res.status(403).json({ message: 'Tu rol está deshabilitado o ya no existe. Contactá al administrador.' });
      }
      if (rolCustom.horario && !dentroDeHorario(rolCustom.horario)) {
        const dias = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
        const diasPermitidos = String(rolCustom.horario.dias || '').split(',').map(d => dias[parseInt(d, 10)] || d).join(', ');
        return res.status(403).json({
          message: `Acceso fuera del horario permitido para tu rol. Horario: ${diasPermitidos} de ${rolCustom.horario.hora_inicio} a ${rolCustom.horario.hora_fin}.`,
        });
      }
    } else if (BASE_OVERRIDABLE.has(usuario.rol)) {
      // Rol base con overrides configurables desde la UI de Roles.
      rolOverrides = {
        slug: usuario.rol,
        permisos: await cargarBaseOverrides(pool, usuario.rol),
      };
    }

    // Sesión única: emitimos un jti nuevo y lo persistimos como el "vivo".
    // Cualquier token previo del usuario queda invalidado en el siguiente
    // request (verifyToken compara jti contra el guardado).
    const jti = crypto.randomBytes(16).toString('hex');
    await pool.query(
      'UPDATE usuarios SET session_jti = ?, last_activity = NOW() WHERE id = ?',
      [jti, usuario.id]
    );

    const token = jwt.sign(
      { id: usuario.id, nombre: usuario.nombre, rol: usuario.rol, sede: sedeId, jti },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({
      token,
      usuario: {
        id: usuario.id,
        nombre: usuario.nombre,
        email: usuario.email,
        rol: usuario.rol,
        sede: sedeId,
        rol_custom: rolCustom,
        rol_overrides: rolOverrides,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error en el servidor' });
  }
};

const crearUsuario = async (req, res) => {
  const { nombre, email, password, rol } = req.body;
  const pool = getPool(req.user.sede);

  try {
    const [existe] = await pool.query('SELECT id FROM usuarios WHERE email = ?', [email]);
    if (existe.length > 0)
      return res.status(400).json({ message: 'El email ya está registrado' });

    const hash = await bcrypt.hash(password, 10);
    await pool.query(
      'INSERT INTO usuarios (nombre, email, password, rol) VALUES (?, ?, ?, ?)',
      [nombre, email, hash, rol]
    );

    res.status(201).json({ message: 'Usuario creado correctamente' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error en el servidor' });
  }
};

const getMe = async (req, res) => {
  try {
    const pool = getPool(req.user.sede);
    const [rows] = await pool.query(
      'SELECT id, nombre, email, rol FROM usuarios WHERE id = ?',
      [req.user.id]
    );
    if (rows.length === 0)
      return res.status(404).json({ message: 'Usuario no encontrado' });

    let rolCustom = null;
    let rolOverrides = null;
    if (!ROLES_BASE.has(rows[0].rol)) {
      rolCustom = await cargarRolCustom(pool, rows[0].rol);
    } else if (BASE_OVERRIDABLE.has(rows[0].rol)) {
      rolOverrides = {
        slug: rows[0].rol,
        permisos: await cargarBaseOverrides(pool, rows[0].rol),
      };
    }

    res.json({ ...rows[0], sede: req.user.sede, rol_custom: rolCustom, rol_overrides: rolOverrides });
  } catch (err) {
    res.status(500).json({ message: 'Error en el servidor' });
  }
};

// Cierra la sesión activa del usuario en el servidor (limpia el jti).
// Cualquier petición futura con el token actual será rechazada con 401.
const logout = async (req, res) => {
  try {
    const pool = getPool(req.user.sede);
    await pool.query(
      'UPDATE usuarios SET session_jti = NULL, last_activity = NULL WHERE id = ?',
      [req.user.id]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('logout error:', err.message);
    res.json({ ok: true });
  }
};

// Endpoint público: lista de sedes ACTIVAS para la pantalla SedeSelector.
// Las inactivas no se exponen para que no aparezcan antes del login.
// Se incluyen los módulos habilitados para que el Sidebar pueda filtrar
// la navegación según lo configurado por el super-admin.
const listSedes = (req, res) => {
  // Filtra por tipo de inquilino.  Sin parámetro (o cualquier valor que no
  // sea 'institucion') devuelve sólo academias, así el SedeSelector de
  // siempre (`GET /sedes`) no cambia.  El selector de instituciones llama
  // `GET /sedes?tipo=institucion`.
  const tipo = req.query.tipo === 'institucion' ? 'institucion' : 'academia';
  const activas = SEDES.filter(s => {
    const meta = sedesMeta[s.id];
    if (meta && meta.activo === false) return false;
    return (meta?.tipo || 'academia') === tipo;
  }).map(s => {
    const meta = sedesMeta[s.id] || {};
    return {
      id: s.id,
      nombre: s.nombre,
      info: meta.info || null,
      modulos: Array.isArray(meta.modulos) ? meta.modulos : null,
      tipo: meta.tipo || 'academia',
    };
  });
  res.json(activas);
};

module.exports = { login, logout, crearUsuario, getMe, listSedes };
