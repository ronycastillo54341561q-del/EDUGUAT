import { useEffect, useRef } from 'react';
import Sidebar from '../../components/Sidebar';
import './admin.css';
import './Manual.css';

const SECCIONES = [
  { id: 'intro',         titulo: '1. Bienvenido a EduGuat' },
  { id: 'primer-uso',    titulo: '2. Primer uso — academia recién creada' },
  { id: 'configuracion', titulo: '3. Configuración general e institucional' },
  { id: 'membretes',     titulo: '4. Membretes (recibos, constancias)' },
  { id: 'modulos',       titulo: '5. Recorrido por los módulos' },
  { id: 'importar',      titulo: '6. Importar datos de una academia existente' },
  { id: 'pagos-config',  titulo: '7. Configuración de pagos por año' },
  { id: 'roles',         titulo: '8. Roles personalizados y permisos' },
  { id: 'sesiones',      titulo: '9. Sesiones y seguridad' },
  { id: 'soporte',       titulo: '10. Buenas prácticas y soporte' },
];

const Manual = () => {
  const tocRef = useRef(null);

  // En la versión imprimible (window.print) usamos sólo el contenido,
  // sin sidebar ni botones — controlado vía CSS @media print.
  useEffect(() => {
    document.title = 'Manual — EduGuat';
  }, []);

  const scrollTo = (id) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="admin-layout manual-layout">
      <Sidebar />
      <div className="admin-content manual-content">
        <div className="manual-toolbar no-print">
          <h1>📖 Manual de uso</h1>
          <button className="btn-primary" onClick={() => window.print()}>
            🖨️ Imprimir / Guardar como PDF
          </button>
        </div>

        <p className="subtitle no-print">
          Guía paso a paso para administradores. Para guardar como PDF usa
          <strong> "Imprimir → Destino: Guardar como PDF"</strong> en el navegador.
        </p>

        <nav className="manual-toc no-print" ref={tocRef}>
          <strong>Índice</strong>
          <ul>
            {SECCIONES.map(s => (
              <li key={s.id}>
                <button onClick={() => scrollTo(s.id)}>{s.titulo}</button>
              </li>
            ))}
          </ul>
        </nav>

        <article className="manual-doc">
          <header className="manual-cover print-only">
            <h1>EduGuat</h1>
            <h2>Manual del administrador</h2>
            <p>Sistema de Gestión Estudiantil multi-sede</p>
          </header>

          <section id="intro">
            <h2>1. Bienvenido a EduGuat</h2>
            <p>
              EduGuat es un sistema multi-academia para gestionar alumnos,
              asistencia, mensualidades, recibos, constancias y reportes.
              Cada academia tiene su propia base de datos aislada y su propio
              listado de usuarios, alumnos y configuración.
            </p>
            <p>
              Este manual está pensado para el administrador que recibe la
              academia por primera vez o que va a importar datos desde una
              academia ya existente.
            </p>
          </section>

          <section id="primer-uso">
            <h2>2. Primer uso — academia recién creada</h2>
            <ol>
              <li>
                <strong>Inicia sesión</strong> con la cuenta de administrador
                que se creó al registrar la academia (email indicado al
                momento del alta y la contraseña inicial).
              </li>
              <li>
                Cambia la contraseña en <em>Sistema → Usuarios → Editar mi
                usuario</em>.
              </li>
              <li>
                Ve a <em>Sistema → Configuración</em> y completa los datos
                institucionales (nombre, dirección, teléfono, email).
              </li>
              <li>
                Sube los logos en la pestaña <em>Membretes</em> y arma las
                cabeceras para recibos y constancias.
              </li>
              <li>
                Crea los <em>diplomados</em>, <em>TAC</em> y catálogos en
                sus módulos correspondientes.
              </li>
              <li>
                Recién entonces empieza a registrar alumnos en
                <em>Gestión → Alumnos</em>.
              </li>
            </ol>
          </section>

          <section id="configuracion">
            <h2>3. Configuración general e institucional</h2>
            <p>
              El módulo <strong>Configuración</strong> guarda los datos que se
              imprimen en recibos y reportes (nombre de la institución,
              dirección, teléfono, email). Cambiar estos valores afecta a
              todos los documentos a partir del momento del cambio.
            </p>
            <ul>
              <li>Nombre de la institución</li>
              <li>Dirección</li>
              <li>Teléfono</li>
              <li>Correo electrónico de contacto</li>
            </ul>
          </section>

          <section id="membretes">
            <h2>4. Membretes</h2>
            <p>
              Los <strong>membretes</strong> son las cabeceras que aparecen en
              los recibos de pago, recibos de papelería y constancias. Se
              configuran desde <em>Configuración → pestaña Membretes</em>.
              Para cada tipo de documento puedes:
            </p>
            <ul>
              <li>Subir un logo.</li>
              <li>Definir el texto del encabezado.</li>
              <li>Personalizar nombre y cargo de la firma.</li>
              <li>Ajustar espacios y mostrar/ocultar fecha.</li>
            </ul>
            <p className="tip">
              💡 Desde el módulo <em>Pagos</em> hay un botón directo
              <strong>"Membrete de recibos"</strong> que te lleva ahí.
            </p>
          </section>

          <section id="modulos">
            <h2>5. Recorrido por los módulos</h2>

            <h3>Gestión</h3>
            <ul>
              <li><strong>Alumnos:</strong> alta, edición, retiro, reactivación.</li>
              <li><strong>Diplomados:</strong> catálogo de diplomados y materias.</li>
              <li><strong>Asistencia:</strong> control semanal por mes.</li>
              <li><strong>Planificaciones:</strong> agenda de docentes.</li>
              <li><strong>Mecanografía:</strong> notas por lección y examen.</li>
            </ul>

            <h3>Notas</h3>
            <ul>
              <li><strong>Notas TAC:</strong> notas anuales por TAC.</li>
              <li><strong>Inscritos TAC:</strong> control de inscritos por TAC.</li>
              <li><strong>Notas Diplomados:</strong> notas por materia/diplomado.</li>
            </ul>

            <h3>Reportes</h3>
            <ul>
              <li><strong>Reporte Alumno:</strong> ficha completa del alumno.</li>
              <li><strong>Consultas:</strong> listados configurables.</li>
              <li><strong>Impresión:</strong> formatos imprimibles.</li>
              <li><strong>Constancias:</strong> generación con plantillas.</li>
              <li>
                <strong>Mis Tablas:</strong> tablas personalizadas compartidas
                entre todos los usuarios con acceso al módulo. Las tablas
                desactivadas se conservan 7 días antes de eliminarse.
              </li>
            </ul>

            <h3>Finanzas</h3>
            <ul>
              <li><strong>Nuevo Pago:</strong> cobro guiado mes a mes con recibo.</li>
              <li><strong>Otros Pagos:</strong> pagos no recurrentes.</li>
              <li>
                <strong>Pagos:</strong> rejilla de mensualidades por alumno y
                mes. Las celdas se colorean según estado:
                <ul>
                  <li>Verde — pagado.</li>
                  <li>Naranja — abono parcial.</li>
                  <li>Azul — mes acreditado (gratis/beca).</li>
                  <li>Gris oscuro — mes bloqueado por configuración.</li>
                </ul>
              </li>
              <li><strong>Recibos / Papelería:</strong> consulta de comprobantes.</li>
            </ul>

            <h3>Comunicación</h3>
            <ul>
              <li><strong>Avisos:</strong> mensajes globales o por filtro.</li>
            </ul>

            <h3>Sistema</h3>
            <ul>
              <li><strong>Usuarios:</strong> alta y administración de cuentas.</li>
              <li><strong>Roles:</strong> roles personalizados con horarios y permisos.</li>
              <li><strong>Configuración:</strong> datos institucionales y membretes.</li>
              <li><strong>Academias:</strong> sólo super-admin. Crea, edita y desactiva sedes.</li>
              <li><strong>Importar Datos:</strong> carga masiva desde Excel/CSV.</li>
              <li><strong>Bitácora:</strong> registro de acciones del sistema.</li>
              <li><strong>Backups:</strong> respaldos manuales y programados.</li>
            </ul>
          </section>

          <section id="importar">
            <h2>6. Importar datos de una academia existente</h2>
            <p>
              Cuando trasladas una academia que ya operaba, tienes dos
              opciones:
            </p>
            <ol>
              <li>
                <strong>Importar todos los alumnos históricos.</strong> Útil
                si quieres conservar registros de años anteriores.
              </li>
              <li>
                <strong>Importar solo los alumnos activos del año actual.</strong>
                Si la academia tiene 1000 alumnos pero solo 300 están
                activos este año, importa solo esos. Es lo más recomendado
                para mantener la información operativa limpia.
              </li>
            </ol>
            <p>
              El parser de archivos vive en el módulo <em>Sistema → Importar
              Datos</em>. El wizard que aparece tras crear una academia
              "existente" te lleva ahí y, además, te permite configurar:
            </p>
            <ul>
              <li>
                <strong>Desde qué mes empieza a pagar cada alumno</strong>,
                por filtro: día, diplomado, horario, laboratorio o alumno
                específico (también global). Esto crea reglas en
                <em>Configuración de pagos</em>.
              </li>
              <li>
                <strong>Abono inicial</strong>: monto que se aplica al primer
                mes esperado de los alumnos del filtro.
              </li>
            </ul>
            <p className="tip">
              💡 Los meses anteriores al "mes inicio" configurado quedan
              automáticamente bloqueados (gris oscuro) en la rejilla de
              <em>Pagos</em>. Eso impide cobrarlos por error.
            </p>
          </section>

          <section id="pagos-config">
            <h2>7. Configuración de pagos por año</h2>
            <p>
              Desde <em>Pagos → ⚙ Configuración de pagos</em> defines
              "reglas" de cuándo y cuánto cobra cada grupo:
            </p>
            <ul>
              <li>
                <strong>Año:</strong> cada regla aplica a un año.
              </li>
              <li>
                <strong>Alcance (scope):</strong> global, diplomado, horario,
                laboratorio, día o alumno.
              </li>
              <li>
                <strong>Rango de meses:</strong> mes inicio y mes fin (1–12).
              </li>
              <li>
                <strong>Multiplicador:</strong> 1.0 = cuota completa, 0.5 =
                medio mes, 2.0 = doble.
              </li>
            </ul>
            <p>
              Cualquier mes fuera del rango configurado se ve <strong>en gris
              oscuro</strong> en la rejilla y no se puede editar — es el
              indicador visual de "este alumno no paga ese mes".
            </p>
          </section>

          <section id="roles">
            <h2>8. Roles personalizados y permisos</h2>
            <p>
              Los <strong>roles base</strong> son: admin, oficina, maestro,
              alumno. Desde <em>Sistema → Roles</em> puedes crear roles
              personalizados que heredan de un rol base y restringir:
            </p>
            <ul>
              <li>Permisos por módulo (ver / editar / exportar).</li>
              <li>Horario de acceso (días y rango horario).</li>
              <li>Activar / desactivar el rol completo.</li>
            </ul>
          </section>

          <section id="sesiones">
            <h2>9. Sesiones y seguridad</h2>
            <ul>
              <li>
                <strong>Una sesión por usuario.</strong> Si inicias sesión en
                otro dispositivo, la anterior se cierra automáticamente.
              </li>
              <li>
                <strong>Cierre por inactividad.</strong> Tras 10 minutos sin
                actividad la sesión se cierra y debes volver a iniciar.
              </li>
              <li>
                <strong>Bitácora.</strong> Todas las acciones críticas
                (crear, editar, eliminar) quedan registradas con usuario,
                IP y fecha.
              </li>
            </ul>
          </section>

          <section id="soporte">
            <h2>10. Buenas prácticas</h2>
            <ul>
              <li>
                Programa <strong>backups</strong> regulares desde el módulo
                Backups.
              </li>
              <li>
                Antes de importar, haz un backup manual.
              </li>
              <li>
                Crea roles personalizados en lugar de compartir la cuenta
                "admin".
              </li>
              <li>
                Las tablas en "Mis Tablas" son compartidas — coordínense
                antes de desactivar una.
              </li>
            </ul>
          </section>
        </article>
      </div>
    </div>
  );
};

export default Manual;
