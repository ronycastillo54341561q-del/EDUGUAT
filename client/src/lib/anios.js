import { useEffect, useState } from 'react';
import API from '../api/axios';

const STORAGE_KEY = 'eduguat_anios_filtros_cache';

export function rangoDefault() {
  const y = new Date().getFullYear();
  return { inicio: y - 4, fin: y + 1 };
}

export function aniosDeRango({ inicio, fin }) {
  const lo = Math.min(inicio, fin);
  const hi = Math.max(inicio, fin);
  const out = [];
  for (let y = hi; y >= lo; y--) out.push(y);
  return out;
}

function leerCache() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj || !Number.isInteger(obj.inicio) || !Number.isInteger(obj.fin)) return null;
    return obj;
  } catch { return null; }
}

function escribirCache(rango) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(rango)); } catch { /* ignore */ }
}

let promesa = null;

export async function cargarRangoAnios({ force = false } = {}) {
  if (!force && promesa) return promesa;
  promesa = (async () => {
    try {
      const { data } = await API.get('/config');
      const inicio = parseInt(data?.anios_inicio, 10);
      const fin    = parseInt(data?.anios_fin, 10);
      if (Number.isInteger(inicio) && Number.isInteger(fin) && fin >= inicio) {
        const rango = { inicio, fin };
        escribirCache(rango);
        return rango;
      }
    } catch { /* fallback abajo */ }
    return leerCache() || rangoDefault();
  })();
  return promesa;
}

export function invalidarCacheAnios(nuevoRango = null) {
  promesa = null;
  if (nuevoRango && Number.isInteger(nuevoRango.inicio) && Number.isInteger(nuevoRango.fin)) {
    escribirCache(nuevoRango);
  }
}

export function useAniosFiltros() {
  const [rango, setRango] = useState(() => leerCache() || rangoDefault());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let vivo = true;
    cargarRangoAnios().then(r => {
      if (vivo) { setRango(r); setLoading(false); }
    });
    return () => { vivo = false; };
  }, []);

  return {
    anios: aniosDeRango(rango),
    rango,
    loading,
    anioActual: new Date().getFullYear(),
  };
}
