import { useState, useEffect, useCallback } from 'react';
import Sidebar from '../../components/Sidebar';
import API from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import './admin.css';

const SCOPES = [
  { value: 'global',      label: 'General (todos los alumnos)' },
  { value: 'horario',     label: 'Por horario' },
  { value: 'laboratorio', label: 'Por laboratorio' },
  { value: 'diplomado',   label: 'Por diplomado' },
  { value: 'dia',         label: 'Por día de clases' },
  { value: 'alumno',      label: 'Para un alumno específico' },
];

const ROL_LABEL = { admin: 'Administrador', oficina: 'Oficina', maestro: 'Maestro' };
const SCOPE_LABEL = Object.fromEntries(SCOPES.map(s => [s.value, s.label]));

const formInicial = {
  titulo: '',
  mensaje: '',
  scope: 'global',
  filtro_horario: '',
  filtro_laboratorio: '',
  filtro_diplomado: '',
  filtro_dia: '',
  filtro_alumno_id: '',
  expira_at: '',
};

const fmtFecha = (s) => {
  if (!s) return '—';
  const d = typeof s === 'string' ? new Date(s.replace(' ', 'T')) : new Date(s);
  if (isNaN(d)) return '—';
  return d.toLocaleString('es-GT', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

export default function Avisos() {
  const { usuario } = useAuth();
  const [avisos,   setAvisos]   = useState([]);
  const [cargando, setCargando] = useState(false);
  const [modal,    setModal]    = useState(false);
  const [form,     setForm]     = useState(formInicial);
  const [error,    setError]    = useState('');
  const [msg,      setMsg]      = useState('');

  // Catálogos para selects
  const [filtros,  setFiltros]   = useState({ horarios: [], laboratorios: [], dias: [] });
  const [diplomados, setDiplomados] = useState([]);
  const [alumnos,    setAlumnos]    = useState([]);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const { data } = await API.get('/avisos');
      setAvisos(data);
    } catch (e) {
      console.error(e);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  // Carga catálogos al abrir el modal
  useEffect(() => {
    if (!modal) return;
    API.get('/asistencia/filtros').then(({ data }) => setFiltros(data)).catch(() => {});
    API.get('/diplomados').then(({ data }) => setDiplomados(data || [])).catch(() => {});
    API.get('/alumnos').then(({ data }) => setAlumnos(data || [])).catch(() => {});
  }, [modal]);

  const abrirNuevo = () => {
    setForm(formInicial);
    setError('');
    setModal(true);
  };
  const cerrar = () => { setModal(false); setError(''); };

  const guardar = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.titulo.trim() || !form.mensaje.trim()) {
      setError('Título y mensaje son obligatorios.');
      return;
    }
    try {
      await API.post('/avisos', {
        titulo: form.titulo,
        mensaje: form.mensaje,
        scope: form.scope,
        filtro_horario:     form.scope === 'horario'     ? form.filtro_horario     : null,
        filtro_laboratorio: form.scope === 'laboratorio' ? form.filtro_laboratorio : null,
        filtro_diplomado:   form.scope === 'diplomado'   ? form.filtro_diplomado   : null,
        filtro_dia:         form.scope === 'dia'         ? form.filtro_dia         : null,
        filtro_alumno_id:   form.scope === 'alumno'      ? Number(form.filtro_alumno_id) : null,
        expira_at:          form.expira_at || null,
      });
      setMsg('Aviso publicado');
      setTimeout(() => setMsg(''), 2500);
      cerrar();
      cargar();
    } catch (err) {
      setError(err.response?.data?.message || 'Error al publicar');
    }
  };

  const eliminar = async (a) => {
    if (!window.confirm(`¿Eliminar aviso "${a.titulo}"?`)) return;
    try {
      await API.delete(`/avisos/${a.id}`);
      cargar();
    } catch (err) {
      alert(err.response?.data?.message || 'Error al eliminar');
    }
  };

  const detalleScope = (a) => {
    if (a.scope === 'global')      return 'Todos';
    if (a.scope === 'horario')     return a.filtro_horario;
    if (a.scope === 'laboratorio') return a.filtro_laboratorio;
    if (a.scope === 'diplomado')   return a.filtro_diplomado;
    if (a.scope === 'dia')         return a.filtro_dia;
    if (a.scope === 'alumno')      return `Alumno #${a.filtro_alumno_id}`;
    return '';
  };

  const puedeBorrar = (a) => usuario?.rol === 'admin' || a.autor_id === usuario?.id;

  return (
    <div className="admin-layout">
      <Sidebar />
      <div className="admin-content">
        <h1>📣 Avisos</h1>
        <p className="subtitle">
          Publica mensajes para los alumnos. Pueden ser generales o dirigidos a un horario, laboratorio, diplomado, día o alumno específico.
        </p>

        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem' }}>
          <button className="btn-primary" onClick={abrirNuevo}>+ Nuevo Aviso</button>
        </div>

        {msg && <div className="msg-ok" style={{ marginBottom: '0.75rem' }}>{msg}</div>}

        <div className="table-container">
          {cargando ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: '#999' }}>Cargando...</div>
          ) : (
          <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', borderRadius: 12 }}>
            <table className="alumnos-table">
              <thead>
                <tr>
                  <th>Título</th>
                  <th>Mensaje</th>
                  <th>Destinatarios</th>
                  <th>Autor</th>
                  <th>Publicado</th>
                  <th>Vence</th>
                  <th style={{ minWidth: 100 }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {avisos.length === 0 ? (
                  <tr><td colSpan={7} style={{ textAlign: 'center', padding: '2rem', color: '#999' }}>No hay avisos publicados</td></tr>
                ) : avisos.map(a => (
                  <tr key={a.id}>
                    <td style={{ fontWeight: 600 }}>{a.titulo}</td>
                    <td style={{ maxWidth: 320, fontSize: '.85rem', color: '#444' }}>
                      <div style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {a.mensaje}
                      </div>
                    </td>
                    <td style={{ fontSize: '.85rem' }}>
                      <div><strong>{SCOPE_LABEL[a.scope] || a.scope}</strong></div>
                      <div style={{ color: '#777' }}>{detalleScope(a)}</div>
                    </td>
                    <td style={{ fontSize: '.85rem' }}>
                      {a.autor_nombre}
                      <div style={{ color: '#999', fontSize: '.72rem' }}>{ROL_LABEL[a.autor_rol] || a.autor_rol}</div>
                    </td>
                    <td style={{ fontSize: '.8rem' }}>{fmtFecha(a.created_at)}</td>
                    <td style={{ fontSize: '.8rem' }}>{a.expira_at ? fmtFecha(a.expira_at) : '—'}</td>
                    <td>
                      {puedeBorrar(a) ? (
                        <button className="btn-delete" onClick={() => eliminar(a)}>Eliminar</button>
                      ) : (
                        <span style={{ color: '#bbb', fontSize: '.78rem' }}>—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}
        </div>

        {modal && (
          <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
            zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <div style={{
              background: '#fff', borderRadius: 14, padding: '2rem',
              width: 520, maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto',
              boxShadow: '0 8px 32px rgba(0,0,0,0.18)'
            }}>
              <h2 style={{ margin: '0 0 1.25rem', color: '#1a237e', fontSize: '1.1rem' }}>
                ➕ Nuevo Aviso
              </h2>
              <form onSubmit={guardar}>
                <Field label="Título">
                  <input type="text" value={form.titulo}
                    onChange={e => setForm(p => ({ ...p, titulo: e.target.value }))}
                    style={inputStyle} required maxLength={150} />
                </Field>

                <Field label="Mensaje">
                  <textarea value={form.mensaje} rows={4}
                    onChange={e => setForm(p => ({ ...p, mensaje: e.target.value }))}
                    style={{ ...inputStyle, resize: 'vertical' }} required />
                </Field>

                <Field label="Destinatarios">
                  <select value={form.scope}
                    onChange={e => setForm(p => ({ ...p, scope: e.target.value }))}
                    style={inputStyle}>
                    {SCOPES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </Field>

                {form.scope === 'horario' && (
                  <Field label="Horario">
                    <select value={form.filtro_horario}
                      onChange={e => setForm(p => ({ ...p, filtro_horario: e.target.value }))}
                      style={inputStyle} required>
                      <option value="">— Selecciona —</option>
                      {filtros.horarios.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </Field>
                )}

                {form.scope === 'laboratorio' && (
                  <Field label="Laboratorio">
                    <select value={form.filtro_laboratorio}
                      onChange={e => setForm(p => ({ ...p, filtro_laboratorio: e.target.value }))}
                      style={inputStyle} required>
                      <option value="">— Selecciona —</option>
                      {filtros.laboratorios.map(l => <option key={l} value={l}>{l}</option>)}
                    </select>
                  </Field>
                )}

                {form.scope === 'diplomado' && (
                  <Field label="Diplomado">
                    <select value={form.filtro_diplomado}
                      onChange={e => setForm(p => ({ ...p, filtro_diplomado: e.target.value }))}
                      style={inputStyle} required>
                      <option value="">— Selecciona —</option>
                      {diplomados.map(d => <option key={d.id} value={d.nombre}>{d.nombre}</option>)}
                    </select>
                  </Field>
                )}

                {form.scope === 'dia' && (
                  <Field label="Día de clases">
                    <select value={form.filtro_dia}
                      onChange={e => setForm(p => ({ ...p, filtro_dia: e.target.value }))}
                      style={inputStyle} required>
                      <option value="">— Selecciona —</option>
                      {filtros.dias.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </Field>
                )}

                {form.scope === 'alumno' && (
                  <Field label="Alumno">
                    <select value={form.filtro_alumno_id}
                      onChange={e => setForm(p => ({ ...p, filtro_alumno_id: e.target.value }))}
                      style={inputStyle} required>
                      <option value="">— Selecciona —</option>
                      {alumnos.map(a => (
                        <option key={a.id} value={a.id}>
                          {a.clave}{a.codigo_estudiante ? ` · ${a.codigo_estudiante}` : ''} · {a.nombre} {a.apellido}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}

                <Field label="Vence (opcional)">
                  <input type="date" value={form.expira_at}
                    onChange={e => setForm(p => ({ ...p, expira_at: e.target.value }))}
                    style={inputStyle} />
                </Field>

                {error && <div className="msg-err" style={{ marginBottom: 12 }}>{error}</div>}

                <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
                  <button type="button" onClick={cerrar} style={btnCancelStyle}>Cancelar</button>
                  <button type="submit" style={btnSaveStyle}>Publicar</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const Field = ({ label, children }) => (
  <div style={{ marginBottom: '0.9rem' }}>
    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#555', marginBottom: 4 }}>
      {label}
    </label>
    {children}
  </div>
);

const inputStyle = {
  width: '100%', padding: '0.5rem 0.75rem',
  border: '1.5px solid #c5cae9', borderRadius: 8,
  fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box',
};
const btnCancelStyle = {
  padding: '0.5rem 1.1rem', background: '#f5f5f5',
  border: '1px solid #ddd', borderRadius: 8, cursor: 'pointer',
};
const btnSaveStyle = {
  padding: '0.5rem 1.3rem', background: '#3949ab', color: '#fff',
  border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer',
};
