// Constancias de inscripción.  Maneja:
//   - CRUD de plantillas reutilizables (cabecera, saludo, cuerpo, firma, …).
//   - Endpoint que devuelve los alumnos filtrados con todos los datos
//     que el frontend necesita para renderizar el PDF (jsPDF) sin tener
//     que hacer queries adicionales por cada constancia.

const db = require('../config/db');

/* ─── PLANTILLAS ─────────────────────────────────────────────── */

const listarPlantillas = async (_req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM constancia_plantillas ORDER BY activa DESC, nombre ASC'
    );
    res.json(rows);
  } catch (err) {
    console.error('listarPlantillas:', err);
    res.status(500).json({ message: 'Error al obtener plantillas' });
  }
};

const obtenerPlantilla = async (req, res) => {
  try {
    const [[row]] = await db.query(
      'SELECT * FROM constancia_plantillas WHERE id = ?',
      [req.params.id]
    );
    if (!row) return res.status(404).json({ message: 'Plantilla no encontrada' });
    res.json(row);
  } catch (err) {
    res.status(500).json({ message: 'Error al obtener plantilla' });
  }
};

const camposPermitidos = [
  'nombre','ubicacion','saludo','cuerpo','despedida',
  'firma_nombre','firma_cargo','mostrar_fecha','mostrar_firma',
  'mostrar_telefono','activa',
  'espacio_post_encabezado','espacio_post_fecha','espacio_post_saludo',
  'espacio_post_cuerpo','espacio_post_despedida',
];

const ESPACIOS = [
  'espacio_post_encabezado','espacio_post_fecha','espacio_post_saludo',
  'espacio_post_cuerpo','espacio_post_despedida',
];

const sanitizar = (body = {}) => {
  const out = {};
  for (const k of camposPermitidos) {
    if (k in body) out[k] = body[k];
  }
  for (const k of ['mostrar_fecha','mostrar_firma','mostrar_telefono','activa']) {
    if (k in out) out[k] = out[k] ? 1 : 0;
  }
  for (const k of ESPACIOS) {
    if (k in out) {
      const n = parseInt(out[k], 10);
      out[k] = Math.max(0, Math.min(20, isNaN(n) ? 0 : n));
    }
  }
  return out;
};

const crearPlantilla = async (req, res) => {
  const datos = sanitizar(req.body);
  if (!datos.nombre || !datos.cuerpo) {
    return res.status(400).json({ message: 'Nombre y cuerpo son requeridos' });
  }
  try {
    const cols = Object.keys(datos);
    const placeholders = cols.map(() => '?').join(',');
    const [r] = await db.query(
      `INSERT INTO constancia_plantillas (${cols.join(',')}) VALUES (${placeholders})`,
      cols.map(c => datos[c])
    );
    const [[row]] = await db.query('SELECT * FROM constancia_plantillas WHERE id = ?', [r.insertId]);
    res.status(201).json(row);
  } catch (err) {
    console.error('crearPlantilla:', err);
    res.status(500).json({ message: 'Error al guardar plantilla' });
  }
};

const actualizarPlantilla = async (req, res) => {
  const datos = sanitizar(req.body);
  if (!Object.keys(datos).length) return res.status(400).json({ message: 'Sin cambios' });
  try {
    const sets = Object.keys(datos).map(k => `${k} = ?`).join(', ');
    const args = Object.values(datos);
    args.push(req.params.id);
    await db.query(
      `UPDATE constancia_plantillas SET ${sets} WHERE id = ?`,
      args
    );
    const [[row]] = await db.query('SELECT * FROM constancia_plantillas WHERE id = ?', [req.params.id]);
    if (!row) return res.status(404).json({ message: 'Plantilla no encontrada' });
    res.json(row);
  } catch (err) {
    console.error('actualizarPlantilla:', err);
    res.status(500).json({ message: 'Error al actualizar' });
  }
};

