// Bootstrap de una sede: crea su base de datos (si no existe), su esquema
// completo, un admin por defecto, sincroniza catálogos y arma las
// mensualidades del año en curso.  Re-utilizable: se llama tanto al
// arrancar el servidor (para las sedes ya conocidas) como cuando un
// super-admin crea una nueva academia desde la UI.

const mysql  = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const { ensurePool } = require('../config/db');

const MESES = ['enero','febrero','marzo','abril','mayo','junio',
               'julio','agosto','septiembre','octubre','noviembre','diciembre'];

const crearDatabaseSiNoExiste = async (id) => {
  const admin = await mysql.createConnection({
    host:     process.env.DB_HOST,
    port:     Number(process.env.DB_PORT) || 3306,
    user:     process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  });
  try {
    await admin.query(
      `CREATE DATABASE IF NOT EXISTS \`${id}\` ` +
      `DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
  } finally {
    await admin.end();
  }
};

// Migra el esquema viejo de diplomados (sin diplomado_id) a la versión 2.
const migrarSchemaDiplomadosV1 = async (pool) => {
  try {
    const [tableExists] = await pool.query(`
      SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'dip_programas'
    `);
    if (!tableExists.length) return;

    const [cols] = await pool.query('SHOW COLUMNS FROM dip_programas');
    const has = (n) => cols.some(c => c.Field === n);
    const esViejo = has('competencia_general') && !has('diplomado_id');
    if (!esViejo) return;

    await pool.query(`RENAME TABLE
      dip_programas    TO dip_programas_v1_bak,
      dip_competencias TO dip_competencias_v1_bak,
      dip_materias     TO dip_materias_v1_bak,
      dip_contenido    TO dip_contenido_v1_bak
    `);
  } catch (err) {
    console.error('migrarSchemaDiplomadosV1 (rename):', err.message);
  }
};

const traspasarDatosDiplomadosV1 = async (pool) => {
  try {
    const [bak] = await pool.query(`
      SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'dip_programas_v1_bak'
    `);
    if (!bak.length) return;

    const [oldDips] = await pool.query('SELECT * FROM dip_programas_v1_bak');
    const idMap = {};
    for (const d of oldDips) {
      const [r] = await pool.query(
        'INSERT INTO dip_diplomados (nombre, objetivo_general, activo) VALUES (?,?,?)',
        [d.nombre, d.competencia_general || '', d.activo ?? 1]
      );
      idMap[d.id] = r.insertId;
    }

    const [oldComps] = await pool.query('SELECT * FROM dip_competencias_v1_bak');
    for (const c of oldComps) {
      const did = idMap[c.programa_id];
      if (!did) continue;
      await pool.query(
        'INSERT INTO dip_diplomado_objetivos (diplomado_id, descripcion, orden) VALUES (?,?,?)',
        [did, c.descripcion, c.orden ?? 0]
      );
    }

    const [oldMats] = await pool.query('SELECT * FROM dip_materias_v1_bak ORDER BY programa_id, orden, id');
    for (const m of oldMats) {
      const did = idMap[m.programa_id];
      if (!did) continue;
      await pool.query(
        'INSERT INTO dip_programas (diplomado_id, nombre, objetivo_general, duracion_semanas, orden, activo) VALUES (?,?,?,?,?,1)',
        [did, m.nombre, '', 1, m.orden ?? 0]
      );
    }

    await pool.query('DROP TABLE IF EXISTS dip_materias_v1_bak, dip_contenido_v1_bak, dip_competencias_v1_bak, dip_programas_v1_bak');
    console.log('  migrados diplomados v1 → v2');
  } catch (err) {
    console.error('traspasarDatosDiplomadosV1:', err.message);
  }
};

const initDb = async (pool) => {
  await migrarSchemaDiplomadosV1(pool);

  const tables = [
    `CREATE TABLE IF NOT EXISTS usuarios (
       id        INT AUTO_INCREMENT PRIMARY KEY,
       nombre    VARCHAR(150) NOT NULL,
       email     VARCHAR(150) NOT NULL UNIQUE,
       password  VARCHAR(255) NOT NULL,
       rol       ENUM('admin','alumno','oficina','maestro') NOT NULL DEFAULT 'alumno',
       activo    TINYINT(1)   NOT NULL DEFAULT 1,
       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
     )`,
    `CREATE TABLE IF NOT EXISTS alumnos (
       id                INT AUTO_INCREMENT PRIMARY KEY,
       clave             VARCHAR(40) NOT NULL UNIQUE,
       codigo_estudiante VARCHAR(7) NULL UNIQUE,
       nombre            VARCHAR(100) NOT NULL,
       apellido          VARCHAR(100) NOT NULL,
       fecha_inicio      DATE NULL,
       fecha_nacimiento  DATE NULL,
       encargado         VARCHAR(150) NULL,
       telefono          VARCHAR(80)  NULL,
       diplomado         VARCHAR(120) NULL,
       tac               VARCHAR(40)  NULL,
       asesor            VARCHAR(150) NULL,
       direccion         VARCHAR(255) NULL,
       establecimiento   VARCHAR(200) NULL,
       observaciones     TEXT NULL,
       dia_clases1       VARCHAR(20) NULL,
       dia_clases2       VARCHAR(20) NULL,
       horario           VARCHAR(40) NULL,
       laboratorio       VARCHAR(40) NULL,
       grado             VARCHAR(80)  NULL,
       seccion           VARCHAR(80)  NULL,
       maestro_guia      VARCHAR(150) NULL,
       plan_clases       VARCHAR(80)  NULL,
       dias_clase        VARCHAR(160) NULL,
       estado            ENUM('activo','inactivo','retirado') NOT NULL DEFAULT 'activo',
       cuota_mensual     DECIMAL(10,2) NOT NULL DEFAULT 0,
       usuario_id        INT NULL,
       created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
       CONSTRAINT chk_codigo_estudiante CHECK (codigo_estudiante IS NULL OR codigo_estudiante REGEXP '^[A-Z][0-9]{3}[A-Z]{3}$')
     )`,
    `CREATE TABLE IF NOT EXISTS mensualidades (
       id             INT AUTO_INCREMENT PRIMARY KEY,
       alumno_id      INT NOT NULL,
       mes            VARCHAR(15) NOT NULL,
       anio           SMALLINT NOT NULL,
       monto          DECIMAL(10,2) NOT NULL DEFAULT 0,
       pagado         TINYINT(1) NOT NULL DEFAULT 0,
       anulado        TINYINT(1) NOT NULL DEFAULT 0,
       descuento_100  TINYINT(1) NOT NULL DEFAULT 0,
       no_recibo      VARCHAR(80) NULL,
       fecha_pago     DATE NULL,
       monto_abonado  DECIMAL(10,2) NOT NULL DEFAULT 0,
       UNIQUE KEY uk_mens (alumno_id, mes, anio)
     )`,
    `CREATE TABLE IF NOT EXISTS asistencia_semanal (
       id INT AUTO_INCREMENT PRIMARY KEY,
       alumno_id INT NOT NULL, anio SMALLINT NOT NULL,
       mes TINYINT NOT NULL, semana TINYINT NOT NULL, estado CHAR(1) NULL,
       UNIQUE KEY uk_asist_sem (alumno_id, anio, mes, semana)
     )`,
    // Asistencia DIARIA (instituciones): un registro por (alumno, fecha).
    // Códigos de estado iguales a la semanal: x asistió · e enfermo · p permiso
    // · f falta · r recuperó. Independiente de asistencia_semanal (academias).
    `CREATE TABLE IF NOT EXISTS asistencia_diaria (
       id INT AUTO_INCREMENT PRIMARY KEY,
       alumno_id INT NOT NULL,
       fecha DATE NOT NULL,
       estado CHAR(1) NOT NULL,
       observacion VARCHAR(255) NULL,
       UNIQUE KEY uk_asist_dia (alumno_id, fecha),
       INDEX idx_asist_dia_fecha (fecha)
     )`,
    `CREATE TABLE IF NOT EXISTS mecanografia_notas (
       id INT AUTO_INCREMENT PRIMARY KEY,
       alumno_id INT NOT NULL, anio SMALLINT NOT NULL,
       l1 SMALLINT NULL, l2 SMALLINT NULL, l3 SMALLINT NULL,
       l4 SMALLINT NULL, l5 SMALLINT NULL, l6 SMALLINT NULL,
       l7 SMALLINT NULL, l8 SMALLINT NULL, l9 SMALLINT NULL,
       l10 SMALLINT NULL, l11 SMALLINT NULL, l12 SMALLINT NULL,
       l13 SMALLINT NULL, l14 SMALLINT NULL, l15 SMALLINT NULL,
       l16 SMALLINT NULL, l17 SMALLINT NULL, l18 SMALLINT NULL,
       l19 SMALLINT NULL, l20 SMALLINT NULL, examen SMALLINT NULL,
       UNIQUE KEY uk_mec_n (alumno_id, anio)
     )`,
    `CREATE TABLE IF NOT EXISTS notas_tac_anual (
       id INT AUTO_INCREMENT PRIMARY KEY,
       alumno_id INT NOT NULL, anio SMALLINT NOT NULL,
       nota1 SMALLINT NULL, nota2 SMALLINT NULL,
       nota3 SMALLINT NULL, nota4 SMALLINT NULL,
       UNIQUE KEY uk_tac_a (alumno_id, anio)
     )`,
    `CREATE TABLE IF NOT EXISTS diplomado_notas (
       id INT AUTO_INCREMENT PRIMARY KEY,
       alumno_id INT NOT NULL, anio SMALLINT NOT NULL,
       materia VARCHAR(60) NOT NULL, nota SMALLINT NULL,
       UNIQUE KEY uk_dip_n (alumno_id, anio, materia)
     )`,
    `CREATE TABLE IF NOT EXISTS recibos (
       id INT AUTO_INCREMENT PRIMARY KEY,
       no_recibo VARCHAR(80),
       alumno_id INT,
       meses VARCHAR(250),
       fecha DATE,
       total DECIMAL(10,2),
       observaciones TEXT,
       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
     )`,
    `CREATE TABLE IF NOT EXISTS papeleria (
       id INT AUTO_INCREMENT PRIMARY KEY,
       no_recibo VARCHAR(80),
       alumno_id INT,
       descripcion VARCHAR(500),
       fecha DATE,
       total DECIMAL(10,2),
       observaciones TEXT,
       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
     )`,
    `CREATE TABLE IF NOT EXISTS recibos_diplomados (
       id INT AUTO_INCREMENT PRIMARY KEY,
       no_recibo VARCHAR(80),
       alumno_id INT,
       diplomado VARCHAR(150),
       descripcion VARCHAR(500),
       fecha DATE,
       total DECIMAL(10,2),
       observaciones TEXT,
       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
     )`,
    `CREATE TABLE IF NOT EXISTS bitacora (
       id INT AUTO_INCREMENT PRIMARY KEY,
       usuario_id INT NULL,
       usuario_nombre VARCHAR(150) NOT NULL DEFAULT 'Sistema',
       accion VARCHAR(50) NOT NULL,
       modulo VARCHAR(80) NOT NULL,
       descripcion TEXT NULL,
       ip VARCHAR(60) NULL,
       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
     )`,
    `CREATE TABLE IF NOT EXISTS configuracion (
       id INT AUTO_INCREMENT PRIMARY KEY,
       clave VARCHAR(80) NOT NULL UNIQUE,
       valor LONGTEXT,
       updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
     )`,
    `CREATE TABLE IF NOT EXISTS dip_diplomados (
       id INT AUTO_INCREMENT PRIMARY KEY,
       nombre VARCHAR(150) NOT NULL,
       objetivo_general TEXT,
       activo TINYINT(1) NOT NULL DEFAULT 1,
       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
     )`,
    `CREATE TABLE IF NOT EXISTS dip_diplomado_objetivos (
       id INT AUTO_INCREMENT PRIMARY KEY,
       diplomado_id INT NOT NULL,
       descripcion TEXT NOT NULL,
       orden SMALLINT NOT NULL DEFAULT 0,
       INDEX idx_dip_obj (diplomado_id, orden)
     )`,
    `CREATE TABLE IF NOT EXISTS dip_programas (
       id INT AUTO_INCREMENT PRIMARY KEY,
       diplomado_id INT NOT NULL,
       nombre VARCHAR(150) NOT NULL,
       objetivo_general TEXT,
       duracion_semanas TINYINT NOT NULL DEFAULT 1,
       orden SMALLINT NOT NULL DEFAULT 0,
       activo TINYINT(1) NOT NULL DEFAULT 1,
       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
       INDEX idx_prog_dip (diplomado_id, orden)
     )`,
    `CREATE TABLE IF NOT EXISTS dip_programa_objetivos (
       id INT AUTO_INCREMENT PRIMARY KEY,
       programa_id INT NOT NULL,
       descripcion TEXT NOT NULL,
       orden SMALLINT NOT NULL DEFAULT 0,
       INDEX idx_prog_obj (programa_id, orden)
     )`,
    `CREATE TABLE IF NOT EXISTS dip_programa_contenido (
       id INT AUTO_INCREMENT PRIMARY KEY,
       programa_id INT NOT NULL,
       semana_num TINYINT NOT NULL,
       contenido TEXT,
       UNIQUE KEY uk_dip_prog_cont (programa_id, semana_num)
     )`,
    `CREATE TABLE IF NOT EXISTS dip_examenes (
       id INT AUTO_INCREMENT PRIMARY KEY,
       diplomado_id INT NOT NULL,
       nombre VARCHAR(120) NOT NULL,
       orden SMALLINT NOT NULL DEFAULT 0,
       activo TINYINT(1) NOT NULL DEFAULT 1,
       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
       INDEX idx_dip_exam (diplomado_id, orden)
     )`,
    `CREATE TABLE IF NOT EXISTS cat_horarios (
       id INT AUTO_INCREMENT PRIMARY KEY,
       dia1 VARCHAR(20) NOT NULL,
       dia2 VARCHAR(20) NULL,
       hora_inicio VARCHAR(10) NOT NULL,
       hora_fin VARCHAR(10) NOT NULL,
       activo TINYINT(1) NOT NULL DEFAULT 1,
       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
     )`,
    `CREATE TABLE IF NOT EXISTS cat_laboratorios (
       id INT AUTO_INCREMENT PRIMARY KEY,
       nombre VARCHAR(40) NOT NULL UNIQUE,
       activo TINYINT(1) NOT NULL DEFAULT 1,
       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
     )`,
    `CREATE TABLE IF NOT EXISTS cat_establecimientos (
       id INT AUTO_INCREMENT PRIMARY KEY,
       nombre VARCHAR(200) NOT NULL UNIQUE,
       activo TINYINT(1) NOT NULL DEFAULT 1,
       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
     )`,
    `CREATE TABLE IF NOT EXISTS cat_cuotas (
       id INT AUTO_INCREMENT PRIMARY KEY,
       monto DECIMAL(10,2) NOT NULL,
       descripcion VARCHAR(120) NULL,
       activo TINYINT(1) NOT NULL DEFAULT 1,
       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
     )`,
    // ── Catálogos exclusivos del tipo de inquilino 'institucion' ──────────
    // Plan de días de clase: un bloque con nombre (ej. "Plan diario") y la
    // lista de días que cubre (CSV: "lunes,martes,..."). El alumno elige un
    // plan; los días se copian (snapshot) a `alumnos.dias_clase` al inscribir.
    `CREATE TABLE IF NOT EXISTS cat_planes_clase (
       id INT AUTO_INCREMENT PRIMARY KEY,
       nombre VARCHAR(80) NOT NULL UNIQUE,
       dias VARCHAR(160) NOT NULL DEFAULT '',
       activo TINYINT(1) NOT NULL DEFAULT 1,
       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
     )`,
    `CREATE TABLE IF NOT EXISTS cat_grados (
       id INT AUTO_INCREMENT PRIMARY KEY,
       nombre VARCHAR(80) NOT NULL UNIQUE,
       activo TINYINT(1) NOT NULL DEFAULT 1,
       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
     )`,
    `CREATE TABLE IF NOT EXISTS cat_secciones (
       id INT AUTO_INCREMENT PRIMARY KEY,
       nombre VARCHAR(80) NOT NULL UNIQUE,
       activo TINYINT(1) NOT NULL DEFAULT 1,
       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
     )`,
    // Cursos por grado (instituciones): cada grado tiene sus cursos, con
    // maestro, días (CSV) y horario. Se ligan al grado por NOMBRE para que
    // coincida con el snapshot `alumnos.grado`.
    `CREATE TABLE IF NOT EXISTS cat_cursos (
       id INT AUTO_INCREMENT PRIMARY KEY,
       grado VARCHAR(80) NOT NULL,
       nombre VARCHAR(120) NOT NULL,
       maestro VARCHAR(150) NULL,
       dias VARCHAR(160) NOT NULL DEFAULT '',
       hora_inicio VARCHAR(10) NULL,
       hora_fin VARCHAR(10) NULL,
       activo TINYINT(1) NOT NULL DEFAULT 1,
       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
       INDEX idx_cursos_grado (grado)
     )`,
    // ── Nóminas (módulo exclusivo de instituciones privadas) ─────────────
    // Colaboradores/empleados a quienes la institución paga salario.
    `CREATE TABLE IF NOT EXISTS colaboradores (
       id INT AUTO_INCREMENT PRIMARY KEY,
       nombre VARCHAR(150) NOT NULL,
       apellido VARCHAR(150) NOT NULL,
       dpi VARCHAR(25) NULL,
       nit VARCHAR(25) NULL,
       puesto VARCHAR(120) NULL,
       telefono VARCHAR(80) NULL,
       email VARCHAR(150) NULL,
       fecha_ingreso DATE NULL,
       salario_base DECIMAL(10,2) NOT NULL DEFAULT 0,
       banco VARCHAR(80) NULL,
       cuenta VARCHAR(80) NULL,
       estado ENUM('activo','inactivo') NOT NULL DEFAULT 'activo',
       observaciones TEXT NULL,
       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
     )`,
    // Cada corrida de nómina (un período). periodo_tipo: mensual | quincenal.
    `CREATE TABLE IF NOT EXISTS nominas (
       id INT AUTO_INCREMENT PRIMARY KEY,
       nombre VARCHAR(150) NOT NULL,
       periodo_tipo ENUM('mensual','quincenal') NOT NULL DEFAULT 'mensual',
       anio SMALLINT NOT NULL,
       mes TINYINT NOT NULL,
       quincena TINYINT NULL,
       fecha_pago DATE NULL,
       estado ENUM('borrador','pagada') NOT NULL DEFAULT 'borrador',
       observaciones TEXT NULL,
       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
       INDEX idx_nominas_periodo (anio, mes)
     )`,
    // Renglón por colaborador dentro de una nómina. percepciones/deducciones
    // se guardan como JSON (TEXT): [{ concepto, monto }]. Se guarda snapshot
    // del nombre/puesto por si el colaborador se elimina luego.
    `CREATE TABLE IF NOT EXISTS nomina_renglones (
       id INT AUTO_INCREMENT PRIMARY KEY,
       nomina_id INT NOT NULL,
       colaborador_id INT NULL,
       nombre VARCHAR(300) NOT NULL,
       puesto VARCHAR(120) NULL,
       percepciones LONGTEXT NULL,
       deducciones LONGTEXT NULL,
       total_percepciones DECIMAL(10,2) NOT NULL DEFAULT 0,
       total_deducciones DECIMAL(10,2) NOT NULL DEFAULT 0,
       liquido DECIMAL(10,2) NOT NULL DEFAULT 0,
       pagado TINYINT(1) NOT NULL DEFAULT 0,
       metodo_pago VARCHAR(80) NULL,
       fecha_pago DATE NULL,
       observacion VARCHAR(255) NULL,
       INDEX idx_renglon_nomina (nomina_id)
     )`,
    // ── Horarios de clase (módulo institución) ───────────────────────────
    // Franjas horarias globales (el "timbre" de la institución): se definen
    // una vez y todas las parrillas por grado/sección las comparten como filas.
    `CREATE TABLE IF NOT EXISTS horario_franjas (
       id INT AUTO_INCREMENT PRIMARY KEY,
       hora_inicio VARCHAR(10) NOT NULL,
       hora_fin VARCHAR(10) NOT NULL,
       etiqueta VARCHAR(60) NULL,
       orden SMALLINT NOT NULL DEFAULT 0,
       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
     )`,
    // Cada celda de la parrilla: (grado, sección, día, franja) → curso + maestro.
    // hora_inicio/hora_fin se guardan (snapshot) para imprimir y detectar choques.
    `CREATE TABLE IF NOT EXISTS horario_clases (
       id INT AUTO_INCREMENT PRIMARY KEY,
       grado VARCHAR(80) NOT NULL,
       seccion VARCHAR(80) NOT NULL DEFAULT '',
       dia VARCHAR(20) NOT NULL,
       hora_inicio VARCHAR(10) NOT NULL,
       hora_fin VARCHAR(10) NOT NULL,
       curso VARCHAR(120) NULL,
       maestro VARCHAR(150) NULL,
       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
       UNIQUE KEY uk_horario_celda (grado, seccion, dia, hora_inicio),
       INDEX idx_horario_maestro (dia, hora_inicio)
     )`,
    `CREATE TABLE IF NOT EXISTS mis_tablas (
       id INT AUTO_INCREMENT PRIMARY KEY,
       nombre VARCHAR(150) NOT NULL,
       descripcion TEXT NULL,
       encabezado TEXT NULL,
       columnas LONGTEXT NOT NULL,
       filas LONGTEXT NOT NULL,
       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
       updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
     )`,
    // Reportes guardados del módulo Consultas.  Cada reporte queda atado
    // a su usuario creador (owner_id); el creador define con qué otros
    // usuarios de la sede se comparte vía consultas_reportes_compartidos.
    // Los usuarios con quien se comparte pueden ver/editar seguimiento,
    // pero sólo el creador puede borrar o cambiar la lista de compartidos.
    `CREATE TABLE IF NOT EXISTS consultas_reportes (
       id INT AUTO_INCREMENT PRIMARY KEY,
       owner_id INT NOT NULL,
       nombre VARCHAR(200) NOT NULL,
       filtros LONGTEXT NOT NULL,
       seguimiento LONGTEXT NULL,
       descripcion VARCHAR(255) NULL,
       count_alumnos INT NOT NULL DEFAULT 0,
       fecha VARCHAR(20) NULL,
       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
       updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
       INDEX idx_consrep_owner (owner_id)
     )`,
    `CREATE TABLE IF NOT EXISTS consultas_reportes_compartidos (
       reporte_id INT NOT NULL,
       usuario_id INT NOT NULL,
       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
       PRIMARY KEY (reporte_id, usuario_id),
       INDEX idx_consrep_comp_user (usuario_id)
     )`,
    `CREATE TABLE IF NOT EXISTS cat_cuentas_bancarias (
       id INT AUTO_INCREMENT PRIMARY KEY,
       numero_cuenta VARCHAR(60) NOT NULL,
       nombre VARCHAR(150) NOT NULL,
       tipo_cuenta VARCHAR(80) NOT NULL,
       activo TINYINT(1) NOT NULL DEFAULT 1,
       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
     )`,
    `CREATE TABLE IF NOT EXISTS cierres_diarios (
       id INT AUTO_INCREMENT PRIMARY KEY,
       modulo ENUM('recibos','papeleria') NOT NULL,
       fecha DATE NOT NULL,
       total_dia DECIMAL(10,2) NOT NULL DEFAULT 0,
       total_gastos DECIMAL(10,2) NOT NULL DEFAULT 0,
       total_depositar DECIMAL(10,2) NOT NULL DEFAULT 0,
       cuenta_id INT NULL,
       cuenta_snapshot VARCHAR(255) NULL,
       ultimo_recibo VARCHAR(80) NULL,
       observaciones TEXT NULL,
       estado ENUM('pendiente','revisado') NOT NULL DEFAULT 'pendiente',
       creado_por_id INT NULL,
       creado_por_nombre VARCHAR(150) NULL,
       revisado_por_id INT NULL,
       revisado_por_nombre VARCHAR(150) NULL,
       revisado_at TIMESTAMP NULL,
       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
       updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
       UNIQUE KEY uk_cierre (modulo, fecha)
     )`,
    `CREATE TABLE IF NOT EXISTS cierre_gastos (
       id INT AUTO_INCREMENT PRIMARY KEY,
       cierre_id INT NOT NULL,
       descripcion VARCHAR(255) NOT NULL,
       monto DECIMAL(10,2) NOT NULL DEFAULT 0,
       INDEX idx_cierre_gastos (cierre_id)
     )`,
    `CREATE TABLE IF NOT EXISTS avisos (
       id INT AUTO_INCREMENT PRIMARY KEY,
       autor_id INT NULL,
       autor_nombre VARCHAR(150) NOT NULL,
       autor_rol VARCHAR(20) NOT NULL,
       titulo VARCHAR(150) NOT NULL,
       mensaje TEXT NOT NULL,
       scope ENUM('global','horario','laboratorio','diplomado','dia','alumno') NOT NULL DEFAULT 'global',
       filtro_dia VARCHAR(20) NULL,
       filtro_horario VARCHAR(40) NULL,
       filtro_laboratorio VARCHAR(40) NULL,
       filtro_diplomado VARCHAR(120) NULL,
       filtro_alumno_id INT NULL,
       expira_at DATE NULL,
       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
       INDEX idx_avisos_scope (scope),
       INDEX idx_avisos_expira (expira_at)
     )`,
    `CREATE TABLE IF NOT EXISTS password_resets (
       id          INT AUTO_INCREMENT PRIMARY KEY,
       usuario_id  INT NOT NULL,
       token       VARCHAR(120) NOT NULL UNIQUE,
       expira_at   DATETIME NOT NULL,
       usado       TINYINT(1) NOT NULL DEFAULT 0,
       created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
       INDEX idx_pwres_user (usuario_id)
     )`,
    `CREATE TABLE IF NOT EXISTS inscritos_tac (
       id INT AUTO_INCREMENT PRIMARY KEY,
       alumno_id INT NOT NULL,
       anio SMALLINT NOT NULL,
       tac TINYINT NOT NULL,
       estado ENUM('inscrito','no_inscrito','pendiente') NOT NULL DEFAULT 'no_inscrito',
       fecha_actualizacion DATETIME NULL,
       observaciones TEXT NULL,
       UNIQUE KEY uk_inscritos_tac (alumno_id, anio, tac),
       INDEX idx_inscritos_anio_tac (anio, tac)
     )`,
    `CREATE TABLE IF NOT EXISTS instituciones (
       id          INT AUTO_INCREMENT PRIMARY KEY,
       nombre      VARCHAR(200) NOT NULL,
       tipo        VARCHAR(120) NULL,
       resolucion  VARCHAR(200) NULL,
       fecha       DATE NULL,
       ubicacion   VARCHAR(200) NULL,
       extras      LONGTEXT NULL,
       activo      TINYINT(1) NOT NULL DEFAULT 1,
       created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
       updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
     )`,
    `CREATE TABLE IF NOT EXISTS roles_custom (
       id          INT AUTO_INCREMENT PRIMARY KEY,
       slug        VARCHAR(40) NOT NULL UNIQUE,
       nombre      VARCHAR(100) NOT NULL,
       descripcion TEXT NULL,
       base_rol    ENUM('admin','oficina','maestro') NOT NULL DEFAULT 'oficina',
       activo      TINYINT(1) NOT NULL DEFAULT 1,
       created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
       updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
     )`,
    `CREATE TABLE IF NOT EXISTS role_permisos (
       id         INT AUTO_INCREMENT PRIMARY KEY,
       rol_id     INT NOT NULL,
       modulo     VARCHAR(40) NOT NULL,
       can_view   TINYINT(1) NOT NULL DEFAULT 0,
       can_edit   TINYINT(1) NOT NULL DEFAULT 0,
       can_export TINYINT(1) NOT NULL DEFAULT 0,
       UNIQUE KEY uk_rol_mod (rol_id, modulo),
       INDEX idx_rol_perm (rol_id)
     )`,
    `CREATE TABLE IF NOT EXISTS role_horarios (
       id          INT AUTO_INCREMENT PRIMARY KEY,
       rol_id      INT NOT NULL UNIQUE,
       dias        VARCHAR(40) NOT NULL DEFAULT '1,2,3,4,5',
       hora_inicio VARCHAR(8) NOT NULL DEFAULT '08:00',
       hora_fin    VARCHAR(8) NOT NULL DEFAULT '18:00',
       activo      TINYINT(1) NOT NULL DEFAULT 1
     )`,
    // Overrides de permisos para roles base (admin/oficina/maestro).  Una
    // fila por (rol_slug, modulo) reemplaza los defaults hardcodeados en
    // client/src/lib/permissions.js.  Si no hay fila para un (rol, modulo)
    // se aplica el default del frontend.
    `CREATE TABLE IF NOT EXISTS role_permisos_base (
       id         INT AUTO_INCREMENT PRIMARY KEY,
       rol_slug   VARCHAR(20) NOT NULL,
       modulo     VARCHAR(40) NOT NULL,
       can_view   TINYINT(1) NOT NULL DEFAULT 0,
       can_edit   TINYINT(1) NOT NULL DEFAULT 0,
       can_export TINYINT(1) NOT NULL DEFAULT 0,
       UNIQUE KEY uk_rolbase_mod (rol_slug, modulo),
       INDEX idx_rolbase_slug (rol_slug)
     )`,
    `CREATE TABLE IF NOT EXISTS constancia_plantillas (
       id              INT AUTO_INCREMENT PRIMARY KEY,
       nombre          VARCHAR(150) NOT NULL,
       ubicacion       VARCHAR(150) NOT NULL DEFAULT 'Guatemala',
       saludo          VARCHAR(255) NOT NULL DEFAULT 'Estimado(a) Director(a):',
       cuerpo          LONGTEXT NOT NULL,
       despedida       VARCHAR(120) NOT NULL DEFAULT 'Atentamente,',
       firma_nombre    VARCHAR(150) NOT NULL DEFAULT 'Secretaría',
       firma_cargo     VARCHAR(150) NULL,
       mostrar_fecha   TINYINT(1) NOT NULL DEFAULT 1,
       mostrar_firma   TINYINT(1) NOT NULL DEFAULT 1,
       mostrar_telefono TINYINT(1) NOT NULL DEFAULT 1,
       espacio_post_encabezado TINYINT NOT NULL DEFAULT 3,
       espacio_post_fecha      TINYINT NOT NULL DEFAULT 2,
       espacio_post_saludo     TINYINT NOT NULL DEFAULT 1,
       espacio_post_cuerpo     TINYINT NOT NULL DEFAULT 2,
       espacio_post_despedida  TINYINT NOT NULL DEFAULT 3,
       activa          TINYINT(1) NOT NULL DEFAULT 1,
       created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
       updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
     )`,
  ];

  for (const sql of tables) {
    try { await pool.query(sql); }
    catch (err) { console.error('initDb table error:', err.message); }
  }

  const migraciones = [
    `ALTER TABLE mensualidades ADD COLUMN monto_abonado DECIMAL(10,2) NOT NULL DEFAULT 0`,
    `ALTER TABLE mensualidades ADD COLUMN fecha_pago DATE NULL`,
    `ALTER TABLE mensualidades ADD UNIQUE KEY uk_mens (alumno_id, mes, anio)`,
    `ALTER TABLE recibos ADD COLUMN descuento DECIMAL(10,2) NOT NULL DEFAULT 0`,
    `ALTER TABLE usuarios MODIFY COLUMN rol ENUM('admin','alumno','oficina','maestro') NOT NULL DEFAULT 'alumno'`,
    `ALTER TABLE usuarios CHANGE COLUMN creado_en created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP`,
    `ALTER TABLE notas_tac_anual
       MODIFY COLUMN nota1 SMALLINT NULL, MODIFY COLUMN nota2 SMALLINT NULL,
       MODIFY COLUMN nota3 SMALLINT NULL, MODIFY COLUMN nota4 SMALLINT NULL`,
    `ALTER TABLE diplomado_notas MODIFY COLUMN nota SMALLINT NULL`,
    `ALTER TABLE mecanografia_notas
       MODIFY COLUMN l1 SMALLINT NULL,  MODIFY COLUMN l2 SMALLINT NULL,
       MODIFY COLUMN l3 SMALLINT NULL,  MODIFY COLUMN l4 SMALLINT NULL,
       MODIFY COLUMN l5 SMALLINT NULL,  MODIFY COLUMN l6 SMALLINT NULL,
       MODIFY COLUMN l7 SMALLINT NULL,  MODIFY COLUMN l8 SMALLINT NULL,
       MODIFY COLUMN l9 SMALLINT NULL,  MODIFY COLUMN l10 SMALLINT NULL,
       MODIFY COLUMN l11 SMALLINT NULL, MODIFY COLUMN l12 SMALLINT NULL,
       MODIFY COLUMN l13 SMALLINT NULL, MODIFY COLUMN l14 SMALLINT NULL,
       MODIFY COLUMN l15 SMALLINT NULL, MODIFY COLUMN l16 SMALLINT NULL,
       MODIFY COLUMN l17 SMALLINT NULL, MODIFY COLUMN l18 SMALLINT NULL,
       MODIFY COLUMN l19 SMALLINT NULL, MODIFY COLUMN l20 SMALLINT NULL,
       MODIFY COLUMN examen SMALLINT NULL`,
    `ALTER TABLE alumnos ADD COLUMN asesor VARCHAR(150) NULL AFTER tac`,
    // Campos exclusivos de inquilinos tipo 'institucion' (primarias/básicas).
    // Son nullable y las academias nunca los llenan, así que no afectan su flujo.
    `ALTER TABLE alumnos ADD COLUMN grado        VARCHAR(80)  NULL AFTER laboratorio`,
    `ALTER TABLE alumnos ADD COLUMN seccion      VARCHAR(80)  NULL AFTER grado`,
    `ALTER TABLE alumnos ADD COLUMN maestro_guia VARCHAR(150) NULL AFTER seccion`,
    `ALTER TABLE alumnos ADD COLUMN plan_clases  VARCHAR(80)  NULL AFTER maestro_guia`,
    `ALTER TABLE alumnos ADD COLUMN dias_clase   VARCHAR(160) NULL AFTER plan_clases`,
    `ALTER TABLE constancia_plantillas ADD COLUMN espacio_post_encabezado TINYINT NOT NULL DEFAULT 3`,
    `ALTER TABLE constancia_plantillas ADD COLUMN espacio_post_fecha      TINYINT NOT NULL DEFAULT 2`,
    `ALTER TABLE constancia_plantillas ADD COLUMN espacio_post_saludo     TINYINT NOT NULL DEFAULT 1`,
    `ALTER TABLE constancia_plantillas ADD COLUMN espacio_post_cuerpo     TINYINT NOT NULL DEFAULT 2`,
    `ALTER TABLE constancia_plantillas ADD COLUMN espacio_post_despedida  TINYINT NOT NULL DEFAULT 3`,
    // Notas TAC: a partir de ahora cada (alumno, año) puede tener notas en
    // varios TAC.  Añade la columna `tac` y reemplaza el UNIQUE por uno nuevo
    // que la incluya.  Backfill inicial = el TAC actual del alumno.
    `ALTER TABLE notas_tac_anual ADD COLUMN tac VARCHAR(40) NULL`,
    `UPDATE notas_tac_anual nta JOIN alumnos a ON a.id = nta.alumno_id
        SET nta.tac = COALESCE(NULLIF(a.tac,''), '01')
      WHERE nta.tac IS NULL OR nta.tac = ''`,
    `ALTER TABLE notas_tac_anual DROP INDEX uk_tac_a`,
    `ALTER TABLE notas_tac_anual ADD UNIQUE KEY uk_tac_a (alumno_id, anio, tac)`,

    // Migración recibos diplomados:
    //
    // Importaciones anteriores guardaban en `recibos_diplomados` (tabla
    // huérfana sin UI).  La fuente de verdad para "Recibos" en el front
    // es `papeleria` (la que muestra columna Descripción).  Copiamos las
    // filas que aún no estén en `papeleria` (match por no_recibo + alumno_id).
    `INSERT INTO papeleria (no_recibo, alumno_id, descripcion, fecha, total, observaciones, created_at)
     SELECT rd.no_recibo, rd.alumno_id,
            TRIM(BOTH ' · ' FROM CONCAT_WS(' · ',
              NULLIF(rd.diplomado,''),
              NULLIF(rd.descripcion,''))) AS descripcion,
            rd.fecha, rd.total, rd.observaciones, rd.created_at
       FROM recibos_diplomados rd
      WHERE NOT EXISTS (
        SELECT 1 FROM papeleria p
         WHERE p.no_recibo = rd.no_recibo
           AND p.alumno_id = rd.alumno_id
      )`,

    // Limpieza: una versión intermedia del importador insertó duplicados
    // en `recibos` con el formato "<diplomado> · <descripción>" en `meses`.
    // Los identificamos porque comparten (no_recibo, alumno_id) con una
    // fila de `recibos_diplomados` y los eliminamos para que no aparezcan
    // duplicados en el módulo "Recibos colegiatura".
    `DELETE r FROM recibos r
       JOIN recibos_diplomados rd
         ON rd.no_recibo = r.no_recibo
        AND rd.alumno_id = r.alumno_id`,

    // La importación de pagos / papelería ahora inserta el campo `alumno`
    // como texto libre (sin lookup contra la tabla `alumnos`).  Añadimos
    // columna dedicada en ambas tablas para no perder el nombre cuando
    // alumno_id queda NULL.
    `ALTER TABLE recibos   ADD COLUMN alumno_texto VARCHAR(150) NULL`,
    `ALTER TABLE papeleria ADD COLUMN alumno_texto VARCHAR(150) NULL`,

    // Anulación de recibos: bandera + fecha del usuario que anuló.
    `ALTER TABLE recibos   ADD COLUMN anulado TINYINT(1) NOT NULL DEFAULT 0`,
    `ALTER TABLE papeleria ADD COLUMN anulado TINYINT(1) NOT NULL DEFAULT 0`,
    `ALTER TABLE recibos   ADD COLUMN anulado_at TIMESTAMP NULL`,
    `ALTER TABLE papeleria ADD COLUMN anulado_at TIMESTAMP NULL`,

    // Número de depósito bancario asociado al recibo (campo manual,
    // se llena de vez en cuando — opcional).
    `ALTER TABLE recibos   ADD COLUMN no_deposito VARCHAR(80) NULL`,
    `ALTER TABLE papeleria ADD COLUMN no_deposito VARCHAR(80) NULL`,

    // ── Configuración de pagos por año ──────────────────────────────────
    // Cada fila es una "regla": define a qué grupo de alumnos aplica y qué
    // meses del año se le cobran (con qué multiplicador de cuota).
    // scope_tipo: global | diplomado | horario | laboratorio | dia | alumno
    // scope_valor: el valor del atributo (nombre del diplomado, alumno_id, etc).
    `CREATE TABLE IF NOT EXISTS config_pagos (
       id INT AUTO_INCREMENT PRIMARY KEY,
       anio INT NOT NULL,
       scope_tipo ENUM('global','diplomado','horario','laboratorio','dia','alumno') NOT NULL DEFAULT 'global',
       scope_valor VARCHAR(150) NULL,
       mes_inicio TINYINT NOT NULL,
       mes_fin    TINYINT NOT NULL,
       multiplicador DECIMAL(4,2) NOT NULL DEFAULT 1.00,
       descripcion VARCHAR(200) NULL,
       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
       INDEX idx_cfg_anio (anio),
       INDEX idx_cfg_scope (scope_tipo, scope_valor)
     )`,

    // Mes acreditado (gratis/beca). Cuando acreditado=1 el mes no se cobra
    // ni se distribuye en NuevoPago — se considera saldado con el mensaje.
    `ALTER TABLE mensualidades ADD COLUMN acreditado TINYINT(1) NOT NULL DEFAULT 0`,
    `ALTER TABLE mensualidades ADD COLUMN acreditado_msg VARCHAR(80) NULL`,

    // Roles personalizados: usuarios.rol pasa a VARCHAR para aceptar tanto
    // los roles base ('admin','alumno','oficina','maestro') como los slugs
    // de roles_custom creados desde la UI.
    `ALTER TABLE usuarios MODIFY COLUMN rol VARCHAR(40) NOT NULL DEFAULT 'alumno'`,

    // Si la tabla roles_custom existía sin base_rol (versión anterior), la
    // migramos. base_rol define qué rol "padre" hereda el rol custom para
    // efectos de permisos a nivel de ruta en el backend.
    `ALTER TABLE roles_custom ADD COLUMN base_rol ENUM('admin','oficina','maestro') NOT NULL DEFAULT 'oficina' AFTER descripcion`,

    // Sesión activa única + timeout por inactividad.
    //   session_jti    → id del último JWT emitido para el usuario.
    //                    Cualquier token con jti distinto se considera revocado.
    //   last_activity  → marca cada request autenticado; si pasa el umbral de
    //                    inactividad (10 min) la sesión se cierra del lado server.
    `ALTER TABLE usuarios ADD COLUMN session_jti VARCHAR(64) NULL`,
    `ALTER TABLE usuarios ADD COLUMN last_activity DATETIME NULL`,

    // Mis Tablas: soft-delete con auto-eliminación a los 7 días.
    //   activo=1 → tabla visible para todos los usuarios con permiso al módulo.
    //   activo=0 + desactivado_at → en papelera; el listado calcula días
    //                               restantes y purga cuando llega a 0.
    `ALTER TABLE mis_tablas ADD COLUMN activo TINYINT(1) NOT NULL DEFAULT 1`,
    `ALTER TABLE mis_tablas ADD COLUMN desactivado_at DATETIME NULL`,

    // Configuración: el `valor` original era TEXT (~64KB), insuficiente para
    // membretes con imagen en base64 (logos llegan a varios cientos de KB).
    // LONGTEXT da espacio sobrado (~4GB) sin afectar performance porque sólo
    // se lee/escribe el JSON cuando el admin guarda el membrete.
    `ALTER TABLE configuracion MODIFY COLUMN valor LONGTEXT`,

    // Teléfono: 40 caracteres se quedaba corto cuando el alumno tiene varios
    // números (casa + celular del encargado, +código país, separadores, etc.).
    `ALTER TABLE alumnos MODIFY COLUMN telefono VARCHAR(80) NULL`,

    // Normaliza a minúsculas los campos enum-like que se importaron antes con
    // mayúsculas ("Activo", "Lunes"). El esquema espera 'activo'/'retirado'
    // y 'lunes'..'domingo' para que las validaciones y filtros del front
    // hagan match consistente.
    `UPDATE alumnos SET estado      = LOWER(estado)      WHERE estado      <> LOWER(estado)`,
    `UPDATE alumnos SET dia_clases1 = LOWER(dia_clases1) WHERE dia_clases1 IS NOT NULL AND dia_clases1 <> LOWER(dia_clases1)`,
    `UPDATE alumnos SET dia_clases2 = LOWER(dia_clases2) WHERE dia_clases2 IS NOT NULL AND dia_clases2 <> LOWER(dia_clases2)`,
  ];

  for (const sql of migraciones) {
    try { await pool.query(sql); }
    catch (_) { /* columna o clave ya existe — ok */ }
  }

  // Migración alumnos: codigo_estudiante (manual) → clave (auto) + nuevo codigo_estudiante (A000AAA)
  try {
    const [colsAlu] = await pool.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'alumnos'
          AND COLUMN_NAME IN ('clave','codigo_estudiante')`
    );
    const tiene = new Set(colsAlu.map(c => c.COLUMN_NAME));
    if (!tiene.has('clave') && tiene.has('codigo_estudiante')) {
      await pool.query(`ALTER TABLE alumnos CHANGE COLUMN codigo_estudiante clave VARCHAR(40) NOT NULL`);
      await pool.query(`ALTER TABLE alumnos ADD COLUMN codigo_estudiante VARCHAR(7) NULL UNIQUE AFTER clave`);
      try {
        await pool.query(`ALTER TABLE alumnos ADD CONSTRAINT chk_codigo_estudiante
          CHECK (codigo_estudiante IS NULL OR codigo_estudiante REGEXP '^[A-Z][0-9]{3}[A-Z]{3}$')`);
      } catch (_) {}
    } else if (tiene.has('clave') && !tiene.has('codigo_estudiante')) {
      await pool.query(`ALTER TABLE alumnos ADD COLUMN codigo_estudiante VARCHAR(7) NULL UNIQUE AFTER clave`);
      try {
        await pool.query(`ALTER TABLE alumnos ADD CONSTRAINT chk_codigo_estudiante
          CHECK (codigo_estudiante IS NULL OR codigo_estudiante REGEXP '^[A-Z][0-9]{3}[A-Z]{3}$')`);
      } catch (_) {}
    }
  } catch (err) {
    console.error('migración alumnos clave/codigo_estudiante:', err.message);
  }

  const configDefault = [
    ['inst_nombre',    'EDUGUAT'],
    ['inst_direccion', 'Ciudad de Guatemala, Guatemala'],
    ['inst_telefono',  'Tel: 2222-3333'],
    ['inst_email',     ''],
  ];
  for (const [clave, valor] of configDefault) {
    try {
      await pool.query('INSERT IGNORE INTO configuracion (clave, valor) VALUES (?,?)', [clave, valor]);
    } catch (_) {}
  }

  await traspasarDatosDiplomadosV1(pool);

  // Seed inicial de diplomados
  try {
    const [[{ total }]] = await pool.query('SELECT COUNT(*) AS total FROM dip_diplomados');
    if (total === 0) {
      const seed = [
        { nombre: 'Operador Windows', programas: ['Windows','Word','Publisher','PowerPoint','Parcial','Excel','Examen Final'] },
        { nombre: 'Programador',      programas: ['Scratch','Python','Parcial','C#','Examen Final'] },
        { nombre: 'Diseño Gráfico',   programas: ['Photoshop','Illustrator','Parcial','Filmora','Examen Final'] },
      ];
      for (const d of seed) {
        const [r] = await pool.query(
          'INSERT INTO dip_diplomados (nombre, objetivo_general, activo) VALUES (?,?,1)',
          [d.nombre, '']
        );
        const did = r.insertId;
        for (let i = 0; i < d.programas.length; i++) {
          await pool.query(
            'INSERT INTO dip_programas (diplomado_id, nombre, objetivo_general, duracion_semanas, orden, activo) VALUES (?,?,?,?,?,1)',
            [did, d.programas[i], '', 1, i]
          );
          await pool.query(
            'INSERT INTO dip_examenes (diplomado_id, nombre, orden, activo) VALUES (?,?,?,1)',
            [did, d.programas[i], i]
          );
        }
      }
    }

    const [dipsSinEx] = await pool.query(`
      SELECT d.id FROM dip_diplomados d
       LEFT JOIN dip_examenes e ON e.diplomado_id = d.id AND e.activo=1
      WHERE d.activo=1
      GROUP BY d.id
      HAVING COUNT(e.id) = 0
    `);
    for (const { id: did } of dipsSinEx) {
      const [progs] = await pool.query(
        'SELECT nombre, orden FROM dip_programas WHERE diplomado_id=? AND activo=1 ORDER BY orden, id',
        [did]
      );
      for (let i = 0; i < progs.length; i++) {
        await pool.query(
          'INSERT INTO dip_examenes (diplomado_id, nombre, orden, activo) VALUES (?,?,?,1)',
          [did, progs[i].nombre, i]
        );
      }
    }
  } catch (err) {
    console.error('Seed dip_diplomados error:', err.message);
  }

  // Seed inicial: plantilla de "Constancia de Inscripción"
  try {
    const [[{ total }]] = await pool.query('SELECT COUNT(*) AS total FROM constancia_plantillas');
    if (total === 0) {
      const cuerpo =
        'Por medio de la presente hacemos constar que el alumno(a) {{nombre_completo}}, ' +
        'estudiante del establecimiento {{establecimiento}}, se encuentra inscrito(a) ' +
        'actualmente en el curso de Tecnología {{tac}}, en el horario de {{horario}} ' +
        'los días {{dias}} en el laboratorio {{laboratorio}}.\n\n' +
        'La presente constancia se extiende a solicitud del interesado para los usos ' +
        'que estime convenientes.';
      await pool.query(
        `INSERT INTO constancia_plantillas
           (nombre, ubicacion, saludo, cuerpo, despedida, firma_nombre, firma_cargo, mostrar_telefono, activa)
         VALUES (?,?,?,?,?,?,?,?,1)`,
        [
          'Constancia de Inscripción',
          'Guatemala',
          'A quien corresponda:',
          cuerpo,
          'Atentamente,',
          'Secretaría',
          '',
          1,
        ]
      );
    }
  } catch (err) {
    console.error('Seed constancia_plantillas error:', err.message);
  }
};

