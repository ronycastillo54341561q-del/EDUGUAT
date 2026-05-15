// Matriz central de permisos por rol del sistema.
// `view` = puede entrar a la página; `edit` = puede crear/editar/eliminar.
// El backend siempre valida también, esto es solo para UI.

// El super-admin (admin de la sede semilla `sistema_escolar`) es el único
// que puede gestionar academias.  El backend duplica esta validación.
export const SUPER_ADMIN_SEDE = 'sistema_escolar';

export const isSuperAdmin = (usuario, sede) => {
  if (!usuario || usuario.rol !== 'admin') return false;
  const sedeId = sede?.id || usuario?.sede;
  return sedeId === SUPER_ADMIN_SEDE;
};

const PERMS = {
  admin: {
    dashboard:        { view: true,  edit: true  },
    alumnos:          { view: true,  edit: true  },
    asistencia:       { view: true,  edit: true  },
    mecanografia:     { view: true,  edit: true  },
    notasTac:         { view: true,  edit: true  },
    inscritosTac:     { view: true,  edit: true  },
    notasDiplomados:  { view: true,  edit: true  },
    planificaciones:  { view: true,  edit: true  },
    diplomados:       { view: true,  edit: true  },
    pagos:            { view: true,  edit: true  },
    nuevoPago:        { view: true,  edit: true  },
    otrosPagos:       { view: true,  edit: true  },
    recibos:          { view: true,  edit: true  },
    papeleria:        { view: true,  edit: true  },
    reporteAlumno:    { view: true,  edit: true  },
    reporteFinanciero:{ view: true,  edit: true  },
    consultas:        { view: true,  edit: true  },
    impresion:        { view: true,  edit: true  },
    misTablas:        { view: true,  edit: true  },
    bitacora:         { view: true,  edit: true  },
    configuracion:    { view: true,  edit: true  },
    usuarios:         { view: true,  edit: true  },
    roles:            { view: true,  edit: true  },
    pagosInstitucion: { view: true,  edit: true  },
    avisos:           { view: true,  edit: true  },
    academias:        { view: true,  edit: true  },
    constancias:      { view: true,  edit: true  },
    importar:         { view: true,  edit: true  },
    backups:          { view: true,  edit: true  },
    relaciones:       { view: true,  edit: false },
    manual:           { view: true,  edit: false },
  },
  oficina: {
    dashboard:        { view: false, edit: false },
    alumnos:          { view: true,  edit: true  },
    asistencia:       { view: true,  edit: true  },
    mecanografia:     { view: true,  edit: true  },
    notasTac:         { view: true,  edit: true  },
    inscritosTac:     { view: true,  edit: true  },
    notasDiplomados:  { view: true,  edit: false },
    planificaciones:  { view: true,  edit: false },
    diplomados:       { view: true,  edit: false },
    pagos:            { view: true,  edit: false },
    nuevoPago:        { view: true,  edit: true  },
    otrosPagos:       { view: true,  edit: true  },
    recibos:          { view: true,  edit: true  },
    papeleria:        { view: true,  edit: true  },
    reporteAlumno:    { view: true,  edit: true  },
    reporteFinanciero:{ view: false, edit: false },
    consultas:        { view: true,  edit: true  },
    impresion:        { view: true,  edit: true  },
    misTablas:        { view: true,  edit: true  },
    bitacora:         { view: false, edit: false },
    configuracion:    { view: false, edit: false },
    usuarios:         { view: false, edit: false },
    pagosInstitucion: { view: false, edit: false },
    avisos:           { view: true,  edit: true  },
    constancias:      { view: true,  edit: true  },
    manual:           { view: true,  edit: false },
  },
  maestro: {
    dashboard:        { view: false, edit: false },
    alumnos:          { view: true,  edit: false },
    asistencia:       { view: true,  edit: true  },
    mecanografia:     { view: true,  edit: true  },
    notasTac:         { view: true,  edit: false },
    inscritosTac:     { view: true,  edit: false },
    notasDiplomados:  { view: true,  edit: false },
    planificaciones:  { view: true,  edit: false },
    diplomados:       { view: true,  edit: false },
    pagos:            { view: true,  edit: false },
    nuevoPago:        { view: false, edit: false },
    otrosPagos:       { view: false, edit: false },
    recibos:          { view: false, edit: false },
    papeleria:        { view: false, edit: false },
    reporteAlumno:    { view: true,  edit: true  },
    reporteFinanciero:{ view: false, edit: false },
    consultas:        { view: false, edit: false },
    impresion:        { view: false, edit: false },
    misTablas:        { view: true,  edit: true  },
    bitacora:         { view: false, edit: false },
    configuracion:    { view: false, edit: false },
    usuarios:         { view: false, edit: false },
    pagosInstitucion: { view: false, edit: false },
    avisos:           { view: true,  edit: true  },
    constancias:      { view: false, edit: false },
    manual:           { view: true,  edit: false },
  },
};

export const ROLES = ['admin', 'oficina', 'maestro'];

