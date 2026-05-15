import { useState, useEffect, useCallback, useRef } from 'react';
import Sidebar from '../../components/Sidebar';
import API from '../../api/axios';
import {
  MODULOS_MEMBRETE, membreteDefault, parseMembrete, membreteHTML,
} from '../../lib/membrete';
import {
  rangoDefault as rangoAniosDefault, aniosDeRango, invalidarCacheAnios,
} from '../../lib/anios';
import './admin.css';
import './Configuracion.css';

const DIAS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];

const TABS = [
  { id: 'horarios',         label: 'Horarios de Clase' },
  { id: 'laboratorios',     label: 'Laboratorios' },
  { id: 'establecimientos', label: 'Establecimientos' },
  { id: 'cuotas',           label: 'Cuotas' },
  { id: 'cuentas',          label: 'Cuentas Bancarias' },
  { id: 'instituciones',    label: 'Instituciones' },
  { id: 'membretes',        label: 'Membretes' },
  { id: 'anios',            label: 'Años de filtros' },
];

const fmtHorarioLabel = (h) => {
  const dias = h.dia2 ? `${h.dia1}-${h.dia2}` : h.dia1;
  return `${dias} ${h.hora_inicio} a ${h.hora_fin}`;
};

export default function Configuracion() {
  const [tab, setTab] = useState(() => localStorage.getItem('cfg_tab') || 'horarios');
  useEffect(() => { localStorage.setItem('cfg_tab', tab); }, [tab]);

  return (
    <div className="admin-layout">
      <Sidebar />
      <div className="admin-content">
        <h1>⚙️ Panel de Configuración</h1>
        <p className="subtitle">
          Administra los catálogos del sistema. Los cambios aquí <strong>no afectan</strong> a los registros
          de alumnos ya creados, sólo a los nuevos que se inscriban.
        </p>

        <div className="cfg-tabs">
          {TABS.map(t => (
            <button
              key={t.id}
              className={`cfg-tab${tab === t.id ? ' active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="cfg-panel">
          {tab === 'horarios'         && <SeccionHorarios />}
          {tab === 'laboratorios'     && <SeccionLabs />}
          {tab === 'establecimientos' && <SeccionEstabs />}
          {tab === 'cuotas'           && <SeccionCuotas />}
          {tab === 'cuentas'          && <SeccionCuentas />}
          {tab === 'instituciones'    && <SeccionInstituciones />}
          {tab === 'membretes'        && <SeccionMembretes />}
          {tab === 'anios'            && <SeccionAnios />}
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════
   HORARIOS DE CLASE
   ════════════════════════════════════════════ */
function SeccionHorarios() {
  const empty = { dia1: 'lunes', dia2: '', hora_inicio: '', hora_fin: '', activo: 1 };
  const [items, setItems]       = useState([]);
  const [loading, setLoading]   = useState(false);
  const [modal, setModal]       = useState(false);
  const [form, setForm]         = useState(empty);
  const [editId, setEditId]     = useState(null);
  const [err, setErr]           = useState('');

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await API.get('/catalogos/horarios');
      setItems(data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const abrir = (h = null) => {
    setErr('');
    if (h) {
      setEditId(h.id);
      setForm({
        dia1: h.dia1, dia2: h.dia2 || '',
        hora_inicio: h.hora_inicio, hora_fin: h.hora_fin,
        activo: h.activo,
      });
    } else { setEditId(null); setForm(empty); }
    setModal(true);
  };

  const guardar = async (e) => {
    e.preventDefault();
    if (!form.hora_inicio || !form.hora_fin) { setErr('Hora inicio y fin son requeridas'); return; }
    if (form.dia2 && form.dia2 === form.dia1) { setErr('Los dos días deben ser distintos'); return; }
    try {
      const payload = { ...form, dia2: form.dia2 || null };
      if (editId) await API.put(`/catalogos/horarios/${editId}`, payload);
      else        await API.post('/catalogos/horarios', payload);
      setModal(false);
      cargar();
    } catch (ex) {
      setErr(ex.response?.data?.message || 'Error al guardar');
    }
  };

  const eliminar = async (h) => {
    if (!confirm(`¿Eliminar el horario "${fmtHorarioLabel(h)}"?\nLos alumnos ya inscritos no se verán afectados.`)) return;
    try { await API.delete(`/catalogos/horarios/${h.id}`); cargar(); }
    catch { alert('Error al eliminar'); }
  };

  return (
    <>
      <div className="cfg-toolbar">
        <h2>Horarios de Clase ({items.length})</h2>
        <button className="btn-primary" onClick={() => abrir()}>+ Nuevo Horario</button>
      </div>
      <p className="cfg-hint">
        Define el día (o los dos días) y el rango horario. Los alumnos con dos días se mostrarán
        como un solo horario combinado (ej. <em>lunes-martes 10:00 a 11:30</em>).
      </p>

      {loading ? <div className="cfg-empty">Cargando...</div> : items.length === 0 ? (
        <div className="cfg-empty">
          No hay horarios. <button className="btn-primary" onClick={() => abrir()}>Crear primero</button>
        </div>
      ) : (
        <div className="cfg-list">
          {items.map(h => (
            <div key={h.id} className={`cfg-card${h.activo ? '' : ' inactivo'}`}>
              <div className="cfg-card-info">
                <strong>{fmtHorarioLabel(h)}</strong>
                {!h.activo && <span className="cfg-badge-off">Inactivo</span>}
              </div>
              <div className="cfg-card-actions">
                <button className="btn-edit" onClick={() => abrir(h)}>Editar</button>
                <button className="btn-danger-sm" onClick={() => eliminar(h)}>Eliminar</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <div className="modal-overlay" onClick={() => setModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 500 }}>
            <div className="modal-header">
              <h2>{editId ? 'Editar Horario' : 'Nuevo Horario'}</h2>
              <button className="modal-close" onClick={() => setModal(false)}>✕</button>
            </div>
            <form onSubmit={guardar} className="modal-form">
              <div className="form-grid">
                <div className="form-group">
                  <label>Día principal *</label>
                  <select value={form.dia1} onChange={e => setForm({ ...form, dia1: e.target.value })} required>
                    {DIAS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Segundo día (opcional)</label>
                  <select value={form.dia2} onChange={e => setForm({ ...form, dia2: e.target.value })}>
                    <option value="">— Solo un día —</option>
                    {DIAS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Hora inicio *</label>
                  <input type="time" value={form.hora_inicio}
                         onChange={e => setForm({ ...form, hora_inicio: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label>Hora fin *</label>
                  <input type="time" value={form.hora_fin}
                         onChange={e => setForm({ ...form, hora_fin: e.target.value })} required />
                </div>
                <div className="form-group full-width">
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="checkbox" checked={!!form.activo}
                           onChange={e => setForm({ ...form, activo: e.target.checked ? 1 : 0 })} />
                    Activo (aparece en el select de Alumnos)
                  </label>
                </div>
              </div>
              {err && <p style={{ color: '#e53935', fontSize: '0.85rem' }}>{err}</p>}
              <div className="modal-actions">
                <button type="button" className="btn-cancel" onClick={() => setModal(false)}>Cancelar</button>
                <button type="submit" className="btn-primary">{editId ? 'Actualizar' : 'Crear'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

/* ════════════════════════════════════════════
   Catálogo simple genérico (laboratorios, establecimientos)
   ════════════════════════════════════════════ */
function SeccionSimple({ titulo, descripcion, endpoint, campo, placeholder }) {
  const empty = { [campo]: '', activo: 1 };
  const [items, setItems]   = useState([]);
  const [modal, setModal]   = useState(false);
  const [form, setForm]     = useState(empty);
  const [editId, setEditId] = useState(null);
  const [err, setErr]       = useState('');

  const cargar = useCallback(() => {
    API.get(`/catalogos/${endpoint}`).then(({ data }) => setItems(data)).catch(console.error);
  }, [endpoint]);
  useEffect(() => { cargar(); }, [cargar]);

  const abrir = (it = null) => {
    setErr('');
    if (it) { setEditId(it.id); setForm({ [campo]: it[campo], activo: it.activo }); }
    else    { setEditId(null); setForm(empty); }
    setModal(true);
  };

  const guardar = async (e) => {
    e.preventDefault();
    if (!form[campo]) { setErr('Campo requerido'); return; }
    try {
      if (editId) await API.put(`/catalogos/${endpoint}/${editId}`, form);
      else        await API.post(`/catalogos/${endpoint}`, form);
      setModal(false); cargar();
    } catch (ex) { setErr(ex.response?.data?.message || 'Error al guardar'); }
  };

  const eliminar = async (it) => {
    if (!confirm(`¿Eliminar "${it[campo]}"?`)) return;
    try { await API.delete(`/catalogos/${endpoint}/${it.id}`); cargar(); }
    catch { alert('Error al eliminar'); }
  };

  return (
    <>
      <div className="cfg-toolbar">
        <h2>{titulo} ({items.length})</h2>
        <button className="btn-primary" onClick={() => abrir()}>+ Nuevo</button>
      </div>
      <p className="cfg-hint">{descripcion}</p>

      {items.length === 0 ? (
        <div className="cfg-empty">No hay registros.</div>
      ) : (
        <div className="cfg-list">
          {items.map(it => (
            <div key={it.id} className={`cfg-card${it.activo ? '' : ' inactivo'}`}>
              <div className="cfg-card-info">
                <strong>{it[campo]}</strong>
                {!it.activo && <span className="cfg-badge-off">Inactivo</span>}
              </div>
              <div className="cfg-card-actions">
                <button className="btn-edit" onClick={() => abrir(it)}>Editar</button>
                <button className="btn-danger-sm" onClick={() => eliminar(it)}>Eliminar</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <div className="modal-overlay" onClick={() => setModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <h2>{editId ? 'Editar' : 'Nuevo'} {titulo.replace(/s$/, '').toLowerCase()}</h2>
              <button className="modal-close" onClick={() => setModal(false)}>✕</button>
            </div>
            <form onSubmit={guardar} className="modal-form">
              <div className="form-grid">
                <div className="form-group full-width">
                  <label>{titulo.replace(/s$/, '')} *</label>
                  <input value={form[campo]} placeholder={placeholder}
                         onChange={e => setForm({ ...form, [campo]: e.target.value })} required />
                </div>
                <div className="form-group full-width">
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="checkbox" checked={!!form.activo}
                           onChange={e => setForm({ ...form, activo: e.target.checked ? 1 : 0 })} />
                    Activo
                  </label>
                </div>
              </div>
              {err && <p style={{ color: '#e53935', fontSize: '0.85rem' }}>{err}</p>}
              <div className="modal-actions">
                <button type="button" className="btn-cancel" onClick={() => setModal(false)}>Cancelar</button>
                <button type="submit" className="btn-primary">{editId ? 'Actualizar' : 'Crear'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

const SeccionLabs = () => (
  <SeccionSimple
    titulo="Laboratorios"
    descripcion="Salones o laboratorios donde se imparten las clases."
    endpoint="laboratorios"
    campo="nombre"
    placeholder="Ej: Lab 1"
  />
);

const SeccionEstabs = () => (
  <SeccionSimple
    titulo="Establecimientos"
    descripcion="Colegios y establecimientos de procedencia de los alumnos."
    endpoint="establecimientos"
    campo="nombre"
    placeholder="Ej: Liceo Javier"
  />
);

/* ════════════════════════════════════════════
   CUOTAS
   ════════════════════════════════════════════ */
function SeccionCuotas() {
  const empty = { monto: '', descripcion: '', activo: 1 };
  const [items, setItems]   = useState([]);
  const [modal, setModal]   = useState(false);
  const [form, setForm]     = useState(empty);
  const [editId, setEditId] = useState(null);
  const [err, setErr]       = useState('');

  const cargar = useCallback(() => {
    API.get('/catalogos/cuotas').then(({ data }) => setItems(data)).catch(console.error);
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const abrir = (it = null) => {
    setErr('');
    if (it) { setEditId(it.id); setForm({ monto: it.monto, descripcion: it.descripcion || '', activo: it.activo }); }
    else    { setEditId(null); setForm(empty); }
    setModal(true);
  };

  const guardar = async (e) => {
    e.preventDefault();
    if (form.monto === '' || isNaN(parseFloat(form.monto))) { setErr('Monto inválido'); return; }
    try {
      if (editId) await API.put(`/catalogos/cuotas/${editId}`, form);
      else        await API.post('/catalogos/cuotas', form);
      setModal(false); cargar();
    } catch (ex) { setErr(ex.response?.data?.message || 'Error al guardar'); }
  };

  const eliminar = async (it) => {
    if (!confirm(`¿Eliminar la cuota de Q${it.monto}?`)) return;
    try { await API.delete(`/catalogos/cuotas/${it.id}`); cargar(); }
    catch { alert('Error al eliminar'); }
  };

  return (
    <>
      <div className="cfg-toolbar">
        <h2>Cuotas Mensuales ({items.length})</h2>
        <button className="btn-primary" onClick={() => abrir()}>+ Nueva Cuota</button>
      </div>
      <p className="cfg-hint">Cuotas predefinidas que aparecerán como sugerencias al inscribir alumnos.</p>

      {items.length === 0 ? (
        <div className="cfg-empty">No hay cuotas registradas.</div>
      ) : (
        <div className="cfg-list">
          {items.map(it => (
            <div key={it.id} className={`cfg-card${it.activo ? '' : ' inactivo'}`}>
              <div className="cfg-card-info">
                <strong>Q{parseFloat(it.monto).toFixed(2)}</strong>
                {it.descripcion && <span style={{ color: '#666', marginLeft: 10 }}>— {it.descripcion}</span>}
                {!it.activo && <span className="cfg-badge-off">Inactivo</span>}
              </div>
              <div className="cfg-card-actions">
                <button className="btn-edit" onClick={() => abrir(it)}>Editar</button>
                <button className="btn-danger-sm" onClick={() => eliminar(it)}>Eliminar</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <div className="modal-overlay" onClick={() => setModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <h2>{editId ? 'Editar Cuota' : 'Nueva Cuota'}</h2>
              <button className="modal-close" onClick={() => setModal(false)}>✕</button>
            </div>
            <form onSubmit={guardar} className="modal-form">
              <div className="form-grid">
                <div className="form-group">
                  <label>Monto (Q) *</label>
                  <input type="number" step="0.01" min="0" value={form.monto}
                         onChange={e => setForm({ ...form, monto: e.target.value })} required />
                </div>
                <div className="form-group full-width">
                  <label>Descripción</label>
                  <input value={form.descripcion} placeholder="Ej: Cuota diplomado completo"
                         onChange={e => setForm({ ...form, descripcion: e.target.value })} />
                </div>
                <div className="form-group full-width">
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="checkbox" checked={!!form.activo}
                           onChange={e => setForm({ ...form, activo: e.target.checked ? 1 : 0 })} />
                    Activa
                  </label>
                </div>
              </div>
              {err && <p style={{ color: '#e53935', fontSize: '0.85rem' }}>{err}</p>}
              <div className="modal-actions">
                <button type="button" className="btn-cancel" onClick={() => setModal(false)}>Cancelar</button>
                <button type="submit" className="btn-primary">{editId ? 'Actualizar' : 'Crear'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

/* ════════════════════════════════════════════
   CUENTAS BANCARIAS
   ════════════════════════════════════════════ */
function SeccionCuentas() {
  const empty = { numero_cuenta: '', nombre: '', tipo_cuenta: '', activo: 1 };
  const [items, setItems]   = useState([]);
  const [modal, setModal]   = useState(false);
  const [form, setForm]     = useState(empty);
  const [editId, setEditId] = useState(null);
  const [err, setErr]       = useState('');

  const cargar = useCallback(() => {
    API.get('/catalogos/cuentas').then(({ data }) => setItems(data)).catch(console.error);
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const abrir = (it = null) => {
    setErr('');
    if (it) {
      setEditId(it.id);
      setForm({
        numero_cuenta: it.numero_cuenta,
        nombre: it.nombre,
        tipo_cuenta: it.tipo_cuenta,
        activo: it.activo,
      });
    } else { setEditId(null); setForm(empty); }
    setModal(true);
  };

  const guardar = async (e) => {
    e.preventDefault();
    if (!form.numero_cuenta || !form.nombre || !form.tipo_cuenta) {
      setErr('Todos los campos son requeridos'); return;
    }
    try {
      if (editId) await API.put(`/catalogos/cuentas/${editId}`, form);
      else        await API.post('/catalogos/cuentas', form);
      setModal(false); cargar();
    } catch (ex) { setErr(ex.response?.data?.message || 'Error al guardar'); }
  };

  const eliminar = async (it) => {
    if (!confirm(`¿Eliminar la cuenta "${it.nombre}"?`)) return;
    try { await API.delete(`/catalogos/cuentas/${it.id}`); cargar(); }
    catch { alert('Error al eliminar'); }
  };

  return (
    <>
      <div className="cfg-toolbar">
        <h2>Cuentas Bancarias ({items.length})</h2>
        <button className="btn-primary" onClick={() => abrir()}>+ Nueva Cuenta</button>
      </div>
      <p className="cfg-hint">
        Cuentas de depósito que se mostrarán en el cierre diario de Recibos y Papelería.
        Solo el administrador puede gestionar este catálogo.
      </p>

      {items.length === 0 ? (
        <div className="cfg-empty">No hay cuentas registradas.</div>
      ) : (
        <div className="cfg-list">
          {items.map(it => (
            <div key={it.id} className={`cfg-card${it.activo ? '' : ' inactivo'}`}>
              <div className="cfg-card-info">
                <strong>{it.tipo_cuenta} · {it.numero_cuenta}</strong>
                <span style={{ color: '#666', marginLeft: 10 }}>— {it.nombre}</span>
                {!it.activo && <span className="cfg-badge-off">Inactiva</span>}
              </div>
              <div className="cfg-card-actions">
                <button className="btn-edit" onClick={() => abrir(it)}>Editar</button>
                <button className="btn-danger-sm" onClick={() => eliminar(it)}>Eliminar</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <div className="modal-overlay" onClick={() => setModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <h2>{editId ? 'Editar Cuenta' : 'Nueva Cuenta'}</h2>
              <button className="modal-close" onClick={() => setModal(false)}>✕</button>
            </div>
            <form onSubmit={guardar} className="modal-form">
              <div className="form-grid">
                <div className="form-group">
                  <label>Tipo de cuenta *</label>
                  <input value={form.tipo_cuenta} placeholder="Ej: Banrural, BI, BAC..."
                         onChange={e => setForm({ ...form, tipo_cuenta: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label>No. de cuenta *</label>
                  <input value={form.numero_cuenta} placeholder="Ej: 3-001-12345-6"
                         onChange={e => setForm({ ...form, numero_cuenta: e.target.value })} required />
                </div>
                <div className="form-group full-width">
                  <label>Nombre de la cuenta *</label>
                  <input value={form.nombre} placeholder="Ej: EduGuat S.A. — Cuenta Operativa"
                         onChange={e => setForm({ ...form, nombre: e.target.value })} required />
                </div>
                <div className="form-group full-width">
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="checkbox" checked={!!form.activo}
                           onChange={e => setForm({ ...form, activo: e.target.checked ? 1 : 0 })} />
                    Activa (aparece en el modal de cierre diario)
                  </label>
                </div>
              </div>
              {err && <p style={{ color: '#e53935', fontSize: '0.85rem' }}>{err}</p>}
              <div className="modal-actions">
                <button type="button" className="btn-cancel" onClick={() => setModal(false)}>Cancelar</button>
                <button type="submit" className="btn-primary">{editId ? 'Actualizar' : 'Crear'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

/* ════════════════════════════════════════════
   INSTITUCIONES
   ════════════════════════════════════════════ */
const emptyInstitucion = () => ({
  nombre: '', tipo: '', resolucion: '', fecha: '', ubicacion: '',
  extras: [], activo: 1,
});

function SeccionInstituciones() {
  const [items, setItems]   = useState([]);
  const [modal, setModal]   = useState(false);
  const [form, setForm]     = useState(emptyInstitucion());
  const [editId, setEditId] = useState(null);
  const [err, setErr]       = useState('');

  const cargar = useCallback(() => {
    API.get('/instituciones').then(({ data }) => setItems(data)).catch(console.error);
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const abrir = (it = null) => {
    setErr('');
    if (it) {
      setEditId(it.id);
      setForm({
        nombre:     it.nombre || '',
        tipo:       it.tipo || '',
        resolucion: it.resolucion || '',
        fecha:      it.fecha ? String(it.fecha).slice(0, 10) : '',
        ubicacion:  it.ubicacion || '',
        extras:     Array.isArray(it.extras) ? it.extras : [],
        activo:     it.activo,
      });
    } else { setEditId(null); setForm(emptyInstitucion()); }
    setModal(true);
  };

  const setExtra = (i, patch) => setForm(f => {
    const copia = [...(f.extras || [])];
    copia[i] = { ...copia[i], ...patch };
    return { ...f, extras: copia };
  });
  const addExtra = () => setForm(f => ({
    ...f, extras: [...(f.extras || []), { nombre: '', descripcion: '' }],
  }));
  const delExtra = (i) => setForm(f => ({
    ...f, extras: (f.extras || []).filter((_, idx) => idx !== i),
  }));

  const guardar = async (e) => {
    e.preventDefault();
    if (!form.nombre.trim()) { setErr('Nombre es requerido'); return; }
    try {
      const payload = {
        ...form,
        fecha: form.fecha || null,
        extras: (form.extras || []).filter(x => x.nombre || x.descripcion),
      };
      if (editId) await API.put(`/instituciones/${editId}`, payload);
      else        await API.post('/instituciones', payload);
      setModal(false); cargar();
    } catch (ex) { setErr(ex.response?.data?.message || 'Error al guardar'); }
  };

  const eliminar = async (it) => {
    if (!confirm(`¿Eliminar la institución "${it.nombre}"?`)) return;
    try { await API.delete(`/instituciones/${it.id}`); cargar(); }
    catch { alert('Error al eliminar'); }
  };

  return (
    <>
      <div className="cfg-toolbar">
        <h2>Instituciones ({items.length})</h2>
        <button className="btn-primary" onClick={() => abrir()}>+ Nueva institución</button>
      </div>
      <p className="cfg-hint">
        Define instituciones que comparten esta misma sede (tipo, resolución, fecha,
        ubicación) y agrega información adicional libre con clave / descripción.
        Los datos se usan en los membretes de los PDFs (recibos, notas, planificaciones, constancias).
      </p>

      {items.length === 0 ? (
        <div className="cfg-empty">
          No hay instituciones. <button className="btn-primary" onClick={() => abrir()}>Crear primera</button>
        </div>
      ) : (
        <div className="cfg-list">
          {items.map(it => (
            <div key={it.id} className={`cfg-card${it.activo ? '' : ' inactivo'}`}>
              <div className="cfg-card-info" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
                <strong>{it.nombre}</strong>
                <span style={{ color: '#666', fontSize: '0.78rem' }}>
                  {[it.tipo, it.ubicacion].filter(Boolean).join(' · ') || '—'}
                </span>
                {it.resolucion && (
                  <span style={{ color: '#888', fontSize: '0.74rem' }}>Res: {it.resolucion}</span>
                )}
                {!it.activo && <span className="cfg-badge-off">Inactiva</span>}
              </div>
              <div className="cfg-card-actions">
                <button className="btn-edit" onClick={() => abrir(it)}>Editar</button>
                <button className="btn-danger-sm" onClick={() => eliminar(it)}>Eliminar</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <div className="modal-overlay" onClick={() => setModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 640 }}>
            <div className="modal-header">
              <h2>{editId ? 'Editar institución' : 'Nueva institución'}</h2>
              <button className="modal-close" onClick={() => setModal(false)}>✕</button>
            </div>
            <form onSubmit={guardar} className="modal-form">
              <div className="form-grid">
                <div className="form-group full-width">
                  <label>Nombre *</label>
                  <input value={form.nombre} placeholder="Ej: Centro Educativo X"
                         onChange={e => setForm({ ...form, nombre: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label>Tipo</label>
                  <input value={form.tipo} placeholder="Ej: Privado, Público..."
                         onChange={e => setForm({ ...form, tipo: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Fecha</label>
                  <input type="date" value={form.fecha}
                         onChange={e => setForm({ ...form, fecha: e.target.value })} />
                </div>
                <div className="form-group full-width">
                  <label>Resolución</label>
                  <input value={form.resolucion}
                         placeholder="Ej: Resolución Ministerial 2020-2028"
                         onChange={e => setForm({ ...form, resolucion: e.target.value })} />
                </div>
                <div className="form-group full-width">
                  <label>Ubicación</label>
                  <input value={form.ubicacion}
                         placeholder="Ej: 12 calle 1-25 zona 10, Ciudad de Guatemala"
                         onChange={e => setForm({ ...form, ubicacion: e.target.value })} />
                </div>

                <div className="form-group full-width">
                  <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Información adicional</span>
                    <button type="button" className="btn-edit" onClick={addExtra}
                            style={{ padding: '2px 10px', fontSize: '0.78rem' }}>
                      + Agregar campo
                    </button>
                  </label>
                  {(form.extras || []).length === 0 && (
                    <small style={{ color: '#888' }}>
                      Agrega cualquier dato extra (ej. nombre: "Nivel", descripción: "Bachillerato"). Aparecerá en el membrete.
                    </small>
                  )}
                  {(form.extras || []).map((ex, i) => (
                    <div key={i} style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                      <input
                        placeholder="Nombre"
                        value={ex.nombre || ''}
                        onChange={e => setExtra(i, { nombre: e.target.value })}
                        style={{ flex: '0 0 32%' }}
                      />
                      <input
                        placeholder="Descripción / valor"
                        value={ex.descripcion || ''}
                        onChange={e => setExtra(i, { descripcion: e.target.value })}
                        style={{ flex: 1 }}
                      />
                      <button type="button" className="btn-danger-sm"
                              onClick={() => delExtra(i)} title="Quitar">✕</button>
                    </div>
                  ))}
                </div>

                <div className="form-group full-width">
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="checkbox" checked={!!form.activo}
                           onChange={e => setForm({ ...form, activo: e.target.checked ? 1 : 0 })} />
                    Activa (disponible para usar en membretes)
                  </label>
                </div>
              </div>
              {err && <p style={{ color: '#e53935', fontSize: '0.85rem' }}>{err}</p>}
              <div className="modal-actions">
                <button type="button" className="btn-cancel" onClick={() => setModal(false)}>Cancelar</button>
                <button type="submit" className="btn-primary">{editId ? 'Actualizar' : 'Crear'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

/* ════════════════════════════════════════════
   MEMBRETES (configuración por módulo)
   ════════════════════════════════════════════ */
function SeccionMembretes() {
  const [moduloId, setModuloId]       = useState(MODULOS_MEMBRETE[0].id);
  const [cfg, setCfg]                 = useState({});
  const [instituciones, setInst]      = useState([]);
  const [form, setForm]               = useState(membreteDefault());
  const [guardando, setGuardando]     = useState(false);
  const [msg, setMsg]                 = useState('');
  const fileRef = useRef(null);

  const recargar = useCallback(async () => {
    try {
      const [{ data: c }, { data: ins }] = await Promise.all([
        API.get('/config'),
        API.get('/instituciones'),
      ]);
      setCfg(c || {});
      setInst(ins || []);
      setForm(parseMembrete(c || {}, moduloId));
    } catch (e) { console.error(e); }
  }, [moduloId]);

  useEffect(() => { recargar(); }, [recargar]);

  const onPickImage = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      alert('La imagen no debe superar 2 MB.');
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setForm(f => ({ ...f, imagen: String(reader.result || '') }));
    reader.readAsDataURL(file);
  };

  const setExtra = (i, patch) => setForm(f => {
    const copia = [...(f.info_extra || [])];
    copia[i] = { ...copia[i], ...patch };
    return { ...f, info_extra: copia };
  });
  const addExtra = () => setForm(f => ({
    ...f, info_extra: [...(f.info_extra || []), { nombre: '', descripcion: '' }],
  }));
  const delExtra = (i) => setForm(f => ({
    ...f, info_extra: (f.info_extra || []).filter((_, idx) => idx !== i),
  }));

  const guardar = async () => {
    setGuardando(true);
    try {
      const limpio = {
        ...form,
        info_extra: (form.info_extra || []).filter(x => x.nombre || x.descripcion),
      };
      await API.put('/config', { [`membrete_${moduloId}`]: JSON.stringify(limpio) });
      setMsg('ok'); setTimeout(() => setMsg(''), 2000);
      setCfg(c => ({ ...c, [`membrete_${moduloId}`]: JSON.stringify(limpio) }));
    } catch {
      setMsg('err'); setTimeout(() => setMsg(''), 2500);
    } finally { setGuardando(false); }
  };

  const restaurar = () => {
    if (!confirm('¿Restaurar a los valores por defecto del membrete de este módulo?')) return;
    setForm(membreteDefault());
  };

  const institucion = instituciones.find(i => i.id === form.institucion_id) || null;
  const previewHTML = membreteHTML({ membrete: form, institucion, cfg });

  return (
    <>
      <div className="cfg-toolbar">
        <h2>Membretes por módulo</h2>
      </div>
      <p className="cfg-hint">
        Cada módulo tiene su propia configuración de membrete para los PDFs que exporta.
        El membrete se compone de dos bloques: imagen a la izquierda e información de la institución
        centrada a la derecha. Puedes editar la información, sumar campos adicionales o cargar tu propio logo.
      </p>

      <div className="cfg-tabs" style={{ position: 'static', marginBottom: 12 }}>
        {MODULOS_MEMBRETE.map(m => (
          <button key={m.id}
                  className={`cfg-tab${moduloId === m.id ? ' active' : ''}`}
                  onClick={() => setModuloId(m.id)}>
            {m.label}
          </button>
        ))}
      </div>

      <div style={{
        display: 'grid', gap: '1rem',
        gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
      }}>
        <div>
          <div className="form-grid">
            <div className="form-group full-width">
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" checked={!!form.usar}
                       onChange={e => setForm(f => ({ ...f, usar: e.target.checked ? 1 : 0 }))} />
                Aplicar este membrete al exportar PDF
              </label>
            </div>

            <div className="form-group full-width">
              <label>Institución a usar</label>
              <select
                value={form.institucion_id ?? ''}
                onChange={e => setForm(f => ({
                  ...f,
                  institucion_id: e.target.value ? Number(e.target.value) : null,
                }))}
              >
                <option value="">— Usar datos genéricos (Datos de la institución global) —</option>
                {instituciones.filter(i => i.activo).map(i => (
                  <option key={i.id} value={i.id}>{i.nombre}</option>
                ))}
              </select>
              {!instituciones.length && (
                <small style={{ color: '#888' }}>
                  No hay instituciones registradas. Crea una en la pestaña <strong>Instituciones</strong>.
                </small>
              )}
            </div>

            <div className="form-group full-width">
              <label>Logo / imagen del membrete</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <input ref={fileRef} type="file" accept="image/png,image/jpeg" onChange={onPickImage} />
                {form.imagen && (
                  <button type="button" className="btn-danger-sm"
                          onClick={() => { setForm(f => ({ ...f, imagen: '' })); if (fileRef.current) fileRef.current.value = ''; }}>
                    Quitar imagen
                  </button>
                )}
              </div>
              <small style={{ color: '#888' }}>PNG o JPG, máximo 2 MB. Idealmente cuadrado o ligeramente horizontal.</small>
            </div>

            <div className="form-group">
              <label>Alto del membrete (mm)</label>
              <input type="number" min={20} max={70} step={1} value={form.altura_mm}
                     onChange={e => setForm(f => ({ ...f, altura_mm: parseInt(e.target.value, 10) || 30 }))} />
            </div>
            <div className="form-group">
              <label>Ancho de la imagen (mm)</label>
              <input type="number" min={20} max={120} step={1} value={form.ancho_img_mm}
                     onChange={e => setForm(f => ({ ...f, ancho_img_mm: parseInt(e.target.value, 10) || 55 }))} />
            </div>
            <div className="form-group">
              <label>Color de la banda inferior</label>
              <input type="color" value={form.banda_color}
                     onChange={e => setForm(f => ({ ...f, banda_color: e.target.value }))}
                     style={{ width: 60, height: 32, padding: 2 }} />
            </div>
            <div className="form-group">
              <label>Grosor de la banda (mm)</label>
              <input type="number" min={0} max={10} step={0.2} value={form.banda_alto_mm}
                     onChange={e => setForm(f => ({ ...f, banda_alto_mm: parseFloat(e.target.value) || 0 }))} />
            </div>

            <div className="form-group full-width" style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              <label><input type="checkbox" checked={!!form.mostrar_tipo}
                onChange={e => setForm(f => ({ ...f, mostrar_tipo: e.target.checked ? 1 : 0 }))}/> Tipo</label>
              <label><input type="checkbox" checked={!!form.mostrar_resolucion}
                onChange={e => setForm(f => ({ ...f, mostrar_resolucion: e.target.checked ? 1 : 0 }))}/> Resolución</label>
              <label><input type="checkbox" checked={!!form.mostrar_fecha}
                onChange={e => setForm(f => ({ ...f, mostrar_fecha: e.target.checked ? 1 : 0 }))}/> Fecha</label>
              <label><input type="checkbox" checked={!!form.mostrar_ubicacion}
                onChange={e => setForm(f => ({ ...f, mostrar_ubicacion: e.target.checked ? 1 : 0 }))}/> Ubicación</label>
            </div>

            <div className="form-group full-width">
              <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Información adicional del membrete</span>
                <button type="button" className="btn-edit" onClick={addExtra}
                        style={{ padding: '2px 10px', fontSize: '0.78rem' }}>
                  + Agregar campo
                </button>
              </label>
              {(form.info_extra || []).length === 0 && (
                <small style={{ color: '#888' }}>
                  Estos campos se imprimen además de los que vienen de la institución (ej. lema, sitio web).
                </small>
              )}
              {(form.info_extra || []).map((ex, i) => (
                <div key={i} style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                  <input placeholder="Nombre" value={ex.nombre || ''}
                         onChange={e => setExtra(i, { nombre: e.target.value })}
                         style={{ flex: '0 0 32%' }} />
                  <input placeholder="Descripción / valor" value={ex.descripcion || ''}
                         onChange={e => setExtra(i, { descripcion: e.target.value })}
                         style={{ flex: 1 }} />
                  <button type="button" className="btn-danger-sm"
                          onClick={() => delExtra(i)} title="Quitar">✕</button>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
            <button className="btn-primary" onClick={guardar} disabled={guardando}>
              {guardando ? 'Guardando...' : '💾 Guardar membrete'}
            </button>
            <button className="btn-cancel" onClick={restaurar} disabled={guardando}>
              Restaurar predeterminado
            </button>
            {msg === 'ok'  && <span className="msg-ok"  style={{ alignSelf: 'center' }}>Guardado</span>}
            {msg === 'err' && <span className="msg-err" style={{ alignSelf: 'center' }}>Error al guardar</span>}
          </div>
        </div>

        <div>
          <div style={{
            border: '1px solid #e0e0e0', borderRadius: 10, padding: 12,
            background: '#fff', position: 'sticky', top: 56,
          }}>
            <div style={{ fontSize: '0.78rem', color: '#777', marginBottom: 6, fontWeight: 600 }}>
              Vista previa
            </div>
            <div dangerouslySetInnerHTML={{ __html: previewHTML }} />
            <small style={{ color: '#999', fontSize: '0.74rem' }}>
              La apariencia final en el PDF puede variar ligeramente según el módulo y el tamaño de página.
            </small>
          </div>
        </div>
      </div>
    </>
  );
}

/* ════════════════════════════════════════════
   AÑOS DE FILTROS
   ════════════════════════════════════════════ */
function SeccionAnios() {
  const def = rangoAniosDefault();
  const [inicio, setInicio] = useState(def.inicio);
  const [fin, setFin]       = useState(def.fin);
  const [cargado, setCargado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    API.get('/config').then(({ data }) => {
      const i = parseInt(data?.anios_inicio, 10);
      const f = parseInt(data?.anios_fin, 10);
      if (Number.isInteger(i)) setInicio(i);
      if (Number.isInteger(f)) setFin(f);
    }).catch(console.error).finally(() => setCargado(true));
  }, []);

  const guardar = async () => {
    setErr('');
    const i = parseInt(inicio, 10);
    const f = parseInt(fin, 10);
    if (!Number.isInteger(i) || !Number.isInteger(f)) {
      setErr('Ingresa años válidos.'); return;
    }
    if (i < 1990 || i > 2200 || f < 1990 || f > 2200) {
      setErr('El año debe estar entre 1990 y 2200.'); return;
    }
    if (f < i) {
      setErr('El año final no puede ser menor al inicial.'); return;
    }
    if ((f - i) > 60) {
      setErr('El rango no debería superar 60 años.'); return;
    }
    setGuardando(true);
    try {
      await API.put('/config', {
        anios_inicio: String(i),
        anios_fin:    String(f),
      });
      invalidarCacheAnios({ inicio: i, fin: f });
      setMsg('ok'); setTimeout(() => setMsg(''), 2000);
    } catch {
      setMsg('err'); setTimeout(() => setMsg(''), 2500);
    } finally { setGuardando(false); }
  };

  const restaurar = () => {
    setInicio(def.inicio);
    setFin(def.fin);
    setErr('');
  };

  const preview = aniosDeRango({
    inicio: parseInt(inicio, 10) || def.inicio,
    fin:    parseInt(fin, 10)    || def.fin,
  });

  return (
    <>
      <div className="cfg-toolbar">
        <h2>Años en los filtros</h2>
      </div>
      <p className="cfg-hint">
        Define el rango de años que aparecerá en los selectores de año de los módulos:
        <strong> Asistencia, Mecanografía, Notas TAC, Inscritos TAC, Notas Diplomado, Reporte de Alumno,
        Consulta, Impresión, Nuevo Pago y Pagos.</strong> Útil si tu sede lleva varios años abiertos o
        necesitas planificar años futuros.
      </p>

      {!cargado ? (
        <div className="cfg-empty">Cargando...</div>
      ) : (
        <>
          <div className="form-grid" style={{ maxWidth: 520 }}>
            <div className="form-group">
              <label>Año inicial *</label>
              <input type="number" min={1990} max={2200} step={1}
                     value={inicio}
                     onChange={e => setInicio(e.target.value)} />
            </div>
            <div className="form-group">
              <label>Año final *</label>
              <input type="number" min={1990} max={2200} step={1}
                     value={fin}
                     onChange={e => setFin(e.target.value)} />
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: '0.82rem', color: '#666', marginBottom: 6, fontWeight: 600 }}>
              Vista previa ({preview.length} año{preview.length === 1 ? '' : 's'}):
            </div>
            <div style={{
              display: 'flex', flexWrap: 'wrap', gap: 6,
              padding: 10, border: '1px solid #e0e0e0', borderRadius: 8, background: '#fafafa',
            }}>
              {preview.map(y => (
                <span key={y} style={{
                  padding: '3px 10px', borderRadius: 14, background: '#fff',
                  border: '1px solid #ddd', fontSize: '0.82rem',
                }}>{y}</span>
              ))}
            </div>
          </div>

          {err && <p style={{ color: '#e53935', fontSize: '0.85rem', marginTop: 10 }}>{err}</p>}

          <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
            <button className="btn-primary" onClick={guardar} disabled={guardando}>
              {guardando ? 'Guardando...' : '💾 Guardar'}
            </button>
            <button className="btn-cancel" onClick={restaurar} disabled={guardando}>
              Restaurar predeterminado
            </button>
            {msg === 'ok'  && <span className="msg-ok"  style={{ alignSelf: 'center' }}>Guardado</span>}
            {msg === 'err' && <span className="msg-err" style={{ alignSelf: 'center' }}>Error al guardar</span>}
          </div>

          <small style={{ display: 'block', color: '#888', marginTop: 10 }}>
            Los cambios se aplican la próxima vez que se abra cada módulo (o al recargar la página).
          </small>
        </>
      )}
    </>
  );
}
