require('dotenv').config();
const db     = require('./config/db');
const bcrypt = require('bcryptjs');

const MESES = ['enero','febrero','marzo','abril','mayo','junio',
               'julio','agosto','septiembre','octubre','noviembre','diciembre'];

const DIPLOMADOS = ['Computación Básica','Diseño Gráfico','Redes y Comunicaciones',
                    'Programación Web','Ofimática Avanzada','Contabilidad Computarizada'];

const TAC = ['TAC-A','TAC-B','TAC-C','TAC-D'];

const HORARIOS = ['7:00 - 9:00','9:00 - 11:00','14:00 - 16:00','16:00 - 18:00','18:00 - 20:00'];

const LABORATORIOS = ['Lab-1','Lab-2','Lab-3','Lab-4'];

const DIAS = ['lunes','martes','miercoles','jueves','viernes','sabado'];

const NOMBRES = [
  'Carlos','María','José','Ana','Luis','Rosa','Pedro','Carmen','Juan','Sandra',
  'Miguel','Lucia','Jorge','Elena','Roberto','Patricia','Fernando','Isabel','Ricardo','Claudia',
  'Alejandro','Gabriela','Eduardo','Verónica','Andrés','Daniela','Francisco','Mónica','Manuel','Sofía',
  'Héctor','Valeria','Óscar','Mariana','Rodrigo','Natalia','Sergio','Alejandra','Pablo','Cristina',
  'Diego','Laura','Alberto','Paola','Ernesto','Rebeca','Alfredo','Silvia','Armando','Gloria'
];

const APELLIDOS = [
  'García','López','Martínez','González','Pérez','Rodríguez','Sánchez','Ramírez',
  'Torres','Flores','Hernández','Rivera','Morales','Ortiz','Gutiérrez','Chávez',
  'Mendoza','Castillo','Vargas','Ríos','Reyes','Cruz','Medina','Aguilar',
  'Vásquez','Cabrera','Fuentes','Mejía','Alvarado','Herrera','Pacheco','Solís',
  'Figueroa','De León','Monterroso','Ramos','Sandoval','Juárez','Morán','Barrios',
  'Argueta','Salguero','Cifuentes','Velásquez','Marroquín','Orozco','Cuellar','Escobar',
  'Palma','Juárez'
];

const ESTABLECIMIENTOS = [
  'Instituto Nacional Mixto','Colegio Evangélico Bethania','Centro Educativo San José',
  'Instituto Técnico','Escuela Nacional Mixta','Colegio Privado Los Álamos'
];

const r  = arr => arr[Math.floor(Math.random() * arr.length)];
const rn = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

function fecha(start, end) {
  const d = new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
  return d.toISOString().split('T')[0];
}

async function seed() {
  const anio = new Date().getFullYear();
  let insertados = 0;

  for (let i = 0; i < 50; i++) {
    const nombre   = NOMBRES[i];
    const apellido = APELLIDOS[i];
    const codigo   = `EST-${String(i + 1).padStart(3, '0')}`;
    const email    = `alumno${i + 1}@eduguat.gt`;
    const pass     = await bcrypt.hash('alumno123', 10);
    const cuota    = [150, 175, 200, 225, 250][rn(0,4)];
    const dia1     = r(DIAS);
    const dia2     = Math.random() > 0.5 ? r(DIAS.filter(d => d !== dia1)) : null;
    const horario  = r(HORARIOS);
    const lab      = r(LABORATORIOS);
    const diplom   = r(DIPLOMADOS);
    const tac      = r(TAC);
    const estab    = r(ESTABLECIMIENTOS);
    const fnac     = fecha(new Date('2000-01-01'), new Date('2008-12-31'));
    const finicio  = fecha(new Date('2024-01-01'), new Date('2025-06-30'));

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      const [uRes] = await conn.query(
        'INSERT INTO usuarios (nombre, email, password, rol) VALUES (?, ?, ?, ?)',
        [`${nombre} ${apellido}`, email, pass, 'alumno']
      );

      const [aRes] = await conn.query(`
        INSERT INTO alumnos
          (clave, nombre, apellido, fecha_inicio, fecha_nacimiento,
           encargado, telefono, diplomado, tac, direccion, establecimiento,
           observaciones, dia_clases1, dia_clases2, horario, laboratorio,
           estado, cuota_mensual, usuario_id)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `, [
        codigo, nombre, apellido, finicio, fnac,
        `${r(NOMBRES)} ${r(APELLIDOS)}`,
        `5${rn(0,9)}${rn(1000000,9999999)}`,
        diplom, tac,
        `${rn(1,20)} Calle ${rn(1,12)}-${rn(1,99)}, Zona ${rn(1,19)}`,
        estab, '',
        dia1, dia2, horario, lab,
        'activo', cuota, uRes.insertId
      ]);

      for (const mes of MESES) {
        await conn.query(
          'INSERT INTO mensualidades (alumno_id, mes, anio, monto) VALUES (?,?,?,?)',
          [aRes.insertId, mes, anio, cuota]
        );
      }

      await conn.commit();
      insertados++;
      process.stdout.write(`\r  Insertando... ${insertados}/50`);
    } catch (err) {
      await conn.rollback();
      if (err.code === 'ER_DUP_ENTRY') {
        process.stdout.write(`\r  Alumno ${i+1} ya existe, omitiendo...`);
      } else {
        console.error(`\n  Error en alumno ${i+1}:`, err.message);
      }
    } finally {
      conn.release();
    }
  }

  console.log(`\n\n  ✅ Seed completado: ${insertados} alumnos insertados.`);
  process.exit(0);
}

seed().catch(err => { console.error(err); process.exit(1); });
