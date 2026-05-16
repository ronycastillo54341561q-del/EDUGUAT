import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import API from '../api/axios';
import { defaultRoute } from '../lib/permissions';
import usePageTitle from '../hooks/usePageTitle';
import './Login.css';

const Login = () => {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [verPass, setVerPass]   = useState(false);
  const [error, setError]       = useState('');
  const [aviso, setAviso]       = useState('');
  const [cargando, setCargando] = useState(false);
  const { login, sede }         = useAuth();
  const navigate = useNavigate();

  usePageTitle(sede ? `Iniciar sesión · ${sede.nombre}` : 'Iniciar sesión');

  // Si no hay sede elegida, no tiene sentido estar aquí.
  useEffect(() => {
    if (!sede) navigate('/seleccionar', { replace: true });
  }, [sede, navigate]);

  // Mensaje pasado por el interceptor cuando la sesión cae por timeout
  // o porque otro dispositivo tomó el control.
  useEffect(() => {
    try {
      const msg = sessionStorage.getItem('session_msg');
      if (msg) {
        setAviso(msg);
        sessionStorage.removeItem('session_msg');
      }
    } catch {}
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!sede) { setError('Selecciona una sede primero'); return; }
    setCargando(true);
    setError('');
    try {
      const { data } = await API.post('/auth/login', {
        email,
        password,
        sede: sede.id,
      });
      login(data.token, data.usuario);
      navigate(defaultRoute(data.usuario.rol));
    } catch (err) {
      setError(err.response?.data?.message || 'Error al iniciar sesión');
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-logo">
          <h1>EduGuat</h1>
          <p>Sistema de Gestión Estudiantil</p>
          {sede && (
            <p className="login-sede">
              Iniciando sesión en <strong>{sede.nombre}</strong>
            </p>
          )}
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Usuario</label>
            <input
              type="text"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="usuario o correo"
              required
            />
          </div>
          <div className="form-group">
            <label>Contraseña</label>
            <div className="password-wrap">
              <input
                type={verPass ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setVerPass(v => !v)}
                aria-label={verPass ? 'Ocultar contraseña' : 'Ver contraseña'}
                title={verPass ? 'Ocultar contraseña' : 'Ver contraseña'}
              >
                {verPass ? '🙈' : '👁️'}
              </button>
            </div>
          </div>
          {aviso && <p className="info-msg">{aviso}</p>}
          {error && <p className="error-msg">{error}</p>}
          <button type="submit" disabled={cargando}>
            {cargando ? 'Ingresando...' : 'Ingresar'}
          </button>
          <div className="login-acciones">
            <button
              type="button"
              className="link-secundario"
              onClick={() => navigate('/', { replace: true })}
            >
              ← Regresar
            </button>
            <button
              type="button"
              className="link-secundario"
              onClick={() => navigate('/seleccionar', { replace: true })}
            >
              Cambiar sede
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Login;
