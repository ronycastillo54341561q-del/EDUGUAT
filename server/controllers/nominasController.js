const db = require('../config/db');
const { log } = require('../utils/bitacora');

// percepciones/deducciones se persisten como JSON: [{ concepto, monto }]
const parseLista = (raw) => {
  if (!raw) return [];
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(x => ({ concepto: String(x.concepto || '').trim(), monto: Number(x.monto) || 0 }))
      .filter(x => x.concepto || x.monto);
  } catch { return []; }
};

const sumar = (lista) => lista.reduce((s, x) => s + (Number(x.monto) || 0), 0);

/* ═══════════════════════ COLABORADORES ═══════════════════════ */
const listColaboradores = async (_req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT id, nombre, apellido, dpi, nit, puesto, telefono, email,
              fecha_ingreso, salario_base, banco, cuenta, estado, observaciones
         FROM colaboradores
        ORDER BY apellido, nombre`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al listar colaboradores' });
  }
};

const crearColaborador = async (req, res) => {
  const {
    nombre, apellido, dpi = '', nit = '', puesto = '', telefono = '', email = '',
    fecha_ingreso = null, salario_base = 0, banco = '', cuenta = '',
    estado = 'activo', observaciones = '',
  } = req.body;
  if (!nombre || !String(nombre).trim()) return res.status(400).json({ message: 'Nombre es requerido' });
  if (!apellido || !String(apellido).trim()) return res.status(400).json({ message: 'Apellido es requerido' });
  try {
    const [r] = await db.query(
      `INSERT INTO colaboradores
         (nombre, apellido, dpi, nit, puesto, telefono, email, fecha_ingreso,
          salario_base, banco, cuenta, estado, observaciones)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [String(nombre).trim(), String(apellido).trim(), dpi || null, nit || null,
       puesto || null, telefono || null, email || null, fecha_ingreso || null,
       Number(salario_base) || 0, banco || null, cuenta || null,
       estado === 'inactivo' ? 'inactivo' : 'activo', observaciones || null]
    );
    log(req, 'crear', 'Nóminas', `Colaborador: ${nombre} ${apellido}`);
    res.json({ ok: true, id: r.insertId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al crear colaborador' });
  }
};

const actualizarColaborador = async (req, res) => {
  const { id } = req.params;
  const {
    nombre, apellido, dpi = '', nit = '', puesto = '', telefono = '', email = '',
    fecha_ingreso = null, salario_base = 0, banco = '', cuenta = '',
    estado = 'activo', observaciones = '',
  } = req.body;
  if (!nombre || !String(nombre).trim()) return res.status(400).json({ message: 'Nombre es requerido' });
  if (!apellido || !String(apellido).trim()) return res.status(400).json({ message: 'Apellido es requerido' });
  try {
    await db.query(
      `UPDATE colaboradores SET
         nombre=?, apellido=?, dpi=?, nit=?, puesto=?, telefono=?, email=?,
         fecha_ingreso=?, salario_base=?, banco=?, cuenta=?, estado=?, observaciones=?
       WHERE id=?`,
      [String(nombre).trim(), String(apellido).trim(), dpi || null, nit || null,
       puesto || null, telefono || null, email || null, fecha_ingreso || null,
       Number(salario_base) || 0, banco || null, cuenta || null,
       estado === 'inactivo' ? 'inactivo' : 'activo', observaciones || null, id]
    );
    log(req, 'editar', 'Nóminas', `Colaborador ID ${id}: ${nombre} ${apellido}`);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al actualizar colaborador' });
  }
};

const eliminarColaborador = async (req, res) => {
  const { id } = req.params;
  try {
    await db.query('DELETE FROM colaboradores WHERE id=?', [id]);
    log(req, 'eliminar', 'Nóminas', `Colaborador ID ${id}`);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al eliminar colaborador' });
  }
};

