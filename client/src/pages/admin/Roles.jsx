import { useState, useEffect, useCallback } from 'react';
import Sidebar from '../../components/Sidebar';
import API from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import { setBaseRolOverrides as cacheBaseOverrides } from '../../lib/permissions';
import './admin.css';

const DIAS = [
  { v: 0, label: 'Dom' },
  { v: 1, label: 'Lun' },
  { v: 2, label: 'Mar' },
  { v: 3, label: 'Mié' },
  { v: 4, label: 'Jue' },
  { v: 5, label: 'Vie' },
  { v: 6, label: 'Sáb' },
];

const ROLES_BASE_OPTS = [
  { value: 'oficina', label: 'Oficina (heredar)' },
  { value: 'maestro', label: 'Maestro (heredar)' },
  { value: 'admin',   label: 'Administrador (heredar)' },
];

// Roles del sistema (defaults hardcodeados + overrides editables).
const ROLES_SISTEMA = [
  { slug: 'admin',   nombre: 'Administrador', descripcion: 'Acceso total al sistema' },
  { slug: 'oficina', nombre: 'Oficina',       descripcion: 'Personal administrativo de oficina' },
  { slug: 'maestro', nombre: 'Maestro',       descripcion: 'Docentes y catedráticos' },
];

// Defaults hardcodeados (mismos que client/src/lib/permissions.js).
// Si no hay override en la BD para un (rol, modulo), aplica estos valores.
// Nota: admin tiene acceso completo (manejado en defaultPara).
// Para "exportar" los defaults son = view (compatibilidad histórica).
const DEFAULTS_BASE = {
  oficina: {
    dashboard:        { v: false, e: false },
    alumnos:          { v: true,  e: true  },
    asistencia:       { v: true,  e: true  },
    mecanografia:     { v: true,  e: true  },
    notasTac:         { v: true,  e: true  },
    inscritosTac:     { v: true,  e: true  },
    notasDiplomados:  { v: true,  e: false },
    planificaciones:  { v: true,  e: false },
    diplomados:       { v: true,  e: false },
    pagos:            { v: true,  e: false },
    nuevoPago:        { v: true,  e: true  },
    otrosPagos:       { v: true,  e: true  },
    recibos:          { v: true,  e: true  },
    papeleria:        { v: true,  e: true  },
    reporteAlumno:    { v: true,  e: true  },
    reporteFinanciero:{ v: false, e: false },
    consultas:        { v: true,  e: true  },
    impresion:        { v: true,  e: true  },
    misTablas:        { v: true,  e: true  },
    bitacora:         { v: false, e: false },
    configuracion:    { v: false, e: false },
    usuarios:         { v: false, e: false },
    roles:            { v: false, e: false },
    pagosInstitucion: { v: false, e: false },
    avisos:           { v: true,  e: true  },
    academias:        { v: false, e: false },
    constancias:      { v: true,  e: true  },
    importar:         { v: false, e: false },
    backups:          { v: false, e: false },
  },
  maestro: {
    dashboard:        { v: false, e: false },
    alumnos:          { v: true,  e: false },
    asistencia:       { v: true,  e: true  },
    mecanografia:     { v: true,  e: true  },
    notasTac:         { v: true,  e: false },
    inscritosTac:     { v: true,  e: false },
    notasDiplomados:  { v: true,  e: false },
    planificaciones:  { v: true,  e: false },
    diplomados:       { v: true,  e: false },
    pagos:            { v: true,  e: false },
    nuevoPago:        { v: false, e: false },
    otrosPagos:       { v: false, e: false },
    recibos:          { v: false, e: false },
    papeleria:        { v: false, e: false },
    reporteAlumno:    { v: true,  e: true  },
    reporteFinanciero:{ v: false, e: false },
    consultas:        { v: false, e: false },
    impresion:        { v: false, e: false },
    misTablas:        { v: true,  e: true  },
    bitacora:         { v: false, e: false },
    configuracion:    { v: false, e: false },
    usuarios:         { v: false, e: false },
    roles:            { v: false, e: false },
    pagosInstitucion: { v: false, e: false },
    avisos:           { v: true,  e: true  },
    academias:        { v: false, e: false },
    constancias:      { v: false, e: false },
    importar:         { v: false, e: false },
    backups:          { v: false, e: false },
  },
};

