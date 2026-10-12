import { Navigate } from 'react-router-dom';
import usePortalAlumno from '../hooks/usePortalAlumno';

// Si el admin ocultó este módulo del portal, el alumno vuelve al dashboard
// (el backend además rechaza la petición).
export default function PortalModulo({ modulo, children }) {
  const portal = usePortalAlumno();
  if (portal && portal.modulos && portal.modulos[modulo] === false) {
    return <Navigate to="/alumno/dashboard" replace />;
  }
  return children;
}