/* ═══════════════════════ NÓMINAS ═══════════════════════ */
const listNominas = async (_req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT n.id, n.nombre, n.periodo_tipo, n.anio, n.mes, n.quincena,
              n.fecha_pago, n.estado, n.observaciones, n.created_at,
              COUNT(r.id) AS total_renglones,
              COALESCE(SUM(r.liquido), 0) AS total_liquido,
              COALESCE(SUM(r.pagado), 0) AS total_pagados
         FROM nominas n
         LEFT JOIN nomina_renglones r ON r.nomina_id = n.id
        GROUP BY n.id
        ORDER BY n.anio DESC, n.mes DESC, n.quincena DESC, n.id DESC`
    );
    res.json(rows.map(r => ({
      ...r,
      total_liquido: parseFloat(r.total_liquido),
      total_renglones: Number(r.total_renglones),
      total_pagados: Number(r.total_pagados),
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al listar nóminas' });
  }
};

const getNomina = async (req, res) => {
  const { id } = req.params;
  try {
    const [[nomina]] = await db.query('SELECT * FROM nominas WHERE id=?', [id]);
    if (!nomina) return res.status(404).json({ message: 'Nómina no encontrada' });
    const [renglones] = await db.query(
      `SELECT * FROM nomina_renglones WHERE nomina_id=? ORDER BY nombre`, [id]
    );
    res.json({
      ...nomina,
      renglones: renglones.map(r => ({
        ...r,
        percepciones: parseLista(r.percepciones),
        deducciones: parseLista(r.deducciones),
        total_percepciones: parseFloat(r.total_percepciones),
        total_deducciones: parseFloat(r.total_deducciones),
        liquido: parseFloat(r.liquido),
        pagado: !!r.pagado,
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al obtener nómina' });
  }
};

// Crea una nómina y autogenera un renglón por cada colaborador activo,
// con el salario base como percepción inicial.
const crearNomina = async (req, res) => {
  const {
    nombre, periodo_tipo = 'mensual', anio, mes, quincena = null,
    fecha_pago = null, observaciones = '',
  } = req.body;
  if (!nombre || !String(nombre).trim()) return res.status(400).json({ message: 'Nombre es requerido' });
  if (!anio || !mes) return res.status(400).json({ message: 'Año y mes son requeridos' });
  const tipo = periodo_tipo === 'quincenal' ? 'quincenal' : 'mensual';
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [r] = await conn.query(
      `INSERT INTO nominas (nombre, periodo_tipo, anio, mes, quincena, fecha_pago, observaciones)
       VALUES (?,?,?,?,?,?,?)`,
      [String(nombre).trim(), tipo, anio, mes, tipo === 'quincenal' ? (quincena || 1) : null,
       fecha_pago || null, observaciones || null]
    );
    const nominaId = r.insertId;

    const [colabs] = await conn.query(
      `SELECT id, nombre, apellido, puesto, salario_base FROM colaboradores WHERE estado='activo' ORDER BY apellido, nombre`
    );
    for (const c of colabs) {
      const percepciones = [{ concepto: 'Salario base', monto: Number(c.salario_base) || 0 }];
      const totalP = sumar(percepciones);
      await conn.query(
        `INSERT INTO nomina_renglones
           (nomina_id, colaborador_id, nombre, puesto, percepciones, deducciones,
            total_percepciones, total_deducciones, liquido)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [nominaId, c.id, `${c.nombre} ${c.apellido}`, c.puesto || null,
         JSON.stringify(percepciones), JSON.stringify([]), totalP, 0, totalP]
      );
    }
    await conn.commit();
    log(req, 'crear', 'Nóminas', `Nómina: ${nombre} (${colabs.length} colaboradores)`);
    res.json({ ok: true, id: nominaId });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ message: 'Error al crear nómina' });
  } finally {
    conn.release();
  }
};

const actualizarNomina = async (req, res) => {
  const { id } = req.params;
  const { nombre, fecha_pago = null, estado, observaciones = '' } = req.body;
  try {
    await db.query(
      `UPDATE nominas SET nombre=COALESCE(?,nombre), fecha_pago=?, estado=COALESCE(?,estado), observaciones=?
       WHERE id=?`,
      [nombre ? String(nombre).trim() : null, fecha_pago || null,
       estado === 'pagada' || estado === 'borrador' ? estado : null, observaciones || null, id]
    );
    log(req, 'editar', 'Nóminas', `Nómina ID ${id}`);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al actualizar nómina' });
  }
};

const eliminarNomina = async (req, res) => {
  const { id } = req.params;
  try {
    await db.query('DELETE FROM nomina_renglones WHERE nomina_id=?', [id]);
    await db.query('DELETE FROM nominas WHERE id=?', [id]);
    log(req, 'eliminar', 'Nóminas', `Nómina ID ${id}`);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al eliminar nómina' });
  }
};

// Actualiza un renglón (percepciones/deducciones/pago). Recalcula totales.
const actualizarRenglon = async (req, res) => {
  const { id, rid } = req.params;
  const {
    percepciones = [], deducciones = [], pagado, metodo_pago = '',
    fecha_pago = null, observacion = '',
  } = req.body;
  const perc = parseLista(percepciones);
  const ded  = parseLista(deducciones);
  const totalP = sumar(perc);
  const totalD = sumar(ded);
  const liquido = totalP - totalD;
  try {
    await db.query(
      `UPDATE nomina_renglones SET
         percepciones=?, deducciones=?, total_percepciones=?, total_deducciones=?,
         liquido=?, pagado=?, metodo_pago=?, fecha_pago=?, observacion=?
       WHERE id=? AND nomina_id=?`,
      [JSON.stringify(perc), JSON.stringify(ded), totalP, totalD, liquido,
       pagado ? 1 : 0, metodo_pago || null, fecha_pago || null, observacion || null, rid, id]
    );
    res.json({ ok: true, total_percepciones: totalP, total_deducciones: totalD, liquido });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al actualizar renglón' });
  }
};

// Marca toda la nómina como pagada (estado + todos los renglones pagado=1).
const marcarPagada = async (req, res) => {
  const { id } = req.params;
  const { fecha_pago = null, metodo_pago = '' } = req.body;
  try {
    await db.query(
      `UPDATE nomina_renglones SET pagado=1, fecha_pago=COALESCE(fecha_pago, ?), metodo_pago=COALESCE(NULLIF(metodo_pago,''), ?)
       WHERE nomina_id=?`,
      [fecha_pago || null, metodo_pago || null, id]
    );
    await db.query(
      `UPDATE nominas SET estado='pagada', fecha_pago=COALESCE(fecha_pago, ?) WHERE id=?`,
      [fecha_pago || null, id]
    );
    log(req, 'editar', 'Nóminas', `Nómina ID ${id} marcada como pagada`);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al marcar nómina pagada' });
  }
};

module.exports = {
  listColaboradores, crearColaborador, actualizarColaborador, eliminarColaborador,
  listNominas, getNomina, crearNomina, actualizarNomina, eliminarNomina,
  actualizarRenglon, marcarPagada,
};
