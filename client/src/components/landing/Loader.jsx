import { useEffect, useState } from 'react';
import './Loader.css';

// Pantalla de carga inicial del landing: monograma "Ed" animado + barra que
// se llena. Se muestra una sola vez por sesión (sessionStorage) para no
// estorbar al navegar de vuelta. Respeta prefers-reduced-motion.
const Loader = () => {
  const yaVisto = typeof window !== 'undefined' && sessionStorage.getItem('lp_intro') === '1';
  const reduce =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  const [activo, setActivo] = useState(!yaVisto && !reduce);
  const [saliendo, setSaliendo] = useState(false);
  const [progreso, setProgreso] = useState(0);

  useEffect(() => {
    if (!activo) return;
    document.body.style.overflow = 'hidden';

    // Anima el porcentaje de forma "natural" (rápido al inicio, frena al final).
    let p = 0;
    const tick = setInterval(() => {
      p += Math.max(1, (100 - p) * 0.12);
      setProgreso(Math.min(100, Math.round(p)));
    }, 60);

    const finavanza = setTimeout(() => setProgreso(100), 1500);
    const fade = setTimeout(() => setSaliendo(true), 1750);
    const fin = setTimeout(() => {
      setActivo(false);
      document.body.style.overflow = '';
      sessionStorage.setItem('lp_intro', '1');
    }, 2350);

    return () => {
      clearInterval(tick);
      clearTimeout(finavanza);
      clearTimeout(fade);
      clearTimeout(fin);
      document.body.style.overflow = '';
    };
  }, [activo]);

  if (!activo) return null;

  return (
    <div className={`lp-loader ${saliendo ? 'lp-loader--out' : ''}`} role="status" aria-live="polite">
      <div className="lp-loader__halo" aria-hidden="true" />
      <div className="lp-loader__centro">
        <div className="lp-loader__monograma">
          <svg viewBox="0 0 120 120" className="lp-loader__svg" aria-hidden="true">
            <circle className="lp-loader__anillo" cx="60" cy="60" r="54" />
            <circle className="lp-loader__anillo lp-loader__anillo--prog" cx="60" cy="60" r="54" />
          </svg>
          <span className="lp-loader__ed">
            <span className="lp-loader__e">E</span>
            <span className="lp-loader__d">d</span>
          </span>
        </div>

        <div className="lp-loader__marca">EduGuat</div>
        <div className="lp-loader__sub">Sistema de Gestión Educativa</div>

        <div className="lp-loader__barra">
          <div className="lp-loader__relleno" style={{ width: `${progreso}%` }} />
        </div>
        <div className="lp-loader__pct">{progreso}%</div>
      </div>
    </div>
  );
};

export default Loader;
