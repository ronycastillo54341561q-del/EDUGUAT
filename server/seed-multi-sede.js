/**
 * Seed de datos de prueba para las sedes m_lozano y sistec_jutiapa.
 *
 * Requisitos previos:
 *   - Haber corrido `mysql -u root -p < server/sql/init-sedes.sql`
 *     (crea las BDs y las tablas).
 *
 * Uso:
 *   node server/seed-multi-sede.js
 *
 * Inserta en cada sede:
 *   - 1 usuario admin  (admin@<sede>.gt  /  admin123)
 *   - 20 usuarios alumno + 20 alumnos
 *   - mensualidades del año actual para cada alumno
 *   - mecanografia_notas, notas_tac_anual, diplomado_notas
 *   - 40 registros de asistencia_semanal por alumno
 */

require('dotenv').config();
const mysql  = require('mysql2/promise');
const bcrypt = require('bcryptjs');

const SEDES = [
  { db: 'm_lozano',       nombre: 'M Lozano',      dominio: 'mlozano.gt' },
  { db: 'sistec_jutiapa', nombre: 'Sistec Jutiapa', dominio: 'sistecjutiapa.gt' },
];

const MESES = ['enero','febrero','marzo','abril','mayo','junio',
               'julio','agosto','septiembre','octubre','noviembre','diciembre'];

const DIPLOMADOS = ['Computación Básica','Diseño Gráfico','Redes y Comunicaciones',
                    'Programación Web','Ofimática Avanzada','Contabilidad Computarizada'];

const TAC        = ['TAC-A','TAC-B','TAC-C','TAC-D'];
const HORARIOS   = ['7:00 - 9:00','9:00 - 11:00','14:00 - 16:00','16:00 - 18:00','18:00 - 20:00'];
const LABS       = ['Lab-1','Lab-2','Lab-3','Lab-4'];
const DIAS       = ['lunes','martes','miercoles','jueves','viernes','sabado'];

// Nombres guatemaltecos realistas
const NOMBRES = [
  'Carlos','María','José','Ana','Luis','Rosa','Pedro','Carmen','Juan','Sandra',
  'Miguel','Lucía','Jorge','Elena','Roberto','Patricia','Fernando','Isabel','Ricardo','Claudia',
  'Alejandro','Gabriela','Eduardo','Verónica','Andrés','Daniela','Francisco','Mónica','Manuel','Sofía'
];

const APELLIDOS = [
  'García','López','Martínez','González','Pérez','Rodríguez','Sánchez','Ramírez',
  'Hernández','Morales','Ortiz','Gutiérrez','Chávez','Mendoza','Castillo','Vargas',
  'Reyes','Cruz','Medina','Aguilar','Vásquez','Cabrera','Fuentes','Mejía',
  'Alvarado','Herrera','Pacheco','Solís','Figueroa','De León','Monterroso','Ramos',
  'Sandoval','Juárez','Morán','Barrios','Argueta','Salguero','Cifuentes','Velásquez',
  'Marroquín','Orozco','Cuellar','Escobar','Palma','Batz','Coc','Xol','Tzul','Poou'
];

const ESTABLECIMIENTOS = [
  'Instituto Nacional Mixto','Colegio Evangélico Bethania','Centro Educativo San José',
  'Instituto Técnico Vocacional','Escuela Nacional Mixta','Colegio Privado Los Álamos',
  'Liceo Guatemala','Colegio Monte María','Instituto Normal Central','Colegio Salesiano'
];

const MATERIAS_DIP = ['Introducción','Fundamentos','Desarrollo','Práctica','Proyecto Final'];

const r  = arr => arr[Math.floor(Math.random() * arr.length)];
const rn = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

function fecha(start, end) {
  const d = new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
  return d.toISOString().split('T')[0];
}

