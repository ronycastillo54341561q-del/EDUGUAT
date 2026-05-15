-- ════════════════════════════════════════════════════════════════════════════
--  Vista: v_relaciones_tablas
--  Base : sistec_flores_oficina
--
--  Muestra todas las relaciones lógicas entre tablas. El esquema no usa
--  FOREIGN KEY explícitos, así que esta vista declara las relaciones por
--  convención de nombres (*_id → tabla.id) y se cruza con
--  information_schema.COLUMNS para mostrar sólo las que realmente existen
--  en la BD.
--
--  Uso:
--    USE sistec_flores_oficina;
--    SOURCE v_relaciones_tablas.sql;
--    SELECT * FROM v_relaciones_tablas;
--    SELECT * FROM v_relaciones_tablas WHERE tabla_destino = 'alumnos';
-- ════════════════════════════════════════════════════════════════════════════

USE sistec_flores_oficina;

-- ── Tabla "diccionario" con las relaciones conocidas ────────────────────────
DROP TABLE IF EXISTS _rel_dict;
CREATE TABLE _rel_dict (
  tabla_origen     VARCHAR(80) NOT NULL,
  columna_fk       VARCHAR(80) NOT NULL,
  tabla_destino    VARCHAR(80) NOT NULL,
  columna_destino  VARCHAR(80) NOT NULL DEFAULT 'id',
  cardinalidad     VARCHAR(10) NOT NULL DEFAULT 'N:1',
  descripcion      VARCHAR(255) NULL,
  PRIMARY KEY (tabla_origen, columna_fk)
) ENGINE=InnoDB;

INSERT INTO _rel_dict (tabla_origen, columna_fk, tabla_destino, columna_destino, cardinalidad, descripcion) VALUES
  -- ── Alumno ↔ usuario (login) ─────────────────────────────────────────────
  ('alumnos',                       'usuario_id',        'usuarios',              'id', '1:1', 'Usuario de login del alumno (rol=alumno)'),

  -- ── Datos académicos/financieros que cuelgan del alumno ──────────────────
  ('mensualidades',                 'alumno_id',         'alumnos',               'id', 'N:1', 'Mensualidades del alumno por año/mes'),
  ('asistencia_semanal',            'alumno_id',         'alumnos',               'id', 'N:1', 'Asistencia semanal (x/e/p/f/r)'),
  ('mecanografia_notas',            'alumno_id',         'alumnos',               'id', 'N:1', 'Lecciones de mecanografía por año'),
  ('notas_tac_anual',               'alumno_id',         'alumnos',               'id', 'N:1', 'Notas TAC por año/nivel'),
  ('diplomado_notas',               'alumno_id',         'alumnos',               'id', 'N:1', 'Notas de diplomado por materia/año'),
  ('recibos',                       'alumno_id',         'alumnos',               'id', 'N:1', 'Recibos de colegiatura emitidos al alumno'),
  ('papeleria',                     'alumno_id',         'alumnos',               'id', 'N:1', 'Recibos de papelería/otros pagos del alumno'),
  ('recibos_diplomados',            'alumno_id',         'alumnos',               'id', 'N:1', 'Recibos de diplomados (legacy, migrado a papeleria)'),
  ('inscritos_tac',                 'alumno_id',         'alumnos',               'id', 'N:1', 'Inscripción del alumno a un nivel TAC en un año'),

  -- ── Bitácora / sesiones / password ───────────────────────────────────────
  ('bitacora',                      'usuario_id',        'usuarios',              'id', 'N:1', 'Acción registrada por el usuario'),
  ('password_resets',               'usuario_id',        'usuarios',              'id', 'N:1', 'Token de recuperación de contraseña'),

  -- ── Diplomados: jerarquía diplomado → programas/exámenes/objetivos ───────
  ('dip_diplomado_objetivos',       'diplomado_id',      'dip_diplomados',        'id', 'N:1', 'Objetivos específicos de un diplomado'),
  ('dip_programas',                 'diplomado_id',      'dip_diplomados',        'id', 'N:1', 'Programa/materia que compone un diplomado'),
  ('dip_examenes',                  'diplomado_id',      'dip_diplomados',        'id', 'N:1', 'Exámenes definidos para un diplomado'),
  ('dip_programa_objetivos',        'programa_id',       'dip_programas',         'id', 'N:1', 'Objetivos por programa/materia'),
  ('dip_programa_contenido',        'programa_id',       'dip_programas',         'id', 'N:1', 'Contenido semanal por programa'),

  -- ── Roles personalizados y permisos ──────────────────────────────────────
  ('role_permisos',                 'rol_id',            'roles_custom',          'id', 'N:1', 'Permisos por módulo del rol custom'),
  ('role_horarios',                 'rol_id',            'roles_custom',          'id', '1:1', 'Horario de acceso permitido del rol'),

  -- ── Consultas (reportes guardados) ───────────────────────────────────────
  ('consultas_reportes',            'owner_id',          'usuarios',              'id', 'N:1', 'Usuario creador del reporte'),
  ('consultas_reportes_compartidos','reporte_id',        'consultas_reportes',    'id', 'N:1', 'Reporte compartido (lado N:M)'),
  ('consultas_reportes_compartidos','usuario_id',        'usuarios',              'id', 'N:1', 'Usuario con quien se comparte (lado N:M)'),

  -- ── Cierres diarios ──────────────────────────────────────────────────────
  ('cierres_diarios',               'cuenta_id',         'cat_cuentas_bancarias', 'id', 'N:1', 'Cuenta donde se depositó el cierre'),
  ('cierres_diarios',               'creado_por_id',     'usuarios',              'id', 'N:1', 'Usuario que registró el cierre'),
  ('cierres_diarios',               'revisado_por_id',   'usuarios',              'id', 'N:1', 'Usuario que revisó/aprobó el cierre'),
  ('cierre_gastos',                 'cierre_id',         'cierres_diarios',       'id', 'N:1', 'Gastos descontados del cierre'),

  -- ── Avisos ───────────────────────────────────────────────────────────────
  ('avisos',                        'autor_id',          'usuarios',              'id', 'N:1', 'Usuario autor del aviso'),
  ('avisos',                        'filtro_alumno_id',  'alumnos',               'id', 'N:1', 'Alumno destinatario cuando scope=alumno');

