import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Reveal from './Reveal';
import Icon from './Icon';
import faqs from './faqData';
import './FAQ.css';

// Acordeón de preguntas frecuentes. `completo` muestra todas; en el landing se
// muestran solo las primeras y un botón hacia la página dedicada.
const FAQ = ({ completo = false }) => {
  const navigate = useNavigate();
  const [abierto, setAbierto] = useState(completo ? 0 : -1);
  const lista = completo ? faqs : faqs.slice(0, 6);

  return (
    <section id="faq" className="lp-faq">
      <div className="lp-faq__inner">
        {!completo && (
          <Reveal className="lp-section__header">
            <span className="lp-section__pill">Preguntas frecuentes</span>
            <h2 className="lp-section__titulo">Resolvemos tus dudas</h2>
            <p className="lp-section__descripcion">
              Lo que más nos preguntan las instituciones de Guatemala antes de dar el paso.
            </p>
          </Reveal>
        )}

        <div className="lp-faq__lista">
          {lista.map((f, i) => {
            const activo = abierto === i;
            return (
              <Reveal as="div" delay={i * 60} key={f.p}>
                <div className={`lp-faq__item ${activo ? 'lp-faq__item--abierto' : ''}`}>
                  <button
                    className="lp-faq__pregunta"
                    aria-expanded={activo}
                    onClick={() => setAbierto(activo ? -1 : i)}
                  >
                    <span>{f.p}</span>
                    <Icon name="chevron" size={20} className="lp-faq__chevron" />
                  </button>
                  <div className="lp-faq__respuesta">
                    <p>{f.r}</p>
                  </div>
                </div>
              </Reveal>
            );
          })}
        </div>

        {!completo && (
          <Reveal className="lp-faq__cta">
            <button className="lp-btn lp-btn--secundario" onClick={() => navigate('/preguntas-frecuentes')}>
              Ver todas las preguntas
              <Icon name="arrow" size={18} />
            </button>
          </Reveal>
        )}
      </div>
    </section>
  );
};

export default FAQ;
