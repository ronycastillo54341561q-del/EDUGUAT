// Set de iconos de línea (estilo Lucide / "stock" de iconos), inline SVG.
// Reemplaza los emojis del landing: heredan el color con currentColor y
// escalan con el font-size del contenedor. Uso: <Icon name="wallet" />
const PATHS = {
  wallet: (
    <>
      <path d="M3 7a2 2 0 0 1 2-2h13a1 1 0 0 1 1 1v2" />
      <path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4" />
      <path d="M21 9v4h-4a2 2 0 0 1 0-4z" />
    </>
  ),
  chart: (
    <>
      <path d="M3 3v18h18" />
      <rect x="7" y="11" width="3" height="6" rx="1" />
      <rect x="12" y="7" width="3" height="10" rx="1" />
      <rect x="17" y="13" width="3" height="4" rx="1" />
    </>
  ),
  card: (
    <>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M2 10h20" />
      <path d="M6 15h4" />
    </>
  ),
  users: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  check: (
    <>
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </>
  ),
  cap: (
    <>
      <path d="M22 10 12 5 2 10l10 5 10-5Z" />
      <path d="M6 12v5c0 1 2.5 3 6 3s6-2 6-3v-5" />
      <path d="M22 10v6" />
    </>
  ),
  file: (
    <>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M9 13h6M9 17h6" />
    </>
  ),
  book: (
    <>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </>
  ),
  building: (
    <>
      <rect x="3" y="3" width="8" height="18" rx="1" />
      <rect x="13" y="8" width="8" height="13" rx="1" />
      <path d="M6 7h2M6 11h2M6 15h2M16 12h2M16 16h2" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  megaphone: (
    <>
      <path d="M3 11v2a1 1 0 0 0 1 1h2l9 4V6L6 10H4a1 1 0 0 0-1 1Z" />
      <path d="M15 6a4 4 0 0 1 0 12" />
      <path d="M6 14v4a1 1 0 0 0 1 1h1" />
    </>
  ),
  database: (
    <>
      <ellipse cx="12" cy="5" rx="8" ry="3" />
      <path d="M4 5v6c0 1.66 3.58 3 8 3s8-1.34 8-3V5" />
      <path d="M4 11v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6" />
    </>
  ),
  landmark: (
    <>
      <path d="M3 21h18" />
      <path d="M12 3 3 8h18z" />
      <path d="M6 10v7M10 10v7M14 10v7M18 10v7" />
    </>
  ),
  presentation: (
    <>
      <path d="M2 4h20" />
      <path d="M3 4v11a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V4" />
      <path d="M12 17v4M9 21h6" />
      <path d="M8 12l2.5-2.5L13 12l3-3" />
    </>
  ),
  heart: (
    <>
      <path d="M20.8 5.6a5 5 0 0 0-7 0L12 7.3l-1.8-1.7a5 5 0 1 0-7 7l1.8 1.7L12 21l7-7 1.8-1.7a5 5 0 0 0 0-6.7Z" />
    </>
  ),
  mail: (
    <>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m2 7 10 6 10-6" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11Z" />
      <circle cx="12" cy="10" r="2.5" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6Z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  cloud: (
    <>
      <path d="M17.5 19a4.5 4.5 0 0 0 .5-9 6 6 0 0 0-11.6-1.5A4 4 0 0 0 6 19Z" />
    </>
  ),
  arrow: (
    <>
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </>
  ),
  chevron: <path d="m6 9 6 6 6-6" />,
  tick: <path d="M20 6 9 17l-5-5" />,
  phone: (
    <>
      <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.6A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z" />
    </>
  ),
  whatsapp: (
    <>
      <path d="M3 21l1.7-5A8 8 0 1 1 8 19.3z" />
      <path d="M8.5 8.5c-.3 0-.6.1-.8.4-.3.3-.9.9-.9 2.1s.9 2.4 1 2.6c.1.2 1.7 2.7 4.2 3.6 2 .8 2.5.7 2.9.6.5-.1 1.4-.6 1.6-1.2.2-.6.2-1 .1-1.2 0-.1-.3-.2-.6-.4-.3-.2-1.4-.7-1.6-.7-.2-.1-.4-.1-.5.1l-.7.9c-.1.2-.3.2-.5.1-.3-.1-1.1-.4-2-1.2-.7-.6-1.2-1.4-1.3-1.6-.1-.2 0-.4.1-.5l.4-.4c.1-.2.2-.3.2-.5s0-.4-.1-.5c0-.2-.5-1.3-.7-1.7-.1-.3-.3-.3-.5-.3z" />
    </>
  ),
  lock: (
    <>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </>
  ),
  grid: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </>
  ),
  sparkles: (
    <>
      <path d="M12 3v4M12 17v4M5 12H3M21 12h-2M6 6l1.5 1.5M16.5 16.5 18 18M18 6l-1.5 1.5M7.5 16.5 6 18" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  zap: <path d="M13 2 4 14h6l-1 8 9-12h-6z" />,
  monitor: (
    <>
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </>
  ),
  pencil: (
    <>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </>
  ),
  fingerprint: (
    <>
      <path d="M12 10a2 2 0 0 0-2 2c0 1.5.5 3 .5 3" />
      <path d="M8 9a4 4 0 0 1 7 2.5c0 2.5.5 4 .5 4" />
      <path d="M5 11a7 7 0 0 1 13-3" />
      <path d="M5 16c.5-1 1-2 1-4" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.5 2.5 15 0 18M12 3c-2.5 2.5-2.5 15 0 18" />
    </>
  ),
  receipt: (
    <>
      <path d="M5 3v18l2-1 2 1 2-1 2 1 2-1 2 1V3l-2 1-2-1-2 1-2-1-2 1z" />
      <path d="M9 8h6M9 12h6" />
    </>
  ),
  rocket: (
    <>
      <path d="M5 16c-1.5 1.5-2 5-2 5s3.5-.5 5-2" />
      <path d="M9 15s5-1 8-4 4-8 4-8-5 1-8 4-4 8-4 8z" />
      <circle cx="14" cy="10" r="1.5" />
      <path d="M9 15l-2-2" />
    </>
  ),
};

const Icon = ({ name, size = 24, className = '', strokeWidth = 1.8, ...rest }) => {
  const path = PATHS[name];
  if (!path) return null;
  return (
    <svg
      className={`lp-icon ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {path}
    </svg>
  );
};

export default Icon;