-- ── La vista cruza el diccionario con information_schema para verificar ─────
--    que las columnas realmente existan en la base actual.
DROP VIEW IF EXISTS v_relaciones_tablas;
CREATE VIEW v_relaciones_tablas AS
SELECT
  r.tabla_origen,
  r.columna_fk,
  c1.DATA_TYPE                                   AS tipo_origen,
  c1.IS_NULLABLE                                 AS origen_nullable,
  r.tabla_destino,
  r.columna_destino,
  r.cardinalidad,
  r.descripcion
FROM _rel_dict r
JOIN information_schema.COLUMNS c1
  ON  c1.TABLE_SCHEMA = DATABASE()
  AND c1.TABLE_NAME   = r.tabla_origen
  AND c1.COLUMN_NAME  = r.columna_fk
JOIN information_schema.COLUMNS c2
  ON  c2.TABLE_SCHEMA = DATABASE()
  AND c2.TABLE_NAME   = r.tabla_destino
  AND c2.COLUMN_NAME  = r.columna_destino;

-- ── (Opcional) Vista resumen por tabla destino ──────────────────────────────
DROP VIEW IF EXISTS v_relaciones_resumen;
CREATE VIEW v_relaciones_resumen AS
SELECT
  tabla_destino,
  COUNT(*)                              AS num_tablas_dependientes,
  GROUP_CONCAT(tabla_origen ORDER BY tabla_origen SEPARATOR ', ') AS tablas_origen
FROM v_relaciones_tablas
GROUP BY tabla_destino
ORDER BY num_tablas_dependientes DESC, tabla_destino;

-- ── Comprobación rápida ─────────────────────────────────────────────────────
-- SELECT * FROM v_relaciones_tablas ORDER BY tabla_destino, tabla_origen;
-- SELECT * FROM v_relaciones_resumen;
