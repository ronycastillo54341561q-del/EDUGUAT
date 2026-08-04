// Preguntas frecuentes basadas en lo que las instituciones de Guatemala más
// consultan al buscar un software escolar (precio, internet, FEL/SAT, seguridad,
// soporte, migración, pagos en línea, multi-sede). Se usa tanto en la sección
// del landing como en la página dedicada /preguntas-frecuentes.
const faqs = [
  {
    p: '¿Cuánto cuesta EduGuat?',
    r: 'EduGuat opera bajo un modelo de suscripción mensual o anual, sin inversión inicial en servidores ni licencias. El precio se ajusta al tamaño y las necesidades de cada institución. Escríbanos por el formulario de contacto y le enviaremos una cotización a la medida.',
  },
  {
    p: '¿Necesito instalar algo o comprar servidores?',
    r: 'No. EduGuat funciona completamente en la nube, desde cualquier navegador (computadora, tablet o celular) y sin instalaciones. Nosotros nos encargamos del servidor, las actualizaciones y los respaldos. Además, puede instalarse como aplicación (PWA) en el celular.',
  },
  {
    p: '¿Funciona sin internet?',
    r: 'EduGuat requiere conexión a internet, ya que toda la información se almacena de forma segura en la nube y se sincroniza en tiempo real entre sedes y usuarios. Opera con normalidad incluso con conexiones modestas y, al ser una aplicación web ligera, consume pocos datos.',
  },
  {
    p: '¿Emite recibos y es compatible con la SAT (FEL)?',
    r: 'Sí. EduGuat genera recibos de pago y comprobantes de colegiatura automáticamente, con historial por alumno. Para la facturación electrónica (FEL) requerida por la SAT, realizamos la integración con su certificador para que sus documentos tributarios sean electrónicos. Cuéntenos su caso y lo configuramos.',
  },
  {
    p: '¿Qué tan seguros están los datos de mis alumnos?',
    r: 'Cada institución cuenta con su propia base de datos aislada en la nube, con acceso por roles (dirección, oficina, maestros y alumnos consultan únicamente lo que les corresponde), sesión única por usuario y cierre por inactividad. Realizamos respaldos automáticos para que su información esté siempre protegida.',
  },
  {
    p: '¿Puedo administrar varias sedes o jornadas?',
    r: 'Sí. EduGuat fue diseñado desde su origen como sistema multi-sede: administre varias sedes, jornadas o academias desde una sola cuenta, cada una con sus propios alumnos, pagos y reportes, y con una visión consolidada para la dirección.',
  },
  {
    p: '¿Sirve para colegios, academias e institutos?',
    r: 'Sí. EduGuat se adapta a colegios e instituciones (con grados, secciones, cursos, horarios y nóminas) y también a academias y centros de capacitación (con diplomados, cursos técnicos, mecanografía y TAC). Las pantallas se ajustan al tipo de institución.',
  },
  {
    p: '¿Pueden pasar la información que ya tengo en Excel?',
    r: 'Sí. Contamos con un módulo de importación para migrar sus alumnos y datos desde Excel, de modo que empiece a trabajar sin volver a digitar todo. Le acompañamos en la carga inicial.',
  },
  {
    p: '¿Ofrecen capacitación y soporte?',
    r: 'Sí. Somos una empresa guatemalteca y brindamos soporte en español por WhatsApp y correo, además de capacitación a su personal para que aproveche el sistema desde el primer día.',
  },
  {
    p: '¿Los padres y alumnos pueden ver su información?',
    r: 'Sí. Los alumnos (y sus padres) cuentan con un portal donde consultan notas, asistencias, avisos y su estado de pagos, lo que mejora la comunicación y reduce las consultas en oficina.',
  },
];

export default faqs;