const inicializarMensualidades = async (pool, sedeId) => {
  const anio = new Date().getFullYear();
  try {
    const [alumnos] = await pool.query(
      'SELECT id, cuota_mensual FROM alumnos WHERE estado = "activo"'
    );
    for (const a of alumnos) {
      for (const mes of MESES) {
        await pool.query(
          `INSERT IGNORE INTO mensualidades (alumno_id, mes, anio, monto, pagado, anulado, monto_abonado)
           VALUES (?, ?, ?, ?, 0, 0, 0)`,
          [a.id, mes, anio, parseFloat(a.cuota_mensual) || 0]
        );
      }
    }
    console.log(`  [${sedeId}] mensualidades ${anio} inicializadas para ${alumnos.length} alumnos activos.`);
  } catch (err) {
    console.error(`  [${sedeId}] inicializarMensualidades error:`, err.message);
  }
};

const sincronizarCatalogosConAlumnos = async (pool, sedeId) => {
  try {
    const [estabs] = await pool.query(
      `SELECT DISTINCT TRIM(establecimiento) AS v FROM alumnos
        WHERE establecimiento IS NOT NULL AND TRIM(establecimiento) <> ''`
    );
    for (const { v } of estabs) {
      await pool.query(
        'INSERT IGNORE INTO cat_establecimientos (nombre, activo) VALUES (?, 1)',
        [v]
      );
    }

    const [labs] = await pool.query(
      `SELECT DISTINCT TRIM(laboratorio) AS v FROM alumnos
        WHERE laboratorio IS NOT NULL AND TRIM(laboratorio) <> ''`
    );
    for (const { v } of labs) {
      await pool.query(
        'INSERT IGNORE INTO cat_laboratorios (nombre, activo) VALUES (?, 1)',
        [v]
      );
    }

    const [cuotas] = await pool.query(
      `SELECT DISTINCT cuota_mensual AS v FROM alumnos
        WHERE cuota_mensual IS NOT NULL AND cuota_mensual > 0`
    );
    for (const { v } of cuotas) {
      const [[exists]] = await pool.query(
        'SELECT id FROM cat_cuotas WHERE monto = ? LIMIT 1',
        [v]
      );
      if (!exists) {
        await pool.query(
          'INSERT INTO cat_cuotas (monto, descripcion, activo) VALUES (?, NULL, 1)',
          [v]
        );
      }
    }

    const [hors] = await pool.query(
      `SELECT DISTINCT dia_clases1, IFNULL(dia_clases2,'') AS dia_clases2, horario
         FROM alumnos
        WHERE dia_clases1 IS NOT NULL AND dia_clases1 <> ''
          AND horario IS NOT NULL AND horario <> ''`
    );
    for (const { dia_clases1, dia_clases2, horario } of hors) {
      const m = String(horario).match(/^\s*(\S+)\s+a\s+(\S+)\s*$/i);
      if (!m) continue;
      const [hora_inicio, hora_fin] = [m[1], m[2]];
      const dia2 = dia_clases2 || null;
      const [[exists]] = await pool.query(
        `SELECT id FROM cat_horarios
          WHERE dia1 = ? AND IFNULL(dia2,'') = IFNULL(?, '')
            AND hora_inicio = ? AND hora_fin = ? LIMIT 1`,
        [dia_clases1, dia2, hora_inicio, hora_fin]
      );
      if (!exists) {
        await pool.query(
          'INSERT INTO cat_horarios (dia1, dia2, hora_inicio, hora_fin, activo) VALUES (?,?,?,?,1)',
          [dia_clases1, dia2, hora_inicio, hora_fin]
        );
      }
    }
  } catch (err) {
    console.error(`  [${sedeId}] sincronizarCatalogosConAlumnos error:`, err.message);
  }
};

