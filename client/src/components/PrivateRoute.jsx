import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { can, defaultRoute, isSuperAdmin } from '../lib/permissions';
import SinAcceso from '../pages/admin/SinAcceso';

// Módulos que sólo el super-admin puede ver (gestión global multi-sede).
const SUPER_ADMIN_MODULES = new Set(['academias']);

// Módulos exclusivos de inquilinos tipo 'institucion'.
const INSTITUCION_MODULES = new Set(['nominas', 'horarios']);

const PrivateRoute = ({ children, rol, roles, modulo }) => {
  const { usuario, sede, cargando } = useAuth();
  const location = useLocation();

  if (cargando) return <div>Cargando...</div>;

  // Sin sede/institución: volver a la puerta de entrada (academias o instituciones).
  if (!sede) return <Navigate to="/acceder" replace />;

  // Con sede pero sin sesión: ir al login (mantiene la sede).
  if (!usuario) return <Navigate to="/login" replace />;

  // Destino al que se manda a quien no pasa un filtro.  Si ese destino es la
  // ruta actual, navegar de nuevo sería un bucle infinito (la causa de la
  // pantalla en blanco), así que se muestra la pantalla de "sin acceso".
  const destino = defaultRoute(usuario.rol, sede);
  const rebotar = () =>
    (destino === location.pathname
      ? <SinAcceso />
      : <Navigate to={destino} replace />);

  // Módulos habilitados para este inquilino (null = todos).  Si el inquilino
  // tiene lista de módulos y la ruta pide uno que no está incluido, se
  // bloquea por URL (no sólo se oculta en el Sidebar).  Una institución, por
  // ejemplo, sólo permite dashboard+alumnos.  Las sedes con modulos=null no
  // se ven afectadas.
  const sedeModulos = Array.isArray(sede?.modulos) && sede.modulos.length ? sede.modulos : null;
  if (modulo && sedeModulos && !sedeModulos.includes(modulo) && !SUPER_ADMIN_MODULES.has(modulo)) {
    return rebotar();
  }

  // Módulos solo-institución: bloqueados si la sede no es de tipo institucion
  // (las academias con modulos=null no pasan por el filtro de arriba).
  if (modulo && INSTITUCION_MODULES.has(modulo) && sede?.tipo !== 'institucion') {
    return rebotar();
  }

  // Validación por rol simple (compat con uso anterior `rol="admin"`).
  if (rol && usuario.rol !== rol) {
    return rebotar();
  }

  // Validación por lista de roles permitidos.
  if (roles && !roles.includes(usuario.rol)) {
    return rebotar();
  }

  // Validación contra el módulo de permisos.
  if (modulo && !can(usuario.rol, modulo, 'view')) {
    return rebotar();
  }

  // Módulos super-admin: además del rol, requieren estar en la sede semilla.
  if (modulo && SUPER_ADMIN_MODULES.has(modulo) && !isSuperAdmin(usuario, sede)) {
    return rebotar();
  }

  return children;
};

export default PrivateRoute;