export const ROLE_LABEL = {
  admin:   'Administrador',
  oficina: 'Oficina',
  maestro: 'Maestro',
  alumno:  'Alumno',
};

// Cache de permisos para roles custom: { [slug]: { [modulo]: { view, edit, export } } }
// Se llena desde AuthContext con el rol_custom devuelto por /login y /me, y se
// consulta por `can()` cuando el rol no es uno base.
let _customPermisos = {};
let _customExports  = {}; // { [slug]: { [modulo]: bool } } — para `canExport()`
// Overrides para roles base. Cuando existe una entrada para (rol, modulo), su
// valor REEMPLAZA al hardcodeado en PERMS. Estructura idéntica a _customPermisos.
let _baseOverrides = {};
const STORAGE_KEY = 'rol_custom_cache_v1';
const BASE_OVERRIDES_KEY = 'rol_base_overrides_v1';

const loadCache = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      _customPermisos = parsed.permisos || {};
      _customExports  = parsed.exports  || {};
    }
  } catch { /* ignora cache inválido */ }
  try {
    const raw = localStorage.getItem(BASE_OVERRIDES_KEY);
    if (raw) _baseOverrides = JSON.parse(raw) || {};
  } catch { /* ignora */ }
};
loadCache();

export const setCustomRolPermisos = (rolCustom) => {
  if (!rolCustom?.slug) return;
  const map = {};
  const exp = {};
  for (const p of (rolCustom.permisos || [])) {
    map[p.modulo] = { view: !!p.can_view, edit: !!p.can_edit, export: !!p.can_export };
    if (p.can_export) exp[p.modulo] = true;
  }
  _customPermisos[rolCustom.slug] = map;
  _customExports[rolCustom.slug]  = exp;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      permisos: _customPermisos,
      exports:  _customExports,
    }));
  } catch { /* localStorage lleno */ }
};

export const clearCustomRolPermisos = () => {
  _customPermisos = {};
  _customExports = {};
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
};

// Aplica overrides para un rol base (admin/oficina/maestro). `overrides` puede
// ser:
//  - { slug, permisos: [{ modulo, can_view, can_edit, can_export }, ...] }
//  - mapa completo { admin: [...], oficina: [...], maestro: [...] }  (admin UI)
export const setBaseRolOverrides = (overrides) => {
  if (!overrides) return;
  const aplicar = (slug, permisos) => {
    if (!['admin','oficina','maestro'].includes(slug)) return;
    if (!Array.isArray(permisos) || !permisos.length) {
      delete _baseOverrides[slug];
      return;
    }
    const map = {};
    for (const p of permisos) {
      map[p.modulo] = { view: !!p.can_view, edit: !!p.can_edit, export: !!p.can_export };
    }
    _baseOverrides[slug] = map;
  };
  if (Array.isArray(overrides.permisos) && overrides.slug) {
    aplicar(overrides.slug, overrides.permisos);
  } else {
    for (const slug of Object.keys(overrides)) {
      aplicar(slug, overrides[slug]);
    }
  }
  try { localStorage.setItem(BASE_OVERRIDES_KEY, JSON.stringify(_baseOverrides)); }
  catch { /* localStorage lleno */ }
};

export const clearBaseRolOverrides = () => {
  _baseOverrides = {};
  try { localStorage.removeItem(BASE_OVERRIDES_KEY); }
  catch { /* ignora */ }
};

export const can = (rol, modulo, action = 'view') => {
  if (!rol) return false;
  const baseR = PERMS[rol];
  if (baseR) {
    // Si hay override para este (rol, modulo), prevalece sobre el default.
    const ov = _baseOverrides[rol]?.[modulo];
    if (ov) return Boolean(ov[action]);
    return Boolean(baseR[modulo]?.[action]);
  }
  // Rol custom — consulta el cache poblado desde AuthContext.
  const custom = _customPermisos[rol];
  if (!custom) return false;
  return Boolean(custom[modulo]?.[action]);
};

// Permiso de exportar para un (rol, módulo). Para roles base respeta override
// can_export si existe; si no, default = puede ver el módulo (no había control
// de exportación previo). Para roles custom respetamos el flag configurado.
export const canExport = (rol, modulo) => {
  if (!rol) return false;
  if (PERMS[rol]) {
    const ov = _baseOverrides[rol]?.[modulo];
    if (ov) return Boolean(ov.export);
    return can(rol, modulo, 'view');
  }
  return Boolean(_customExports[rol]?.[modulo]);
};

export const defaultRoute = (rol) => {
  if (rol === 'admin')   return '/admin/dashboard';
  if (rol === 'oficina') return '/admin/alumnos';
  if (rol === 'maestro') return '/admin/alumnos';
  if (rol === 'alumno')  return '/alumno/dashboard';
  // Custom: redirige al panel admin (su PrivateRoute filtra módulos).
  return rol ? '/admin/alumnos' : '/login';
};

// Roles autorizados para rutas tipo "admin/*" (todo el panel administrativo).
export const ADMIN_PANEL_ROLES = ['admin', 'oficina', 'maestro'];
