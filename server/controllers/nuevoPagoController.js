const db = require('../config/db');
const { log } = require('../utils/bitacora');
const { cargarReglasAnio, resolverParaAlumno } = require('../utils/configPagosResolver');

const MESES_ORD = ['enero','febrero','marzo','abril','mayo','junio',
                   'julio','agosto','septiembre','octubre','noviembre','diciembre'];

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// Asegura registros de mensualidades del año para un alumno.
// Si hay configuración aplica solo a los meses esperados con el monto
// ajustado por multiplicador. Si no hay config: comportamiento legacy
// (12 meses con cuota normal).
const asegurarMensualidades = async (alumno, anio) => {
  const cuota = parseFloat(alumno.cuota_mensual) || 0;
  const reglas = await cargarReglasAnio(anio);
  const cfg = resolverParaAlumno(alumno, reglas);
  for (let i = 0; i < MESES_ORD.length; i++) {
    const mes = MESES_ORD[i];
    const m = i + 1;
    if (!cfg[m].esperado) continue;
    const monto = +(cuota * cfg[m].multiplicador).toFixed(2);
    await db.query(
      `INSERT IGNORE INTO mensualidades (alumno_id, mes, anio, monto, pagado, anulado, monto_abonado)
       VALUES (?, ?, ?, ?, 0, 0, 0)`,
      [alumno.id, mes, anio, monto]
    );
  }
};

// ─── GET /estado/:alumno_id ─────────────────────────────────────────────────
const getEstadoAlumno = async (req, res) => {
  const { alumno_id } = req.params;
  const anio = parseInt(req.query.anio) || new Date().getFullYear();
  try {
    const [alumnos] = await db.query(
      `SELECT id, clave, codigo_estudiante, nombre, apellido, cuota_mensual,
              diplomado, horario, laboratorio, dia_clases1, dia_clases2
         FROM alumnos WHERE id = ?`,
      [alumno_id]
    );
    if (!alumnos.length) return res.status(404).json({ message: 'Alumno no encontrado' });
    const alumno = alumnos[0];
    const cuota  = parseFloat(alumno.cuota_mensual) || 0;

    // Garantiza existencia (respetando configuración de pagos del año).
    await asegurarMensualidades(alumno, anio);

    const reglas = await cargarReglasAnio(anio);
    const cfg = resolverParaAlumno(alumno, reglas);

    const ph = MESES_ORD.map(() => '?').join(',');
    const [meses] = await db.query(
      `SELECT id, mes, anio, monto, pagado, anulado, no_recibo, fecha_pago, monto_abonado,
              acreditado, acreditado_msg
       FROM mensualidades
       WHERE alumno_id = ? AND anio = ?
       ORDER BY FIELD(mes, ${ph})`,
      [alumno_id, anio, ...MESES_ORD]
    );

    const mesesProcesados = meses.map(m => {
      const mesNum        = MESES_ORD.indexOf(m.mes) + 1;
      const cfgMes        = cfg[mesNum] || { esperado: true, multiplicador: 1 };
      const monto         = parseFloat(m.monto) || +(cuota * cfgMes.multiplicador).toFixed(2);
      const monto_abonado = parseFloat(m.monto_abonado) || 0;
      let estado    = 'pendiente';
      let pendiente = monto;

      if (m.acreditado) {
        estado = 'acreditado'; pendiente = 0;
      } else if (m.anulado) {
        estado = 'anulado'; pendiente = 0;
      } else if (m.pagado) {
        estado = 'pagado'; pendiente = 0;
      } else if (monto_abonado > 0) {
        estado    = 'abono';
        pendiente = Math.max(0, monto - monto_abonado);
      }

      return {
        id: m.id, mes: m.mes, anio: m.anio, monto,
        monto_abonado, estado, pendiente,
        no_recibo:  m.no_recibo  || '',
        fecha_pago: m.fecha_pago ? String(m.fecha_pago).slice(0, 10) : null,
        acreditado:     !!m.acreditado,
        acreditado_msg: m.acreditado_msg || '',
        esperado:       cfgMes.esperado,
        multiplicador:  cfgMes.multiplicador,
      };
    });

    res.json({ alumno, meses: mesesProcesados, anio });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al obtener estado del alumno' });
  }
};

