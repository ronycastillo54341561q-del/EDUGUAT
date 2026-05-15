-- ============================================================
-- INIT MULTI-SEDE SCHEMA  (m_lozano + sistec_jutiapa)
-- ============================================================
-- Crea las dos nuevas bases de datos con la misma estructura
-- que sistema_escolar.  Es idempotente: puede correrse varias
-- veces sin romper datos existentes.
--
-- Uso:
--   mysql -u root -p < server/sql/init-sedes.sql
--
-- Luego, para poblar con datos de prueba:
--   node server/seed-multi-sede.js
-- ============================================================

-- ------------------------------------------------------------
-- BASE 1: m_lozano
-- ------------------------------------------------------------
CREATE DATABASE IF NOT EXISTS m_lozano
  DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE m_lozano;

CREATE TABLE IF NOT EXISTS usuarios (
  id        INT AUTO_INCREMENT PRIMARY KEY,
  nombre    VARCHAR(150) NOT NULL,
  email     VARCHAR(150) NOT NULL UNIQUE,
  password  VARCHAR(255) NOT NULL,
  rol       ENUM('admin','alumno','oficina','maestro') NOT NULL DEFAULT 'alumno',
  activo    TINYINT(1)   NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS alumnos (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  clave             VARCHAR(40) NOT NULL UNIQUE,
  codigo_estudiante VARCHAR(7) NULL UNIQUE,
  nombre            VARCHAR(100) NOT NULL,
  apellido          VARCHAR(100) NOT NULL,
  fecha_inicio      DATE NULL,
  fecha_nacimiento  DATE NULL,
  encargado         VARCHAR(150) NULL,
  telefono          VARCHAR(40)  NULL,
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
  estado            ENUM('activo','inactivo','retirado') NOT NULL DEFAULT 'activo',
  cuota_mensual     DECIMAL(10,2) NOT NULL DEFAULT 0,
  usuario_id        INT NULL,
  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_codigo_estudiante CHECK (codigo_estudiante IS NULL OR codigo_estudiante REGEXP '^[A-Z][0-9]{3}[A-Z]{3}$')
);

CREATE TABLE IF NOT EXISTS mensualidades (
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
);

CREATE TABLE IF NOT EXISTS asistencia_semanal (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  alumno_id  INT NOT NULL,
  anio       SMALLINT NOT NULL,
  mes        TINYINT  NOT NULL,
  semana     TINYINT  NOT NULL,
  estado     CHAR(1)  NULL,
  UNIQUE KEY uk_asist_sem (alumno_id, anio, mes, semana)
);

CREATE TABLE IF NOT EXISTS mecanografia_notas (
  id        INT AUTO_INCREMENT PRIMARY KEY,
  alumno_id INT NOT NULL,
  anio      SMALLINT NOT NULL,
  l1  SMALLINT NULL, l2  SMALLINT NULL, l3  SMALLINT NULL, l4  SMALLINT NULL,
  l5  SMALLINT NULL, l6  SMALLINT NULL, l7  SMALLINT NULL, l8  SMALLINT NULL,
  l9  SMALLINT NULL, l10 SMALLINT NULL, l11 SMALLINT NULL, l12 SMALLINT NULL,
  l13 SMALLINT NULL, l14 SMALLINT NULL, l15 SMALLINT NULL, l16 SMALLINT NULL,
  l17 SMALLINT NULL, l18 SMALLINT NULL, l19 SMALLINT NULL, l20 SMALLINT NULL,
  examen SMALLINT NULL,
  UNIQUE KEY uk_mec_n (alumno_id, anio)
);

CREATE TABLE IF NOT EXISTS notas_tac_anual (
  id        INT AUTO_INCREMENT PRIMARY KEY,
  alumno_id INT NOT NULL,
  anio      SMALLINT NOT NULL,
  nota1 SMALLINT NULL, nota2 SMALLINT NULL,
  nota3 SMALLINT NULL, nota4 SMALLINT NULL,
  UNIQUE KEY uk_tac_a (alumno_id, anio)
);

CREATE TABLE IF NOT EXISTS diplomado_notas (
  id        INT AUTO_INCREMENT PRIMARY KEY,
  alumno_id INT NOT NULL,
  anio      SMALLINT NOT NULL,
  materia   VARCHAR(60) NOT NULL,
  nota      SMALLINT NULL,
  UNIQUE KEY uk_dip_n (alumno_id, anio, materia)
);

CREATE TABLE IF NOT EXISTS recibos (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  no_recibo      VARCHAR(80),
  alumno_id      INT,
  meses          VARCHAR(250),
  fecha          DATE,
  total          DECIMAL(10,2),
  descuento      DECIMAL(10,2) NOT NULL DEFAULT 0,
  observaciones  TEXT,
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS papeleria (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  no_recibo      VARCHAR(80),
  alumno_id      INT,
  descripcion    VARCHAR(500),
  fecha          DATE,
  total          DECIMAL(10,2),
  observaciones  TEXT,
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS bitacora (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  usuario_id      INT NULL,
  usuario_nombre  VARCHAR(150) NOT NULL DEFAULT 'Sistema',
  accion          VARCHAR(50)  NOT NULL,
  modulo          VARCHAR(80)  NOT NULL,
  descripcion     TEXT NULL,
  ip              VARCHAR(60)  NULL,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS configuracion (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  clave       VARCHAR(80) NOT NULL UNIQUE,
  valor       TEXT,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS dip_diplomados (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  nombre            VARCHAR(150) NOT NULL,
  objetivo_general  TEXT,
  activo            TINYINT(1) NOT NULL DEFAULT 1,
  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS dip_diplomado_objetivos (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  diplomado_id  INT NOT NULL,
  descripcion   TEXT NOT NULL,
  orden         SMALLINT NOT NULL DEFAULT 0,
  INDEX idx_dip_obj (diplomado_id, orden)
);

CREATE TABLE IF NOT EXISTS dip_programas (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  diplomado_id      INT NOT NULL,
  nombre            VARCHAR(150) NOT NULL,
  objetivo_general  TEXT,
  duracion_semanas  TINYINT NOT NULL DEFAULT 1,
  orden             SMALLINT NOT NULL DEFAULT 0,
  activo            TINYINT(1) NOT NULL DEFAULT 1,
  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_prog_dip (diplomado_id, orden)
);

CREATE TABLE IF NOT EXISTS dip_programa_objetivos (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  programa_id   INT NOT NULL,
  descripcion   TEXT NOT NULL,
  orden         SMALLINT NOT NULL DEFAULT 0,
  INDEX idx_prog_obj (programa_id, orden)
);

CREATE TABLE IF NOT EXISTS dip_programa_contenido (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  programa_id   INT NOT NULL,
  semana_num    TINYINT NOT NULL,
  contenido     TEXT,
  UNIQUE KEY uk_dip_prog_cont (programa_id, semana_num)
);

CREATE TABLE IF NOT EXISTS dip_examenes (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  diplomado_id  INT NOT NULL,
  nombre        VARCHAR(120) NOT NULL,
  orden         SMALLINT NOT NULL DEFAULT 0,
  activo        TINYINT(1) NOT NULL DEFAULT 1,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_dip_exam (diplomado_id, orden)
);

CREATE TABLE IF NOT EXISTS mis_tablas (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  nombre      VARCHAR(150) NOT NULL,
  descripcion TEXT NULL,
  encabezado  TEXT NULL,
  columnas    LONGTEXT NOT NULL,
  filas       LONGTEXT NOT NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);


-- ------------------------------------------------------------
-- BASE 2: sistec_jutiapa  (idéntico schema)
-- ------------------------------------------------------------
CREATE DATABASE IF NOT EXISTS sistec_jutiapa
  DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE sistec_jutiapa;

CREATE TABLE IF NOT EXISTS usuarios (
  id        INT AUTO_INCREMENT PRIMARY KEY,
  nombre    VARCHAR(150) NOT NULL,
  email     VARCHAR(150) NOT NULL UNIQUE,
  password  VARCHAR(255) NOT NULL,
  rol       ENUM('admin','alumno','oficina','maestro') NOT NULL DEFAULT 'alumno',
  activo    TINYINT(1)   NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS alumnos (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  clave             VARCHAR(40) NOT NULL UNIQUE,
  codigo_estudiante VARCHAR(7) NULL UNIQUE,
  nombre            VARCHAR(100) NOT NULL,
  apellido          VARCHAR(100) NOT NULL,
  fecha_inicio      DATE NULL,
  fecha_nacimiento  DATE NULL,
  encargado         VARCHAR(150) NULL,
  telefono          VARCHAR(40)  NULL,
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
  estado            ENUM('activo','inactivo','retirado') NOT NULL DEFAULT 'activo',
  cuota_mensual     DECIMAL(10,2) NOT NULL DEFAULT 0,
  usuario_id        INT NULL,
  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_codigo_estudiante CHECK (codigo_estudiante IS NULL OR codigo_estudiante REGEXP '^[A-Z][0-9]{3}[A-Z]{3}$')
);

CREATE TABLE IF NOT EXISTS mensualidades (
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
);

CREATE TABLE IF NOT EXISTS asistencia_semanal (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  alumno_id  INT NOT NULL,
  anio       SMALLINT NOT NULL,
  mes        TINYINT  NOT NULL,
  semana     TINYINT  NOT NULL,
  estado     CHAR(1)  NULL,
  UNIQUE KEY uk_asist_sem (alumno_id, anio, mes, semana)
);

CREATE TABLE IF NOT EXISTS mecanografia_notas (
  id        INT AUTO_INCREMENT PRIMARY KEY,
  alumno_id INT NOT NULL,
  anio      SMALLINT NOT NULL,
  l1  SMALLINT NULL, l2  SMALLINT NULL, l3  SMALLINT NULL, l4  SMALLINT NULL,
  l5  SMALLINT NULL, l6  SMALLINT NULL, l7  SMALLINT NULL, l8  SMALLINT NULL,
  l9  SMALLINT NULL, l10 SMALLINT NULL, l11 SMALLINT NULL, l12 SMALLINT NULL,
  l13 SMALLINT NULL, l14 SMALLINT NULL, l15 SMALLINT NULL, l16 SMALLINT NULL,
  l17 SMALLINT NULL, l18 SMALLINT NULL, l19 SMALLINT NULL, l20 SMALLINT NULL,
  examen SMALLINT NULL,
  UNIQUE KEY uk_mec_n (alumno_id, anio)
);

CREATE TABLE IF NOT EXISTS notas_tac_anual (
  id        INT AUTO_INCREMENT PRIMARY KEY,
  alumno_id INT NOT NULL,
  anio      SMALLINT NOT NULL,
  nota1 SMALLINT NULL, nota2 SMALLINT NULL,
  nota3 SMALLINT NULL, nota4 SMALLINT NULL,
  UNIQUE KEY uk_tac_a (alumno_id, anio)
);

CREATE TABLE IF NOT EXISTS diplomado_notas (
  id        INT AUTO_INCREMENT PRIMARY KEY,
  alumno_id INT NOT NULL,
  anio      SMALLINT NOT NULL,
  materia   VARCHAR(60) NOT NULL,
  nota      SMALLINT NULL,
  UNIQUE KEY uk_dip_n (alumno_id, anio, materia)
);

CREATE TABLE IF NOT EXISTS recibos (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  no_recibo      VARCHAR(80),
  alumno_id      INT,
  meses          VARCHAR(250),
  fecha          DATE,
  total          DECIMAL(10,2),
  descuento      DECIMAL(10,2) NOT NULL DEFAULT 0,
  observaciones  TEXT,
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS papeleria (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  no_recibo      VARCHAR(80),
  alumno_id      INT,
  descripcion    VARCHAR(500),
  fecha          DATE,
  total          DECIMAL(10,2),
  observaciones  TEXT,
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS bitacora (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  usuario_id      INT NULL,
  usuario_nombre  VARCHAR(150) NOT NULL DEFAULT 'Sistema',
  accion          VARCHAR(50)  NOT NULL,
  modulo          VARCHAR(80)  NOT NULL,
  descripcion     TEXT NULL,
  ip              VARCHAR(60)  NULL,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS configuracion (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  clave       VARCHAR(80) NOT NULL UNIQUE,
  valor       TEXT,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS dip_diplomados (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  nombre            VARCHAR(150) NOT NULL,
  objetivo_general  TEXT,
  activo            TINYINT(1) NOT NULL DEFAULT 1,
  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS dip_diplomado_objetivos (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  diplomado_id  INT NOT NULL,
  descripcion   TEXT NOT NULL,
  orden         SMALLINT NOT NULL DEFAULT 0,
  INDEX idx_dip_obj (diplomado_id, orden)
);

CREATE TABLE IF NOT EXISTS dip_programas (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  diplomado_id      INT NOT NULL,
  nombre            VARCHAR(150) NOT NULL,
  objetivo_general  TEXT,
  duracion_semanas  TINYINT NOT NULL DEFAULT 1,
  orden             SMALLINT NOT NULL DEFAULT 0,
  activo            TINYINT(1) NOT NULL DEFAULT 1,
  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_prog_dip (diplomado_id, orden)
);

CREATE TABLE IF NOT EXISTS dip_programa_objetivos (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  programa_id   INT NOT NULL,
  descripcion   TEXT NOT NULL,
  orden         SMALLINT NOT NULL DEFAULT 0,
  INDEX idx_prog_obj (programa_id, orden)
);

CREATE TABLE IF NOT EXISTS dip_programa_contenido (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  programa_id   INT NOT NULL,
  semana_num    TINYINT NOT NULL,
  contenido     TEXT,
  UNIQUE KEY uk_dip_prog_cont (programa_id, semana_num)
);

CREATE TABLE IF NOT EXISTS dip_examenes (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  diplomado_id  INT NOT NULL,
  nombre        VARCHAR(120) NOT NULL,
  orden         SMALLINT NOT NULL DEFAULT 0,
  activo        TINYINT(1) NOT NULL DEFAULT 1,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_dip_exam (diplomado_id, orden)
);

CREATE TABLE IF NOT EXISTS mis_tablas (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  nombre      VARCHAR(150) NOT NULL,
  descripcion TEXT NULL,
  encabezado  TEXT NULL,
  columnas    LONGTEXT NOT NULL,
  filas       LONGTEXT NOT NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
