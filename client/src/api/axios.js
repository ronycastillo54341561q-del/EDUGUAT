import axios from 'axios';

// URL del backend.
//   - VITE_API_URL (definida en .env / panel de Vercel) tiene prioridad.
//   - Sin esa variable: en dev apunta a localhost:5000; en build servido
//     por el backend usa rutas relativas (/api).
const API_URL =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.DEV
    ? 'http://localhost:5000'
    : ''); // prod sin VITE_API_URL → rutas relativas (/api), same-origin

const API = axios.create({
  baseURL: `${API_URL}/api`,
});

API.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Códigos con los que el backend avisa que el TOKEN/SESIÓN ya no sirve.
// Sólo estos (y cualquier 401) justifican cerrar la sesión.
const SESION_MUERTA = ['TOKEN_INVALID', 'SESSION_REPLACED', 'SESSION_IDLE', 'SESSION_ENDED'];

// Si el backend dice que el token ya no sirve, limpiamos la sesión
// (se conserva sede_seleccionada para no forzar re-elegir sede).
// Si el motivo es uno de los códigos de sesión (replaced/idle/ended),
// guardamos el mensaje para mostrarlo al regresar al login.
//
// OJO: un 403 de AUTORIZACIÓN ("no tenés permiso para esta acción") no es una
// sesión muerta.  Antes cualquier 403 borraba el token y mandaba al login sin
// explicar nada; ahora se deja pasar el error para que la pantalla muestre su
// propio mensaje.
API.interceptors.response.use(
  (r) => r,
  (err) => {
    const url = err.config?.url || '';
    const isLogin  = url.includes('/auth/login');
    const isLogout = url.includes('/auth/logout');
    const status = err.response?.status;
    const code   = err.response?.data?.code;
    const sesionMuerta = status === 401 || (status === 403 && SESION_MUERTA.includes(code));
    if (!isLogin && !isLogout && sesionMuerta) {
      const msg = err.response?.data?.message;
      if (code === 'SESSION_REPLACED' || code === 'SESSION_IDLE' || code === 'SESSION_ENDED') {
        try { sessionStorage.setItem('session_msg', msg || ''); } catch {}
      }
      localStorage.removeItem('token');
      localStorage.removeItem('usuario');
      if (window.location.pathname !== '/' && window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(err);
  }
);

export default API;
