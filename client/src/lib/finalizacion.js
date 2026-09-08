// Mes/año de finalización del alumno (cuándo termina su diplomado o ciclo).
//
// En la BD el mes se guarda como número 1..12 para que ordene y filtre bien;
// el nombre en español vive sólo aquí. El valor 'sin' es el centinela que usan
// los filtros para pedir "los que todavía no tienen el dato".

export const SIN_DEFINIR = 'sin';

export const MESES_FINALIZACION = [
  { num: 1,  nombre: 'Enero'   }, { num: 2,  nombre: 'Febrero'   },
  { num: 3,  nombre: 'Marzo'   }, { num: 4,  nombre: 'Abril'     },
  { num: 5,  nombre: 'Mayo'    }, { num: 6,  nombre: 'Junio'     },
  { num: 7,  nombre: 'Julio'   }, { num: 8,  nombre: 'Agosto'    },
  { num: 9,  nombre: 'Septiembre' }, { num: 10, nombre: 'Octubre' },
  { num: 11, nombre: 'Noviembre' }, { num: 12, nombre: 'Diciembre' },
];

export const nombreMes = (num) =>
  MESES_FINALIZACION.find(m => m.num === Number(num))?.nombre || '';

// Etiqueta para tablas y exports: "Mayo 2026", "Mayo", "2026" o "—".
export const etiquetaFinalizacion = (mes, anio) => {
  const m = nombreMes(mes);
  const a = anio ? String(anio) : '';
  return [m, a].filter(Boolean).join(' ') || '—';
};

// Igual que la anterior pero pensada para recibir el alumno completo.
export const finalizacionDeAlumno = (a) =>
  etiquetaFinalizacion(a?.mes_finalizacion, a?.anio_finalizacion);

// Convierte el estado de los dos selects en params de query. Se usa en cada
// módulo para no repetir la misma condición siete veces.
export const paramsFinalizacion = (mes, anio) => {
  const out = {};
  if (mes)  out.mes_fin  = mes;
  if (anio) out.anio_fin = anio;
  return out;
};
