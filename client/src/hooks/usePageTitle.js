import { useEffect } from 'react';

// Fija el <title> del documento por página y lo restaura al desmontar.
// Uso: usePageTitle('Iniciar sesión') → "Iniciar sesión · EduGuat"
const BASE = 'EduGuat';

export default function usePageTitle(titulo) {
  useEffect(() => {
    const anterior = document.title;
    document.title = titulo ? `${titulo} · ${BASE}` : `${BASE} — Sistema de Gestión Educativa`;
    return () => { document.title = anterior; };
  }, [titulo]);
}
