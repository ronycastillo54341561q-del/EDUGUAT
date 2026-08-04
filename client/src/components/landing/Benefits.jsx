import Reveal from './Reveal';
import Icon from './Icon';
import './Benefits.css';

const beneficiarios = [
  {
    icono: 'landmark',
    titulo: 'Directores y Administradores',
    descripcion: 'Decisiones informadas con visibilidad completa de la operación.',
    beneficios: [
      'Dashboard ejecutivo con indicadores clave',
      'Reportes financieros en tiempo real',
      'Control centralizado de sedes y personal',
      'Análisis comparativos entre periodos',
    ],
  },
  {
    icono: 'presentation',
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
    icono: 'heart',
    titulo: 'Padres de Familia',
    descripcion: 'Seguimiento del progreso académico de sus hijos, desde cualquier dispositivo.',
    beneficios: [
      'Seguimiento académico actualizado',
      'Notificaciones de pagos y eventos',
      'Historial de asistencias y notas',
      'Comunicación directa con maestros',
    ],
  },
  {
    icono: 'cap',
    titulo: 'Estudiantes',
    descripcion: 'Su información académica, siempre disponible.',
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
        <Reveal className="lp-section__header">
          <span className="lp-section__pill">Beneficios</span>
          <h2 className="lp-section__titulo">Diseñado para toda la comunidad educativa</h2>
          <p className="lp-section__descripcion">
            Cada perfil accede únicamente a la información que le corresponde,
            según su rol dentro de la institución.
          </p>
        </Reveal>

        <div className="lp-benefits__grid">
          {beneficiarios.map((b, i) => (
            <Reveal as="article" className="lp-benefit" delay={i * 90} key={b.titulo}>
              <div className="lp-benefit__header">
                <span className="lp-benefit__icono" aria-hidden="true"><Icon name={b.icono} size={26} /></span>
                <h3 className="lp-benefit__titulo">{b.titulo}</h3>
              </div>
              <p className="lp-benefit__descripcion">{b.descripcion}</p>
              <ul className="lp-benefit__lista">
                {b.beneficios.map((item) => (
                  <li key={item}>
                    <span className="lp-benefit__check"><Icon name="tick" size={15} strokeWidth={2.6} /></span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Benefits;
