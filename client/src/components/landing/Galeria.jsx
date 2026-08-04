import { useState } from 'react';
import Reveal from './Reveal';
import Icon from './Icon';
import './Galeria.css';

// Galería de capturas reales del sistema. Las imágenes se colocan manualmente
// en client/public/capturas/ (ver README de esa carpeta) y deben referenciarse
// SIEMPRE con ruta absoluta "/capturas/..." — rutas relativas tipo
// "../../../public/..." solo funcionan en el dev server de Vite, no en el
// build servido por nginx/pm2. Si el archivo aún no existe, la tarjeta no se
// muestra (nada de marcos rotos ni placeholders en la página pública).
const capturas = [
  { archivo: '/capturas/01-dashboard.png', titulo: 'Dashboard ejecutivo', icono: 'chart' },
  { archivo: '/capturas/02-alumnos.png', titulo: 'Gestión de alumnos', icono: 'cap' },
  { archivo: '/capturas/03-pagos.png', titulo: 'Pagos y recibos', icono: 'card' },
  { archivo: '/capturas/04-asistencia.png', titulo: 'Control de asistencia', icono: 'check' },
  { archivo: '/capturas/05-notas.png', titulo: 'Notas y boletas', icono: 'pencil' },
  { archivo: '/capturas/06-reportes.png', titulo: 'Reportes financieros', icono: 'wallet' },
];

const Tarjeta = ({ c, delay }) => {
  const [error, setError] = useState(false);
  if (error) return null;
  return (
    <Reveal as="figure" delay={delay} className="gl-card">
      <div className="gl-card__marco">
        <img
          src={c.archivo}
          alt={`EduGuat — ${c.titulo}`}
          loading="lazy"
          onError={() => setError(true)}
        />
      </div>
      <figcaption className="gl-card__pie">
        <span className="gl-card__icono"><Icon name={c.icono} size={18} /></span>
        {c.titulo}
      </figcaption>
    </Reveal>
  );
};

const Galeria = () => (
  <section id="galeria" className="lp-galeria">
    <div className="lp-galeria__inner">
      <Reveal className="lp-section__header">
        <span className="lp-section__pill">El producto</span>
        <h2 className="lp-section__titulo">La plataforma en operación</h2>
        <p className="lp-section__descripcion">
          Capturas del sistema en producción, tal como lo utilizan a diario las
          instituciones que administran su operación con EduGuat.
        </p>
      </Reveal>

      <div className="lp-galeria__grid">
        {capturas.map((c, i) => (
          <Tarjeta key={c.archivo} c={c} delay={i * 80} />
        ))}
      </div>
    </div>
  </section>
);

export default Galeria;
