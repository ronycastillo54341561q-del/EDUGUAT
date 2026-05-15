import { useState, useEffect, useRef } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { can, ROLE_LABEL, isSuperAdmin } from '../lib/permissions';
import './Sidebar.css';

// Icono inline de "cerrar sesión" (flecha saliendo de un rectángulo).
// Es el patrón estándar usado por Heroicons / Material Icons para logout.
const LogoutIcon = ({ size = 20 }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);

// Módulos que sólo se muestran al super-admin (admin de la sede semilla).
const SUPER_ADMIN_MODULES = new Set(['academias']);

const NAV = [
  { section: 'PRINCIPAL', items: [
    { to: '/admin/dashboard',       icon: '🏠', label: 'Dashboard',        modulo: 'dashboard' },
  ]},
  { section: 'GESTIÓN', items: [
    { to: '/admin/alumnos',         icon: '👨‍🎓', label: 'Alumnos',          modulo: 'alumnos' },
    { to: '/admin/diplomados',      icon: '🏫', label: 'Diplomados',       modulo: 'diplomados' },
    { to: '/admin/asistencia',       icon: '📋', label: 'Asistencia',      modulo: 'asistencia' },
    { to: '/admin/planificaciones',  icon: '🗓️', label: 'Planificaciones', modulo: 'planificaciones' },
    { to: '/admin/mecanografia',    icon: '⌨️', label: 'Mecanografía',     modulo: 'mecanografia' },
  ]},
  { section: 'NOTAS', items: [
    { to: '/admin/notas-tac',       icon: '📝', label: 'Notas TAC',         modulo: 'notasTac' },
    { to: '/admin/inscritos-tac',   icon: '📋', label: 'Inscritos TAC',     modulo: 'inscritosTac' },
    { to: '/admin/notas-diplomados',icon: '🎓', label: 'Notas Diplomados',  modulo: 'notasDiplomados' },
  ]},
  { section: 'REPORTES', items: [
    { to: '/admin/reporte-alumno', icon: '📊', label: 'Reporte Alumno', modulo: 'reporteAlumno' },
    { to: '/admin/consultas',      icon: '🔎', label: 'Consultas',      modulo: 'consultas' },
    { to: '/admin/impresion',      icon: '🖨️', label: 'Impresión',      modulo: 'impresion' },
    { to: '/admin/constancias',    icon: '📜', label: 'Constancias',    modulo: 'constancias' },
    { to: '/admin/mis-tablas',     icon: '🗂️', label: 'Mis Tablas',     modulo: 'misTablas' },
  ]},
  { section: 'FINANZAS', items: [
    { to: '/admin/nuevo-pago',      icon: '💳', label: 'Nuevo Pago',   modulo: 'nuevoPago' },
    { to: '/admin/otros-pagos',     icon: '🧮', label: 'Otros Pagos',  modulo: 'otrosPagos' },
    { to: '/admin/pagos',           icon: '💰', label: 'Pagos',        modulo: 'pagos' },
    { to: '/admin/recibos',         icon: '🧾', label: 'Recibos',      modulo: 'recibos' },
    { to: '/admin/papeleria',       icon: '📎', label: 'Papelería',    modulo: 'papeleria' },
  ]},
  { section: 'COMUNICACIÓN', items: [
    { to: '/admin/avisos',          icon: '📣', label: 'Avisos',        modulo: 'avisos' },
  ]},
  { section: 'SISTEMA', items: [
    { to: '/admin/usuarios',        icon: '👥', label: 'Usuarios',      modulo: 'usuarios' },
    { to: '/admin/roles',           icon: '🛡️', label: 'Roles',         modulo: 'roles' },
    { to: '/admin/configuracion',   icon: '⚙️', label: 'Configuración', modulo: 'configuracion' },
    { to: '/admin/academias',       icon: '🏢', label: 'Academias',     modulo: 'academias' },
    { to: '/admin/importar',        icon: '📥', label: 'Importar Datos', modulo: 'importar' },
    { to: '/admin/bitacora',        icon: '📒', label: 'Bitácora',      modulo: 'bitacora' },
    { to: '/admin/backups',         icon: '💾', label: 'Backups',       modulo: 'backups' },
    { to: '/admin/relaciones',      icon: '🔗', label: 'Relaciones BD', modulo: 'relaciones' },
    { to: '/admin/manual',          icon: '📖', label: 'Manual',        modulo: 'manual' },
  ]},
];

const SECTIONS_LS_KEY = 'sidebar_sections_col';

