import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './Sidebar.css';

const AlumnoSidebar = () => {
  const { usuario, logout, sede, cambiarSede } = useAuth();
  const navigate = useNavigate();
  const [abierta, setAbierta] = useState(false);

  const handleLogout = () => { logout(); navigate('/login'); };
  const handleCambiarSede = () => { cambiarSede(); navigate('/seleccionar', { replace: true }); };
  const cerrar = () => setAbierta(false);

  return (
    <>
      <div className="mobile-topbar">
        <button className="hamburger-btn" onClick={() => setAbierta(true)}>☰</button>
        <h2>EduGuat</h2>
        <button
          className="mobile-logout-btn"
          onClick={handleLogout}
          title="Cerrar sesión"
          aria-label="Cerrar sesión"
        >
          🚪
        </button>
      </div>

      <div className={`sidebar-overlay ${abierta ? 'activo' : ''}`} onClick={cerrar} />

      <div className={`sidebar ${abierta ? 'abierta' : ''}`}>
        <button className="sidebar-close-btn" onClick={cerrar}>✕</button>

        <div className="sidebar-header">
          <h2>EduGuat</h2>
          <p>{usuario?.nombre}</p>
          <span className="rol-badge" style={{ background: '#43a047' }}>Alumno</span>
          {sede && <span className="sede-badge" title={sede.id}>📍 {sede.nombre}</span>}
          <button type="button" className="cambiar-sede-btn" onClick={handleCambiarSede}>
            Cambiar sede
          </button>
        </div>

        <nav className="sidebar-nav">
          <p className="nav-section">MI PORTAL</p>
          <NavLink to="/alumno/dashboard" onClick={cerrar}
            className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
            🏠 Dashboard
          </NavLink>
          <NavLink to="/alumno/perfil" onClick={cerrar}
            className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
            👤 Mi Perfil
          </NavLink>
          <NavLink to="/alumno/asistencia" onClick={cerrar}
            className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
            📋 Mi Asistencia
          </NavLink>
          <NavLink to="/alumno/notas" onClick={cerrar}
            className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
            📝 Mis Notas
          </NavLink>
          <NavLink to="/alumno/pagos" onClick={cerrar}
            className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
            💰 Mis Pagos
          </NavLink>
          <NavLink to="/alumno/mecanografia" onClick={cerrar}
            className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
            ⌨️ Mecanografía
          </NavLink>
          <NavLink to="/alumno/avisos" onClick={cerrar}
            className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
            📣 Avisos
          </NavLink>
        </nav>

        <button className="logout-btn" onClick={handleLogout}>
          🚪 Cerrar sesión
        </button>
      </div>
    </>
  );
};

export default AlumnoSidebar;
