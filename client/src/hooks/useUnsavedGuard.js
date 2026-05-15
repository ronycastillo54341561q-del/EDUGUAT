import { useEffect, useRef } from 'react';

/**
 * Avisa al usuario cuando intenta salir del módulo con cambios sin guardar.
 * Compatible con <BrowserRouter> (sin depender de useBlocker / data routers).
 *
 * Cubre:
 *   - cierre / recarga de la pestaña (beforeunload)
 *   - clic en cualquier <a href="..."> de la aplicación
 *   - botón "atrás" del navegador (popstate)
 *
 * @param {boolean} hayCambios
 * @param {string}  mensaje
 */
export default function useUnsavedGuard(hayCambios, mensaje = 'Hay cambios sin guardar. ¿Salir sin guardar?') {
  const hayCambiosRef = useRef(hayCambios);
  useEffect(() => { hayCambiosRef.current = hayCambios; }, [hayCambios]);

  // Cierre / recarga de pestaña
  useEffect(() => {
    const onBeforeUnload = (e) => {
      if (!hayCambiosRef.current) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  // Clicks en <a> internos (NavLink, Link, etc.)
  useEffect(() => {
    const onClick = (e) => {
      if (!hayCambiosRef.current) return;
      if (e.defaultPrevented) return;
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      const anchor = e.target.closest('a[href]');
      if (!anchor) return;
      if (anchor.target && anchor.target !== '_self') return;
      if (anchor.hasAttribute('download')) return;

      const href = anchor.getAttribute('href');
      if (!href || href.startsWith('#')) return;

      // Solo interceptar navegación interna (mismo origen o ruta relativa)
      let url;
      try { url = new URL(anchor.href, window.location.href); }
      catch { return; }
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname) return;

      if (!window.confirm(mensaje)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    // usar capture para interceptar antes que el router de React
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [mensaje]);

  // Botón atrás / adelante del navegador
  useEffect(() => {
    if (!hayCambios) return;

    // Marcamos el estado actual con una "guarda"; si el usuario retrocede,
    // lanzamos confirm y reponemos el estado si cancela.
    const GUARD = '__unsaved_guard__';
    const pathActual = window.location.pathname + window.location.search + window.location.hash;

    window.history.pushState({ [GUARD]: true }, '', pathActual);

    const onPopState = () => {
      if (!hayCambiosRef.current) return;
      if (window.confirm(mensaje)) {
        // el usuario acepta salir: dejamos que la navegación proceda
        return;
      }
      // cancelar: volver a empujar la guarda para que "atrás" siga bloqueado
      window.history.pushState({ [GUARD]: true }, '', pathActual);
    };
    window.addEventListener('popstate', onPopState);

    return () => {
      window.removeEventListener('popstate', onPopState);
    };
  }, [hayCambios, mensaje]);
}
