import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import API from '../api/axios';
import { defaultRoute } from '../lib/permissions';
import usePageTitle from '../hooks/usePageTitle';
import logo from '../assets/eduguat-logo.png';
import './auth.css';

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

  // Si no hay sede/institución elegida, no tiene sentido estar aquí.
  useEffect(() => {
    if (!sede) navigate('/acceder', { replace: true });
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
    <div className="auth-screen">
      <div className="auth-card">
        <img src={logo} alt="EduGuat" className="auth-logo" />

        <div className="auth-head">
          <h1>Bienvenido de nuevo</h1>
          <p>Ingresa tus credenciales para continuar</p>
          {sede && (
            <span className="auth-sede-chip">
              <span className="auth-sede-dot" />
              {sede.nombre}
            </span>
          )}
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="auth-field">
            <label htmlFor="usuario">Usuario</label>
            <input
              id="usuario"
              type="text"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="usuario o correo"
              autoComplete="username"
              required
            />
          </div>

          <div className="auth-field">
            <label htmlFor="password">Contraseña</label>
            <input
              id="password"
              type={verPass ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Tu contraseña"
              autoComplete="current-password"
              required
            />
          </div>

          <label className="auth-check">
            <input
              type="checkbox"
              checked={verPass}
              onChange={(e) => setVerPass(e.target.checked)}
            />
            <span>Mostrar contraseña</span>
          </label>

          {aviso && <p className="auth-msg auth-msg--info">{aviso}</p>}
          {error && <p className="auth-msg auth-msg--error">{error}</p>}

          <button type="submit" className="auth-btn auth-btn--primary" disabled={cargando}>
            {cargando ? 'Ingresando…' : 'Ingresar'}
          </button>

          <div className="auth-actions">
            <button
              type="button"
              className="auth-btn auth-btn--ghost"
              onClick={() => navigate('/', { replace: true })}
            >
              ← Regresar
            </button>
            <button
              type="button"
              className="auth-btn auth-btn--ghost"
              onClick={() => navigate(sede?.tipo === 'institucion' ? '/instituciones' : '/seleccionar', { replace: true })}
            >
              {sede?.tipo === 'institucion' ? 'Cambiar institución' : 'Cambiar sede'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Login;