async function seedSede(sede) {
  console.log(`\n▶ Sembrando sede: ${sede.db} (${sede.nombre})`);

  const conn = await mysql.createConnection({
    host:     process.env.DB_HOST     || 'localhost',
    user:     process.env.DB_USER     || 'root',
    password: process.env.DB_PASSWORD || '',
    database: sede.db,
    multipleStatements: false,
  });

  const [[{ total: yaHay }]] = await conn.query(
    'SELECT COUNT(*) AS total FROM alumnos'
  );
  if (yaHay > 0) {
    console.log(`  ⚠  ya hay ${yaHay} alumnos en ${sede.db} — omitiendo seed`);
    await conn.end();
    return;
  }

  const anio = new Date().getFullYear();
  const passAdmin  = await bcrypt.hash('admin123', 10);
  const passAlumno = await bcrypt.hash('alumno123', 10);

  // --- 1 admin ---------------------------------------------------------
  await conn.query(
    'INSERT INTO usuarios (nombre, email, password, rol) VALUES (?,?,?,?)',
    [`Admin ${sede.nombre}`, `admin@${sede.dominio}`, passAdmin, 'admin']
  );

  // --- 20 alumnos + usuarios -----------------------------------------
  const alumnoIds = [];
  for (let i = 0; i < 20; i++) {
    const nombre   = NOMBRES[i % NOMBRES.length];
    const apellido = APELLIDOS[i % APELLIDOS.length];
    const codigo   = `${sede.db.toUpperCase().slice(0,3)}-${String(i + 1).padStart(3, '0')}`;
    const email    = `alumno${i + 1}@${sede.dominio}`;
    const cuota    = [150, 175, 200, 225, 250][rn(0,4)];
    const dia1     = r(DIAS);
    const dia2     = Math.random() > 0.5 ? r(DIAS.filter(d => d !== dia1)) : null;

    const [uRes] = await conn.query(
      'INSERT INTO usuarios (nombre, email, password, rol) VALUES (?,?,?,?)',
      [`${nombre} ${apellido}`, email, passAlumno, 'alumno']
    );

    const [aRes] = await conn.query(`
      INSERT INTO alumnos
        (clave, nombre, apellido, fecha_inicio, fecha_nacimiento,
         encargado, telefono, diplomado, tac, direccion, establecimiento,
         observaciones, dia_clases1, dia_clases2, horario, laboratorio,
         estado, cuota_mensual, usuario_id)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `, [
      codigo, nombre, apellido,
      fecha(new Date('2024-01-01'), new Date('2025-06-30')),
      fecha(new Date('2000-01-01'), new Date('2008-12-31')),
      `${r(NOMBRES)} ${r(APELLIDOS)}`,
      `5${rn(0,9)}${rn(1000000,9999999)}`,
      r(DIPLOMADOS), r(TAC),
      `${rn(1,20)} Calle ${rn(1,12)}-${rn(1,99)}, Zona ${rn(1,19)}`,
      r(ESTABLECIMIENTOS), '',
      dia1, dia2, r(HORARIOS), r(LABS),
      'activo', cuota, uRes.insertId
    ]);

    alumnoIds.push({ id: aRes.insertId, cuota });
  }

  // --- Mensualidades del año actual (12 por alumno) ------------------
  for (const a of alumnoIds) {
    for (let k = 0; k < MESES.length; k++) {
      const pagado = k < rn(2, 9) ? 1 : 0;
      await conn.query(
        `INSERT INTO mensualidades
           (alumno_id, mes, anio, monto, pagado, anulado, monto_abonado,
            no_recibo, fecha_pago)
         VALUES (?,?,?,?,?,0,0,?,?)`,
        [
          a.id, MESES[k], anio, a.cuota, pagado,
          pagado ? `R-${sede.db.slice(0,3).toUpperCase()}-${rn(1000,9999)}` : null,
          pagado ? fecha(new Date(anio,k,1), new Date(anio,k,28)) : null,
        ]
      );
    }
  }

  // --- Mecanografia: 1 fila por alumno con ~20 lecciones y examen ----
  for (const a of alumnoIds) {
    const vals = Array.from({length:20}, () => rn(60,100));
    const examen = rn(60, 100);
    await conn.query(
      `INSERT INTO mecanografia_notas
         (alumno_id, anio, l1,l2,l3,l4,l5,l6,l7,l8,l9,l10,
          l11,l12,l13,l14,l15,l16,l17,l18,l19,l20, examen)
       VALUES (?,?,${vals.map(()=>'?').join(',')},?)`,
      [a.id, anio, ...vals, examen]
    );
  }

  // --- Notas TAC: 1 fila por alumno con 4 notas ----------------------
  for (const a of alumnoIds) {
    await conn.query(
      `INSERT INTO notas_tac_anual (alumno_id, anio, nota1, nota2, nota3, nota4)
       VALUES (?,?,?,?,?,?)`,
      [a.id, anio, rn(60,100), rn(60,100), rn(60,100), rn(60,100)]
    );
  }

  // --- Notas Diplomados: 5 materias por alumno -----------------------
  for (const a of alumnoIds) {
    for (const m of MATERIAS_DIP) {
      await conn.query(
        `INSERT INTO diplomado_notas (alumno_id, anio, materia, nota)
         VALUES (?,?,?,?)`,
        [a.id, anio, m, rn(60,100)]
      );
    }
  }

  // --- Asistencia semanal: 4 semanas x 10 meses = 40 registros -------
  const letras = ['P','P','P','P','A','T'];
  for (const a of alumnoIds) {
    for (let mes = 1; mes <= 10; mes++) {
      for (let sem = 1; sem <= 4; sem++) {
        await conn.query(
          `INSERT INTO asistencia_semanal (alumno_id, anio, mes, semana, estado)
           VALUES (?,?,?,?,?)`,
          [a.id, anio, mes, sem, r(letras)]
        );
      }
    }
  }

  // --- Configuración institucional -----------------------------------
  const cfg = [
    ['inst_nombre',    sede.nombre],
    ['inst_direccion', 'Guatemala, C.A.'],
    ['inst_telefono',  `Tel: ${rn(2000,7999)}-${rn(1000,9999)}`],
    ['inst_email',     `contacto@${sede.dominio}`],
  ];
  for (const [k,v] of cfg) {
    await conn.query('INSERT IGNORE INTO configuracion (clave, valor) VALUES (?,?)', [k,v]);
  }

  console.log(`  ✅ ${sede.db}: 1 admin + 20 alumnos sembrados`);
  await conn.end();
}

(async () => {
  try {
    for (const sede of SEDES) await seedSede(sede);
    console.log('\n✅ Seed multi-sede completado.\n');
    console.log('Credenciales admin por sede:');
    for (const s of SEDES) console.log(`   • ${s.db}: admin@${s.dominio} / admin123`);
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Error en seed:', err);
    process.exit(1);
  }
})();
