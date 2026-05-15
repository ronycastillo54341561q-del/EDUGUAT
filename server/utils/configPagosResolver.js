// Resolver de configuración de pagos: dado un alumno y un año, decide qué
// meses corresponde cobrarle y con qué multiplicador (medio mes, etc).
//
// Reglas de aplicación:
//   - Las reglas se filtran por año y por scope que coincida con el alumno.
//   - Por cada mes 1..12 se elige la regla más específica que lo cubra.
//   - Especificidad: alumno > diplomado/horario/laboratorio/dia > global.
//   - Si NO hay reglas configuradas para el año (ni siquiera globales) se
//     mantiene el comportamiento legacy: los 12 meses son esperados con
//     multiplicador 1.0 (sin romper nada de lo existente).

const db = require('../config/db');

const PRIORIDAD = {
  alumno:      4,
  diplomado:   3,
  horario:     3,
  laboratorio: 3,
  dia:         3,
  global:      1,
};

// Devuelve true si una regla aplica al alumno dado.
const reglaAplica = (regla, alumno) => {
  switch (regla.scope_tipo) {
    case 'global':      return true;
    case 'alumno':      return String(regla.scope_valor) === String(alumno.id);
    case 'diplomado':   return (alumno.diplomado || '') === regla.scope_valor;
    case 'horario':     return (alumno.horario || '')   === regla.scope_valor;
    case 'laboratorio': return (alumno.laboratorio || '') === regla.scope_valor;
    case 'dia':
      return (alumno.dia_clases1 || '') === regla.scope_valor
          || (alumno.dia_clases2 || '') === regla.scope_valor;
    default: return false;
  }
};

// Carga las reglas del año una sola vez y las cachea en el caller.
const cargarReglasAnio = async (anio) => {
  const [rows] = await db.query(
    `SELECT id, anio, scope_tipo, scope_valor, mes_inicio, mes_fin,
            multiplicador, descripcion
       FROM config_pagos WHERE anio = ?`,
    [anio]
  );
  return rows.map(r => ({
    ...r,
    multiplicador: parseFloat(r.multiplicador) || 1,
    mes_inicio:    parseInt(r.mes_inicio),
    mes_fin:       parseInt(r.mes_fin),
  }));
};

// Devuelve para un alumno+año un mapa { 1..12: { esperado, multiplicador, regla_id } }
// Si hayReglas=false, todos los meses son esperados con multiplicador 1.0.
const resolverParaAlumno = (alumno, reglas) => {
  const meses = {};
  for (let m = 1; m <= 12; m++) meses[m] = { esperado: false, multiplicador: 1, regla_id: null };

  if (!reglas.length) {
    for (let m = 1; m <= 12; m++) meses[m] = { esperado: true, multiplicador: 1, regla_id: null };
    return meses;
  }

  const aplicables = reglas.filter(r => reglaAplica(r, alumno));
  if (!aplicables.length) {
    // Hay reglas en el año pero ninguna aplica a ESTE alumno → comportamiento
    // por defecto (12 meses con cuota normal). Antes era esperado=false, lo
    // que causaba que reglas tipo "alumno específico" rompieran a los demás.
    for (let m = 1; m <= 12; m++) meses[m] = { esperado: true, multiplicador: 1, regla_id: null };
    return meses;
  }

  for (let m = 1; m <= 12; m++) {
    let mejor = null;
    for (const r of aplicables) {
      if (m < r.mes_inicio || m > r.mes_fin) continue;
      const prio = PRIORIDAD[r.scope_tipo] || 0;
      if (!mejor || prio > mejor._prio || (prio === mejor._prio && r.id > mejor.id)) {
        mejor = { ...r, _prio: prio };
      }
    }
    if (mejor) {
      meses[m] = { esperado: true, multiplicador: mejor.multiplicador, regla_id: mejor.id };
    }
  }
  return meses;
};

module.exports = { cargarReglasAnio, resolverParaAlumno };
