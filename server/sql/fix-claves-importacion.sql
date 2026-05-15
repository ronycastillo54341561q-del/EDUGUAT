-- ============================================================
-- FIX: claves de alumnos importados que reiniciaron en 260001
-- ============================================================
-- Contexto: la primera versión de la importación filtraba el correlativo
-- por prefijo YY (LIKE '26%') y no veía claves legacy (ej. "103"),
-- por lo que generaba 260001, 260002, … cuando debía continuar la
-- secuencia global.
--
-- Este script renumera las claves "huérfanas" (las que no continúan
-- el correlativo global) y actualiza el username (usuarios.email) que
-- las contiene en su sufijo.
--
-- Aplícalo en la sede donde ocurrió la importación, ej.:
--   mysql -u root -p sistema_escolar < server/sql/fix-claves-importacion.sql
--
-- Es seguro ejecutarlo varias veces: si no hay claves "fuera de orden"
-- no hace nada.
-- ============================================================

DELIMITER $$

DROP PROCEDURE IF EXISTS fix_claves_importacion$$
CREATE PROCEDURE fix_claves_importacion()
BEGIN
  DECLARE done INT DEFAULT 0;
  DECLARE v_id        INT;
  DECLARE v_clave_old VARCHAR(40);
  DECLARE v_user_id   INT;
  DECLARE v_email_old VARCHAR(150);
  DECLARE v_yy        CHAR(2);
  DECLARE v_max_corr  INT;
  DECLARE v_next      INT;
  DECLARE v_clave_new VARCHAR(40);
  DECLARE v_email_new VARCHAR(150);

  -- Cursor: alumnos con clave de formato "YY0001..YY0099" (los reiniciados)
  -- ordenados por id ascendente para reasignar en el orden en que entraron.
  DECLARE cur CURSOR FOR
    SELECT a.id, a.clave, a.usuario_id, u.email
      FROM alumnos a
      LEFT JOIN usuarios u ON u.id = a.usuario_id
     WHERE a.clave REGEXP '^[0-9]{6}$'
       AND CAST(SUBSTRING(a.clave, 3) AS UNSIGNED) <= 99
     ORDER BY a.id ASC;
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = 1;

  -- Correlativo máximo entre las claves NO reiniciadas (legacy + modernas válidas).
  SELECT COALESCE(MAX(
    CASE
      WHEN CHAR_LENGTH(clave) >= 6 THEN CAST(RIGHT(clave, 4) AS UNSIGNED)
      ELSE CAST(REGEXP_SUBSTR(clave, '[0-9]+$') AS UNSIGNED)
    END
  ), 0)
    INTO v_max_corr
    FROM alumnos
   WHERE NOT (clave REGEXP '^[0-9]{6}$' AND CAST(SUBSTRING(clave, 3) AS UNSIGNED) <= 99);

  -- Si no hay candidatos a renumerar, salimos.
  SELECT COUNT(*) INTO @cnt
    FROM alumnos
   WHERE clave REGEXP '^[0-9]{6}$'
     AND CAST(SUBSTRING(clave, 3) AS UNSIGNED) <= 99;
  IF @cnt = 0 THEN
    SELECT 'Sin claves a corregir' AS resultado;
  ELSE
    SET v_next = v_max_corr + 1;
    SET v_yy   = LPAD(RIGHT(YEAR(CURDATE()), 2), 2, '0');

    OPEN cur;
    bucle: LOOP
      FETCH cur INTO v_id, v_clave_old, v_user_id, v_email_old;
      IF done = 1 THEN LEAVE bucle; END IF;

      SET v_clave_new = CONCAT(v_yy, LPAD(v_next, 4, '0'));

      -- Actualiza la clave del alumno
      UPDATE alumnos SET clave = v_clave_new WHERE id = v_id;

      -- Si el username (email) terminaba en la clave vieja, lo reasignamos
      IF v_user_id IS NOT NULL AND v_email_old IS NOT NULL
         AND v_email_old LIKE CONCAT('%', v_clave_old) THEN
        SET v_email_new = CONCAT(
          SUBSTRING(v_email_old, 1, CHAR_LENGTH(v_email_old) - CHAR_LENGTH(v_clave_old)),
          v_clave_new
        );
        UPDATE usuarios SET email = v_email_new WHERE id = v_user_id;
      END IF;

      SET v_next = v_next + 1;
    END LOOP;
    CLOSE cur;

    SELECT CONCAT(@cnt, ' clave(s) renumeradas a partir de ', v_max_corr + 1) AS resultado;
  END IF;
END$$

CALL fix_claves_importacion()$$
DROP PROCEDURE fix_claves_importacion$$

DELIMITER ;
