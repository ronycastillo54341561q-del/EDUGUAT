import { useState, useEffect, useCallback } from 'react';
import Sidebar from '../../components/Sidebar';
import API from '../../api/axios';
import { ROLE_LABEL } from '../../lib/permissions';
import './admin.css';

const ROLES_BASE = [
  { value: 'admin',   label: 'Administrador' },
  { value: 'oficina', label: 'Oficina' },
  { value: 'maestro', label: 'Maestro' },
];

const formInicial = {
  nombre: '',
  email: '',
  password: '',
  rol: 'oficina',
  activo: 1,
};

export default function Usuarios() {
  const [usuarios, setUsuarios]   = useState([]);
  const [rolesCustom, setRolesCustom] = useState([]);
  const [cargando, setCargando]   = useState(false);
  const [modal, setModal]         = useState(false);
  const [editando, setEditando]   = useState(null);
  const [form, setForm]           = useState(formInicial);
  const [error, setError]         = useState('');
  const [msg, setMsg]             = useState('');
  const [busqueda, setBusqueda]   = useState('');

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const { data } = await API.get('/usuarios');
      setUsuarios(data);
    } catch (e) {
      console.error(e);
    } finally {
      setCargando(false);
    }
  }, []);

  const cargarRoles = useCallback(async () => {
    try {
      const { data } = await API.get('/roles');
      setRolesCustom(data || []);
    } catch (e) { /* admin sin roles custom aún */ }
  }, []);

  useEffect(() => { cargar(); cargarRoles(); }, [cargar, cargarRoles]);

  const rolLabel = (rol) => {
    if (ROLE_LABEL[rol]) return ROLE_LABEL[rol];
    const c = rolesCustom.find(r => r.slug === rol);
    return c ? c.nombre : rol;
  };
  const rolesOpts = [
    ...ROLES_BASE,
    ...rolesCustom.filter(r => r.activo).map(r => ({ value: r.slug, label: `${r.nombre} (custom)` })),
  ];

  const abrirNuevo = () => {
    setEditando(null);
    setForm(formInicial);
    setError('');
    setModal(true);
  };

  const abrirEditar = (u) => {
    setEditando(u);
    setForm({
      nombre:   u.nombre,
      email:    u.email,
      password: '',
      rol:      u.rol,
      activo:   u.activo,
    });
    setError('');
    setModal(true);
  };

  const cerrar = () => {
    setModal(false);
    setEditando(null);
    setForm(formInicial);
    setError('');
  };

  const guardar = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.nombre.trim() || !form.email.trim() || !form.rol) {
      setError('Nombre, email y rol son obligatorios.');
      return;
    }
    if (!editando && !form.password) {
      setError('La contraseña es obligatoria para usuarios nuevos.');
      return;
    }
    try {
      if (editando) {
        const body = {
          nombre: form.nombre,
          email:  form.email,
          rol:    form.rol,
          activo: form.activo,
        };
        if (form.password) body.password = form.password;
        await API.put(`/usuarios/${editando.id}`, body);
        setMsg('Usuario actualizado');
      } else {
        await API.post('/usuarios', {
          nombre:   form.nombre,
          email:    form.email,
          password: form.password,
          rol:      form.rol,
          activo:   form.activo,
        });
        setMsg('Usuario creado');
      }
      setTimeout(() => setMsg(''), 2500);
      cerrar();
      cargar();
    } catch (err) {
      setError(err.response?.data?.message || 'Error al guardar');
    }
  };

  const toggleEstado = async (u) => {
    try {
      await API.patch(`/usuarios/${u.id}/toggle`);
      cargar();
    } catch (err) {
      console.error(err);
    }
  };

  const eliminar = async (u) => {
    if (!window.confirm(`¿Eliminar al usuario "${u.nombre}"?`)) return;
    try {
      await API.delete(`/usuarios/${u.id}`);
      setMsg('Usuario eliminado');
      setTimeout(() => setMsg(''), 2500);
      cargar();
    } catch (err) {
      setError(err.response?.data?.message || 'Error al eliminar');
    }
  };

  const filtrados = busqueda
    ? usuarios.filter(u =>
        `${u.nombre} ${u.email} ${u.rol}`.toLowerCase().includes(busqueda.toLowerCase()))
    : usuarios;

  return (
    <div className="admin-layout">
      <Sidebar />
      <div className="admin-content">
        <h1>👥 Usuarios y Roles</h1>
        <p className="subtitle">
          Crea cuentas para personal de oficina y maestros. Solo el administrador puede acceder a este módulo.
        </p>

        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <input
            type="text"
            className="search-input"
            placeholder="Buscar por nombre, email o rol..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            style={{ minWidth: 250 }}
          />
          <button className="btn-primary" onClick={abrirNuevo}>+ Nuevo Usuario</button>
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
                  <th>Nombre</th>
                  <th>Email</th>
                  <th>Rol</th>
                  <th>Estado</th>
                  <th style={{ minWidth: 220 }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: '#999' }}>
                      No hay usuarios registrados
                    </td>
                  </tr>
                ) : filtrados.map(u => (
                  <tr key={u.id}>
                    <td>{u.nombre}</td>
                    <td>{u.email}</td>
                    <td>
                      <span className="rol-badge" style={{
                        background: u.rol === 'admin' ? '#e3f2fd' : u.rol === 'oficina' ? '#fff3e0' : u.rol === 'maestro' ? '#f3e5f5' : '#e0f2f1',
                        color:      u.rol === 'admin' ? '#1565c0' : u.rol === 'oficina' ? '#ef6c00' : u.rol === 'maestro' ? '#6a1b9a' : '#00695c',
                        padding: '2px 10px', borderRadius: 12, fontSize: '0.8rem', fontWeight: 600
                      }}>
                        {rolLabel(u.rol)}
                      </span>
                    </td>
                    <td>
                      <span style={{
                        background: u.activo ? '#c8e6c9' : '#ffcdd2',
                        color:      u.activo ? '#2e7d32' : '#c62828',
                        padding: '2px 10px', borderRadius: 12, fontSize: '0.8rem', fontWeight: 600
                      }}>
                        {u.activo ? 'Habilitado' : 'Deshabilitado'}
                      </span>
                    </td>
                    <td>
                      <button className="btn-edit"  onClick={() => abrirEditar(u)} style={{ marginRight: 6 }}>Editar</button>
                      <button
                        onClick={() => toggleEstado(u)}
                        style={{
                          padding: '0.35rem 0.7rem',
                          background: u.activo ? '#fff3e0' : '#e8f5e9',
                          color:      u.activo ? '#ef6c00' : '#2e7d32',
                          border: '1px solid', borderRadius: 6, cursor: 'pointer',
                          fontSize: '0.82rem', marginRight: 6
                        }}
                      >
                        {u.activo ? 'Deshabilitar' : 'Habilitar'}
                      </button>
                      <button className="btn-delete" onClick={() => eliminar(u)}>Eliminar</button>
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
              width: 460, maxWidth: '95vw', boxShadow: '0 8px 32px rgba(0,0,0,0.18)'
            }}>
              <h2 style={{ margin: '0 0 1.25rem', color: '#1a237e', fontSize: '1.1rem' }}>
                {editando ? '✏️ Editar Usuario' : '➕ Nuevo Usuario'}
              </h2>

              <form onSubmit={guardar}>
                <div style={{ marginBottom: '0.9rem' }}>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#555', marginBottom: 4 }}>
                    Nombre completo
                  </label>
                  <input
                    type="text"
                    value={form.nombre}
                    onChange={(e) => setForm(p => ({ ...p, nombre: e.target.value }))}
                    style={inputStyle}
                    required
                  />
                </div>

                <div style={{ marginBottom: '0.9rem' }}>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#555', marginBottom: 4 }}>
                    Email (usuario para iniciar sesión)
                  </label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm(p => ({ ...p, email: e.target.value }))}
                    style={inputStyle}
                    required
                  />
                </div>

                <div style={{ marginBottom: '0.9rem' }}>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#555', marginBottom: 4 }}>
                    Contraseña {editando && <span style={{ color: '#999', fontWeight: 400 }}>(dejar vacío para no cambiar)</span>}
                  </label>
                  <input
                    type="text"
                    value={form.password}
                    onChange={(e) => setForm(p => ({ ...p, password: e.target.value }))}
                    style={inputStyle}
                    placeholder={editando ? '••••••••' : 'Contraseña inicial'}
                  />
                </div>

                <div style={{ marginBottom: '0.9rem' }}>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#555', marginBottom: 4 }}>
                    Rol
                  </label>
                  <select
                    value={form.rol}
                    onChange={(e) => setForm(p => ({ ...p, rol: e.target.value }))}
                    style={inputStyle}
                  >
                    {rolesOpts.map(r => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                </div>

                <div style={{ marginBottom: '0.9rem' }}>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#555', marginBottom: 4 }}>
                    Estado
                  </label>
                  <select
                    value={form.activo}
                    onChange={(e) => setForm(p => ({ ...p, activo: Number(e.target.value) }))}
                    style={inputStyle}
                  >
                    <option value={1}>Habilitado</option>
                    <option value={0}>Deshabilitado</option>
                  </select>
                </div>

                {error && <div className="msg-err" style={{ marginBottom: 12 }}>{error}</div>}

                <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
                  <button type="button" onClick={cerrar} style={btnCancelStyle}>Cancelar</button>
                  <button type="submit" style={btnSaveStyle}>
                    {editando ? 'Actualizar' : 'Crear'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

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
