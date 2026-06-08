import { useNavigate } from 'react-router-dom';
import usePageTitle from '../hooks/usePageTitle';
import logo from '../assets/eduguat-logo.png';
import './auth.css';

// Puerta de entrada al sistema: el usuario elige si va a una Academia
// (flujo de siempre) o a una Institución (nuevo tipo de inquilino).
const Acceder = () => {
  const navigate = useNavigate();
  usePageTitle('Acceder al sistema');

  return (
    <div className="auth-screen">
      <div className="auth-card auth-card--wide">
        <img src={logo} alt="EduGuat" className="auth-logo" />

        <div className="auth-head">
          <h1>Acceder al sistema</h1>
          <p>Elige a qué tipo de sistema quieres ingresar</p>
        </div>

        <div className="auth-sedes">
          <button
            type="button"
            className="auth-sede"
            onClick={() => navigate('/seleccionar')}
          >
            <span className="auth-sede__icono" aria-hidden="true">🏫</span>
            <span className="auth-sede__nombre">Academias</span>
            <span className="auth-sede__info">Ingresa a tu academia</span>
          </button>

          <button
            type="button"
            className="auth-sede"
            onClick={() => navigate('/instituciones')}
          >
            <span className="auth-sede__icono" aria-hidden="true">🏛️</span>
            <span className="auth-sede__nombre">Instituciones</span>
            <span className="auth-sede__info">Ingresa a tu institución</span>
          </button>
        </div>

        <div className="auth-actions">
          <button
            type="button"
            className="auth-btn auth-btn--ghost"
            onClick={() => navigate('/', { replace: true })}
          >
            ← Regresar al inicio
          </button>
        </div>
      </div>
    </div>
  );
};

export default Acceder;