// ─── Número correlativo de recibo (empieza en 100) ──────────────────────────
const getNextNoRecibo = async () => {
  const [rows] = await db.query(
    `SELECT COALESCE(MAX(CAST(no_recibo AS UNSIGNED)), 99) + 1 AS next_no
     FROM recibos WHERE no_recibo REGEXP '^[0-9]+$'`
  );
  return rows[0].next_no;
};

// ─── POST /procesar ──────────────────────────────────────────────────────────
const procesarPago = async (req, res) => {
  const { alumno_id, monto_total, descuento = 0, anio, fecha_pago } = req.body;
  if (!alumno_id || !monto_total || !fecha_pago)
    return res.status(400).json({ message: 'alumno_id, monto_total y fecha_pago son requeridos' });

  const anioEfectivo  = parseInt(anio) || new Date().getFullYear();
  const montoCobrado  = parseFloat(monto_total);  // lo que paga el alumno
  const montoDesc     = Math.max(0, parseFloat(descuento) || 0);
  const montoTotal    = montoCobrado + montoDesc;  // efectivo para distribuir
  if (montoCobrado <= 0)
    return res.status(400).json({ message: 'El monto debe ser mayor a cero' });

  try {
    const [alumnos] = await db.query(
      `SELECT id, clave, codigo_estudiante, nombre, apellido, cuota_mensual,
              diplomado, horario, laboratorio, dia_clases1, dia_clases2
         FROM alumnos WHERE id = ?`,
      [alumno_id]
    );
    if (!alumnos.length) return res.status(404).json({ message: 'Alumno no encontrado' });
    const alumno = alumnos[0];
    const cuota  = parseFloat(alumno.cuota_mensual) || 0;

    // Garantiza existencia respetando configuración de pagos.
    await asegurarMensualidades(alumno, anioEfectivo);

    const ph = MESES_ORD.map(() => '?').join(',');
    // Pendientes: pagado=0, anulado=0 y NO acreditado. El acreditado se
    // considera saldado y no entra al distribuir el pago.
    const [mesesPendientes] = await db.query(
      `SELECT id, mes, monto, pagado, anulado, no_recibo, monto_abonado, acreditado
       FROM mensualidades
       WHERE alumno_id = ? AND anio = ? AND pagado = 0 AND anulado = 0 AND acreditado = 0
       ORDER BY FIELD(mes, ${ph})`,
      [alumno_id, anioEfectivo, ...MESES_ORD]
    );

    if (!mesesPendientes.length)
      return res.status(400).json({ message: 'No hay meses pendientes de pago' });

    const noRecibo  = await getNextNoRecibo();
    let restante    = montoTotal;
    const actus     = [];
    const strParts  = [];

    for (const m of mesesPendientes) {
      if (restante <= 0) break;
      const monto         = parseFloat(m.monto) || cuota;
      const monto_abonado = parseFloat(m.monto_abonado) || 0;
      const deuda         = Math.max(0, monto - monto_abonado);
      if (deuda === 0) continue;

      if (restante >= deuda) {
        // Pago completo (puede estar completando un abono previo)
        actus.push({
          id: m.id, mes: m.mes, tipo: 'completo',
          nuevoAbonado: monto, pagado: 1,
        });
        strParts.push(cap(m.mes));
        restante -= deuda;
      } else {
        // Abono parcial
        const nuevoAbonado = parseFloat((monto_abonado + restante).toFixed(2));
        actus.push({
          id: m.id, mes: m.mes, tipo: 'abono',
          nuevoAbonado, pagado: 0,
        });
        strParts.push(`Abono Q${nuevoAbonado} ${cap(m.mes)}`);
        restante = 0;
      }
    }

    if (!actus.length)
      return res.status(400).json({ message: 'No se pudo distribuir el pago' });

    for (const u of actus) {
      await db.query(
        `UPDATE mensualidades
         SET no_recibo = ?, pagado = ?, fecha_pago = ?, monto_abonado = ?
         WHERE id = ?`,
        [String(noRecibo), u.pagado, fecha_pago, u.nuevoAbonado, u.id]
      );
    }

    const mesesStr     = strParts.join(' - ');
    const totalAplicado = parseFloat((montoTotal - Math.max(0, restante)).toFixed(2));

    // El total del recibo es lo que el alumno pagó (sin contar el descuento como cobro)
    const cobradoAplicado = parseFloat(
      Math.max(0, totalAplicado - montoDesc).toFixed(2)
    );

    await db.query(
      'INSERT INTO recibos (no_recibo, alumno_id, meses, fecha, total, descuento) VALUES (?,?,?,?,?,?)',
      [String(noRecibo), alumno_id, mesesStr, fecha_pago, cobradoAplicado, montoDesc]
    );

    log(req, 'crear', 'NuevoPago',
      `Recibo ${noRecibo} — ${alumno.clave}${alumno.codigo_estudiante ? ' ('+alumno.codigo_estudiante+')' : ''} ${alumno.nombre} ${alumno.apellido} — ${mesesStr} — Q${cobradoAplicado}${montoDesc > 0 ? ` (desc Q${montoDesc})` : ''}`);

    res.json({
      ok: true,
      no_recibo:    noRecibo,
      alumno,
      actualizaciones: actus,
      meses_str:    mesesStr,
      total:        cobradoAplicado,
      descuento:    montoDesc,
      fecha:        fecha_pago,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al procesar el pago' });
  }
};

// ─── POST /otros ─────────────────────────────────────────────────────────────
// Crea un recibo "suelto" (otros pagos) que NO se asocia a ninguna mensualidad
// ni se distribuye en `pagos`. Solo se inserta en la tabla `recibos`.
const procesarOtroPago = async (req, res) => {
  const { alumno_id, descripcion, total, fecha_pago } = req.body;
  if (!alumno_id || !total || !fecha_pago)
    return res.status(400).json({ message: 'alumno_id, total y fecha_pago son requeridos' });

  const monto = parseFloat(total);
  if (!(monto > 0))
    return res.status(400).json({ message: 'El total debe ser mayor a cero' });

  const desc = (descripcion || '').toString().trim();
  if (!desc)
    return res.status(400).json({ message: 'La descripción es requerida' });

  try {
    const [alumnos] = await db.query(
      'SELECT id, clave, codigo_estudiante, nombre, apellido FROM alumnos WHERE id = ?',
      [alumno_id]
    );
    if (!alumnos.length) return res.status(404).json({ message: 'Alumno no encontrado' });
    const alumno = alumnos[0];

    const noRecibo = await getNextNoRecibo();

    // Guardamos en la columna `meses` la descripción para que aparezca en el
    // detalle del recibo (mismo flujo de impresión que NuevoPago) y también
    // en `observaciones`. NO se toca la tabla `mensualidades`.
    await db.query(
      `INSERT INTO recibos (no_recibo, alumno_id, meses, fecha, total, observaciones)
       VALUES (?,?,?,?,?,?)`,
      [String(noRecibo), alumno_id, desc, fecha_pago, monto.toFixed(2), desc]
    );

    log(req, 'crear', 'OtrosPagos',
      `Recibo ${noRecibo} (otros) — ${alumno.clave}${alumno.codigo_estudiante ? ' ('+alumno.codigo_estudiante+')' : ''} ${alumno.nombre} ${alumno.apellido} — ${desc} — Q${monto.toFixed(2)}`);

    res.json({
      ok: true,
      no_recibo: noRecibo,
      alumno,
      meses_str: desc,
      total:     parseFloat(monto.toFixed(2)),
      descuento: 0,
      fecha:     fecha_pago,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al registrar el otro pago' });
  }
};

module.exports = { getEstadoAlumno, procesarPago, procesarOtroPago };
