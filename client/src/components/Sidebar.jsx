import { useState, useEffect, useRef } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, GraduationCap, School, ClipboardList, Clock, CalendarDays,
  Keyboard, FileEdit, ListChecks, Award, BarChart3, Search, Printer,
  ScrollText, Table2, CreditCard, Calculator, Wallet, Receipt, Paperclip,
  Briefcase, Megaphone, Users, Shield, Settings, Building2, Download,
  BookOpen, HardDrive, Link2, LogOut, BookMarked,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { can, ROLE_LABEL, isSuperAdmin } from '../lib/permissions';
import InstallAppButton from './InstallAppButton';
import logo from '../assets/eduguat-logo-blanco-transparente.png';
import './Sidebar.css';

const LogoutIcon = ({ size = 20 }) => <LogOut size={size} aria-hidden="true" />;

// Módulos que sólo se muestran al super-admin (admin de la sede semilla).
const SUPER_ADMIN_MODULES = new Set(['academias']);

// Módulos exclusivos de inquilinos tipo 'institucion' (nunca en academias).
// Aunque una academia tenga modulos=null (todos), estos no deben aparecer.
const INSTITUCION_MODULES = new Set(['nominas', 'horarios']);

const NAV_ICON_SIZE = 17;

const NAV = [
  { section: 'PRINCIPAL', items: [
    { to: '/admin/dashboard',       icon: <LayoutDashboard size={NAV_ICON_SIZE} />, label: 'Dashboard',        modulo: 'dashboard' },
  ]},
  { section: 'GESTIÓN', items: [
    { to: '/admin/alumnos',         icon: <GraduationCap size={NAV_ICON_SIZE} />, label: 'Alumnos',          modulo: 'alumnos' },
    { to: '/admin/diplomados',      icon: <School size={NAV_ICON_SIZE} />,        label: 'Diplomados',       modulo: 'diplomados' },
    { to: '/admin/asistencia',       icon: <ClipboardList size={NAV_ICON_SIZE} />, label: 'Asistencia',      modulo: 'asistencia' },
    { to: '/admin/horarios',         icon: <Clock size={NAV_ICON_SIZE} />,         label: 'Horarios de Clase', modulo: 'horarios' },
    { to: '/admin/planificaciones',  icon: <CalendarDays size={NAV_ICON_SIZE} />,  label: 'Planificaciones', modulo: 'planificaciones' },
    { to: '/admin/mecanografia',    icon: <Keyboard size={NAV_ICON_SIZE} />,      label: 'Mecanografía',     modulo: 'mecanografia' },
  ]},
  { section: 'NOTAS', items: [
    { to: '/admin/notas-tac',       icon: <FileEdit size={NAV_ICON_SIZE} />,   label: 'Notas TAC',         modulo: 'notasTac' },
    { to: '/admin/inscritos-tac',   icon: <ListChecks size={NAV_ICON_SIZE} />, label: 'Inscritos TAC',     modulo: 'inscritosTac' },
    { to: '/admin/notas-diplomados',icon: <Award size={NAV_ICON_SIZE} />,      label: 'Notas Diplomados',  modulo: 'notasDiplomados' },
  ]},
  { section: 'REPORTES', items: [
    { to: '/admin/reporte-alumno', icon: <BarChart3 size={NAV_ICON_SIZE} />,  label: 'Reporte Alumno', modulo: 'reporteAlumno' },
    { to: '/admin/consultas',      icon: <Search size={NAV_ICON_SIZE} />,     label: 'Consultas',      modulo: 'consultas' },
    { to: '/admin/impresion',      icon: <Printer size={NAV_ICON_SIZE} />,    label: 'Impresión',      modulo: 'impresion' },
    { to: '/admin/constancias',    icon: <ScrollText size={NAV_ICON_SIZE} />, label: 'Constancias',    modulo: 'constancias' },
    { to: '/admin/mis-tablas',     icon: <Table2 size={NAV_ICON_SIZE} />,     label: 'Mis Tablas',     modulo: 'misTablas' },
  ]},
  { section: 'FINANZAS', items: [
    { to: '/admin/nuevo-pago',      icon: <CreditCard size={NAV_ICON_SIZE} />, label: 'Nuevo Pago',   modulo: 'nuevoPago' },
    { to: '/admin/otros-pagos',     icon: <Calculator size={NAV_ICON_SIZE} />, label: 'Otros Pagos',  modulo: 'otrosPagos' },
    { to: '/admin/pagos',           icon: <Wallet size={NAV_ICON_SIZE} />,     label: 'Pagos',        modulo: 'pagos' },
    { to: '/admin/recibos',         icon: <Receipt size={NAV_ICON_SIZE} />,    label: 'Recibos',      modulo: 'recibos' },
    { to: '/admin/papeleria',       icon: <Paperclip size={NAV_ICON_SIZE} />,  label: 'Papelería',    modulo: 'papeleria' },
    { to: '/admin/nominas',         icon: <Briefcase size={NAV_ICON_SIZE} />,  label: 'Nóminas',      modulo: 'nominas' },
  ]},
  { section: 'COMUNICACIÓN', items: [
    { to: '/admin/avisos',          icon: <Megaphone size={NAV_ICON_SIZE} />, label: 'Avisos',        modulo: 'avisos' },
  ]},
  { section: 'SISTEMA', items: [
    { to: '/admin/usuarios',        icon: <Users size={NAV_ICON_SIZE} />,     label: 'Usuarios',      modulo: 'usuarios' },
    { to: '/admin/roles',           icon: <Shield size={NAV_ICON_SIZE} />,    label: 'Roles',         modulo: 'roles' },
    { to: '/admin/configuracion',   icon: <Settings size={NAV_ICON_SIZE} />,  label: 'Configuración', modulo: 'configuracion' },
    { to: '/admin/academias',       icon: <Building2 size={NAV_ICON_SIZE} />, label: 'Academias',     modulo: 'academias' },
    { to: '/admin/importar',        icon: <Download size={NAV_ICON_SIZE} />,  label: 'Importar Datos', modulo: 'importar' },
    { to: '/admin/bitacora',        icon: <BookMarked size={NAV_ICON_SIZE} />, label: 'Bitácora',     modulo: 'bitacora' },
    { to: '/admin/backups',         icon: <HardDrive size={NAV_ICON_SIZE} />, label: 'Backups',       modulo: 'backups' },
    // Módulo "Relaciones BD" desactivado: no debe mostrarse.
    // { to: '/admin/relaciones',      icon: <Link2 size={NAV_ICON_SIZE} />,     label: 'Relaciones BD', modulo: 'relaciones' },
    { to: '/admin/manual',          icon: <BookOpen size={NAV_ICON_SIZE} />,  label: 'Manual',        modulo: 'manual' },
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

  const esInstitucion = sede?.tipo === 'institucion';
  const handleLogout = () => { logout(); navigate('/login'); };
  const handleCambiarSede = () => {
    cambiarSede();
    navigate(esInstitucion ? '/instituciones' : '/seleccionar', { replace: true });
  };
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
    // Módulos solo-institución: requieren tipo institucion además del whitelist.
    if (INSTITUCION_MODULES.has(mod)) {
      if (!esInstitucion) return false;
      return sedeModulos ? sedeModulos.has(mod) : true;
    }
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
        <img src={logo} alt="EduGuat" className="sidebar-logo sidebar-logo--mobile" />
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
          title={collapsed ? 'Expandir menú' : 'Colapsar menú'}
          aria-label={collapsed ? 'Expandir menú' : 'Colapsar menú'}
        >
          {collapsed ? '☰' : '◀'}
        </button>

        <div className="sidebar-header">
          <img src={logo} alt="EduGuat" className="sidebar-logo" />
          <p className="nav-text">{usuario?.nombre}</p>
          <span className="rol-badge nav-text">{ROLE_LABEL[rol] || rol}</span>
          {sede && (
            <span className="sede-badge nav-text" title={sede.id}>{sede.nombre}</span>
          )}
          <button
            type="button"
            className="cambiar-sede-btn nav-text"
            onClick={handleCambiarSede}
          >
            {esInstitucion ? 'Cambiar institución' : 'Cambiar sede'}
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

        <InstallAppButton />

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
