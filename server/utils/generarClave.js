// Generador de clave de alumno: correlativo plano (sin prefijo de año).
//
// Toma como correlativo el máximo entre TODAS las claves existentes
// interpretadas como número entero (legacy "1033" → 1033, plano).  El
// resultado es la siguiente posición, sin padding ni prefijo.  El
// parámetro `fechaInicio` se ignora pero se conserva en la firma para
// los llamadores existentes (creación manual e importación masiva).

const correlativo = (clave) => {
  const m = String(clave || '').match(/(\d+)$/);
  if (!m) return 0;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) ? n : 0;
};

const generarClave = async (conn, _fechaInicio) => {
  // Bloqueamos la fila con mayor correlativo numérico para evitar
  // colisiones bajo concurrencia entre creación manual e importación.
  const [rows] = await conn.query(
    `SELECT clave FROM alumnos
       ORDER BY CAST(REGEXP_SUBSTR(clave, '[0-9]+$') AS UNSIGNED) DESC, id DESC
       LIMIT 1 FOR UPDATE`
  );

  const max = rows.length ? correlativo(rows[0].clave) : 0;
  return String(max + 1);
};

module.exports = { generarClave, correlativo };
