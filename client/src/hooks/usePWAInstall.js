import { useState, useEffect, useRef, useCallback } from 'react';

// Detecta si la app ya se está ejecutando como PWA instalada
// (modo standalone o el caso especial de Safari/iOS con navigator.standalone).
const isRunningStandalone = () => {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  );
};

/**
 * Hook para gestionar la instalación de la PWA.
 *
 * Expone:
 *   - isInstallable: el navegador ofreció el prompt de instalación y la app
 *                    aún no está instalada.
 *   - isInstalled:   la app ya está instalada / corriendo en modo standalone.
 *   - installApp():  dispara el prompt nativo; retorna true si el usuario
 *                    aceptó instalar, false en caso contrario.
 */
export default function usePWAInstall() {
  // Guardamos el evento 'beforeinstallprompt' en un ref para poder
  // dispararlo más tarde (no debe provocar re-render por sí mismo).
  const deferredPromptRef = useRef(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [isInstalled, setIsInstalled] = useState(isRunningStandalone());

  useEffect(() => {
    const handleBeforeInstallPrompt = (e) => {
      // Evitamos que el navegador muestre su mini-infobar automática.
      e.preventDefault();
      deferredPromptRef.current = e;
      // Sólo es instalable si todavía no está instalada.
      if (!isRunningStandalone()) setIsInstallable(true);
    };

    const handleAppInstalled = () => {
      deferredPromptRef.current = null;
      setIsInstallable(false);
      setIsInstalled(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    // Si el usuario cambia al modo standalone (instaló desde el navegador),
    // reflejamos el estado al instante.
    const mql = window.matchMedia?.('(display-mode: standalone)');
    const handleDisplayModeChange = (e) => {
      if (e.matches) {
        setIsInstalled(true);
        setIsInstallable(false);
      }
    };
    mql?.addEventListener?.('change', handleDisplayModeChange);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      mql?.removeEventListener?.('change', handleDisplayModeChange);
    };
  }, []);

  const installApp = useCallback(async () => {
    const promptEvent = deferredPromptRef.current;
    if (!promptEvent) return false;

    promptEvent.prompt();
    const { outcome } = await promptEvent.userChoice;

    // El prompt sólo puede usarse una vez; lo descartamos.
    deferredPromptRef.current = null;
    setIsInstallable(false);

    return outcome === 'accepted';
  }, []);

  return { isInstallable, isInstalled, installApp };
}
