import './Features.css';

const caracteristicas = [
  {
    icono: '💰',
    titulo: 'Control de Finanzas',
    descripcion: 'Gestiona ingresos, gastos y reportes financieros con métricas claras y exportables en tiempo real.',
  },
  {
    icono: '📊',
    titulo: 'Gestión de Información',
    descripcion: 'Centraliza datos de estudiantes y personal en una sola plataforma segura y ordenada.',
  },
  {
    icono: '💳',
    titulo: 'Control de Pagos',
    descripcion: 'Registra pagos, genera recibos automáticos y mantén historiales detallados por alumno.',
  },
  {
    icono: '👥',
    titulo: 'Control de Usuarios',
    descripcion: 'Administra roles y permisos con un sistema flexible adaptado a cada institución.',
  },
  {
    icono: '✅',
    titulo: 'Control de Asistencias',
    descripcion: 'Registra asistencias, genera reportes diarios y detecta patrones para tomar decisiones.',
  },
];

const Features = () => {
  return (
    <section id="features" className="lp-features">
      <div className="lp-features__inner">
        <div className="lp-section__header">
          <span className="lp-section__pill">Características</span>
          <h2 className="lp-section__titulo">Todo lo que necesita tu institución</h2>
          <p className="lp-section__descripcion">
            Un sistema completo que cubre todas las áreas críticas de la administración educativa.
          </p>
        </div>

        <div className="lp-features__grid">
          {caracteristicas.map((c) => (
            <article className="lp-feature" key={c.titulo}>
              <div className="lp-feature__icono" aria-hidden="true">{c.icono}</div>
              <h3 className="lp-feature__titulo">{c.titulo}</h3>
              <p className="lp-feature__descripcion">{c.descripcion}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Features;
