import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import PrivateRoute from './components/PrivateRoute';
import Login from './pages/Login';
import SedeSelector from './pages/SedeSelector';
import InstitucionSelector from './pages/InstitucionSelector';
import Acceder from './pages/Acceder';
import Landing from './pages/Landing';
import PreguntasFrecuentes from './pages/PreguntasFrecuentes';
import Contacto from './pages/Contacto';
import MasSistemas from './pages/MasSistemas';
import { defaultRoute } from './lib/permissions';
// Admin
import Dashboard from './pages/admin/Dashboard';
import Alumnos from './pages/admin/Alumnos';
import Asistencia from './pages/admin/Asistencia';
import Mecanografia from './pages/admin/Mecanografia';
import NotasTac from './pages/admin/NotasTac';
import NotasDiplomados from './pages/admin/NotasDiplomados';
import Pagos from './pages/admin/Pagos';
import Recibos from './pages/admin/Recibos';
import Papeleria from './pages/admin/Papeleria';
import ReporteAlumno from './pages/admin/ReporteAlumno';
import ReporteFinanciero from './pages/admin/ReporteFinanciero';
import Consultas from './pages/admin/Consultas';
import Impresion from './pages/admin/Impresion';
import Bitacora from './pages/admin/Bitacora';
import NuevoPago from './pages/admin/NuevoPago';
import OtrosPagos from './pages/admin/OtrosPagos';
import GestionDiplomados from './pages/admin/GestionDiplomados';
import Planificaciones from './pages/admin/Planificaciones';
import MisTablas from './pages/admin/MisTablas';
import Nominas from './pages/admin/Nominas';
import Horarios from './pages/admin/Horarios';
import Configuracion from './pages/admin/Configuracion';
import Usuarios from './pages/admin/Usuarios';
import Roles from './pages/admin/Roles';
import Avisos from './pages/admin/Avisos';
import Academias from './pages/admin/Academias';
import Constancias from './pages/admin/Constancias';
import Importar from './pages/admin/Importar';
import InscritosTac from './pages/admin/InscritosTac';
import Backups from './pages/admin/Backups';
import Relaciones from './pages/admin/Relaciones';
import Manual from './pages/admin/Manual';
// Alumno
import AlumnoDashboard from './pages/alumno/AlumnoDashboard';
import AlumnoPerfil from './pages/alumno/AlumnoPerfil';
import AlumnoAsistencia from './pages/alumno/AlumnoAsistencia';
import AlumnoNotas from './pages/alumno/AlumnoNotas';
import AlumnoPagos from './pages/alumno/AlumnoPagos';
import AlumnoMecanografia from './pages/alumno/AlumnoMecanografia';
import AlumnoAvisos from './pages/alumno/AlumnoAvisos';

// Decide el destino de "/seleccionar":
//   - sin sede: selector (cubre login nuevo y sesiones viejas sin sede)
//   - con sede y sin sesión: selector (cubre sesión expirada, spec 3a)
//   - con ambos: dashboard según rol
const RootGate = () => {
  const { usuario, sede, cargando } = useAuth();
  if (cargando) return <div>Cargando...</div>;
  if (!sede || !usuario) return <SedeSelector />;
  return <Navigate to={defaultRoute(usuario.rol)} replace />;
};