// Devuelve el permiso default para (rol base, modulo). edit/export = view en
// compatibilidad histórica para roles base; los flags `e` indican edit.
const defaultPara = (rolSlug, modulo) => {
  if (rolSlug === 'admin') return { can_view: true, can_edit: true, can_export: true };
  const m = DEFAULTS_BASE[rolSlug]?.[modulo];
  if (!m) return { can_view: false, can_edit: false, can_export: false };
  return { can_view: !!m.v, can_edit: !!m.e, can_export: !!m.v };
};

const formInicial = () => ({
  slug: '',
  nombre: '',
  descripcion: '',
  base_rol: 'oficina',
  activo: true,
  permisos: {},          // { [modulo]: { can_view, can_edit, can_export } }
  horarioActivo: true,
  horarioDias: [1,2,3,4,5],
  horarioInicio: '08:00',
  horarioFin:    '18:00',
});

export default function Roles() {
  const { usuario } = useAuth();
  const [modulos, setModulos] = useState([]);
  const [roles, setRoles]     = useState([]);
  const [baseOverrides, setBaseOverridesState] = useState({ admin: [], oficina: [], maestro: [] });
  const [cargando, setCargando] = useState(false);
  const [modal, setModal]     = useState(false);
  const [editando, setEditando] = useState(null);
  const [form, setForm]       = useState(formInicial());
  const [error, setError]     = useState('');
  const [msg, setMsg]         = useState('');

  // Estado del modal de edición de un rol del sistema (admin/oficina/maestro).
  const [modalBase, setModalBase] = useState(null); // { slug, nombre } | null
  const [formBase, setFormBase]   = useState({ permisos: {} });
  const [errorBase, setErrorBase] = useState('');

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const [m, r, b] = await Promise.all([
        API.get('/roles/modulos'),
        API.get('/roles'),
        API.get('/roles/base'),
      ]);
      setModulos(m.data);
      setRoles(r.data);
      setBaseOverridesState(b.data || { admin: [], oficina: [], maestro: [] });
    } catch (e) {
      console.error(e);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  // Construye el set de permisos efectivos para un rol base:
  // si hay override en la BD lo usa; si no, aplica el default hardcodeado.
  const permisosEfectivos = (slug) => {
    const overrides = baseOverrides[slug] || [];
    const ovMap = Object.fromEntries(overrides.map(p => [p.modulo, p]));
    const out = {};
    for (const m of modulos) {
      if (ovMap[m]) {
        out[m] = {
          can_view:   !!ovMap[m].can_view,
          can_edit:   !!ovMap[m].can_edit,
          can_export: !!ovMap[m].can_export,
        };
      } else {
        out[m] = defaultPara(slug, m);
      }
    }
    return out;
  };

  const abrirEditarBase = (slug) => {
    const efect = permisosEfectivos(slug);
    setFormBase({ permisos: efect });
    setErrorBase('');
    setModalBase({ slug, nombre: ROLES_SISTEMA.find(r => r.slug === slug)?.nombre || slug });
  };

  const cerrarBase = () => {
    setModalBase(null);
    setErrorBase('');
  };

  const togglePermisoBase = (modulo, key) => {
    setFormBase(p => {
      const m = p.permisos[modulo] || { can_view: false, can_edit: false, can_export: false };
      const next = { ...m, [key]: !m[key] };
      if (key === 'can_view' && !next.can_view) {
        next.can_edit = false;
        next.can_export = false;
      }
      if ((key === 'can_edit' || key === 'can_export') && next[key]) {
        next.can_view = true;
      }
      return { ...p, permisos: { ...p.permisos, [modulo]: next } };
    });
  };

  const guardarBase = async (e) => {
    e.preventDefault();
    if (!modalBase) return;
    setErrorBase('');
    const permisosArr = Object.entries(formBase.permisos).map(([modulo, v]) => ({
      modulo,
      can_view:   !!v.can_view,
      can_edit:   !!v.can_edit,
      can_export: !!v.can_export,
    }));
    try {
      const { data } = await API.put(`/roles/base/${modalBase.slug}`, { permisos: permisosArr });
      setBaseOverridesState(data || { admin: [], oficina: [], maestro: [] });
      // Si el admin actual está editando su propio rol, aplicamos la cache local
      // para que el cambio se vea sin necesidad de re-login.
      if (usuario?.rol === modalBase.slug) {
        cacheBaseOverrides({ slug: modalBase.slug, permisos: permisosArr });
      }
      setMsg(`Permisos del rol "${modalBase.nombre}" actualizados`);
      setTimeout(() => setMsg(''), 2500);
      cerrarBase();
    } catch (err) {
      setErrorBase(err.response?.data?.message || 'Error al guardar');
    }
  };

  const restaurarBase = async () => {
    if (!modalBase) return;
    if (!window.confirm(`¿Restaurar los permisos por defecto del rol "${modalBase.nombre}"?`)) return;
    try {
      const { data } = await API.put(`/roles/base/${modalBase.slug}`, { permisos: [] });
      setBaseOverridesState(data || { admin: [], oficina: [], maestro: [] });
      if (usuario?.rol === modalBase.slug) {
        cacheBaseOverrides({ slug: modalBase.slug, permisos: [] });
      }
      setMsg(`Permisos del rol "${modalBase.nombre}" restaurados`);
      setTimeout(() => setMsg(''), 2500);
      cerrarBase();
    } catch (err) {
      setErrorBase(err.response?.data?.message || 'Error al restaurar');
    }
  };

  const abrirNuevo = () => {
    setEditando(null);
    const f = formInicial();
    // Inicializa permisos vacíos por módulo
    f.permisos = Object.fromEntries(modulos.map(m => [m, { can_view: false, can_edit: false, can_export: false }]));
    setForm(f);
    setError('');
    setModal(true);
  };

  const abrirEditar = (r) => {
    setEditando(r);
    const permisos = Object.fromEntries(modulos.map(m => [m, { can_view: false, can_edit: false, can_export: false }]));
    for (const p of (r.permisos || [])) {
      if (permisos[p.modulo]) {
        permisos[p.modulo] = {
          can_view:   !!p.can_view,
          can_edit:   !!p.can_edit,
          can_export: !!p.can_export,
        };
      }
    }
    setForm({
      slug: r.slug,
      nombre: r.nombre,
      descripcion: r.descripcion || '',
      base_rol: r.base_rol || 'oficina',
      activo: !!r.activo,
      permisos,
      horarioActivo: r.horario ? !!r.horario.activo : true,
      horarioDias:   r.horario ? String(r.horario.dias || '').split(',').map(d => parseInt(d, 10)).filter(n => !isNaN(n)) : [1,2,3,4,5],
      horarioInicio: r.horario?.hora_inicio || '08:00',
      horarioFin:    r.horario?.hora_fin    || '18:00',
    });
    setError('');
    setModal(true);
  };

  const cerrar = () => {
    setModal(false);
    setEditando(null);
    setError('');
  };

  const togglePermiso = (modulo, key) => {
    setForm(p => {
      const m = p.permisos[modulo] || { can_view: false, can_edit: false, can_export: false };
      const next = { ...m, [key]: !m[key] };
      // Si quitan view, también caen edit y export.
      if (key === 'can_view' && !next.can_view) {
        next.can_edit = false;
        next.can_export = false;
      }
      // Edit/export implican view.
      if ((key === 'can_edit' || key === 'can_export') && next[key]) {
        next.can_view = true;
      }
      return { ...p, permisos: { ...p.permisos, [modulo]: next } };
    });
  };

  const toggleDia = (v) => {
    setForm(p => {
      const set = new Set(p.horarioDias);
      if (set.has(v)) set.delete(v); else set.add(v);
      return { ...p, horarioDias: Array.from(set).sort((a,b) => a - b) };
    });
  };

  const guardar = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.nombre.trim()) { setError('El nombre es obligatorio.'); return; }
    if (!editando) {
      if (!form.slug.trim()) { setError('El slug es obligatorio.'); return; }
      if (!/^[a-z0-9_]{2,40}$/.test(form.slug)) {
        setError('Slug inválido. Solo minúsculas, números y guion bajo (2-40 caracteres).');
        return;
      }
    }
    if (form.horarioActivo && !form.horarioDias.length) {
      setError('Seleccioná al menos un día de la semana.');
      return;
    }

    const permisosArr = Object.entries(form.permisos)
      .filter(([_, v]) => v.can_view || v.can_edit || v.can_export)
      .map(([modulo, v]) => ({
        modulo,
        can_view:   !!v.can_view,
        can_edit:   !!v.can_edit,
        can_export: !!v.can_export,
      }));

    const horario = {
      dias:        form.horarioDias.join(','),
      hora_inicio: form.horarioInicio,
      hora_fin:    form.horarioFin,
      activo:      form.horarioActivo,
    };

    const body = {
      nombre: form.nombre,
      descripcion: form.descripcion,
      base_rol: form.base_rol,
      activo: form.activo,
      permisos: permisosArr,
      horario,
    };

    try {
      if (editando) {
        await API.put(`/roles/${editando.id}`, body);
        setMsg('Rol actualizado');
      } else {
        await API.post('/roles', { slug: form.slug, ...body });
        setMsg('Rol creado');
      }
      setTimeout(() => setMsg(''), 2500);
      cerrar();
      cargar();
    } catch (err) {
      setError(err.response?.data?.message || 'Error al guardar');
    }
  };

  const eliminar = async (r) => {
    if (!window.confirm(`¿Eliminar el rol "${r.nombre}"? Esta acción no se puede deshacer.`)) return;
    try {
      await API.delete(`/roles/${r.id}`);
      setMsg('Rol eliminado');
      setTimeout(() => setMsg(''), 2500);
      cargar();
    } catch (err) {
      setError(err.response?.data?.message || 'Error al eliminar');
    }
  };

  return (
    <div className="admin-layout">
      <Sidebar />
      <div className="admin-content">
        <h1>🛡️ Roles y permisos</h1>
        <p className="subtitle">
          Definí qué módulos puede ver/editar/exportar cada rol y en qué horario el sistema le permite iniciar sesión.
          El rol "admin" no tiene restricción de horario.
        </p>

        {msg && <div className="msg-ok" style={{ marginBottom: '0.75rem' }}>{msg}</div>}

        {/* ───── Roles del sistema (base): admin / oficina / maestro ───── */}
        <h2 style={{ color: '#1a237e', fontSize: '1.05rem', margin: '0.5rem 0 0.5rem' }}>
          Roles del sistema
        </h2>
        <p className="subtitle" style={{ marginTop: 0 }}>
          Ajustá los permisos de los roles incorporados (admin, oficina, maestro). Los cambios afectan a todos los usuarios con ese rol.
        </p>
        <div className="table-container" style={{ marginBottom: '1.5rem' }}>
          <div style={{ overflowX: 'auto', borderRadius: 12 }}>
            <table className="alumnos-table">
              <thead>
                <tr>
                  <th>Rol</th>
                  <th>Descripción</th>
                  <th>Módulos visibles</th>
                  <th>Personalizado</th>
                  <th style={{ minWidth: 140 }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {ROLES_SISTEMA.map(r => {
                  const efect = modulos.length ? permisosEfectivos(r.slug) : {};
                  const conView = Object.values(efect).filter(p => p.can_view).length;
                  const conEdit = Object.values(efect).filter(p => p.can_edit).length;
                  const tieneOverride = (baseOverrides[r.slug] || []).length > 0;
                  return (
                    <tr key={r.slug}>
                      <td>
                        <span className="rol-badge" style={{
                          background: r.slug === 'admin' ? '#e3f2fd' : r.slug === 'oficina' ? '#fff3e0' : '#f3e5f5',
                          color:      r.slug === 'admin' ? '#1565c0' : r.slug === 'oficina' ? '#ef6c00' : '#6a1b9a',
                          padding: '2px 10px', borderRadius: 12, fontSize: '0.8rem', fontWeight: 600,
                        }}>{r.nombre}</span>
                        <div style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#888', marginTop: 4 }}>{r.slug}</div>
                      </td>
                      <td style={{ fontSize: '0.85rem', color: '#555' }}>{r.descripcion}</td>
                      <td style={{ fontSize: '0.85rem' }}>
                        {conView} ver{conEdit ? ` · ${conEdit} editar` : ''}
                      </td>
                      <td>
                        <span style={{
                          background: tieneOverride ? '#fff3e0' : '#e8f5e9',
                          color:      tieneOverride ? '#ef6c00' : '#2e7d32',
                          padding: '2px 10px', borderRadius: 12, fontSize: '0.8rem', fontWeight: 600,
                        }}>
                          {tieneOverride ? 'Modificado' : 'Por defecto'}
                        </span>
                      </td>
                      <td>
                        <button
                          className="btn-edit"
                          onClick={() => abrirEditarBase(r.slug)}
                          disabled={!modulos.length}
                        >
                          Editar permisos
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* ───── Roles personalizados ───── */}
        <h2 style={{ color: '#1a237e', fontSize: '1.05rem', margin: '0.5rem 0 0.5rem' }}>
          Roles personalizados
        </h2>
        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem' }}>
          <button className="btn-primary" onClick={abrirNuevo}>+ Nuevo Rol</button>
        </div>

        <div className="table-container">
          {cargando ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: '#999' }}>Cargando...</div>
          ) : (
          <div style={{ overflowX: 'auto', borderRadius: 12 }}>
            <table className="alumnos-table">
              <thead>
                <tr>
                  <th>Slug</th>
                  <th>Nombre</th>
                  <th>Hereda de</th>
                  <th>Módulos</th>
                  <th>Horario</th>
                  <th>Estado</th>
                  <th style={{ minWidth: 200 }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {roles.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '2rem', color: '#999' }}>
                      Aún no hay roles personalizados. Creá uno para empezar.
                    </td>
                  </tr>
                ) : roles.map(r => {
                  const modConView = (r.permisos || []).filter(p => p.can_view).length;
                  const modConEdit = (r.permisos || []).filter(p => p.can_edit).length;
                  const dias = r.horario
                    ? String(r.horario.dias || '').split(',').map(d => DIAS[parseInt(d,10)]?.label || d).join(' ')
                    : '—';
                  return (
                    <tr key={r.id}>
                      <td style={{ fontFamily: 'monospace', color: '#555' }}>{r.slug}</td>
                      <td><strong>{r.nombre}</strong>
                        {r.descripcion && <div style={{ fontSize: '0.78rem', color: '#888' }}>{r.descripcion}</div>}
                      </td>
                      <td>{r.base_rol || 'oficina'}</td>
                      <td style={{ fontSize: '0.85rem' }}>
                        {modConView} ver{modConEdit ? ` · ${modConEdit} editar` : ''}
                      </td>
                      <td style={{ fontSize: '0.82rem' }}>
                        {r.horario && r.horario.activo
                          ? <>{dias}<br/>{r.horario.hora_inicio} – {r.horario.hora_fin}</>
                          : <span style={{ color: '#999' }}>Sin restricción</span>
                        }
                      </td>
                      <td>
                        <span style={{
                          background: r.activo ? '#c8e6c9' : '#ffcdd2',
                          color:      r.activo ? '#2e7d32' : '#c62828',
                          padding: '2px 10px', borderRadius: 12, fontSize: '0.8rem', fontWeight: 600,
                        }}>
                          {r.activo ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td>
                        <button className="btn-edit"   onClick={() => abrirEditar(r)} style={{ marginRight: 6 }}>Editar</button>
                        <button className="btn-delete" onClick={() => eliminar(r)}>Eliminar</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          )}
        </div>

        {modal && (
          <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
            zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
            overflowY: 'auto',
          }}>
            <div style={{
              background: '#fff', borderRadius: 14, padding: '1.6rem',
              width: 720, maxWidth: '95vw', maxHeight: '92vh', overflowY: 'auto',
              boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
            }}>
              <h2 style={{ margin: '0 0 1rem', color: '#1a237e', fontSize: '1.15rem' }}>
                {editando ? '✏️ Editar Rol' : '➕ Nuevo Rol'}
              </h2>

              <form onSubmit={guardar}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                  <div>
                    <label style={lbl}>Slug (identificador) {editando && <span style={{ color: '#999', fontWeight: 400 }}>(no editable)</span>}</label>
                    <input
                      type="text"
                      value={form.slug}
                      onChange={(e) => setForm(p => ({ ...p, slug: e.target.value.toLowerCase() }))}
                      style={{ ...inputStyle, fontFamily: 'monospace' }}
                      disabled={!!editando}
                      placeholder="ej: secretaria_tarde"
                    />
                  </div>
                  <div>
                    <label style={lbl}>Nombre visible</label>
                    <input
                      type="text"
                      value={form.nombre}
                      onChange={(e) => setForm(p => ({ ...p, nombre: e.target.value }))}
                      style={inputStyle}
                      required
                    />
                  </div>
                </div>

                <div style={{ marginBottom: '0.75rem' }}>
                  <label style={lbl}>Descripción (opcional)</label>
                  <input
                    type="text"
                    value={form.descripcion}
                    onChange={(e) => setForm(p => ({ ...p, descripcion: e.target.value }))}
                    style={inputStyle}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.9rem' }}>
                  <div>
                    <label style={lbl}>Hereda permisos de ruta de</label>
                    <select
                      value={form.base_rol}
                      onChange={(e) => setForm(p => ({ ...p, base_rol: e.target.value }))}
                      style={inputStyle}
                    >
                      {ROLES_BASE_OPTS.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                    <div style={{ fontSize: '0.72rem', color: '#888', marginTop: 3 }}>
                      Define qué endpoints del backend acepta el rol.
                    </div>
                  </div>
                  <div>
                    <label style={lbl}>Estado</label>
                    <select
                      value={form.activo ? '1' : '0'}
                      onChange={(e) => setForm(p => ({ ...p, activo: e.target.value === '1' }))}
                      style={inputStyle}
                    >
                      <option value="1">Activo</option>
                      <option value="0">Inactivo</option>
                    </select>
                  </div>
                </div>

                <h3 style={subTitleStyle}>Permisos por módulo</h3>
                <div style={{ border: '1px solid #e0e0e0', borderRadius: 8, overflow: 'hidden', marginBottom: '1rem' }}>
                  <table style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: '#f5f5f5' }}>
                        <th style={thStyle}>Módulo</th>
                        <th style={thStyle}>Lectura</th>
                        <th style={thStyle}>Edición</th>
                        <th style={thStyle}>Exportar</th>
                      </tr>
                    </thead>
                    <tbody>
                      {modulos.map(m => {
                        const v = form.permisos[m] || { can_view: false, can_edit: false, can_export: false };
                        return (
                          <tr key={m} style={{ borderTop: '1px solid #eee' }}>
                            <td style={tdStyle}>{m}</td>
                            <td style={tdCenter}><input type="checkbox" checked={!!v.can_view}   onChange={() => togglePermiso(m, 'can_view')} /></td>
                            <td style={tdCenter}><input type="checkbox" checked={!!v.can_edit}   onChange={() => togglePermiso(m, 'can_edit')} /></td>
                            <td style={tdCenter}><input type="checkbox" checked={!!v.can_export} onChange={() => togglePermiso(m, 'can_export')} /></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <h3 style={subTitleStyle}>Horario permitido para iniciar sesión</h3>
                <div style={{ border: '1px solid #e0e0e0', borderRadius: 8, padding: '0.8rem', marginBottom: '1rem' }}>
                  <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: '0.6rem' }}>
                    <input
                      type="checkbox"
                      checked={form.horarioActivo}
                      onChange={(e) => setForm(p => ({ ...p, horarioActivo: e.target.checked }))}
                    />
                    <span style={{ fontSize: '0.85rem' }}>Restringir el ingreso a un horario</span>
                  </label>

                  {form.horarioActivo && (
                    <>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: '0.6rem' }}>
                        {DIAS.map(d => {
                          const sel = form.horarioDias.includes(d.v);
                          return (
                            <button
                              key={d.v}
                              type="button"
                              onClick={() => toggleDia(d.v)}
                              style={{
                                padding: '4px 10px',
                                background: sel ? '#3949ab' : '#f5f5f5',
                                color: sel ? '#fff' : '#555',
                                border: '1px solid ' + (sel ? '#3949ab' : '#ddd'),
                                borderRadius: 8, cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600,
                              }}
                            >
                              {d.label}
                            </button>
                          );
                        })}
                      </div>
                      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                        <label style={{ fontSize: '0.78rem', color: '#555' }}>Desde</label>
                        <input
                          type="time"
                          value={form.horarioInicio}
                          onChange={(e) => setForm(p => ({ ...p, horarioInicio: e.target.value }))}
                          style={inputStyle}
                        />
                        <label style={{ fontSize: '0.78rem', color: '#555' }}>hasta</label>
                        <input
                          type="time"
                          value={form.horarioFin}
                          onChange={(e) => setForm(p => ({ ...p, horarioFin: e.target.value }))}
                          style={inputStyle}
                        />
                      </div>
                    </>
                  )}
                </div>

                {error && <div className="msg-err" style={{ marginBottom: 12 }}>{error}</div>}

                <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                  <button type="button" onClick={cerrar} style={btnCancelStyle}>Cancelar</button>
                  <button type="submit" style={btnSaveStyle}>{editando ? 'Actualizar' : 'Crear'}</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ───── Modal: editar permisos de un rol del sistema ───── */}
        {modalBase && (
          <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
            zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
            overflowY: 'auto',
          }}>
            <div style={{
              background: '#fff', borderRadius: 14, padding: '1.6rem',
              width: 720, maxWidth: '95vw', maxHeight: '92vh', overflowY: 'auto',
              boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
            }}>
              <h2 style={{ margin: '0 0 0.5rem', color: '#1a237e', fontSize: '1.15rem' }}>
                ✏️ Editar permisos — {modalBase.nombre}
              </h2>
              <p className="subtitle" style={{ marginTop: 0, fontSize: '0.85rem' }}>
                Ajustá qué módulos puede ver, editar y exportar este rol. Los cambios aplican a todos los usuarios con rol <strong>{modalBase.slug}</strong>.
              </p>

              <form onSubmit={guardarBase}>
                <div style={{ border: '1px solid #e0e0e0', borderRadius: 8, overflow: 'hidden', marginBottom: '1rem' }}>
                  <table style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: '#f5f5f5' }}>
                        <th style={thStyle}>Módulo</th>
                        <th style={thStyle}>Lectura</th>
                        <th style={thStyle}>Edición</th>
                        <th style={thStyle}>Exportar</th>
                      </tr>
                    </thead>
                    <tbody>
                      {modulos.map(m => {
                        const v = formBase.permisos[m] || { can_view: false, can_edit: false, can_export: false };
                        return (
                          <tr key={m} style={{ borderTop: '1px solid #eee' }}>
                            <td style={tdStyle}>{m}</td>
                            <td style={tdCenter}><input type="checkbox" checked={!!v.can_view}   onChange={() => togglePermisoBase(m, 'can_view')} /></td>
                            <td style={tdCenter}><input type="checkbox" checked={!!v.can_edit}   onChange={() => togglePermisoBase(m, 'can_edit')} /></td>
                            <td style={tdCenter}><input type="checkbox" checked={!!v.can_export} onChange={() => togglePermisoBase(m, 'can_export')} /></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {errorBase && <div className="msg-err" style={{ marginBottom: 12 }}>{errorBase}</div>}

                <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'space-between', flexWrap: 'wrap' }}>
                  <button type="button" onClick={restaurarBase} style={{
                    padding: '0.5rem 1.1rem', background: '#fff3e0',
                    border: '1px solid #ffcc80', color: '#ef6c00',
                    borderRadius: 8, cursor: 'pointer', fontWeight: 600,
                  }}>
                    Restaurar valores por defecto
                  </button>
                  <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <button type="button" onClick={cerrarBase} style={btnCancelStyle}>Cancelar</button>
                    <button type="submit" style={btnSaveStyle}>Guardar</button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const lbl = { display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#555', marginBottom: 4 };
const inputStyle = {
  width: '100%', padding: '0.5rem 0.75rem',
  border: '1.5px solid #c5cae9', borderRadius: 8,
  fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box',
};
const subTitleStyle = { color: '#1a237e', fontSize: '0.95rem', margin: '1rem 0 0.5rem' };
const thStyle = { padding: '8px 10px', fontSize: '0.78rem', textAlign: 'left', color: '#444', fontWeight: 700 };
const tdStyle = { padding: '6px 10px', fontFamily: 'monospace', fontSize: '0.82rem' };
const tdCenter = { padding: '6px 10px', textAlign: 'center' };
const btnCancelStyle = {
  padding: '0.5rem 1.1rem', background: '#f5f5f5',
  border: '1px solid #ddd', borderRadius: 8, cursor: 'pointer',
};
const btnSaveStyle = {
  padding: '0.5rem 1.3rem', background: '#3949ab', color: '#fff',
  border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer',
};
