// Filtro compartido por mes/año de finalización del alumno.
//
// Lo usan todos los módulos que listan alumnos (asistencia, mecanografía,
// notas TAC, notas de diplomados, mis tablas, constancias) para que el filtro
// se comporte igual en todos lados y no haya seis copias de la misma lógica.
//
// Params aceptados en el query string:
//   mes_fin  → 1..12, o 'sin' para traer sólo a los que aún no tienen mes.
//   anio_fin → año (ej. 2026), o 'sin' para los que aún no tienen año.
//
// Los alumnos que ya existían quedaron en NULL, así que 'sin' es la forma de
// encontrar a quién le falta el dato.

const SIN_DEFINIR = 'sin';

// Añade las condiciones a `conds`/`params`. `alias` es el alias de la tabla
// alumnos en la consulta ('al', 'a', ...).
const aplicarFiltroFinalizacion = (query, alias, conds, params) => {
  const mes  = query.mes_fin  != null ? String(query.mes_fin).trim()  : '';
  const anio = query.anio_fin != null ? String(query.anio_fin).trim() : '';

  if (mes === SIN_DEFINIR) {
    conds.push(`${alias}.mes_finalizacion IS NULL`);
  } else if (mes) {
    const n = parseInt(mes, 10);
    if (n >= 1 && n <= 12) { conds.push(`${alias}.mes_finalizacion=?`); params.push(n); }
  }

  if (anio === SIN_DEFINIR) {
    conds.push(`${alias}.anio_finalizacion IS NULL`);
  } else if (anio) {
    const n = parseInt(anio, 10);
    if (n >= 1900 && n <= 2999) { conds.push(`${alias}.anio_finalizacion=?`); params.push(n); }
  }
};

// Normaliza lo que llega del formulario de alumnos. Devuelve null cuando el
// campo viene vacío o fuera de rango, nunca 0 ni NaN.
const normalizarMes = (v) => {
  const n = parseInt(v, 10);
  return (n >= 1 && n <= 12) ? n : null;
};

const normalizarAnioFin = (v) => {
  const n = parseInt(v, 10);
  return (n >= 1900 && n <= 2999) ? n : null;
};

module.exports = { aplicarFiltroFinalizacion, normalizarMes, normalizarAnioFin, SIN_DEFINIR };
