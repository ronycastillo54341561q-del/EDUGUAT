const db = require('../config/db');
const { log } = require('../utils/bitacora');

const MODULOS = { recibos: 'recibos', papeleria: 'papeleria' };

const fmtFecha = (d) => (d ? String(d).slice(0, 10) : null);

// Fecha local YYYY-MM-DD (toISOString es UTC, off-by-one en GT después de 6pm).
const hoyLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};

const fmtCierre = (c) => ({
  ...c,
  fecha:           fmtFecha(c.fecha),
  total_dia:       c.total_dia       != null ? parseFloat(c.total_dia)       : 0,
  total_gastos:    c.total_gastos    != null ? parseFloat(c.total_gastos)    : 0,
  total_depositar: c.total_depositar != null ? parseFloat(c.total_depositar) : 0,
});

// Suma de totales y último recibo del día para el módulo dado.
// Excluye recibos anulados — no deben sumarse al total a depositar.
const calcularDia = async (modulo, fecha) => {
  const tabla = MODULOS[modulo];
  const [[{ suma }]] = await db.query(
    `SELECT COALESCE(SUM(total),0) AS suma FROM ${tabla} WHERE fecha = ? AND anulado = 0`,
    [fecha]
  );
  // El "último recibo" sigue tomando el más reciente (anulado o no), porque
  // representa el último folio emitido del día, no el último cobrado.
  const [[ult]] = await db.query(
    `SELECT no_recibo FROM ${tabla} WHERE fecha = ? ORDER BY id DESC LIMIT 1`,
    [fecha]
  );
  return {
    total_dia: parseFloat(suma) || 0,
    ultimo_recibo: ult?.no_recibo || null,
  };
};

const cargarCierreCompleto = async (id) => {
  const [[c]] = await db.query(
    `SELECT * FROM cierres_diarios WHERE id = ?`, [id]
  );
  if (!c) return null;
  const [gastos] = await db.query(
    `SELECT id, descripcion, monto FROM cierre_gastos WHERE cierre_id = ? ORDER BY id`,
    [id]
  );
  return {
    ...fmtCierre(c),
    gastos: gastos.map(g => ({ ...g, monto: parseFloat(g.monto) || 0 })),
  };
};

// GET /cierres?modulo=recibos|papeleria
const listarCierres = async (req, res) => {
  const modulo = req.query.modulo;
  if (!MODULOS[modulo]) return res.status(400).json({ message: 'modulo inválido' });
  try {
    const [rows] = await db.query(
      `SELECT * FROM cierres_diarios WHERE modulo = ? ORDER BY fecha DESC, id DESC`,
      [modulo]
    );
    res.json(rows.map(fmtCierre));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al listar cierres' });
  }
};

