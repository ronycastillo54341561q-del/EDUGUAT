import usePWAInstall from '../hooks/usePWAInstall';
import './InstallAppButton.css';

// Icono inline de "descarga" (flecha hacia una bandeja).
const DownloadIcon = ({ size = 18 }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

const InstallAppButton = () => {
  const { isInstallable, isInstalled, installApp } = usePWAInstall();

  // Si ya está instalada mostramos una confirmación discreta.
  if (isInstalled) {
    return <span className="install-app-installed nav-text">App instalada ✓</span>;
  }

  // Sólo renderizamos el botón cuando el navegador permite instalar.
  if (!isInstallable) return null;

  const handleClick = async () => {
    await installApp();
  };

  return (
    <button
      type="button"
      className="install-app-btn"
      onClick={handleClick}
      title="Instalar App"
      aria-label="Instalar App"
    >
      <span className="nav-icon" style={{ display: 'inline-flex', alignItems: 'center' }}>
        <DownloadIcon size={18} />
      </span>
      <span className="nav-text"> Instalar App</span>
    </button>
  );
};

export default InstallAppButton;
