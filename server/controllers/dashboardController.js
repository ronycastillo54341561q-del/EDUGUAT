const db = require('../config/db');

const DIAS_ES  = ['domingo','lunes','martes','miercoles','jueves','viernes','sabado'];
const MESES_ES = ['enero','febrero','marzo','abril','mayo','junio',
                  'julio','agosto','septiembre','octubre','noviembre','diciembre'];

const parseAnio = (v) => {
  const n = parseInt(v, 10);
  return Number.isInteger(n) && n >= 1990 && n <= 2200 ? n : new Date().getFullYear();
};

// ─── /dashboard/stats?anio=YYYY ─────────────────────────────────────────────
// Tarjetas resumen del dashboard. Acepta `anio` opcional (por defecto el
// año en curso). Las consultas de mensualidades filtran por alumnos activos
// para no contar registros que ya no están al cobro. Los ingresos del año
// se calculan sobre la tabla `recibos` (no `mensualidades`) para coincidir
// con el módulo de Recibos, que es la fuente "de caja" real.
const getStats = async (req, res) => {
  const hoy         = new Date();
  const anioParam   = parseAnio(req.query.anio);
  const anioActual  = hoy.getFullYear();
  const esAnioActual = anioParam === anioActual;

  // Para el año seleccionado, "mes actual" sólo aplica si es el año en curso;
  // de lo contrario tomamos diciembre como mes de cierre para ese año.
  const mesIdx      = esAnioActual ? hoy.getMonth() : 11;
  const mesActual   = MESES_ES[mesIdx];
  const diaHoy      = DIAS_ES[hoy.getDay()];
  const semanaDelMes = Math.ceil(hoy.getDate() / 7);

  const mesAnteriorIdx = mesIdx === 0 ? 11 : mesIdx - 1;
  const anioAnterior   = mesIdx === 0 ? anioParam - 1 : anioParam;
  const mesAnterior    = MESES_ES[mesAnteriorIdx];

  try {
    // ── Alumnos ──────────────────────────────────────────
    const [[{ total_alumnos }]] = await db.query(
      "SELECT COUNT(*) as total_alumnos FROM alumnos WHERE estado='activo'"
    );
    const [[{ alumnos_retirados }]] = await db.query(
      "SELECT COUNT(*) as alumnos_retirados FROM alumnos WHERE estado='retirado'"
    );
    const [[{ alumnos_nuevos_anio }]] = await db.query(
      "SELECT COUNT(*) as alumnos_nuevos_anio FROM alumnos WHERE YEAR(fecha_inicio)=?",
      [anioParam]
    );
    const [[{ diplomados_activos }]] = await db.query(
      "SELECT COUNT(*) as diplomados_activos FROM alumnos WHERE estado='activo' AND diplomado IS NOT NULL AND diplomado!=''"
    );

    // ── Pagos mes actual (sólo alumnos activos) ───────────
    const [[mesAct]] = await db.query(`
      SELECT
        COUNT(CASE WHEN m.pagado=1 AND m.anulado=0 THEN 1 END) AS pagados_mes,
        COUNT(CASE WHEN m.anulado=0                THEN 1 END) AS total_mes,
        COALESCE(SUM(CASE WHEN m.pagado=1 AND m.anulado=0 THEN m.monto ELSE 0 END),0) AS monto_mes
      FROM mensualidades m
      JOIN alumnos al ON al.id = m.alumno_id AND al.estado='activo'
      WHERE m.mes=? AND m.anio=?
    `, [mesActual, anioParam]);

    // ── Pagos mes anterior (sólo alumnos activos) ─────────
    const [[mesAnt]] = await db.query(`
      SELECT
        COUNT(CASE WHEN m.pagado=1 AND m.anulado=0 THEN 1 END) AS pagados_mes_ant,
        COUNT(CASE WHEN m.anulado=0                THEN 1 END) AS total_mes_ant,
        COALESCE(SUM(CASE WHEN m.pagado=1 AND m.anulado=0 THEN m.monto ELSE 0 END),0) AS monto_mes_ant
      FROM mensualidades m
      JOIN alumnos al ON al.id = m.alumno_id AND al.estado='activo'
      WHERE m.mes=? AND m.anio=?
    `, [mesAnterior, anioAnterior]);

    // ── Ingresos año (caja real desde recibos) ────────────
    // Toma TODOS los recibos no anulados emitidos en el año (incluye
    // colegiaturas, inscripciones, papelería, otros). Coincide con la
    // suma del módulo de Recibos.
    const [[{ ingresos_anio }]] = await db.query(
      "SELECT COALESCE(SUM(total),0) AS ingresos_anio FROM recibos WHERE anulado=0 AND YEAR(fecha)=?",
      [anioParam]
    );
    // Y para complementar: ingresos provenientes sólo de colegiaturas (mensualidades).
    const [[{ ingresos_colegiaturas }]] = await db.query(
      "SELECT COALESCE(SUM(monto),0) AS ingresos_colegiaturas FROM mensualidades WHERE pagado=1 AND anulado=0 AND anio=?",
      [anioParam]
    );

    // ── Asistencia hoy ─────────────────────────────────────
    // Sólo tiene sentido para el año en curso. Si el filtro es otro año,
    // devolvemos 0/0 para no confundir al usuario.
    let total_esperados_hoy = 0;
    let asistieron_semana   = 0;
    if (esAnioActual) {
      const [[r1]] = await db.query(
        "SELECT COUNT(*) as total_esperados_hoy FROM alumnos WHERE estado='activo' AND (dia_clases1=? OR dia_clases2=?)",
        [diaHoy, diaHoy]
      );
      total_esperados_hoy = r1.total_esperados_hoy;
      const [[r2]] = await db.query(`
        SELECT COUNT(*) as asistieron_semana
        FROM alumnos al
        JOIN asistencia_semanal ass ON al.id=ass.alumno_id
          AND ass.anio=? AND ass.mes=? AND ass.semana=? AND ass.estado='x'
        WHERE al.estado='activo' AND (al.dia_clases1=? OR al.dia_clases2=?)
      `, [anioParam, mesIdx + 1, semanaDelMes, diaHoy, diaHoy]);
      asistieron_semana = r2.asistieron_semana;
    }

    // ── Grupos dia+horario+laboratorio ────────────────────
    const [por_grupo] = await db.query(`
      SELECT dia_clases1 AS dia, horario, laboratorio, COUNT(*) AS total
      FROM alumnos
      WHERE estado='activo'
        AND dia_clases1 IS NOT NULL AND dia_clases1!=''
        AND horario IS NOT NULL AND horario!=''
      GROUP BY dia_clases1, horario, laboratorio
      ORDER BY dia_clases1, horario, laboratorio
    `);

    // ── Distribuciones ────────────────────────────────────
    const [por_diplomado] = await db.query(
      "SELECT diplomado, COUNT(*) as total FROM alumnos WHERE estado='activo' AND diplomado IS NOT NULL AND diplomado!='' GROUP BY diplomado ORDER BY total DESC LIMIT 8"
    );
    const [por_tac] = await db.query(
      "SELECT tac, COUNT(*) as total FROM alumnos WHERE estado='activo' AND tac IS NOT NULL AND tac!='' GROUP BY tac ORDER BY total DESC LIMIT 8"
    );

    res.json({
      anio: anioParam,
      total_alumnos, alumnos_retirados, alumnos_nuevos_anio, diplomados_activos,
      // pagos
      pagados_mes: mesAct.pagados_mes,
      total_mes:   mesAct.total_mes,
      monto_mes:   parseFloat(mesAct.monto_mes),
      pagados_mes_ant: mesAnt.pagados_mes_ant,
      total_mes_ant:   mesAnt.total_mes_ant,
      monto_mes_ant:   parseFloat(mesAnt.monto_mes_ant),
      mes_actual: mesActual, mes_anterior: mesAnterior,
      // ingresos
      ingresos_anio:        parseFloat(ingresos_anio),
      ingresos_colegiaturas: parseFloat(ingresos_colegiaturas),
      // asistencia
      dia_hoy: diaHoy,
      semana_mes: semanaDelMes,
      mes_nombre: mesActual,
      total_esperados_hoy,
      asistieron_semana,
      es_anio_actual: esAnioActual,
      // grupos y distribuciones
      por_grupo, por_diplomado, por_tac,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al obtener estadísticas' });
  }
};

// ─── /dashboard/finanzas?anio=YYYY ──────────────────────────────────────────
// Series temporales y comparaciones para el dashboard financiero.
const getFinanzas = async (req, res) => {
  const anio = parseAnio(req.query.anio);
  const anioPrev = anio - 1;
  const hoy = new Date();

  try {
    // ── Recibos por mes (año seleccionado y año anterior) ─────────────
    // Suma sólo recibos no anulados; agrupa por MONTH(fecha).
    const [recibosMes] = await db.query(
      `SELECT YEAR(fecha) AS anio, MONTH(fecha) AS mes,
              COALESCE(SUM(total),0) AS monto,
              COUNT(*) AS cantidad
         FROM recibos
        WHERE anulado=0 AND fecha IS NOT NULL
          AND YEAR(fecha) IN (?, ?)
        GROUP BY YEAR(fecha), MONTH(fecha)`,
      [anio, anioPrev]
    );
    const recibosPorMes = Array.from({ length: 12 }, (_, i) => ({
      mes: i + 1,
      monto:      0,
      cantidad:   0,
      monto_prev: 0,
    }));
    for (const r of recibosMes) {
      const idx = r.mes - 1;
      if (idx < 0 || idx > 11) continue;
      if (r.anio === anio) {
        recibosPorMes[idx].monto    = parseFloat(r.monto);
        recibosPorMes[idx].cantidad = r.cantidad;
      } else if (r.anio === anioPrev) {
        recibosPorMes[idx].monto_prev = parseFloat(r.monto);
      }
    }

    // ── Mensualidades por mes (sólo alumnos activos) ──────────────────
    // Útil para distinguir colegiaturas de "otros" ingresos.
    const [colegiaturasMes] = await db.query(`
      SELECT m.mes, m.anio,
             COUNT(CASE WHEN m.pagado=1 AND m.anulado=0 THEN 1 END) AS pagadas,
             COUNT(CASE WHEN m.anulado=0                THEN 1 END) AS totales,
             COALESCE(SUM(CASE WHEN m.pagado=1 AND m.anulado=0 THEN m.monto ELSE 0 END),0) AS monto
        FROM mensualidades m
        JOIN alumnos al ON al.id=m.alumno_id AND al.estado='activo'
       WHERE m.anio IN (?, ?)
       GROUP BY m.anio, m.mes
    `, [anio, anioPrev]);
    const colegiaturasPorMes = Array.from({ length: 12 }, (_, i) => ({
      mes:        i + 1,
      mes_nombre: MESES_ES[i],
      pagadas:    0,
      totales:    0,
      monto:      0,
      monto_prev: 0,
    }));
    for (const r of colegiaturasMes) {
      const idx = MESES_ES.indexOf(String(r.mes).toLowerCase());
      if (idx < 0) continue;
      if (r.anio === anio) {
        colegiaturasPorMes[idx].pagadas = r.pagadas;
        colegiaturasPorMes[idx].totales = r.totales;
        colegiaturasPorMes[idx].monto   = parseFloat(r.monto);
      } else if (r.anio === anioPrev) {
        colegiaturasPorMes[idx].monto_prev = parseFloat(r.monto);
      }
    }

    // ── Recibos por semana (últimas 12 semanas calendario) ────────────
    // Se calcula desde el lado de la app para no depender de la zona horaria
    // del servidor MySQL ni del WEEK_MODE.
    const [recibosFechas] = await db.query(
      "SELECT fecha, total FROM recibos WHERE anulado=0 AND fecha IS NOT NULL AND fecha >= ?",
      [iso(addDays(hoy, -7 * 12 - 1))]
    );
    const recibosPorSemana = buildSemanas(hoy, 12, recibosFechas);

    // ── Recibos por día (últimos 30 días) ─────────────────────────────
    const [recibosUlt30] = await db.query(
      "SELECT fecha, total FROM recibos WHERE anulado=0 AND fecha IS NOT NULL AND fecha >= ?",
      [iso(addDays(hoy, -30))]
    );
    const recibosPorDia = buildDias(hoy, 30, recibosUlt30);

    // ── Comparativo de ingresos por año (últimos 5 años) ──────────────
    const [comparativo] = await db.query(
      "SELECT YEAR(fecha) AS anio, COALESCE(SUM(total),0) AS monto, COUNT(*) AS cantidad FROM recibos WHERE anulado=0 AND fecha IS NOT NULL AND YEAR(fecha) BETWEEN ? AND ? GROUP BY YEAR(fecha) ORDER BY anio",
      [anio - 4, anio]
    );
    const comparativoAnios = comparativo.map(r => ({
      anio:     r.anio,
      monto:    parseFloat(r.monto),
      cantidad: r.cantidad,
    }));

    // ── Asistencia mensual (año seleccionado) ─────────────────────────
    const [asistMes] = await db.query(`
      SELECT mes,
             SUM(estado='x') AS asistio,
             SUM(estado='e') AS enfermo,
             SUM(estado='p') AS permiso,
             SUM(estado='f') AS falto,
             COUNT(*) AS total
        FROM asistencia_semanal
       WHERE anio=?
       GROUP BY mes
    `, [anio]);
    const asistenciaPorMes = Array.from({ length: 12 }, (_, i) => ({
      mes: i + 1, asistio: 0, enfermo: 0, permiso: 0, falto: 0, total: 0,
    }));
    for (const r of asistMes) {
      const idx = r.mes - 1;
      if (idx < 0 || idx > 11) continue;
      asistenciaPorMes[idx] = {
        mes: r.mes,
        asistio: Number(r.asistio) || 0,
        enfermo: Number(r.enfermo) || 0,
        permiso: Number(r.permiso) || 0,
        falto:   Number(r.falto)   || 0,
        total:   Number(r.total)   || 0,
      };
    }

    // ── Top alumnos por monto cobrado en el año ───────────────────────
    const [topAlumnos] = await db.query(`
      SELECT al.id, al.clave, al.codigo_estudiante,
             CONCAT(al.nombre,' ',al.apellido) AS nombre,
             COALESCE(SUM(r.total),0) AS monto,
             COUNT(r.id) AS recibos
        FROM recibos r
        JOIN alumnos al ON al.id=r.alumno_id
       WHERE r.anulado=0 AND r.fecha IS NOT NULL AND YEAR(r.fecha)=?
       GROUP BY al.id
       ORDER BY monto DESC
       LIMIT 10
    `, [anio]);
    const topAlumnosLista = topAlumnos.map(a => ({
      ...a,
      monto: parseFloat(a.monto),
    }));

    // ── Top diplomados por ingresos (colegiaturas pagadas del año) ────
    const [topDip] = await db.query(`
      SELECT COALESCE(NULLIF(al.diplomado, ''),'(sin diplomado)') AS diplomado,
             COALESCE(SUM(m.monto),0) AS monto,
             COUNT(*) AS pagadas
        FROM mensualidades m
        JOIN alumnos al ON al.id=m.alumno_id
       WHERE m.pagado=1 AND m.anulado=0 AND m.anio=?
       GROUP BY diplomado
       ORDER BY monto DESC
       LIMIT 8
    `, [anio]);
    const topDiplomados = topDip.map(d => ({
      diplomado: d.diplomado,
      monto: parseFloat(d.monto),
      pagadas: d.pagadas,
    }));

    // ── Resumen anual ────────────────────────────────────────────────
    const totalAnio   = recibosPorMes.reduce((s, m) => s + m.monto, 0);
    const totalPrev   = recibosPorMes.reduce((s, m) => s + m.monto_prev, 0);
    const cantidadAnio = recibosPorMes.reduce((s, m) => s + m.cantidad, 0);

    res.json({
      anio,
      anio_prev: anioPrev,
      total_anio:    totalAnio,
      total_prev:    totalPrev,
      cantidad_anio: cantidadAnio,
      delta_pct:     totalPrev > 0 ? ((totalAnio - totalPrev) / totalPrev) * 100 : null,
      recibos_por_mes:      recibosPorMes,
      colegiaturas_por_mes: colegiaturasPorMes,
      recibos_por_semana:   recibosPorSemana,
      recibos_por_dia:      recibosPorDia,
      comparativo_anios:    comparativoAnios,
      asistencia_por_mes:   asistenciaPorMes,
      top_alumnos:          topAlumnosLista,
      top_diplomados:       topDiplomados,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al obtener datos financieros' });
  }
};

// ─── helpers de fechas ──────────────────────────────────────────────────────
function iso(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function addDays(d, n) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() + n);
  return x;
}
// Lunes 00:00 de la semana de `d`.
function startOfWeek(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = x.getDay(); // 0 dom, 1 lun ... 6 sab
  const diff = dow === 0 ? -6 : 1 - dow;
  x.setDate(x.getDate() + diff);
  return x;
}
// Construye un arreglo de N semanas terminando en la semana actual.
function buildSemanas(hoy, n, recibos) {
  const inicio = startOfWeek(addDays(hoy, -7 * (n - 1)));
  const semanas = [];
  for (let i = 0; i < n; i++) {
    const ini = addDays(inicio, i * 7);
    const fin = addDays(ini, 6);
    semanas.push({
      inicio_iso: iso(ini),
      fin_iso:    iso(fin),
      label:      `${String(ini.getDate()).padStart(2,'0')}/${String(ini.getMonth()+1).padStart(2,'0')}`,
      monto:      0,
      cantidad:   0,
    });
  }
  for (const r of recibos) {
    const f = new Date(`${String(r.fecha).slice(0,10)}T00:00:00`);
    if (Number.isNaN(f.getTime())) continue;
    // ubicar la semana
    for (const s of semanas) {
      if (iso(f) >= s.inicio_iso && iso(f) <= s.fin_iso) {
        s.monto    += parseFloat(r.total) || 0;
        s.cantidad += 1;
        break;
      }
    }
  }
  return semanas;
}
// Últimos N días (incluyendo hoy).
function buildDias(hoy, n, recibos) {
  const dias = [];
  for (let i = n - 1; i >= 0; i--) {
    const f = addDays(hoy, -i);
    dias.push({
      fecha_iso: iso(f),
      label:     `${String(f.getDate()).padStart(2,'0')}/${String(f.getMonth()+1).padStart(2,'0')}`,
      monto:     0,
      cantidad:  0,
    });
  }
  const mapa = new Map(dias.map(d => [d.fecha_iso, d]));
  for (const r of recibos) {
    const key = String(r.fecha).slice(0, 10);
    const d = mapa.get(key);
    if (d) {
      d.monto    += parseFloat(r.total) || 0;
      d.cantidad += 1;
    }
  }
  return dias;
}

module.exports = { getStats, getFinanzas };
