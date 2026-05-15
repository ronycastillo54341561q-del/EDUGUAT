const db = require('../config/db');
const { log } = require('../utils/bitacora');

const hoyLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};

const fmt = (r) => ({
  ...r,
  fecha: r.fecha ? String(r.fecha).slice(0, 10) : null,
  total: r.total != null ? parseFloat(r.total) : null,
});

const getPapeleria = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT p.id, p.no_recibo, p.alumno_id,
             COALESCE(CONCAT(a.nombre, ' ', a.apellido), p.alumno_texto) AS alumno_nombre,
             a.clave, a.codigo_estudiante,
             p.descripcion, p.fecha, p.total, p.observaciones, p.created_at,
             p.anulado, p.anulado_at, p.no_deposito
      FROM papeleria p
      LEFT JOIN alumnos a ON p.alumno_id = a.id
      ORDER BY
        -- Alfanuméricos primero, numéricos después (para que el correlativo
        -- numérico más alto quede en la última página, que es la que se
        -- abre por defecto al entrar al módulo).
        CASE WHEN p.no_recibo REGEXP '^[0-9]+$' THEN 1 ELSE 0 END ASC,
        CASE WHEN p.no_recibo REGEXP '^[0-9]+$' THEN NULL ELSE p.no_recibo END ASC,
        CASE WHEN p.no_recibo REGEXP '^[0-9]+$' THEN CAST(p.no_recibo AS UNSIGNED) ELSE NULL END ASC,
        p.id ASC
    `);
    res.json(rows.map(fmt));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al obtener papelería' });
  }
};

const crearPapeleria = async (req, res) => {
  const { no_recibo, alumno_id, descripcion, fecha, total, observaciones, no_deposito } = req.body;
  try {
    const [result] = await db.query(
      `INSERT INTO papeleria (no_recibo, alumno_id, descripcion, fecha, total, observaciones, no_deposito)
       VALUES (?,?,?,?,?,?,?)`,
      [no_recibo || null, alumno_id || null, descripcion || null,
       fecha || null, total || null, observaciones || null, no_deposito || null]
    );
    const [rows] = await db.query(`
      SELECT p.id, p.no_recibo, p.alumno_id,
             COALESCE(CONCAT(a.nombre, ' ', a.apellido), p.alumno_texto) AS alumno_nombre,
             a.clave, a.codigo_estudiante,
             p.descripcion, p.fecha, p.total, p.observaciones, p.created_at,
             p.anulado, p.anulado_at, p.no_deposito
      FROM papeleria p
      LEFT JOIN alumnos a ON p.alumno_id = a.id
      WHERE p.id = ?
    `, [result.insertId]);
    log(req, 'crear', 'Papelería', `Papelería creada: ${no_recibo || 'sin no.'} alumno_id=${alumno_id}`);
    res.json(fmt(rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al crear registro de papelería' });
  }
};

const actualizarPapeleria = async (req, res) => {
  const { id } = req.params;
  const { no_recibo, alumno_id, descripcion, fecha, total, observaciones, no_deposito } = req.body;
  try {
    await db.query(
      `UPDATE papeleria SET no_recibo=?, alumno_id=?, descripcion=?, fecha=?, total=?, observaciones=?, no_deposito=?
       WHERE id=?`,
      [no_recibo || null, alumno_id || null, descripcion || null,
       fecha || null, total || null, observaciones || null, no_deposito || null, id]
    );
    log(req, 'editar', 'Papelería', `Papelería actualizada ID ${id}`);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al actualizar papelería' });
  }
};

const eliminarPapeleria = async (req, res) => {
  const { id } = req.params;
  try {
    await db.query('DELETE FROM papeleria WHERE id=?', [id]);
    log(req, 'eliminar', 'Papelería', `Papelería eliminada ID ${id}`);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al eliminar registro de papelería' });
  }
};

// ─── POST /:id/anular ────────────────────────────────────────────────────────
// Solo se permite anular si la fecha del recibo es HOY. Se prefija "ANULADO"
// en `descripcion` y `observaciones`. Papelería no toca mensualidades.
const anularPapeleria = async (req, res) => {
  const { id } = req.params;
  try {
    const [rows] = await db.query(
      'SELECT id, no_recibo, descripcion, fecha, observaciones, anulado FROM papeleria WHERE id = ?',
      [id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Registro no encontrado' });
    const r = rows[0];

    if (r.anulado) return res.status(400).json({ message: 'El recibo ya está anulado' });

    const hoy = hoyLocal();
    const fechaRecibo = r.fecha ? String(r.fecha).slice(0, 10) : null;
    if (fechaRecibo !== hoy) {
      return res.status(400).json({
        message: `Solo se pueden anular recibos del día de hoy (${hoy}). Este recibo es del ${fechaRecibo || '—'}.`,
      });
    }

    const prefijo = 'ANULADO';
    const nuevasObs = (r.observaciones || '').toString().trim().toUpperCase().startsWith(prefijo)
      ? r.observaciones
      : `${prefijo}${r.observaciones ? ' — ' + r.observaciones : ''}`;
    const nuevaDesc = (r.descripcion || '').toString().trim().toUpperCase().startsWith(prefijo)
      ? r.descripcion
      : `${prefijo}${r.descripcion ? ' — ' + r.descripcion : ''}`;

    await db.query(
      `UPDATE papeleria
          SET anulado = 1, anulado_at = NOW(), observaciones = ?, descripcion = ?
        WHERE id = ?`,
      [nuevasObs, nuevaDesc, id]
    );

    log(req, 'anular', 'Papelería', `Recibo papelería ID ${id} (no ${r.no_recibo || '—'}) anulado`);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al anular recibo de papelería' });
  }
};

module.exports = { getPapeleria, crearPapeleria, actualizarPapeleria, eliminarPapeleria, anularPapeleria };
