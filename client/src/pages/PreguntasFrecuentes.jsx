import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import usePageTitle from '../hooks/usePageTitle';
import ScrollProgress from '../components/landing/ScrollProgress';
import Header from '../components/landing/Header';
import Footer from '../components/landing/Footer';
import FAQ from '../components/landing/FAQ';
import Reveal from '../components/landing/Reveal';
import Icon from '../components/landing/Icon';
import './Landing.css';

const PreguntasFrecuentes = () => {
  usePageTitle('Preguntas Frecuentes');
  const navigate = useNavigate();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="lp-page">
      <ScrollProgress />
      <Header />
      <main>
        <div className="lp-interna">
          <Reveal className="lp-interna__hero">
            <span className="lp-interna__migaja">
              <Icon name="sparkles" size={16} /> Centro de ayuda
            </span>
            <h1 className="lp-interna__titulo">Preguntas frecuentes</h1>
            <p className="lp-interna__sub">
              Todo lo que las instituciones de Guatemala nos preguntan antes de digitalizar su
              administración con EduGuat. ¿No encuentras tu respuesta? Escríbenos.
            </p>
          </Reveal>
        </div>

        <FAQ completo />

        <div className="lp-interna" style={{ paddingTop: 0 }}>
          <Reveal className="lp-cta-banner">
            <div>
              <h2>¿Te quedó alguna duda?</h2>
              <p>Un asesor de EduGuat resuelve tus preguntas y te muestra el sistema sin compromiso.</p>
            </div>
            <button className="lp-btn-acceder" onClick={() => navigate('/contacto')}>
              Hablar con un asesor <Icon name="arrow" size={18} />
            </button>
          </Reveal>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default PreguntasFrecuentes;
