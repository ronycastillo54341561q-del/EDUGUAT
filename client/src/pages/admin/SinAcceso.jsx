import { useNavigate } from 'react-router-dom';
import Sidebar from '../../components/Sidebar';
import { useAuth } from '../../context/AuthContext';

// Pantalla para un usuario cuyo rol no tiene ningún módulo visible.
// Antes esto terminaba en una pantalla en blanco: el login mandaba a
// /admin/alumnos, PrivateRoute lo rebotaba a la ruta por defecto (la misma) y
// el ciclo se repetía. Mejor decirle al usuario qué pasa.
export default function SinAcceso() {
  const { usuario, logout } = useAuth();
  const navigate = useNavigate();

  const salir = () => { logout(); navigate('/login'); };

  return (
    <div className="admin-layout">
      <Sidebar />
      <div className="admin-content">
        <h1>Sin módulos asignados</h1>
        <p className="subtitle">
          Tu rol{usuario?.rol ? ` (${usuario.rol})` : ''} no tiene ningún módulo habilitado,
          así que no hay ninguna pantalla que mostrarte.
        </p>
        <div className="msg-err" style={{ marginBottom: '1rem', maxWidth: '640px' }}>
          Pedile a un administrador que te asigne permisos de lectura en al menos un
          módulo desde <strong>Sistema → Roles</strong>.
        </div>
        <button className="btn-primary" onClick={salir}>Cerrar sesión</button>
      </div>
    </div>
  );
}