const loadSectionsState = () => {
  try {
    const raw = localStorage.getItem(SECTIONS_LS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch { return {}; }
};

const Sidebar = () => {
  const { usuario, logout, sede, cambiarSede } = useAuth();
  const navigate = useNavigate();
  const [abierta, setAbierta] = useState(false);
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem('sidebar_col') === '1'
  );
  // Estado por sección: { [sectionName]: true(colapsada) | false(abierta) }
  // Por defecto las secciones están abiertas.
  const [sectionsCollapsed, setSectionsCollapsed] = useState(loadSectionsState);
  const sidebarRef = useRef(null);

  useEffect(() => {
    document.body.classList.toggle('sidebar-collapsed', collapsed);
    localStorage.setItem('sidebar_col', collapsed ? '1' : '0');
  }, [collapsed]);

  useEffect(() => {
    localStorage.setItem(SECTIONS_LS_KEY, JSON.stringify(sectionsCollapsed));
  }, [sectionsCollapsed]);

  const toggleSection = (name) => {
    setSectionsCollapsed(prev => ({ ...prev, [name]: !prev[name] }));
  };

  // Conserva la posición de scroll del sidebar entre navegaciones.
  useEffect(() => {
    const el = sidebarRef.current;
    if (!el) return;
    const saved = parseInt(sessionStorage.getItem('sidebar_scroll') || '0', 10);
    if (saved > 0) el.scrollTop = saved;
    const onScroll = () => sessionStorage.setItem('sidebar_scroll', String(el.scrollTop));
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  const handleLogout = () => { logout(); navigate('/login'); };
  const handleCambiarSede = () => { cambiarSede(); navigate('/seleccionar', { replace: true }); };
  const cerrar = () => setAbierta(false);

  const rol = usuario?.rol;
  // Lista de módulos habilitados para esta sede (null = todos).
  const sedeModulos = Array.isArray(sede?.modulos) && sede.modulos.length
    ? new Set(sede.modulos)
    : null;
  const esSuper = isSuperAdmin(usuario, sede);

  const moduloHabilitado = (mod) => {
    if (!mod) return true;
    // Los módulos super-admin (academias, …) no dependen de la lista por sede.
    if (SUPER_ADMIN_MODULES.has(mod)) return esSuper;
    if (!sedeModulos) return true;
    return sedeModulos.has(mod);
  };

  const navFiltrado = NAV
    .map(group => ({
      ...group,
      items: group.items.filter(it =>
        (!it.modulo || can(rol, it.modulo, 'view')) && moduloHabilitado(it.modulo)
      ),
    }))
    .filter(group => group.items.length > 0);

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
          <LogoutIcon size={18} />
          <span className="mobile-logout-label">Cerrar sesión</span>
        </button>
      </div>

      <div className={`sidebar-overlay ${abierta ? 'activo' : ''}`} onClick={cerrar} />

      <div ref={sidebarRef} className={`sidebar ${abierta ? 'abierta' : ''} ${collapsed ? 'collapsed' : ''}`}>
        <button className="sidebar-close-btn" onClick={cerrar}>✕</button>

        <button
          className="collapse-btn"
          onClick={() => setCollapsed(c => !c)}
          title={collapsed ? 'Expandir sidebar' : 'Colapsar sidebar'}
        >
          {collapsed ? '▶' : '◀'}
        </button>

        <div className="sidebar-header">
          <h2>EduGuat</h2>
          <p className="nav-text">{usuario?.nombre}</p>
          <span className="rol-badge nav-text">{ROLE_LABEL[rol] || rol}</span>
          {sede && (
            <span className="sede-badge nav-text" title={sede.id}>📍 {sede.nombre}</span>
          )}
          <button
            type="button"
            className="cambiar-sede-btn nav-text"
            onClick={handleCambiarSede}
          >
            Cambiar sede
          </button>
        </div>

        <nav className="sidebar-nav">
          {navFiltrado.map(group => {
            const isClosed = !!sectionsCollapsed[group.section];
            return (
              <div key={group.section} className={`nav-group${isClosed ? ' closed' : ''}`}>
                <button
                  type="button"
                  className="nav-section nav-section-btn nav-text"
                  onClick={() => toggleSection(group.section)}
                  title={isClosed ? 'Expandir' : 'Colapsar'}
                  aria-expanded={!isClosed}
                >
                  <span>{group.section}</span>
                  <span className="nav-section-caret">{isClosed ? '▸' : '▾'}</span>
                </button>
                <div className="nav-group-items">
                  {group.items.map(item => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      onClick={cerrar}
                      title={collapsed ? item.label : undefined}
                      className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
                    >
                      <span className="nav-icon">{item.icon}</span>
                      <span className="nav-text">{item.label}</span>
                    </NavLink>
                  ))}
                </div>
              </div>
            );
          })}
        </nav>

        <button className="logout-btn" onClick={handleLogout}>
          <span className="nav-icon" style={{ display: 'inline-flex', alignItems: 'center' }}>
            <LogoutIcon size={18} />
          </span>
          <span className="nav-text"> Cerrar sesión</span>
        </button>
      </div>
    </>
  );
};

export default Sidebar;
