import './Benefits.css';

const beneficiarios = [
  {
    icono: '🏛️',
    titulo: 'Directores y Administradores',
    descripcion: 'Toma decisiones basadas en datos con visibilidad total.',
    beneficios: [
      'Dashboard ejecutivo con indicadores clave',
      'Reportes financieros en tiempo real',
      'Control centralizado de sedes y personal',
      'Análisis comparativos entre periodos',
    ],
  },
  {
    icono: '👩‍🏫',
    titulo: 'Maestros',
    descripcion: 'Herramientas que ahorran tiempo en tareas administrativas.',
    beneficios: [
      'Portal de calificaciones intuitivo',
      'Control de asistencias en segundos',
      'Planificaciones y bitácoras digitales',
      'Comunicación directa con padres',
    ],
  },
  {
    icono: '👨‍👩‍👧',
    titulo: 'Padres de Familia',
    descripcion: 'Mantente al tanto del progreso académico de tus hijos.',
    beneficios: [
      'Seguimiento académico actualizado',
      'Notificaciones de pagos y eventos',
      'Historial de asistencias y notas',
      'Comunicación directa con maestros',
    ],
  },
  {
    icono: '🎓',
    titulo: 'Estudiantes',
    descripcion: 'Tu información académica siempre disponible.',
    beneficios: [
      'Acceso a calificaciones y notas',
      'Portal de comunicación interno',
      'Constancias y documentos digitales',
      'Consulta de pagos y avisos',
    ],
  },
];

const Benefits = () => {
  return (
    <section id="benefits" className="lp-benefits">
      <div className="lp-benefits__inner">
        <div className="lp-section__header">
          <span className="lp-section__pill">Beneficios</span>
          <h2 className="lp-section__titulo">Diseñado para toda la comunidad educativa</h2>
          <p className="lp-section__descripcion">
            Cada usuario tiene acceso exactamente a la información que necesita, ni más ni menos.
          </p>
        </div>

        <div className="lp-benefits__grid">
          {beneficiarios.map((b) => (
            <article className="lp-benefit" key={b.titulo}>
              <div className="lp-benefit__header">
                <span className="lp-benefit__icono" aria-hidden="true">{b.icono}</span>
                <h3 className="lp-benefit__titulo">{b.titulo}</h3>
              </div>
              <p className="lp-benefit__descripcion">{b.descripcion}</p>
              <ul className="lp-benefit__lista">
                {b.beneficios.map((item) => (
                  <li key={item}>
                    <span className="lp-benefit__check">✓</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Benefits;
