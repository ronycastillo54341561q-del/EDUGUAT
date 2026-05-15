const db = require('../config/db');
const { log } = require('../utils/bitacora');

// Catálogo central de módulos disponibles para asignar permisos.
// Debe coincidir con los módulos referenciados en client/src/lib/permissions.js
// y en los Routes del backend (verifyRole). Si agregás un módulo nuevo, sumalo acá.
const MODULOS = [
  'dashboard','alumnos','asistencia','mecanografia','notasTac','inscritosTac',
  'notasDiplomados','planificaciones','diplomados','pagos','nuevoPago',
  'otrosPagos','recibos','papeleria','reporteAlumno','reporteFinanciero',
  'consultas','impresion','misTablas','bitacora','configuracion','usuarios',
  'roles','pagosInstitucion','avisos','academias','constancias','importar','backups',
];

const ROLES_BASE = new Set(['admin','alumno','oficina','maestro']);

const SLUG_RE = /^[a-z0-9_]{2,40}$/;

const getModulos = (_req, res) => {
  res.json(MODULOS);
};

const fetchRolCompleto = async (id) => {
  const [[rol]] = await db.query(
    'SELECT id, slug, nombre, descripcion, activo FROM roles_custom WHERE id = ?',
    [id]
  );
  if (!rol) return null;
  const [permisos] = await db.query(
    'SELECT modulo, can_view, can_edit, can_export FROM role_permisos WHERE rol_id = ?',
    [id]
  );
  const [[horario]] = await db.query(
    'SELECT dias, hora_inicio, hora_fin, activo FROM role_horarios WHERE rol_id = ?',
    [id]
  );
  return {
    ...rol,
    activo:   !!rol.activo,
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

const listar = async (_req, res) => {
  try {
    const [roles] = await db.query(
      'SELECT id FROM roles_custom ORDER BY nombre ASC'
    );
    const detalle = [];
    for (const { id } of roles) {
      const r = await fetchRolCompleto(id);
      if (r) detalle.push(r);
    }
    res.json(detalle);
  } catch (err) {
    console.error('roles.listar:', err);
    res.status(500).json({ message: 'Error al listar roles' });
  }
};

const obtener = async (req, res) => {
  try {
    const r = await fetchRolCompleto(req.params.id);
    if (!r) return res.status(404).json({ message: 'Rol no encontrado' });
    res.json(r);
  } catch (err) {
    console.error('roles.obtener:', err);
    res.status(500).json({ message: 'Error al obtener rol' });
  }
};

const validarHorario = (h) => {
  if (!h) return null;
  const dias = String(h.dias || '').trim();
  if (!/^[0-6](,[0-6]){0,6}$/.test(dias)) {
    return 'Días inválidos (formato esperado: lista CSV de 0-6, ej: 1,2,3,4,5)';
  }
  const reHora = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (!reHora.test(h.hora_inicio || '') || !reHora.test(h.hora_fin || '')) {
    return 'Horas inválidas (formato HH:MM en 24h)';
  }
  return null;
};

const crear = async (req, res) => {
  const { slug, nombre, descripcion, activo, permisos, horario } = req.body || {};
  if (!slug || !nombre) {
    return res.status(400).json({ message: 'slug y nombre son requeridos' });
  }
  if (!SLUG_RE.test(slug)) {
    return res.status(400).json({ message: 'Slug inválido (solo a-z, 0-9, _, 2-40 chars)' });
  }
  if (ROLES_BASE.has(slug)) {
    return res.status(400).json({ message: 'No se puede usar un slug reservado (admin, alumno, oficina, maestro)' });
  }
  const errH = validarHorario(horario);
  if (errH) return res.status(400).json({ message: errH });

  try {
    const [exists] = await db.query('SELECT id FROM roles_custom WHERE slug = ?', [slug]);
    if (exists.length) {
      return res.status(400).json({ message: 'Ya existe un rol con ese slug' });
    }
    const [r] = await db.query(
      'INSERT INTO roles_custom (slug, nombre, descripcion, activo) VALUES (?,?,?,?)',
      [slug, nombre, descripcion || null, activo === false ? 0 : 1]
    );
    const rolId = r.insertId;
    if (Array.isArray(permisos) && permisos.length) {
      for (const p of permisos) {
        if (!p?.modulo || !MODULOS.includes(p.modulo)) continue;
        await db.query(
          `INSERT INTO role_permisos (rol_id, modulo, can_view, can_edit, can_export)
           VALUES (?,?,?,?,?)`,
          [rolId, p.modulo, p.can_view ? 1 : 0, p.can_edit ? 1 : 0, p.can_export ? 1 : 0]
        );
      }
    }
    if (horario) {
      await db.query(
        `INSERT INTO role_horarios (rol_id, dias, hora_inicio, hora_fin, activo)
         VALUES (?,?,?,?,?)`,
        [rolId, horario.dias, horario.hora_inicio, horario.hora_fin, horario.activo === false ? 0 : 1]
      );
    }
    log(req, 'crear', 'Roles', `Rol ${slug} creado`);
    res.status(201).json(await fetchRolCompleto(rolId));
  } catch (err) {
    console.error('roles.crear:', err);
    res.status(500).json({ message: 'Error al crear rol' });
  }
};

const actualizar = async (req, res) => {
  const { id } = req.params;
  const { nombre, descripcion, activo, permisos, horario } = req.body || {};
  const errH = validarHorario(horario);
  if (horario && errH) return res.status(400).json({ message: errH });

  try {
    const [[rol]] = await db.query('SELECT id, slug FROM roles_custom WHERE id = ?', [id]);
    if (!rol) return res.status(404).json({ message: 'Rol no encontrado' });

    const sets = []; const params = [];
    if (nombre      !== undefined) { sets.push('nombre = ?');      params.push(nombre); }
    if (descripcion !== undefined) { sets.push('descripcion = ?'); params.push(descripcion); }
    if (activo      !== undefined) { sets.push('activo = ?');      params.push(activo ? 1 : 0); }
    if (sets.length) {
      params.push(id);
      await db.query(`UPDATE roles_custom SET ${sets.join(', ')} WHERE id = ?`, params);
    }
    if (Array.isArray(permisos)) {
      await db.query('DELETE FROM role_permisos WHERE rol_id = ?', [id]);
      for (const p of permisos) {
        if (!p?.modulo || !MODULOS.includes(p.modulo)) continue;
        await db.query(
          `INSERT INTO role_permisos (rol_id, modulo, can_view, can_edit, can_export)
           VALUES (?,?,?,?,?)`,
          [id, p.modulo, p.can_view ? 1 : 0, p.can_edit ? 1 : 0, p.can_export ? 1 : 0]
        );
      }
    }
    if (horario !== undefined) {
      await db.query('DELETE FROM role_horarios WHERE rol_id = ?', [id]);
      if (horario) {
        await db.query(
          `INSERT INTO role_horarios (rol_id, dias, hora_inicio, hora_fin, activo)
           VALUES (?,?,?,?,?)`,
          [id, horario.dias, horario.hora_inicio, horario.hora_fin, horario.activo === false ? 0 : 1]
        );
      }
    }
    log(req, 'actualizar', 'Roles', `Rol ${rol.slug} actualizado`);
    res.json(await fetchRolCompleto(id));
  } catch (err) {
    console.error('roles.actualizar:', err);
    res.status(500).json({ message: 'Error al actualizar rol' });
  }
};

const eliminar = async (req, res) => {
  const { id } = req.params;
  try {
    const [[rol]] = await db.query('SELECT id, slug FROM roles_custom WHERE id = ?', [id]);
    if (!rol) return res.status(404).json({ message: 'Rol no encontrado' });

    const [usos] = await db.query('SELECT COUNT(*) AS n FROM usuarios WHERE rol = ?', [rol.slug]);
    if (usos[0].n > 0) {
      return res.status(400).json({
        message: `No se puede eliminar: hay ${usos[0].n} usuario(s) asignado(s) a este rol. Cambia su rol antes.`,
      });
    }
    await db.query('DELETE FROM role_permisos WHERE rol_id = ?', [id]);
    await db.query('DELETE FROM role_horarios WHERE rol_id = ?', [id]);
    await db.query('DELETE FROM roles_custom WHERE id = ?', [id]);
    log(req, 'eliminar', 'Roles', `Rol ${rol.slug} eliminado`);
    res.json({ ok: true });
  } catch (err) {
    console.error('roles.eliminar:', err);
    res.status(500).json({ message: 'Error al eliminar rol' });
  }
};

// ─── Permisos override para roles base (admin/oficina/maestro) ──────────────
const BASE_SLUGS = ['admin','oficina','maestro'];

// Devuelve los overrides cargados para una sede.  Estructura:
//   { admin: [{ modulo, can_view, can_edit, can_export }, ...], oficina: [...], maestro: [...] }
const fetchBaseOverrides = async () => {
  const [rows] = await db.query(
    'SELECT rol_slug, modulo, can_view, can_edit, can_export FROM role_permisos_base'
  );
  const out = { admin: [], oficina: [], maestro: [] };
  for (const r of rows) {
    if (out[r.rol_slug]) {
      out[r.rol_slug].push({
        modulo: r.modulo,
        can_view:   !!r.can_view,
        can_edit:   !!r.can_edit,
        can_export: !!r.can_export,
      });
    }
  }
  return out;
};

const fetchBaseOverridesPara = async (slug) => {
  if (!BASE_SLUGS.includes(slug)) return [];
  const [rows] = await db.query(
    'SELECT modulo, can_view, can_edit, can_export FROM role_permisos_base WHERE rol_slug = ?',
    [slug]
  );
  return rows.map(r => ({
    modulo: r.modulo,
    can_view:   !!r.can_view,
    can_edit:   !!r.can_edit,
    can_export: !!r.can_export,
  }));
};

const listarBase = async (_req, res) => {
  try {
    const overrides = await fetchBaseOverrides();
    res.json(overrides);
  } catch (err) {
    console.error('roles.listarBase:', err);
    res.status(500).json({ message: 'Error al listar permisos de roles base' });
  }
};

const actualizarBase = async (req, res) => {
  const { slug } = req.params;
  if (!BASE_SLUGS.includes(slug)) {
    return res.status(400).json({ message: 'Rol base no válido (admin, oficina o maestro)' });
  }
  const { permisos } = req.body || {};
  if (!Array.isArray(permisos)) {
    return res.status(400).json({ message: 'permisos debe ser un arreglo' });
  }
  try {
    await db.query('DELETE FROM role_permisos_base WHERE rol_slug = ?', [slug]);
    for (const p of permisos) {
      if (!p?.modulo || !MODULOS.includes(p.modulo)) continue;
      await db.query(
        `INSERT INTO role_permisos_base (rol_slug, modulo, can_view, can_edit, can_export)
         VALUES (?,?,?,?,?)`,
        [slug, p.modulo, p.can_view ? 1 : 0, p.can_edit ? 1 : 0, p.can_export ? 1 : 0]
      );
    }
    log(req, 'actualizar', 'Roles', `Permisos del rol base "${slug}" actualizados`);
    const overrides = await fetchBaseOverrides();
    res.json(overrides);
  } catch (err) {
    console.error('roles.actualizarBase:', err);
    res.status(500).json({ message: 'Error al actualizar permisos del rol base' });
  }
};

module.exports = {
  getModulos, listar, obtener, crear, actualizar, eliminar,
  fetchRolCompleto, fetchBaseOverridesPara, listarBase, actualizarBase,
  MODULOS, ROLES_BASE, BASE_SLUGS,
};
