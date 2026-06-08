const db = require('../config/db');
const { log } = require('../utils/bitacora');

/* ─────────────── HORARIOS DE CLASE ─────────────── */
// Cada horario es { dia1, dia2?, hora_inicio, hora_fin }.
// La etiqueta combinada (ej. "lunes-martes 10:00 a 11:30") se compone
// en el cliente para que ediciones futuras del catálogo no afecten
// los registros snapshot guardados en cada alumno.

const fmtEtiqueta = (h) => {
  const dias = h.dia2 ? `${h.dia1}-${h.dia2}` : h.dia1;
  return `${dias} ${h.hora_inicio} a ${h.hora_fin}`;
};

const listHorarios = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT id, dia1, dia2, hora_inicio, hora_fin, activo
       FROM cat_horarios
       ORDER BY dia1, dia2, hora_inicio`
    );
    res.json(rows.map(r => ({ ...r, etiqueta: fmtEtiqueta(r) })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al listar horarios' });
  }
};

const crearHorario = async (req, res) => {
  const { dia1, dia2, hora_inicio, hora_fin, activo = 1 } = req.body;
  if (!dia1 || !hora_inicio || !hora_fin)
    return res.status(400).json({ message: 'dia1, hora_inicio y hora_fin son requeridos' });
  try {
    const [r] = await db.query(
      'INSERT INTO cat_horarios (dia1, dia2, hora_inicio, hora_fin, activo) VALUES (?,?,?,?,?)',
      [dia1, dia2 || null, hora_inicio, hora_fin, activo ? 1 : 0]
    );
    log(req, 'crear', 'Catálogos', `Horario: ${fmtEtiqueta({ dia1, dia2, hora_inicio, hora_fin })}`);
    res.json({ ok: true, id: r.insertId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al crear horario' });
  }
};

const actualizarHorario = async (req, res) => {
  const { id } = req.params;
  const { dia1, dia2, hora_inicio, hora_fin, activo } = req.body;
  if (!dia1 || !hora_inicio || !hora_fin)
    return res.status(400).json({ message: 'dia1, hora_inicio y hora_fin son requeridos' });
  try {
    await db.query(
      'UPDATE cat_horarios SET dia1=?, dia2=?, hora_inicio=?, hora_fin=?, activo=? WHERE id=?',
      [dia1, dia2 || null, hora_inicio, hora_fin, activo ? 1 : 0, id]
    );
    log(req, 'editar', 'Catálogos', `Horario ID ${id}: ${fmtEtiqueta({ dia1, dia2, hora_inicio, hora_fin })}`);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al actualizar horario' });
  }
};

const eliminarHorario = async (req, res) => {
  const { id } = req.params;
  try {
    await db.query('DELETE FROM cat_horarios WHERE id=?', [id]);
    log(req, 'eliminar', 'Catálogos', `Horario ID ${id}`);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al eliminar horario' });
  }
};

/* ─────────────── helpers genéricos para catálogos simples ─────────────── */
const factorySimple = (tabla, campo, modulo) => ({
  list: async (_req, res) => {
    try {
      const [rows] = await db.query(
        `SELECT id, ${campo}, activo FROM ${tabla} ORDER BY ${campo}`
      );
      res.json(rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: `Error al listar ${tabla}` });
    }
  },
  crear: async (req, res) => {
    const valor = req.body[campo];
    const activo = req.body.activo === undefined ? 1 : (req.body.activo ? 1 : 0);
    if (!valor) return res.status(400).json({ message: `${campo} es requerido` });
    try {
      const [r] = await db.query(`INSERT INTO ${tabla} (${campo}, activo) VALUES (?,?)`, [valor, activo]);
      log(req, 'crear', modulo, `${campo}: ${valor}`);
      res.json({ ok: true, id: r.insertId });
    } catch (err) {
      console.error(err);
      if (err.code === 'ER_DUP_ENTRY')
        return res.status(400).json({ message: 'Ya existe un registro con ese valor' });
      res.status(500).json({ message: `Error al crear ${tabla}` });
    }
  },
  actualizar: async (req, res) => {
    const { id } = req.params;
    const valor = req.body[campo];
    const activo = req.body.activo === undefined ? 1 : (req.body.activo ? 1 : 0);
    if (!valor) return res.status(400).json({ message: `${campo} es requerido` });
    try {
      await db.query(`UPDATE ${tabla} SET ${campo}=?, activo=? WHERE id=?`, [valor, activo, id]);
      log(req, 'editar', modulo, `ID ${id}: ${valor}`);
      res.json({ ok: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: `Error al actualizar ${tabla}` });
    }
  },
  eliminar: async (req, res) => {
    const { id } = req.params;
    try {
      await db.query(`DELETE FROM ${tabla} WHERE id=?`, [id]);
      log(req, 'eliminar', modulo, `ID ${id}`);
      res.json({ ok: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: `Error al eliminar ${tabla}` });
    }
  },
});

const labs   = factorySimple('cat_laboratorios',     'nombre', 'Catálogos');
const estabs = factorySimple('cat_establecimientos', 'nombre', 'Catálogos');
const grados   = factorySimple('cat_grados',    'nombre', 'Catálogos');
const secciones = factorySimple('cat_secciones', 'nombre', 'Catálogos');

/* ─────────────── PLANES DE DÍAS DE CLASE (instituciones) ─────────────── */
// Cada plan es { nombre, dias }.  `dias` se guarda como CSV ("lunes,martes").
// El alumno elige un plan al inscribirse y los días se copian (snapshot) a
// `alumnos.dias_clase`, de modo que editar el plan luego no altera registros.
const DIAS_VALIDOS = ['lunes','martes','miercoles','jueves','viernes','sabado','domingo'];

const limpiarDias = (raw) => {
  const arr = Array.isArray(raw) ? raw : String(raw || '').split(',');
  return arr
    .map(d => String(d).trim().toLowerCase())
    .filter(d => DIAS_VALIDOS.includes(d));
};

const listPlanes = async (_req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id, nombre, dias, activo FROM cat_planes_clase ORDER BY nombre'
    );
    res.json(rows.map(r => ({ ...r, dias: limpiarDias(r.dias) })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al listar planes' });
  }
};

const crearPlan = async (req, res) => {
  const { nombre, dias = [], activo = 1 } = req.body;
  const dlist = limpiarDias(dias);
  if (!nombre || !String(nombre).trim())
    return res.status(400).json({ message: 'Nombre es requerido' });
  if (dlist.length === 0)
    return res.status(400).json({ message: 'Selecciona al menos un día' });
  try {
    const [r] = await db.query(
      'INSERT INTO cat_planes_clase (nombre, dias, activo) VALUES (?,?,?)',
      [String(nombre).trim(), dlist.join(','), activo ? 1 : 0]
    );
    log(req, 'crear', 'Catálogos', `Plan de clases: ${nombre} (${dlist.join(', ')})`);
    res.json({ ok: true, id: r.insertId });
  } catch (err) {
    console.error(err);
    if (err.code === 'ER_DUP_ENTRY')
      return res.status(400).json({ message: 'Ya existe un plan con ese nombre' });
    res.status(500).json({ message: 'Error al crear plan' });
  }
};

const actualizarPlan = async (req, res) => {
  const { id } = req.params;
  const { nombre, dias = [], activo = 1 } = req.body;
  const dlist = limpiarDias(dias);
  if (!nombre || !String(nombre).trim())
    return res.status(400).json({ message: 'Nombre es requerido' });
  if (dlist.length === 0)
    return res.status(400).json({ message: 'Selecciona al menos un día' });
  try {
    await db.query(
      'UPDATE cat_planes_clase SET nombre=?, dias=?, activo=? WHERE id=?',
      [String(nombre).trim(), dlist.join(','), activo ? 1 : 0, id]
    );
    log(req, 'editar', 'Catálogos', `Plan de clases ID ${id}: ${nombre} (${dlist.join(', ')})`);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    if (err.code === 'ER_DUP_ENTRY')
      return res.status(400).json({ message: 'Ya existe un plan con ese nombre' });
    res.status(500).json({ message: 'Error al actualizar plan' });
  }
};

const eliminarPlan = async (req, res) => {
  const { id } = req.params;
  try {
    await db.query('DELETE FROM cat_planes_clase WHERE id=?', [id]);
    log(req, 'eliminar', 'Catálogos', `Plan de clases ID ${id}`);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al eliminar plan' });
  }
};

/* ─────────────── CURSOS POR GRADO (instituciones) ─────────────── */
// Cada curso pertenece a un grado (por nombre) y tiene maestro, días (CSV) y
// horario. Se usan para mostrar/filtrar la asistencia por curso en el reporte.
const fmtCurso = (c) => ({
  ...c,
  dias: limpiarDias(c.dias),
});

const listCursos = async (req, res) => {
  const grado = req.query.grado || '';
  try {
    const where = grado ? 'WHERE grado=?' : '';
    const params = grado ? [grado] : [];
    const [rows] = await db.query(
      `SELECT id, grado, nombre, maestro, dias, hora_inicio, hora_fin, activo
         FROM cat_cursos ${where} ORDER BY grado, nombre`,
      params
    );
    res.json(rows.map(fmtCurso));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al listar cursos' });
  }
};

const crearCurso = async (req, res) => {
  const { grado, nombre, maestro = '', dias = [], hora_inicio = '', hora_fin = '', activo = 1 } = req.body;
  if (!grado || !String(grado).trim()) return res.status(400).json({ message: 'Grado es requerido' });
  if (!nombre || !String(nombre).trim()) return res.status(400).json({ message: 'Nombre del curso es requerido' });
  try {
    const [r] = await db.query(
      `INSERT INTO cat_cursos (grado, nombre, maestro, dias, hora_inicio, hora_fin, activo)
       VALUES (?,?,?,?,?,?,?)`,
      [String(grado).trim(), String(nombre).trim(), maestro || null,
       limpiarDias(dias).join(','), hora_inicio || null, hora_fin || null, activo ? 1 : 0]
    );
    log(req, 'crear', 'Catálogos', `Curso: ${nombre} (${grado})`);
    res.json({ ok: true, id: r.insertId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al crear curso' });
  }
};

const actualizarCurso = async (req, res) => {
  const { id } = req.params;
  const { grado, nombre, maestro = '', dias = [], hora_inicio = '', hora_fin = '', activo = 1 } = req.body;
  if (!grado || !String(grado).trim()) return res.status(400).json({ message: 'Grado es requerido' });
  if (!nombre || !String(nombre).trim()) return res.status(400).json({ message: 'Nombre del curso es requerido' });
  try {
    await db.query(
      `UPDATE cat_cursos SET grado=?, nombre=?, maestro=?, dias=?, hora_inicio=?, hora_fin=?, activo=?
        WHERE id=?`,
      [String(grado).trim(), String(nombre).trim(), maestro || null,
       limpiarDias(dias).join(','), hora_inicio || null, hora_fin || null, activo ? 1 : 0, id]
    );
    log(req, 'editar', 'Catálogos', `Curso ID ${id}: ${nombre} (${grado})`);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al actualizar curso' });
  }
};

const eliminarCurso = async (req, res) => {
  const { id } = req.params;
  try {
    await db.query('DELETE FROM cat_cursos WHERE id=?', [id]);
    log(req, 'eliminar', 'Catálogos', `Curso ID ${id}`);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al eliminar curso' });
  }
};

/* ─────────────── CUOTAS (con monto + descripcion) ─────────────── */
const listCuotas = async (_req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id, monto, descripcion, activo FROM cat_cuotas ORDER BY monto'
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al listar cuotas' });
  }
};
const crearCuota = async (req, res) => {
  const { monto, descripcion = '', activo = 1 } = req.body;
  if (monto == null || isNaN(parseFloat(monto)))
    return res.status(400).json({ message: 'monto es requerido' });
  try {
    const [r] = await db.query(
      'INSERT INTO cat_cuotas (monto, descripcion, activo) VALUES (?,?,?)',
      [parseFloat(monto), descripcion, activo ? 1 : 0]
    );
    log(req, 'crear', 'Catálogos', `Cuota: Q${monto} (${descripcion || '—'})`);
    res.json({ ok: true, id: r.insertId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al crear cuota' });
  }
};
const actualizarCuota = async (req, res) => {
  const { id } = req.params;
  const { monto, descripcion = '', activo = 1 } = req.body;
  if (monto == null || isNaN(parseFloat(monto)))
    return res.status(400).json({ message: 'monto es requerido' });
  try {
    await db.query(
      'UPDATE cat_cuotas SET monto=?, descripcion=?, activo=? WHERE id=?',
      [parseFloat(monto), descripcion, activo ? 1 : 0, id]
    );
    log(req, 'editar', 'Catálogos', `Cuota ID ${id}: Q${monto}`);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al actualizar cuota' });
  }
};
const eliminarCuota = async (req, res) => {
  const { id } = req.params;
  try {
    await db.query('DELETE FROM cat_cuotas WHERE id=?', [id]);
    log(req, 'eliminar', 'Catálogos', `Cuota ID ${id}`);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al eliminar cuota' });
  }
};

/* ─────────────── CUENTAS BANCARIAS (solo admin crea/edita/elimina) ─────────────── */
const listCuentas = async (_req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id, numero_cuenta, nombre, tipo_cuenta, activo FROM cat_cuentas_bancarias ORDER BY nombre'
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al listar cuentas' });
  }
};

const crearCuenta = async (req, res) => {
  const { numero_cuenta, nombre, tipo_cuenta, activo = 1 } = req.body;
  if (!numero_cuenta || !nombre || !tipo_cuenta)
    return res.status(400).json({ message: 'numero_cuenta, nombre y tipo_cuenta son requeridos' });
  try {
    const [r] = await db.query(
      'INSERT INTO cat_cuentas_bancarias (numero_cuenta, nombre, tipo_cuenta, activo) VALUES (?,?,?,?)',
      [numero_cuenta, nombre, tipo_cuenta, activo ? 1 : 0]
    );
    log(req, 'crear', 'Catálogos', `Cuenta bancaria: ${tipo_cuenta} ${numero_cuenta} (${nombre})`);
    res.json({ ok: true, id: r.insertId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al crear cuenta' });
  }
};

const actualizarCuenta = async (req, res) => {
  const { id } = req.params;
  const { numero_cuenta, nombre, tipo_cuenta, activo = 1 } = req.body;
  if (!numero_cuenta || !nombre || !tipo_cuenta)
    return res.status(400).json({ message: 'numero_cuenta, nombre y tipo_cuenta son requeridos' });
  try {
    await db.query(
      'UPDATE cat_cuentas_bancarias SET numero_cuenta=?, nombre=?, tipo_cuenta=?, activo=? WHERE id=?',
      [numero_cuenta, nombre, tipo_cuenta, activo ? 1 : 0, id]
    );
    log(req, 'editar', 'Catálogos', `Cuenta bancaria ID ${id}: ${tipo_cuenta} ${numero_cuenta}`);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al actualizar cuenta' });
  }
};

const eliminarCuenta = async (req, res) => {
  const { id } = req.params;
  try {
    await db.query('DELETE FROM cat_cuentas_bancarias WHERE id=?', [id]);
    log(req, 'eliminar', 'Catálogos', `Cuenta bancaria ID ${id}`);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al eliminar cuenta' });
  }
};

/* ─────────────── Endpoint todo-en-uno para selects de Alumnos ─────────────── */
const getTodos = async (_req, res) => {
  try {
    const [horarios] = await db.query(
      `SELECT id, dia1, dia2, hora_inicio, hora_fin, activo
       FROM cat_horarios WHERE activo=1
       ORDER BY dia1, dia2, hora_inicio`
    );
    const [laboratorios]    = await db.query('SELECT id, nombre, activo FROM cat_laboratorios     WHERE activo=1 ORDER BY nombre');
    const [establecimientos] = await db.query('SELECT id, nombre, activo FROM cat_establecimientos WHERE activo=1 ORDER BY nombre');
    const [cuotas]          = await db.query('SELECT id, monto, descripcion, activo FROM cat_cuotas WHERE activo=1 ORDER BY monto');
    const [diplomados]      = await db.query('SELECT id, nombre FROM dip_diplomados WHERE activo=1 ORDER BY nombre');
    const [planes]          = await db.query('SELECT id, nombre, dias, activo FROM cat_planes_clase WHERE activo=1 ORDER BY nombre');
    const [grados]          = await db.query('SELECT id, nombre, activo FROM cat_grados      WHERE activo=1 ORDER BY nombre');
    const [secciones]       = await db.query('SELECT id, nombre, activo FROM cat_secciones   WHERE activo=1 ORDER BY nombre');
    res.json({
      horarios:        horarios.map(h => ({ ...h, etiqueta: fmtEtiqueta(h) })),
      laboratorios,
      establecimientos,
      cuotas,
      diplomados,
      planes:          planes.map(p => ({ ...p, dias: limpiarDias(p.dias) })),
      grados,
      secciones,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al obtener catálogos' });
  }
};

module.exports = {
  // todos
  getTodos,
  // horarios
  listHorarios, crearHorario, actualizarHorario, eliminarHorario,
  // laboratorios
  listLabs:        labs.list,
  crearLab:        labs.crear,
  actualizarLab:   labs.actualizar,
  eliminarLab:     labs.eliminar,
  // establecimientos
  listEstabs:      estabs.list,
  crearEstab:      estabs.crear,
  actualizarEstab: estabs.actualizar,
  eliminarEstab:   estabs.eliminar,
  // planes de días de clase (instituciones)
  listPlanes, crearPlan, actualizarPlan, eliminarPlan,
  // cursos por grado (instituciones)
  listCursos, crearCurso, actualizarCurso, eliminarCurso,
  // grados (instituciones)
  listGrados:      grados.list,
  crearGrado:      grados.crear,
  actualizarGrado: grados.actualizar,
  eliminarGrado:   grados.eliminar,
  // secciones (instituciones)
  listSecciones:      secciones.list,
  crearSeccion:       secciones.crear,
  actualizarSeccion:  secciones.actualizar,
  eliminarSeccion:    secciones.eliminar,
  // cuotas
  listCuotas, crearCuota, actualizarCuota, eliminarCuota,
  // cuentas bancarias
  listCuentas, crearCuenta, actualizarCuenta, eliminarCuenta,
};