const eliminarPlantilla = async (req, res) => {
  try {
    await db.query('DELETE FROM constancia_plantillas WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: 'Error al eliminar' });
  }
};

/* ─── ALUMNOS PARA CONSTANCIA ─────────────────────────────────── */

// Lista alumnos activos con campos relevantes para la constancia, con
// filtros opcionales.  Si se pasa `ids` (CSV) devuelve sólo esos.
const listarAlumnos = async (req, res) => {
  const {
    establecimiento, tac, horario, dia, diplomado, laboratorio, ids,
  } = req.query;

  const where = ['a.estado = "activo"'];
  const args  = [];

  if (ids) {
    const arr = String(ids).split(',').map(n => parseInt(n,10)).filter(Boolean);
    if (arr.length) {
      where.push(`a.id IN (${arr.map(()=>'?').join(',')})`);
      args.push(...arr);
    }
  }
  if (establecimiento) { where.push('a.establecimiento = ?'); args.push(establecimiento); }
  if (tac)             { where.push('a.tac = ?');             args.push(tac); }
  if (horario)         { where.push('a.horario = ?');         args.push(horario); }
  if (diplomado)       { where.push('a.diplomado = ?');       args.push(diplomado); }
  if (laboratorio)     { where.push('a.laboratorio = ?');     args.push(laboratorio); }
  if (dia) {
    where.push('(a.dia_clases1 = ? OR a.dia_clases2 = ?)');
    args.push(dia, dia);
  }

  try {
    const [rows] = await db.query(
      `SELECT id, clave, codigo_estudiante, nombre, apellido,
              fecha_inicio, fecha_nacimiento, encargado, telefono,
              diplomado, tac, asesor, direccion, establecimiento,
              dia_clases1, dia_clases2, horario, laboratorio, cuota_mensual
         FROM alumnos a
        WHERE ${where.join(' AND ')}
        ORDER BY apellido, nombre`,
      args
    );
    res.json(rows);
  } catch (err) {
    console.error('listarAlumnos constancia:', err);
    res.status(500).json({ message: 'Error al obtener alumnos' });
  }
};

// Devuelve los valores únicos disponibles para llenar los selects de
// filtros (establecimientos, tac, horarios, días, etc.)
const filtrosDisponibles = async (_req, res) => {
  try {
    const [estabs] = await db.query(`SELECT DISTINCT establecimiento AS v FROM alumnos WHERE estado="activo" AND establecimiento IS NOT NULL AND establecimiento <> '' ORDER BY v`);
    const [tacs]   = await db.query(`SELECT DISTINCT tac AS v FROM alumnos WHERE estado="activo" AND tac IS NOT NULL AND tac <> '' ORDER BY v`);
    const [hors]   = await db.query(`SELECT DISTINCT horario AS v FROM alumnos WHERE estado="activo" AND horario IS NOT NULL AND horario <> '' ORDER BY v`);
    const [dips]   = await db.query(`SELECT DISTINCT diplomado AS v FROM alumnos WHERE estado="activo" AND diplomado IS NOT NULL AND diplomado <> '' ORDER BY v`);
    const [labs]   = await db.query(`SELECT DISTINCT laboratorio AS v FROM alumnos WHERE estado="activo" AND laboratorio IS NOT NULL AND laboratorio <> '' ORDER BY v`);
    res.json({
      establecimientos: estabs.map(r => r.v),
      tacs:             tacs.map(r => r.v),
      horarios:         hors.map(r => r.v),
      diplomados:       dips.map(r => r.v),
      laboratorios:     labs.map(r => r.v),
    });
  } catch (err) {
    console.error('filtrosDisponibles constancia:', err);
    res.status(500).json({ message: 'Error al obtener filtros' });
  }
};

module.exports = {
  listarPlantillas, obtenerPlantilla, crearPlantilla,
  actualizarPlantilla, eliminarPlantilla,
  listarAlumnos, filtrosDisponibles,
};
