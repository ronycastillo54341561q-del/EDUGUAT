const db = require('../config/db');
const { log } = require('../utils/bitacora');
const { cargarReglasAnio, resolverParaAlumno } = require('../utils/configPagosResolver');

// Mensualidades de un alumno
const getMensualidadesPorAlumno = async (req, res) => {
  const { alumno_id } = req.query;
  if (!alumno_id) return res.status(400).json({ message: 'alumno_id requerido' });
  try {
    const [rows] = await db.query(
      'SELECT * FROM mensualidades WHERE alumno_id = ? ORDER BY anio ASC, FIELD(mes, "enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre") ASC',
      [alumno_id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al obtener mensualidades' });
  }
};

// Resumen de todos los alumnos: cuántas cuotas han pagado en el año actual
const getResumenMensualidades = async (req, res) => {
  const anio = new Date().getFullYear();
  try {
    const [rows] = await db.query(`
      SELECT
        al.id, al.nombre, al.apellido, al.clave, al.codigo_estudiante, al.cuota_mensual,
        al.estado, al.horario, al.laboratorio, al.dia_clases1, al.dia_clases2,
        COUNT(CASE WHEN m.pagado = 1 AND m.anulado = 0 THEN 1 END) as cuotas_pagadas,
        COUNT(CASE WHEN m.pagado = 0 AND m.anulado = 0 THEN 1 END) as cuotas_pendientes,
        COUNT(CASE WHEN m.anulado = 1 THEN 1 END) as cuotas_anuladas,
        SUM(CASE WHEN m.pagado = 1 AND m.anulado = 0 THEN m.monto ELSE 0 END) as total_pagado
      FROM alumnos al
      LEFT JOIN mensualidades m ON al.id = m.alumno_id AND m.anio = ?
      GROUP BY al.id
      ORDER BY al.id ASC
    `, [anio]);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al obtener resumen de mensualidades' });
  }
};

// Marcar como pagada
const marcarPagada = async (req, res) => {
  const { no_recibo, fecha_pago } = req.body;
  try {
    await db.query(
      'UPDATE mensualidades SET pagado=1, anulado=0, no_recibo=?, fecha_pago=? WHERE id=?',
      [no_recibo || null, fecha_pago || null, req.params.id]
    );
    log(req, 'pago', 'Mensualidades', `Mensualidad ID ${req.params.id} marcada como pagada. Recibo: ${no_recibo || '-'}`);
    res.json({ message: 'Mensualidad marcada como pagada' });
  } catch (err) {
    res.status(500).json({ message: 'Error al marcar como pagada' });
  }
};

// Anular mensualidad
const anularMensualidad = async (req, res) => {
  try {
    await db.query(
      'UPDATE mensualidades SET anulado=1, pagado=0, no_recibo=NULL, fecha_pago=NULL WHERE id=?',
      [req.params.id]
    );
    log(req, 'anular', 'Mensualidades', `Mensualidad ID ${req.params.id} anulada`);
    res.json({ message: 'Mensualidad anulada' });
  } catch (err) {
    res.status(500).json({ message: 'Error al anular mensualidad' });
  }
};

// Aplicar descuento 100%
const aplicarDescuento = async (req, res) => {
  try {
    await db.query(
      'UPDATE mensualidades SET descuento_100=1, monto=0, pagado=1, anulado=0 WHERE id=?',
      [req.params.id]
    );
    log(req, 'descuento', 'Mensualidades', `Descuento 100% aplicado a mensualidad ID ${req.params.id}`);
    res.json({ message: 'Descuento 100% aplicado' });
  } catch (err) {
    res.status(500).json({ message: 'Error al aplicar descuento' });
  }
};

// Deshacer pago (volver a pendiente)
const deshacerPago = async (req, res) => {
  try {
    await db.query(
      'UPDATE mensualidades SET pagado=0, anulado=0, descuento_100=0, no_recibo=NULL, fecha_pago=NULL WHERE id=?',
      [req.params.id]
    );
    log(req, 'revertir', 'Mensualidades', `Pago revertido a pendiente: mensualidad ID ${req.params.id}`);
    res.json({ message: 'Pago revertido a pendiente' });
  } catch (err) {
    res.status(500).json({ message: 'Error al revertir pago' });
  }
};

const MESES_ORD = ['enero','febrero','marzo','abril','mayo','junio',
                   'julio','agosto','septiembre','octubre','noviembre','diciembre'];

const getMensualidadesGrid = async (req, res) => {
  const anio = parseInt(req.query.anio) || new Date().getFullYear();
  const estado = req.query.estado !== undefined ? req.query.estado : 'activo';
  const conds = [], params = [];
  if (estado !== '') { conds.push('al.estado=?'); params.push(estado); }
  if (req.query.horario)     { conds.push('al.horario=?');     params.push(req.query.horario); }
  if (req.query.laboratorio) { conds.push('al.laboratorio=?'); params.push(req.query.laboratorio); }
  if (req.query.dia)         { conds.push('(al.dia_clases1=? OR al.dia_clases2=?)'); params.push(req.query.dia, req.query.dia); }
  const where = conds.join(' AND ') || '1=1';
  try {
    const [alumnos] = await db.query(`
      SELECT al.id, al.clave, al.codigo_estudiante, al.nombre, al.apellido, al.cuota_mensual,
             al.estado, al.horario, al.laboratorio, al.dia_clases1, al.dia_clases2, al.diplomado
      FROM alumnos al WHERE ${where} ORDER BY al.id ASC
    `, params);
    if (!alumnos.length) return res.json([]);
    const ids = alumnos.map(a => a.id);
    const [mensualidades] = await db.query(
      `SELECT id, alumno_id, mes, no_recibo, pagado, monto, anulado, monto_abonado,
              acreditado, acreditado_msg
       FROM mensualidades WHERE anio=? AND alumno_id IN (${ids.map(() => '?').join(',')})`,
      [anio, ...ids]
    );
    const mesMap = {};
    for (const m of mensualidades) {
      if (!mesMap[m.alumno_id]) mesMap[m.alumno_id] = {};
      const mesNum = MESES_ORD.indexOf(m.mes) + 1;
      if (mesNum > 0) mesMap[m.alumno_id][mesNum] = {
        id: m.id, no_recibo: m.no_recibo || '',
        pagado: m.pagado, monto: m.monto,
        anulado: m.anulado,
        monto_abonado: parseFloat(m.monto_abonado) || 0,
        acreditado: !!m.acreditado,
        acreditado_msg: m.acreditado_msg || '',
      };
    }

    // Resolver configuración por año y enriquecer cada celda con
    // {esperado, multiplicador} para que la UI pueda pintar fuera-de-rango.
    const reglas = await cargarReglasAnio(anio);
    res.json(alumnos.map(a => {
      const cfg = resolverParaAlumno(a, reglas);
      const mesesOut = {};
      for (let m = 1; m <= 12; m++) {
        mesesOut[m] = {
          ...(mesMap[a.id]?.[m] || {
            id: null, no_recibo: '', pagado: 0, monto: a.cuota_mensual,
            anulado: 0, monto_abonado: 0, acreditado: false, acreditado_msg: '',
          }),
          esperado: cfg[m].esperado,
          multiplicador: cfg[m].multiplicador,
        };
      }
      return { ...a, meses: mesesOut };
    }));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al obtener grid de pagos' });
  }
};

// POST /:id/acreditar { mensaje } — marca un mes como gratis/acreditado.
const acreditarMes = async (req, res) => {
  const { id } = req.params;
  const mensaje = (req.body?.mensaje || 'Gratis').toString().trim().slice(0, 80);
  try {
    await db.query(
      `UPDATE mensualidades
          SET acreditado=1, acreditado_msg=?, pagado=1, monto_abonado=0,
              no_recibo=NULL, fecha_pago=NULL, anulado=0
        WHERE id=?`,
      [mensaje, id]
    );
    log(req, 'acreditar', 'Mensualidades', `Mensualidad ID ${id} acreditada (${mensaje})`);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al acreditar mes' });
  }
};

// DELETE /:id/acreditar — quita el acreditamiento y vuelve a pendiente.
const desacreditarMes = async (req, res) => {
  const { id } = req.params;
  try {
    await db.query(
      `UPDATE mensualidades
          SET acreditado=0, acreditado_msg=NULL, pagado=0, monto_abonado=0,
              no_recibo=NULL, fecha_pago=NULL
        WHERE id=?`,
      [id]
    );
    log(req, 'desacreditar', 'Mensualidades', `Mensualidad ID ${id} des-acreditada`);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al des-acreditar mes' });
  }
};

// POST /acreditar-mes-directo — acredita un mes por (alumno_id, anio, mes_num)
// creándolo si no existe (útil para meses fuera de rango también).
const acreditarMesPorAlumno = async (req, res) => {
  const { alumno_id, anio, mes_num, mensaje } = req.body;
  if (!alumno_id || !anio || !mes_num)
    return res.status(400).json({ message: 'alumno_id, anio y mes_num requeridos' });
  const mes = MESES_ORD[parseInt(mes_num) - 1];
  if (!mes) return res.status(400).json({ message: 'mes_num inválido' });
  const msg = (mensaje || 'Gratis').toString().trim().slice(0, 80);
  try {
    const [[al]] = await db.query('SELECT cuota_mensual FROM alumnos WHERE id=?', [alumno_id]);
    if (!al) return res.status(404).json({ message: 'Alumno no encontrado' });
    const cuota = parseFloat(al.cuota_mensual) || 0;
    const [[exists]] = await db.query(
      'SELECT id FROM mensualidades WHERE alumno_id=? AND anio=? AND mes=?',
      [alumno_id, anio, mes]
    );
    if (exists) {
      await db.query(
        `UPDATE mensualidades
            SET acreditado=1, acreditado_msg=?, pagado=1, monto_abonado=0,
                no_recibo=NULL, fecha_pago=NULL, anulado=0
          WHERE id=?`,
        [msg, exists.id]
      );
    } else {
      await db.query(
        `INSERT INTO mensualidades
           (alumno_id, mes, anio, monto, pagado, anulado, monto_abonado, acreditado, acreditado_msg)
         VALUES (?,?,?,?,1,0,0,1,?)`,
        [alumno_id, mes, anio, cuota, msg]
      );
    }
    log(req, 'acreditar', 'Mensualidades',
      `Acreditado alumno ${alumno_id} ${mes} ${anio} (${msg})`);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al acreditar mes' });
  }
};

const guardarMensualidadesGrid = async (req, res) => {
  const { anio, cambios } = req.body;
  if (!anio || !Array.isArray(cambios) || !cambios.length)
    return res.status(400).json({ message: 'Datos inválidos' });
  try {
    for (const c of cambios) {
      const mes = MESES_ORD[c.mes_num - 1];
      if (!mes) continue;
      const [rows] = await db.query(
        'SELECT id FROM mensualidades WHERE alumno_id=? AND anio=? AND mes=?',
        [c.alumno_id, anio, mes]
      );
      if (rows.length > 0) {
        // Si se borra el recibo: limpiar todo incluyendo abono
        // Si se escribe recibo: marcar pagado=1, preservar monto_abonado si ya existía
        if (c.no_recibo) {
          await db.query(
            `UPDATE mensualidades SET no_recibo=?, pagado=1
             WHERE alumno_id=? AND anio=? AND mes=?`,
            [c.no_recibo, c.alumno_id, anio, mes]
          );
        } else {
          await db.query(
            `UPDATE mensualidades SET no_recibo=NULL, pagado=0, monto_abonado=0
             WHERE alumno_id=? AND anio=? AND mes=?`,
            [c.alumno_id, anio, mes]
          );
        }
      } else if (c.no_recibo) {
        await db.query(
          `INSERT IGNORE INTO mensualidades (alumno_id, mes, anio, monto, pagado, no_recibo, monto_abonado)
           SELECT ?, ?, ?, COALESCE(cuota_mensual, 0), 1, ?, 0 FROM alumnos WHERE id = ?`,
          [c.alumno_id, mes, anio, c.no_recibo, c.alumno_id]
        );
      }
    }
    log(req, 'guardar', 'Mensualidades', `Grid mensualidades guardado: ${cambios.length} cambios año ${anio}`);
    res.json({ ok: true, total: cambios.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al guardar recibos' });
  }
};

// POST /api/mensualidades/abono-inicial
//   { anio, mes, monto, scope_tipo, scope_valor }
// Aplica un abono inicial (parcial) al mes indicado para todos los alumnos
// que coincidan con el filtro. Crea la fila de mensualidad si no existe y
// suma el monto a `monto_abonado` (sin marcar pagado).
const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const SCOPES = new Set(['global','diplomado','horario','laboratorio','dia','alumno']);

const abonoInicialBulk = async (req, res) => {
  const { anio, mes, monto, scope_tipo, scope_valor } = req.body || {};
  const a = parseInt(anio);
  const m = parseInt(mes);
  const mt = parseFloat(monto);
  if (!a || a < 2000 || a > 2100) return res.status(400).json({ message: 'anio inválido' });
  if (!m || m < 1 || m > 12)      return res.status(400).json({ message: 'mes inválido' });
  if (!(mt > 0))                  return res.status(400).json({ message: 'monto debe ser > 0' });
  if (!SCOPES.has(scope_tipo))    return res.status(400).json({ message: 'scope_tipo inválido' });
  if (scope_tipo !== 'global' && !scope_valor) {
    return res.status(400).json({ message: 'scope_valor requerido para este alcance' });
  }

  const where = ["a.estado = 'activo'"];
  const params = [];
  if (scope_tipo === 'diplomado')    { where.push('a.diplomado = ?');    params.push(scope_valor); }
  if (scope_tipo === 'horario')      { where.push('a.horario = ?');      params.push(scope_valor); }
  if (scope_tipo === 'laboratorio')  { where.push('a.laboratorio = ?');  params.push(scope_valor); }
  if (scope_tipo === 'dia')          { where.push('(a.dia_clases1 = ? OR a.dia_clases2 = ?)'); params.push(scope_valor, scope_valor); }
  if (scope_tipo === 'alumno')       { where.push('a.id = ?');           params.push(parseInt(scope_valor)); }

  const mesNombre = MESES[m - 1];

  try {
    const [alumnos] = await db.query(
      `SELECT a.id, a.cuota_mensual FROM alumnos a WHERE ${where.join(' AND ')}`,
      params
    );

    let aplicados = 0;
    for (const al of alumnos) {
      const cuota = parseFloat(al.cuota_mensual) || 0;
      // Inserta la fila si no existe (con monto = cuota mensual del alumno).
      await db.query(
        `INSERT IGNORE INTO mensualidades (alumno_id, mes, anio, monto, pagado, anulado, monto_abonado)
         VALUES (?,?,?,?,?,?,?)`,
        [al.id, mesNombre, a, cuota, 0, 0, 0]
      );
      // Suma el abono al monto_abonado existente.
      await db.query(
        `UPDATE mensualidades
            SET monto_abonado = LEAST(monto, COALESCE(monto_abonado,0) + ?)
          WHERE alumno_id = ? AND mes = ? AND anio = ?`,
        [mt, al.id, mesNombre, a]
      );
      aplicados++;
    }

    log(req, 'abono', 'Mensualidades',
      `Abono inicial bulk ${a}/${mesNombre} Q${mt} a ${aplicados} alumno(s) ` +
      `[${scope_tipo}${scope_valor ? '=' + scope_valor : ''}]`);
    res.json({ ok: true, aplicados });
  } catch (err) {
    console.error('abonoInicialBulk:', err);
    res.status(500).json({ message: 'Error al aplicar abono inicial' });
  }
};

module.exports = {
  getMensualidadesPorAlumno,
  getResumenMensualidades,
  marcarPagada,
  anularMensualidad,
  aplicarDescuento,
  deshacerPago,
  getMensualidadesGrid,
  guardarMensualidadesGrid,
  acreditarMes,
  desacreditarMes,
  acreditarMesPorAlumno,
  abonoInicialBulk,
};
