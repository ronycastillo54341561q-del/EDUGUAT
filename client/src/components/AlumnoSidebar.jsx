import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, User, ClipboardList, FileEdit, Wallet, Keyboard,
  Megaphone, LogOut,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import logo from '../assets/eduguat-logo-blanco-transparente.png';
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
        <img src={logo} alt="EduGuat" className="sidebar-logo sidebar-logo--mobile" />
        <button
          className="mobile-logout-btn"
          onClick={handleLogout}
          title="Cerrar sesión"
          aria-label="Cerrar sesión"
        >
          <LogOut size={18} />
        </button>
      </div>

      <div className={`sidebar-overlay ${abierta ? 'activo' : ''}`} onClick={cerrar} />

      <div className={`sidebar ${abierta ? 'abierta' : ''}`}>
        <button className="sidebar-close-btn" onClick={cerrar}>✕</button>

        <div className="sidebar-header">
          <img src={logo} alt="EduGuat" className="sidebar-logo" />
          <p>{usuario?.nombre}</p>
          <span className="rol-badge" style={{ background: '#43a047' }}>Alumno</span>
          {sede && <span className="sede-badge" title={sede.id}>{sede.nombre}</span>}
          <button type="button" className="cambiar-sede-btn" onClick={handleCambiarSede}>
            Cambiar sede
          </button>
        </div>

        <nav className="sidebar-nav">
          <p className="nav-section">MI PORTAL</p>
          <NavLink to="/alumno/dashboard" onClick={cerrar}
            className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
            <span className="nav-icon"><LayoutDashboard size={17} /></span> Dashboard
          </NavLink>
          <NavLink to="/alumno/perfil" onClick={cerrar}
            className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
            <span className="nav-icon"><User size={17} /></span> Mi Perfil
          </NavLink>
          <NavLink to="/alumno/asistencia" onClick={cerrar}
            className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
            <span className="nav-icon"><ClipboardList size={17} /></span> Mi Asistencia
          </NavLink>
          <NavLink to="/alumno/notas" onClick={cerrar}
            className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
            <span className="nav-icon"><FileEdit size={17} /></span> Mis Notas
          </NavLink>
          <NavLink to="/alumno/pagos" onClick={cerrar}
            className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
            <span className="nav-icon"><Wallet size={17} /></span> Mis Pagos
          </NavLink>
          <NavLink to="/alumno/mecanografia" onClick={cerrar}
            className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
            <span className="nav-icon"><Keyboard size={17} /></span> Mecanografía
          </NavLink>
          <NavLink to="/alumno/avisos" onClick={cerrar}
            className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
            <span className="nav-icon"><Megaphone size={17} /></span> Avisos
          </NavLink>
        </nav>

        <button className="logout-btn" onClick={handleLogout}>
          <span className="nav-icon" style={{ display: 'inline-flex', alignItems: 'center' }}>
            <LogOut size={18} />
          </span>
          <span> Cerrar sesión</span>
        </button>
      </div>
    </>
  );
};

export default AlumnoSidebar;
