import { useNavigate } from 'react-router-dom';
import Icon from './Icon';
import './Hero.css';

const Hero = () => {
  const navigate = useNavigate();

  const scrollA = (id) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <section className="lp-hero">
      <div className="lp-hero__inner">
        <div className="lp-hero__contenido lp-fade-in">
          <span className="lp-hero__pill">Software guatemalteco de gestión educativa</span>
          <h1 className="lp-hero__titulo">
            La administración de su institución educativa, <span className="lp-hero__acento">en una sola plataforma</span>
          </h1>
          <p className="lp-hero__descripcion">
            EduGuat centraliza la operación diaria de colegios, academias e institutos:
            alumnos, pagos, asistencia, calificaciones y reportes financieros, con
            información en tiempo real para la dirección y accesos diferenciados para
            oficina, maestros, padres y estudiantes.
          </p>

          <div className="lp-hero__botones">
            <button className="lp-btn-acceder lp-btn-acceder--xl" onClick={() => navigate('/acceder')}>
              Acceder al sistema <Icon name="arrow" size={20} />
            </button>
            <button className="lp-btn lp-btn--secundario" onClick={() => scrollA('showcase')}>
              Conocer la plataforma
            </button>
          </div>

          <div className="lp-hero__estadisticas">
            <div className="lp-stat">
              <div className="lp-stat__numero">12</div>
              <div className="lp-stat__texto">Módulos integrados</div>
            </div>
            <div className="lp-stat">
              <div className="lp-stat__numero">100%</div>
              <div className="lp-stat__texto">En la nube</div>
            </div>
            <div className="lp-stat">
              <div className="lp-stat__numero">24/7</div>
              <div className="lp-stat__texto">Disponibilidad</div>
            </div>
          </div>
        </div>

        <div className="lp-hero__visual lp-fade-in-delay">
          <div className="lp-mockup">
            <div className="lp-mockup__barra">
              <span className="lp-mockup__punto lp-mockup__punto--rojo"></span>
              <span className="lp-mockup__punto lp-mockup__punto--amarillo"></span>
              <span className="lp-mockup__punto lp-mockup__punto--verde"></span>
              <span className="lp-mockup__url">eduguat.com/dashboard</span>
            </div>
            <div className="lp-mockup__contenido">
              <div className="lp-mockup__header">
                <div className="lp-mockup__titulo">Dashboard Ejecutivo</div>
                <div className="lp-mockup__fecha">Mayo 2026</div>
              </div>

              <div className="lp-mockup__kpis">
                <div className="lp-kpi">
                  <span className="lp-kpi__label">Alumnos</span>
                  <span className="lp-kpi__valor">1,248</span>
                </div>
                <div className="lp-kpi">
                  <span className="lp-kpi__label">Ingresos</span>
                  <span className="lp-kpi__valor">Q 84K</span>
                </div>
                <div className="lp-kpi">
                  <span className="lp-kpi__label">Asistencia</span>
                  <span className="lp-kpi__valor">96%</span>
                </div>
              </div>

              <div className="lp-mockup__grafico" aria-label="Gráfico de barras">
                <div className="lp-barra" style={{ height: '40%' }}><span>E</span></div>
                <div className="lp-barra" style={{ height: '65%' }}><span>F</span></div>
                <div className="lp-barra" style={{ height: '50%' }}><span>M</span></div>
                <div className="lp-barra" style={{ height: '80%' }}><span>A</span></div>
                <div className="lp-barra" style={{ height: '70%' }}><span>M</span></div>
                <div className="lp-barra lp-barra--destacada" style={{ height: '95%' }}><span>J</span></div>
              </div>

              <div className="lp-mockup__leyenda">
                <span className="lp-leyenda__dot"></span>
                <span>Ingresos mensuales (Q miles)</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
