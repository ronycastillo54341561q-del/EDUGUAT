import { useNavigate } from 'react-router-dom';
import Reveal from './Reveal';
import Icon from './Icon';
import './ComoFunciona.css';

const pasos = [
  {
    n: '01',
    icono: 'building',
    titulo: 'Seleccione su sede',
    texto: 'Cada institución o academia opera en un espacio propio y aislado, con su información independiente.',
  },
  {
    n: '02',
    icono: 'lock',
    titulo: 'Inicie sesión',
    texto: 'Acceso por roles: dirección, oficina, maestros y alumnos consultan únicamente lo que les corresponde.',
  },
  {
    n: '03',
    icono: 'grid',
    titulo: 'Gestione la operación diaria',
    texto: 'Alumnos, pagos, asistencias y notas centralizados, con recibos y constancias generados automáticamente.',
  },
  {
    n: '04',
    icono: 'chart',
    titulo: 'Decida con información',
    texto: 'Dashboard ejecutivo y reportes financieros en tiempo real para respaldar cada decisión.',
  },
];

const ComoFunciona = () => {
  const navigate = useNavigate();

  return (
    <section id="como-funciona" className="lp-comofunciona">
      <div className="lp-comofunciona__inner">
        <Reveal className="lp-section__header">
          <span className="lp-section__pill lp-section__pill--claro">Implementación</span>
          <h2 className="lp-section__titulo lp-section__titulo--claro">Puesta en marcha en cuatro pasos</h2>
          <p className="lp-section__descripcion lp-section__descripcion--claro">
            Sin infraestructura propia ni procesos largos de instalación: su
            institución puede comenzar a operar en poco tiempo.
          </p>
        </Reveal>

        <div className="lp-pasos">
          {pasos.map((p, i) => (
            <Reveal as="article" className="lp-paso" delay={i * 120} key={p.n}>
              <div className="lp-paso__num">{p.n}</div>
              <div className="lp-paso__icono" aria-hidden="true"><Icon name={p.icono} size={28} /></div>
              <h3 className="lp-paso__titulo">{p.titulo}</h3>
              <p className="lp-paso__texto">{p.texto}</p>
              {i < pasos.length - 1 && (
                <span className="lp-paso__flecha" aria-hidden="true"><Icon name="arrow" size={22} /></span>
              )}
            </Reveal>
          ))}
        </div>

        <Reveal className="lp-comofunciona__cta">
          <button className="lp-btn-acceder lp-btn-acceder--xl" onClick={() => navigate('/acceder')}>
            Acceder al sistema <Icon name="arrow" size={20} />
          </button>
          <p className="lp-comofunciona__nota">Sin instalaciones. Funciona en cualquier navegador.</p>
        </Reveal>
      </div>
    </section>
  );
};

export default ComoFunciona;
