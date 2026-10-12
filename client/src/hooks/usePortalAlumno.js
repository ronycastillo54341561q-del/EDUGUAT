import { useEffect, useState } from 'react';
import API from '../api/axios';

// Configuración del portal que ve el alumno logueado: qué módulos tiene
// visibles y si sus notas están bloqueadas por solvencia.  Se pide una vez
// por sesión (atado al token) y se comparte entre el menú y las páginas.
let cache = null;

const pedir = () => {
  const token = localStorage.getItem('token');
  if (!cache || cache.token !== token) {
    const promesa = API.get('/alumno/portal')
      .then(r => r.data)
      .catch(() => { cache = null; return null; });
    cache = { token, promesa };
  }
  return cache.promesa;
};

export default function usePortalAlumno() {
  const [portal, setPortal] = useState(null);
  useEffect(() => {
    let vivo = true;
    pedir().then(p => { if (vivo) setPortal(p); });
    return () => { vivo = false; };
  }, []);
  return portal; // null mientras carga (o si falló)
}
