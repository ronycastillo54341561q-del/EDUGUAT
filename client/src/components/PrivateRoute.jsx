import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { can, defaultRoute, isSuperAdmin } from '../lib/permissions';

// Módulos que sólo el super-admin puede ver (gestión global multi-sede).
const SUPER_ADMIN_MODULES = new Set(['academias']);

const PrivateRoute = ({ children, rol, roles, modulo }) => {
  const { usuario, sede, cargando } = useAuth();

  if (cargando) return <div>Cargando...</div>;

  // Sin sede: volver al selector.
  if (!sede) return <Navigate to="/seleccionar" replace />;

  // Con sede pero sin sesión: ir al login (mantiene la sede).
  if (!usuario) return <Navigate to="/login" replace />;

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
