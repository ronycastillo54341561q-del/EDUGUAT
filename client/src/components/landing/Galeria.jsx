import { useState } from 'react';
import Reveal from './Reveal';
import Icon from './Icon';
import './Galeria.css';

// Galería de capturas REALES del sistema. Las imágenes se colocan manualmente
// en client/public/capturas/ (ver README de esa carpeta). Si una imagen aún no
// existe, se muestra un marco de placeholder con el nombre del archivo que falta
// en vez de una imagen rota.
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
  return (
    <Reveal as="figure" delay={delay} className="gl-card">
      <div className="gl-card__marco">
        {error ? (
          <div className="gl-card__placeholder">
            <Icon name={c.icono} size={34} />
            <span className="gl-card__pendiente">Captura pendiente</span>
            <code>{c.archivo.replace('/capturas/', '')}</code>
          </div>
        ) : (
          <img
            src={c.archivo}
            alt={`EduGuat — ${c.titulo}`}
            loading="lazy"
            onError={() => setError(true)}
          />
        )}
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
        <span className="lp-section__pill">Capturas reales</span>
        <h2 className="lp-section__titulo">Así se ve por dentro</h2>
        <p className="lp-section__descripcion">
          Pantallas reales de EduGuat trabajando en instituciones de Guatemala.
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
