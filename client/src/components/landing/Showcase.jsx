import { useState } from 'react';
import Reveal from './Reveal';
import Icon from './Icon';
import './Showcase.css';

const modulos = [
  { icono: 'cap', nombre: 'Alumnos' },
  { icono: 'card', nombre: 'Pagos y recibos' },
  { icono: 'check', nombre: 'Asistencias' },
  { icono: 'pencil', nombre: 'Notas y TAC' },
  { icono: 'book', nombre: 'Diplomados' },
  { icono: 'chart', nombre: 'Reportes financieros' },
  { icono: 'building', nombre: 'Multi-sede' },
  { icono: 'file', nombre: 'Constancias' },
  { icono: 'users', nombre: 'Usuarios y roles' },
  { icono: 'clock', nombre: 'Bitácora' },
  { icono: 'megaphone', nombre: 'Avisos' },
  { icono: 'database', nombre: 'Respaldos' },
];

const capturas = [
  {
    id: 'alumnos',
    etiqueta: 'Alumnos',
    titulo: 'Listado de alumnos',
    url: 'eduguat.com/admin/alumnos',
  },
  {
    id: 'pagos',
    etiqueta: 'Pagos',
    titulo: 'Control de pagos',
    url: 'eduguat.com/admin/pagos',
  },
  {
    id: 'asistencia',
    etiqueta: 'Asistencia',
    titulo: 'Asistencia mensual',
    url: 'eduguat.com/admin/asistencia',
  },
];

const Mockup = ({ activo }) => (
  <div className="sc-mockup">
    <div className="sc-mockup__barra">
      <span className="sc-mockup__punto sc-mockup__punto--r"></span>
      <span className="sc-mockup__punto sc-mockup__punto--a"></span>
      <span className="sc-mockup__punto sc-mockup__punto--v"></span>
      <span className="sc-mockup__url">{capturas.find(c => c.id === activo).url}</span>
    </div>
    <div className="sc-mockup__cuerpo">
      <div className="sc-mockup__topbar">
        <span className="sc-mockup__titulo">{capturas.find(c => c.id === activo).titulo}</span>
        <span className="sc-mockup__chip">EduGuat</span>
      </div>

      {activo === 'alumnos' && (
        <div className="sc-tabla">
          <div className="sc-tabla__head">
            <span>Código</span><span>Nombre</span><span>Diplomado</span><span>Estado</span>
          </div>
          {[
            ['A001GTM', 'María López', 'Operador Windows', 'Activo'],
            ['A014XEL', 'Carlos Pérez', 'Programador', 'Activo'],
            ['A027JUT', 'Ana Morales', 'Diseño Gráfico', 'Activo'],
            ['A039FLO', 'Luis Gómez', 'Operador Windows', 'Inactivo'],
          ].map((f) => (
            <div className="sc-tabla__fila" key={f[0]}>
              <span className="sc-mono">{f[0]}</span>
              <span>{f[1]}</span>
              <span>{f[2]}</span>
              <span className={`sc-badge ${f[3] === 'Activo' ? 'sc-badge--ok' : 'sc-badge--off'}`}>{f[3]}</span>
            </div>
          ))}
        </div>
      )}

      {activo === 'pagos' && (
        <div className="sc-pagos">
          <div className="sc-pagos__kpis">
            <div className="sc-kpi"><span>Cobrado</span><strong>Q 18,450</strong></div>
            <div className="sc-kpi"><span>Pendiente</span><strong>Q 3,200</strong></div>
            <div className="sc-kpi"><span>Recibos hoy</span><strong>27</strong></div>
          </div>
          <div className="sc-meses">
            {['E','F','M','A','M','J','J','A','S','O','N','D'].map((m, i) => (
              <span key={i} className={`sc-mes ${i < 5 ? 'sc-mes--pag' : i === 5 ? 'sc-mes--act' : ''}`}>{m}</span>
            ))}
          </div>
          <div className="sc-recibo">
            <span>Recibo #00427 · María López</span>
            <strong>Q 250.00</strong>
          </div>
        </div>
      )}

      {activo === 'asistencia' && (
        <div className="sc-asis">
          {['María L.', 'Carlos P.', 'Ana M.', 'Luis G.'].map((n, fila) => (
            <div className="sc-asis__fila" key={n}>
              <span className="sc-asis__nombre">{n}</span>
              <div className="sc-asis__dias">
                {Array.from({ length: 20 }).map((_, i) => {
                  const falta = (i + fila) % 7 === 0;
                  return <span key={i} className={`sc-dia ${falta ? 'sc-dia--f' : 'sc-dia--p'}`}>{falta ? 'A' : 'P'}</span>;
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  </div>
);

const Showcase = () => {
  const [activo, setActivo] = useState('alumnos');

  return (
    <section id="showcase" className="lp-showcase">
      <div className="lp-showcase__inner">
        <Reveal className="lp-section__header">
          <span className="lp-section__pill">El sistema por dentro</span>
          <h2 className="lp-section__titulo">Mira EduGuat en acción</h2>
          <p className="lp-section__descripcion">
            Una plataforma, todos tus módulos. Así se ve el día a día de la administración.
          </p>
        </Reveal>

        <Reveal className="lp-showcase__demo">
          <div className="lp-showcase__tabs" role="tablist">
            {capturas.map((c) => (
              <button
                key={c.id}
                role="tab"
                aria-selected={activo === c.id}
                className={`lp-showcase__tab ${activo === c.id ? 'lp-showcase__tab--activo' : ''}`}
                onClick={() => setActivo(c.id)}
              >
                {c.etiqueta}
              </button>
            ))}
          </div>
          <Mockup activo={activo} />
        </Reveal>

        <Reveal className="lp-showcase__modulos" delay={120}>
          <h3 className="lp-showcase__modulos-titulo">Módulos disponibles</h3>
          <div className="lp-modulos__grid">
            {modulos.map((m, i) => (
              <Reveal as="div" className="lp-modulo" delay={i * 40} key={m.nombre}>
                <span className="lp-modulo__icono" aria-hidden="true"><Icon name={m.icono} size={24} /></span>
                <span className="lp-modulo__nombre">{m.nombre}</span>
              </Reveal>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
};

export default Showcase;