// GET /cierres/hoy?modulo=...&fecha=YYYY-MM-DD (fecha opcional, default = hoy)
const obtenerCierreFecha = async (req, res) => {
  const modulo = req.query.modulo;
  const fecha = req.query.fecha || hoyLocal();
  if (!MODULOS[modulo]) return res.status(400).json({ message: 'modulo inválido' });
  try {
    const dia = await calcularDia(modulo, fecha);
    const [[existing]] = await db.query(
      `SELECT id FROM cierres_diarios WHERE modulo = ? AND fecha = ?`,
      [modulo, fecha]
    );
    let cierre = null;
    if (existing) cierre = await cargarCierreCompleto(existing.id);
    res.json({
      fecha,
      total_dia: dia.total_dia,
      ultimo_recibo: dia.ultimo_recibo,
      cierre,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al obtener cierre' });
  }
};

// GET /cierres/:id
const obtenerCierre = async (req, res) => {
  try {
    const c = await cargarCierreCompleto(req.params.id);
    if (!c) return res.status(404).json({ message: 'Cierre no encontrado' });
    res.json(c);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al obtener cierre' });
  }
};

// POST /cierres { modulo, fecha, cuenta_id, gastos:[{descripcion,monto}], observaciones }
const crearCierre = async (req, res) => {
  const { modulo, fecha, cuenta_id, gastos = [], observaciones = '' } = req.body;
  if (!MODULOS[modulo]) return res.status(400).json({ message: 'modulo inválido' });
  const f = fecha || hoyLocal();
  if (!cuenta_id) return res.status(400).json({ message: 'Cuenta de depósito requerida' });

  try {
    const [[dup]] = await db.query(
      `SELECT id FROM cierres_diarios WHERE modulo = ? AND fecha = ?`, [modulo, f]
    );
    if (dup) return res.status(400).json({ message: 'Ya existe un cierre para esta fecha y módulo' });

    const [[cuenta]] = await db.query(
      `SELECT id, numero_cuenta, nombre, tipo_cuenta FROM cat_cuentas_bancarias WHERE id = ? AND activo = 1`,
      [cuenta_id]
    );
    if (!cuenta) return res.status(400).json({ message: 'Cuenta no válida o inactiva' });
    const cuentaSnap = `${cuenta.tipo_cuenta} · ${cuenta.numero_cuenta} · ${cuenta.nombre}`;

    const dia = await calcularDia(modulo, f);
    const totalGastos = (gastos || []).reduce((s, g) => s + (parseFloat(g.monto) || 0), 0);
    const totalDepositar = dia.total_dia - totalGastos;

    const [r] = await db.query(
      `INSERT INTO cierres_diarios
         (modulo, fecha, total_dia, total_gastos, total_depositar,
          cuenta_id, cuenta_snapshot, ultimo_recibo, observaciones, estado,
          creado_por_id, creado_por_nombre)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [modulo, f, dia.total_dia, totalGastos, totalDepositar,
       cuenta.id, cuentaSnap, dia.ultimo_recibo, observaciones || null, 'pendiente',
       req.user?.id || null, req.user?.nombre || null]
    );

    for (const g of (gastos || [])) {
      const monto = parseFloat(g.monto) || 0;
      const desc = (g.descripcion || '').trim();
      if (!desc || monto <= 0) continue;
      await db.query(
        `INSERT INTO cierre_gastos (cierre_id, descripcion, monto) VALUES (?,?,?)`,
        [r.insertId, desc, monto]
      );
    }

    log(req, 'crear', 'Cierres',
        `Cierre ${modulo} ${f}: total Q${dia.total_dia.toFixed(2)} - gastos Q${totalGastos.toFixed(2)} = Q${totalDepositar.toFixed(2)} (${cuentaSnap})`);
    const cierre = await cargarCierreCompleto(r.insertId);
    res.json(cierre);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al crear cierre' });
  }
};

// PUT /cierres/:id (solo el día y solo si está pendiente)
const actualizarCierre = async (req, res) => {
  const { id } = req.params;
  const { cuenta_id, gastos = [], observaciones = '' } = req.body;
  if (!cuenta_id) return res.status(400).json({ message: 'Cuenta de depósito requerida' });
  try {
    const [[c]] = await db.query(`SELECT * FROM cierres_diarios WHERE id = ?`, [id]);
    if (!c) return res.status(404).json({ message: 'Cierre no encontrado' });
    if (c.estado !== 'pendiente')
      return res.status(400).json({ message: 'El cierre ya fue revisado y no puede editarse' });

    const [[cuenta]] = await db.query(
      `SELECT id, numero_cuenta, nombre, tipo_cuenta FROM cat_cuentas_bancarias WHERE id = ? AND activo = 1`,
      [cuenta_id]
    );
    if (!cuenta) return res.status(400).json({ message: 'Cuenta no válida o inactiva' });
    const cuentaSnap = `${cuenta.tipo_cuenta} · ${cuenta.numero_cuenta} · ${cuenta.nombre}`;

    const dia = await calcularDia(c.modulo, fmtFecha(c.fecha));
    const totalGastos = (gastos || []).reduce((s, g) => s + (parseFloat(g.monto) || 0), 0);
    const totalDepositar = dia.total_dia - totalGastos;

    await db.query(
      `UPDATE cierres_diarios SET
         total_dia=?, total_gastos=?, total_depositar=?,
         cuenta_id=?, cuenta_snapshot=?, ultimo_recibo=?, observaciones=?
       WHERE id=?`,
      [dia.total_dia, totalGastos, totalDepositar,
       cuenta.id, cuentaSnap, dia.ultimo_recibo, observaciones || null, id]
    );

    await db.query(`DELETE FROM cierre_gastos WHERE cierre_id = ?`, [id]);
    for (const g of (gastos || [])) {
      const monto = parseFloat(g.monto) || 0;
      const desc = (g.descripcion || '').trim();
      if (!desc || monto <= 0) continue;
      await db.query(
        `INSERT INTO cierre_gastos (cierre_id, descripcion, monto) VALUES (?,?,?)`,
        [id, desc, monto]
      );
    }

    log(req, 'editar', 'Cierres', `Cierre ID ${id}: total Q${dia.total_dia.toFixed(2)} - gastos Q${totalGastos.toFixed(2)} = Q${totalDepositar.toFixed(2)}`);
    const cierre = await cargarCierreCompleto(id);
    res.json(cierre);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al actualizar cierre' });
  }
};

// POST /cierres/:id/revisar (solo admin)
const revisarCierre = async (req, res) => {
  const { id } = req.params;
  try {
    const [[c]] = await db.query(`SELECT id, estado FROM cierres_diarios WHERE id = ?`, [id]);
    if (!c) return res.status(404).json({ message: 'Cierre no encontrado' });
    if (c.estado === 'revisado')
      return res.status(400).json({ message: 'El cierre ya está revisado' });

    await db.query(
      `UPDATE cierres_diarios SET estado='revisado', revisado_por_id=?, revisado_por_nombre=?, revisado_at=CURRENT_TIMESTAMP WHERE id=?`,
      [req.user?.id || null, req.user?.nombre || null, id]
    );
    log(req, 'revisar', 'Cierres', `Cierre ID ${id} marcado como revisado`);
    const cierre = await cargarCierreCompleto(id);
    res.json(cierre);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al marcar como revisado' });
  }
};

module.exports = {
  listarCierres,
  obtenerCierreFecha,
  obtenerCierre,
  crearCierre,
  actualizarCierre,
  revisarCierre,
};