// "/" muestra siempre la landing pública; el flujo de selección de sede
// vive ahora en "/seleccionar".
function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/"            element={<Landing />} />
          <Route path="/preguntas-frecuentes" element={<PreguntasFrecuentes />} />
          <Route path="/contacto"    element={<Contacto />} />
          <Route path="/mas-sistemas" element={<MasSistemas />} />
          <Route path="/acceder"     element={<Acceder />} />
          <Route path="/seleccionar" element={<RootGate />} />
          <Route path="/instituciones" element={<InstitucionSelector />} />
          <Route path="/login"       element={<Login />} />

          {/* Admin */}
          <Route path="/admin/dashboard"        element={<PrivateRoute modulo="dashboard"><Dashboard /></PrivateRoute>} />
          <Route path="/admin/alumnos"          element={<PrivateRoute modulo="alumnos"><Alumnos /></PrivateRoute>} />
          <Route path="/admin/asistencia"       element={<PrivateRoute modulo="asistencia"><Asistencia /></PrivateRoute>} />
          <Route path="/admin/mecanografia"     element={<PrivateRoute modulo="mecanografia"><Mecanografia /></PrivateRoute>} />
          <Route path="/admin/notas-tac"        element={<PrivateRoute modulo="notasTac"><NotasTac /></PrivateRoute>} />
          <Route path="/admin/inscritos-tac"    element={<PrivateRoute modulo="inscritosTac"><InscritosTac /></PrivateRoute>} />
          <Route path="/admin/notas-diplomados" element={<PrivateRoute modulo="notasDiplomados"><NotasDiplomados /></PrivateRoute>} />
          <Route path="/admin/pagos"             element={<PrivateRoute modulo="pagos"><Pagos /></PrivateRoute>} />
          <Route path="/admin/recibos"          element={<PrivateRoute modulo="recibos"><Recibos /></PrivateRoute>} />
          <Route path="/admin/papeleria"        element={<PrivateRoute modulo="papeleria"><Papeleria /></PrivateRoute>} />
          <Route path="/admin/reporte-alumno"     element={<PrivateRoute modulo="reporteAlumno"><ReporteAlumno /></PrivateRoute>} />
          <Route path="/admin/reporte-financiero" element={<PrivateRoute modulo="reporteFinanciero"><ReporteFinanciero /></PrivateRoute>} />
          <Route path="/admin/consultas"          element={<PrivateRoute modulo="consultas"><Consultas /></PrivateRoute>} />
          <Route path="/admin/impresion"          element={<PrivateRoute modulo="impresion"><Impresion /></PrivateRoute>} />
          <Route path="/admin/bitacora"      element={<PrivateRoute modulo="bitacora"><Bitacora /></PrivateRoute>} />
          <Route path="/admin/nuevo-pago"      element={<PrivateRoute modulo="nuevoPago"><NuevoPago /></PrivateRoute>} />
          <Route path="/admin/otros-pagos"     element={<PrivateRoute modulo="otrosPagos"><OtrosPagos /></PrivateRoute>} />
          <Route path="/admin/diplomados"         element={<PrivateRoute modulo="diplomados"><GestionDiplomados /></PrivateRoute>} />
          <Route path="/admin/planificaciones"  element={<PrivateRoute modulo="planificaciones"><Planificaciones /></PrivateRoute>} />
          <Route path="/admin/mis-tablas"       element={<PrivateRoute modulo="misTablas"><MisTablas /></PrivateRoute>} />
          <Route path="/admin/nominas"          element={<PrivateRoute modulo="nominas"><Nominas /></PrivateRoute>} />
          <Route path="/admin/horarios"         element={<PrivateRoute modulo="horarios"><Horarios /></PrivateRoute>} />
          <Route path="/admin/configuracion"    element={<PrivateRoute modulo="configuracion"><Configuracion /></PrivateRoute>} />
          <Route path="/admin/usuarios"         element={<PrivateRoute modulo="usuarios"><Usuarios /></PrivateRoute>} />
          <Route path="/admin/roles"            element={<PrivateRoute modulo="roles"><Roles /></PrivateRoute>} />
          <Route path="/admin/avisos"           element={<PrivateRoute modulo="avisos"><Avisos /></PrivateRoute>} />
          <Route path="/admin/academias"        element={<PrivateRoute modulo="academias"><Academias /></PrivateRoute>} />
          <Route path="/admin/constancias"      element={<PrivateRoute modulo="constancias"><Constancias /></PrivateRoute>} />
          <Route path="/admin/importar"         element={<PrivateRoute modulo="importar"><Importar /></PrivateRoute>} />
          <Route path="/admin/backups"          element={<PrivateRoute modulo="backups"><Backups /></PrivateRoute>} />
          <Route path="/admin/relaciones"       element={<PrivateRoute modulo="relaciones"><Relaciones /></PrivateRoute>} />
          <Route path="/admin/manual"           element={<PrivateRoute modulo="manual"><Manual /></PrivateRoute>} />

          {/* Alumno */}
          <Route path="/alumno/dashboard"    element={<PrivateRoute rol="alumno"><AlumnoDashboard /></PrivateRoute>} />
          <Route path="/alumno/perfil"       element={<PrivateRoute rol="alumno"><AlumnoPerfil /></PrivateRoute>} />
          <Route path="/alumno/asistencia"   element={<PrivateRoute rol="alumno"><AlumnoAsistencia /></PrivateRoute>} />
          <Route path="/alumno/notas"        element={<PrivateRoute rol="alumno"><AlumnoNotas /></PrivateRoute>} />
          <Route path="/alumno/pagos"        element={<PrivateRoute rol="alumno"><AlumnoPagos /></PrivateRoute>} />
          <Route path="/alumno/mecanografia" element={<PrivateRoute rol="alumno"><AlumnoMecanografia /></PrivateRoute>} />
          <Route path="/alumno/avisos"       element={<PrivateRoute rol="alumno"><AlumnoAvisos /></PrivateRoute>} />

          {/* Cualquier ruta desconocida vuelve al gate */}
          <Route path="*" element={<Navigate to="/seleccionar" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