const asegurarAdmin = async (pool, sedeId, override = null) => {
  try {
    const [[{ total }]] = await pool.query(
      'SELECT COUNT(*) AS total FROM usuarios WHERE rol="admin"'
    );
    if (total > 0) return;
    const nombre   = override?.nombre   || `Admin ${sedeId}`;
    const email    = override?.email    || `admin@${sedeId}.local`;
    const password = override?.password || 'admin123';
    const hash = await bcrypt.hash(password, 10);
    await pool.query(
      'INSERT INTO usuarios (nombre, email, password, rol) VALUES (?,?,?,?)',
      [nombre, email, hash, 'admin']
    );
    console.log(`  [${sedeId}] admin creado: ${email}`);
  } catch (err) {
    console.error(`  [${sedeId}] asegurarAdmin error:`, err.message);
  }
};

// Bootstrap completo de una sede.  Idempotente.  Si se pasa adminOverride
// y todavía no hay admin, lo crea con esas credenciales (se usa al
// dar de alta una academia nueva desde la UI).
const bootstrapSede = async (id, adminOverride = null) => {
  await crearDatabaseSiNoExiste(id);
  const pool = ensurePool(id);
  try {
    await initDb(pool);
  } catch (err) {
    console.error(`  [${id}] initDb error:`, err.message);
  }
  await asegurarAdmin(pool, id, adminOverride);
  await sincronizarCatalogosConAlumnos(pool, id);
  await inicializarMensualidades(pool, id);
  return pool;
};

module.exports = {
  bootstrapSede,
  initDb,
  inicializarMensualidades,
  sincronizarCatalogosConAlumnos,
  asegurarAdmin,
  crearDatabaseSiNoExiste,
};
