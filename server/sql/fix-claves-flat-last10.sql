-- ============================================================
-- FIX: renumera los últimos 10 alumnos a clave plana (sin prefijo YY)
-- ============================================================
-- Toma los 10 alumnos con id más alto, calcula el correlativo máximo
-- entre los DEMÁS alumnos (interpretado como entero plano), y reasigna
-- a los 10 últimos en orden ascendente de id las claves max+1, max+2…
-- También actualiza el username (usuarios.email) que termina en la
-- clave vieja.
--
-- Ejemplo: si el resto tiene un máximo legacy de 1033, los 10 últimos
-- pasan a ser 1034, 1035, …, 1043.
--
-- Aplicar:
--   mysql -u root -p sistema_escolar < server/sql/fix-claves-flat-last10.sql
--
-- Idempotente para ejecuciones repetidas: si los últimos 10 ya tienen
-- la clave que les tocaría, los UPDATE simplemente la dejan igual.
-- ============================================================

DELIMITER $$

DROP PROCEDURE IF EXISTS fix_claves_flat_last10$$
CREATE PROCEDURE fix_claves_flat_last10()
BEGIN
  DECLARE done INT DEFAULT 0;
  DECLARE v_id        INT;
  DECLARE v_clave_old VARCHAR(40);
  DECLARE v_user_id   INT;
  DECLARE v_email_old VARCHAR(150);
  DECLARE v_max_corr  INT DEFAULT 0;
  DECLARE v_next      INT;
  DECLARE v_clave_new VARCHAR(40);
  DECLARE v_email_new VARCHAR(150);

  -- Tabla temporal con los ids de los últimos 10 alumnos (id desc).
  DROP TEMPORARY TABLE IF EXISTS tmp_last10;
  CREATE TEMPORARY TABLE tmp_last10 (id INT PRIMARY KEY);
  INSERT INTO tmp_last10 (id)
    SELECT id FROM alumnos ORDER BY id DESC LIMIT 10;

  -- Cursor: los 10 últimos en orden ASC para que el correlativo
  -- crezca con el orden de inserción.
  DECLARE cur CURSOR FOR
    SELECT a.id, a.clave, a.usuario_id, u.email
      FROM alumnos a
      LEFT JOIN usuarios u ON u.id = a.usuario_id
     WHERE a.id IN (SELECT id FROM tmp_last10)
     ORDER BY a.id ASC;
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = 1;

  -- Correlativo máximo (entero plano de la cola numérica) entre los
  -- alumnos que NO son parte de los últimos 10.
  SELECT COALESCE(MAX(CAST(REGEXP_SUBSTR(clave, '[0-9]+$') AS UNSIGNED)), 0)
    INTO v_max_corr
    FROM alumnos
   WHERE id NOT IN (SELECT id FROM tmp_last10);

  SET v_next = v_max_corr + 1;

  OPEN cur;
  bucle: LOOP
    FETCH cur INTO v_id, v_clave_old, v_user_id, v_email_old;
    IF done = 1 THEN LEAVE bucle; END IF;

    SET v_clave_new = CAST(v_next AS CHAR);

    UPDATE alumnos SET clave = v_clave_new WHERE id = v_id;

    -- Si el username terminaba con la clave vieja, lo recomponemos.
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

  DROP TEMPORARY TABLE IF EXISTS tmp_last10;

  SELECT CONCAT('10 últimos renumerados desde ', v_max_corr + 1, ' hasta ', v_next - 1) AS resultado;
END$$

CALL fix_claves_flat_last10()$$
DROP PROCEDURE fix_claves_flat_last10$$

DELIMITER ;
