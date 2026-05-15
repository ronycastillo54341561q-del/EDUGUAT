import { createContext, useContext, useState, useEffect } from 'react';
import API from '../api/axios';
import {
  setCustomRolPermisos, clearCustomRolPermisos,
  setBaseRolOverrides, clearBaseRolOverrides,
} from '../lib/permissions';

const AuthContext = createContext();

const leerSede = () => {
  const raw = localStorage.getItem('sede_seleccionada');
  try { return raw ? JSON.parse(raw) : null; } catch { return null; }
};

export const AuthProvider = ({ children }) => {
  const [usuario, setUsuario] = useState(null);
  const [sede, setSede]       = useState(leerSede());
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const user  = localStorage.getItem('usuario');
    const sedeGuardada = leerSede();

    // Estado inconsistente: token sin sede (p. ej. sesión anterior a multi-sede).
    // Lo limpiamos para forzar re-login y evitar bucles de navegación.
    if ((token || user) && !sedeGuardada) {
      localStorage.removeItem('token');
      localStorage.removeItem('usuario');
    } else if (token && user) {
      try {
        const u = JSON.parse(user);
        setUsuario(u);
        if (u?.rol_custom) setCustomRolPermisos(u.rol_custom);
        if (u?.rol_overrides) setBaseRolOverrides(u.rol_overrides);
      }
      catch { localStorage.removeItem('usuario'); }
    }
    setCargando(false);
  }, []);

  const login = (token, user) => {
    localStorage.setItem('token', token);
    localStorage.setItem('usuario', JSON.stringify(user));
    if (user?.rol_custom) setCustomRolPermisos(user.rol_custom);
    if (user?.rol_overrides) setBaseRolOverrides(user.rol_overrides);
    setUsuario(user);
  };

  // Cierra sesión pero conserva la sede elegida:
  // la idea es que al volver a entrar ya no tenga que escogerla otra vez.
  const logout = () => {
    // Best-effort: avisar al servidor para que invalide el jti.
    // Si falla (sin red, token vencido) no importa — el cliente igual se cierra.
    API.post('/auth/logout').catch(() => {});
    localStorage.removeItem('token');
    localStorage.removeItem('usuario');
    clearCustomRolPermisos();
    clearBaseRolOverrides();
    setUsuario(null);
  };

  // Limpia todo (token + sede) y regresa al selector.
  const cambiarSede = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('usuario');
    localStorage.removeItem('sede_seleccionada');
    clearCustomRolPermisos();
    clearBaseRolOverrides();
    setUsuario(null);
    setSede(null);
  };

  const setSedeActiva = (nuevaSede) => {
    if (nuevaSede) {
      localStorage.setItem('sede_seleccionada', JSON.stringify(nuevaSede));
    } else {
      localStorage.removeItem('sede_seleccionada');
    }
    setSede(nuevaSede);
  };

  return (
    <AuthContext.Provider value={{
      usuario, sede, cargando,
      login, logout, cambiarSede, setSedeActiva,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
