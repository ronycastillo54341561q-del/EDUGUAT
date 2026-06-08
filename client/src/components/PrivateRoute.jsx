import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { can, defaultRoute, isSuperAdmin } from '../lib/permissions';

// Módulos que sólo el super-admin puede ver (gestión global multi-sede).
const SUPER_ADMIN_MODULES = new Set(['academias']);

const PrivateRoute = ({ children, rol, roles, modulo }) => {
  const { usuario, sede, cargando } = useAuth();

  if (cargando) return <div>Cargando...</div>;

  // Sin sede/institución: volver a la puerta de entrada (academias o instituciones).
  if (!sede) return <Navigate to="/acceder" replace />;

  // Con sede pero sin sesión: ir al login (mantiene la sede).
  if (!usuario) return <Navigate to="/login" replace />;

  // Módulos habilitados para este inquilino (null = todos).  Si el inquilino
  // tiene lista de módulos y la ruta pide uno que no está incluido, se
  // bloquea por URL (no sólo se oculta en el Sidebar).  Una institución, por
  // ejemplo, sólo permite dashboard+alumnos.  Las sedes con modulos=null no
  // se ven afectadas.
  const sedeModulos = Array.isArray(sede?.modulos) && sede.modulos.length ? sede.modulos : null;
  if (modulo && sedeModulos && !sedeModulos.includes(modulo) && !SUPER_ADMIN_MODULES.has(modulo)) {
    return <Navigate to={defaultRoute(usuario.rol)} replace />;
  }

  // Validación por rol simple (compat con uso anterior `rol="admin"`).
  if (rol && usuario.rol !== rol) {
    return <Navigate to={defaultRoute(usuario.rol)} replace />;
  }

  // Validación por lista de roles permitidos.
  if (roles && !roles.includes(usuario.rol)) {
    return <Navigate to={defaultRoute(usuario.rol)} replace />;
  }

  // Validación contra el módulo de permisos.
  if (modulo && !can(usuario.rol, modulo, 'view')) {
    return <Navigate to={defaultRoute(usuario.rol)} replace />;
  }

  // Módulos super-admin: además del rol, requieren estar en la sede semilla.
  if (modulo && SUPER_ADMIN_MODULES.has(modulo) && !isSuperAdmin(usuario, sede)) {
    return <Navigate to={defaultRoute(usuario.rol)} replace />;
  }

  return children;
};

export default PrivateRoute;
