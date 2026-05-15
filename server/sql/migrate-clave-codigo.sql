-- ============================================================
-- MIGRACIÓN: codigo_estudiante (manual) → clave (auto) + nuevo codigo_estudiante (A000AAA)
-- ============================================================
-- Idempotente: detecta si ya se aplicó y no hace nada.
-- Aplicar en cada sede:
--   mysql -u root -p sistema_escolar < server/sql/migrate-clave-codigo.sql
--   mysql -u root -p m_lozano        < server/sql/migrate-clave-codigo.sql
--   mysql -u root -p sistec_jutiapa  < server/sql/migrate-clave-codigo.sql
-- ============================================================

DELIMITER $$

DROP PROCEDURE IF EXISTS migrar_clave_codigo$$
CREATE PROCEDURE migrar_clave_codigo()
BEGIN
  DECLARE tiene_clave INT DEFAULT 0;
  DECLARE tiene_codigo_viejo INT DEFAULT 0;

  SELECT COUNT(*) INTO tiene_clave
    FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'alumnos' AND COLUMN_NAME = 'clave';

  SELECT COUNT(*) INTO tiene_codigo_viejo
    FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'alumnos' AND COLUMN_NAME = 'codigo_estudiante';

  -- Caso 1: schema antiguo (sólo codigo_estudiante manual). Renombrarlo a clave y agregar codigo_estudiante nuevo.
  IF tiene_clave = 0 AND tiene_codigo_viejo = 1 THEN
    ALTER TABLE alumnos CHANGE COLUMN codigo_estudiante clave VARCHAR(40) NOT NULL;
    -- El UNIQUE original sigue vigente sobre la columna renombrada.
    ALTER TABLE alumnos ADD COLUMN codigo_estudiante VARCHAR(7) NULL UNIQUE AFTER clave;
    ALTER TABLE alumnos ADD CONSTRAINT chk_codigo_estudiante
      CHECK (codigo_estudiante IS NULL OR codigo_estudiante REGEXP '^[A-Z][0-9]{3}[A-Z]{3}$');
  END IF;

  -- Caso 2: ya existe clave pero falta el nuevo codigo_estudiante.
  IF tiene_clave = 1 AND tiene_codigo_viejo = 0 THEN
    ALTER TABLE alumnos ADD COLUMN codigo_estudiante VARCHAR(7) NULL UNIQUE AFTER clave;
    ALTER TABLE alumnos ADD CONSTRAINT chk_codigo_estudiante
      CHECK (codigo_estudiante IS NULL OR codigo_estudiante REGEXP '^[A-Z][0-9]{3}[A-Z]{3}$');
  END IF;

  -- Caso 3: ambas existen → nada que hacer.
END$$

CALL migrar_clave_codigo()$$
DROP PROCEDURE migrar_clave_codigo$$

DELIMITER ;
