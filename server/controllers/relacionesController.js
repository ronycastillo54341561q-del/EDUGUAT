const db = require('../config/db');

// Diccionario maestro de relaciones lógicas (tabla origen → tabla destino).
// El esquema no usa FOREIGN KEY explícitos, así que estas relaciones se
// declaran aquí y luego se cruzan con information_schema.COLUMNS para
// devolver únicamente las que realmente existen en la BD activa.
const RELACIONES = [
  // Alumno ↔ usuario
  ['alumnos',                       'usuario_id',       'usuarios',              '1:1', 'Usuario de login del alumno (rol=alumno)'],
  // Datos académicos / financieros del alumno
  ['mensualidades',                 'alumno_id',        'alumnos',               'N:1', 'Mensualidades del alumno por año/mes'],
  ['asistencia_semanal',            'alumno_id',        'alumnos',               'N:1', 'Asistencia semanal (x/e/p/f/r)'],
  ['mecanografia_notas',            'alumno_id',        'alumnos',               'N:1', 'Lecciones de mecanografía por año'],
  ['notas_tac_anual',               'alumno_id',        'alumnos',               'N:1', 'Notas TAC por año/nivel'],
  ['diplomado_notas',               'alumno_id',        'alumnos',               'N:1', 'Notas de diplomado por materia/año'],
  ['recibos',                       'alumno_id',        'alumnos',               'N:1', 'Recibos de colegiatura emitidos al alumno'],
  ['papeleria',                     'alumno_id',        'alumnos',               'N:1', 'Recibos de papelería/otros pagos del alumno'],
  ['recibos_diplomados',            'alumno_id',        'alumnos',               'N:1', 'Recibos de diplomados (legacy, migrado a papeleria)'],
  ['inscritos_tac',                 'alumno_id',        'alumnos',               'N:1', 'Inscripción del alumno a un nivel TAC en un año'],
  // Bitácora / sesiones / contraseñas
  ['bitacora',                      'usuario_id',       'usuarios',              'N:1', 'Acción registrada por el usuario'],
  ['password_resets',               'usuario_id',       'usuarios',              'N:1', 'Token de recuperación de contraseña'],
  // Diplomados (jerarquía)
  ['dip_diplomado_objetivos',       'diplomado_id',     'dip_diplomados',        'N:1', 'Objetivos específicos de un diplomado'],
  ['dip_programas',                 'diplomado_id',     'dip_diplomados',        'N:1', 'Programa/materia que compone un diplomado'],
  ['dip_examenes',                  'diplomado_id',     'dip_diplomados',        'N:1', 'Exámenes definidos para un diplomado'],
  ['dip_programa_objetivos',        'programa_id',      'dip_programas',         'N:1', 'Objetivos por programa/materia'],
  ['dip_programa_contenido',        'programa_id',      'dip_programas',         'N:1', 'Contenido semanal por programa'],
  // Roles personalizados
  ['role_permisos',                 'rol_id',           'roles_custom',          'N:1', 'Permisos por módulo del rol custom'],
  ['role_horarios',                 'rol_id',           'roles_custom',          '1:1', 'Horario de acceso permitido del rol'],
  // Consultas (reportes guardados)
  ['consultas_reportes',            'owner_id',         'usuarios',              'N:1', 'Usuario creador del reporte'],
  ['consultas_reportes_compartidos','reporte_id',       'consultas_reportes',    'N:1', 'Reporte compartido (lado N:M)'],
  ['consultas_reportes_compartidos','usuario_id',       'usuarios',              'N:1', 'Usuario con quien se comparte (lado N:M)'],
  // Cierres diarios
  ['cierres_diarios',               'cuenta_id',        'cat_cuentas_bancarias', 'N:1', 'Cuenta donde se depositó el cierre'],
  ['cierres_diarios',               'creado_por_id',    'usuarios',              'N:1', 'Usuario que registró el cierre'],
  ['cierres_diarios',               'revisado_por_id',  'usuarios',              'N:1', 'Usuario que revisó/aprobó el cierre'],
  ['cierre_gastos',                 'cierre_id',        'cierres_diarios',       'N:1', 'Gastos descontados del cierre'],
  // Avisos
  ['avisos',                        'autor_id',         'usuarios',              'N:1', 'Usuario autor del aviso'],
  ['avisos',                        'filtro_alumno_id', 'alumnos',               'N:1', 'Alumno destinatario cuando scope=alumno'],
];

const getRelaciones = async (req, res) => {
  try {
    // 1. Lee tablas y columnas existentes en la BD activa.
    const [cols] = await db.query(`
      SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, IS_NULLABLE
        FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
    `);
    const [[{ db_name }]] = await db.query('SELECT DATABASE() AS db_name');

    // 2. Indexa para cruzar rápido contra el diccionario.
    const colKey = (t, c) => `${t}::${c}`;
    const colIdx = new Map();
    const tablasSet = new Set();
    for (const c of cols) {
      colIdx.set(colKey(c.TABLE_NAME, c.COLUMN_NAME), c);
      tablasSet.add(c.TABLE_NAME);
    }

    // 3. Filtra el diccionario a las relaciones cuyas columnas existen.
    const relaciones = [];
    for (const [origen, columna, destino, card, descripcion] of RELACIONES) {
      const cOri = colIdx.get(colKey(origen, columna));
      const cDes = colIdx.get(colKey(destino, 'id'));
      if (!cOri || !cDes) continue;
      relaciones.push({
        tabla_origen:    origen,
        columna_fk:      columna,
        tipo_origen:     cOri.DATA_TYPE,
        origen_nullable: cOri.IS_NULLABLE === 'YES',
        tabla_destino:   destino,
        columna_destino: 'id',
        cardinalidad:    card,
        descripcion,
      });
    }

    // 4. Resumen por tabla destino (cuántas tablas la referencian).
    const resumenMap = {};
    for (const r of relaciones) {
      if (!resumenMap[r.tabla_destino]) resumenMap[r.tabla_destino] = [];
      resumenMap[r.tabla_destino].push(r.tabla_origen);
    }
    const resumen = Object.entries(resumenMap)
      .map(([tabla, origenes]) => ({
        tabla_destino: tabla,
        num_dependientes: origenes.length,
        tablas_origen: [...new Set(origenes)].sort(),
      }))
      .sort((a, b) => b.num_dependientes - a.num_dependientes || a.tabla_destino.localeCompare(b.tabla_destino));

    // 5. Conteo de filas por tabla (best-effort, ignora errores individuales).
    const conteos = {};
    for (const t of tablasSet) {
      try {
        const [[row]] = await db.query(`SELECT COUNT(*) AS n FROM \`${t}\``);
        conteos[t] = Number(row.n);
      } catch {
        conteos[t] = null;
      }
    }

    res.json({
      base_datos: db_name,
      total_tablas: tablasSet.size,
      total_relaciones: relaciones.length,
      relaciones,
      resumen,
      conteos,
      tablas: [...tablasSet].sort(),
    });
  } catch (err) {
    console.error('getRelaciones:', err);
    res.status(500).json({ message: 'Error al obtener relaciones' });
  }
};

module.exports = { getRelaciones };
