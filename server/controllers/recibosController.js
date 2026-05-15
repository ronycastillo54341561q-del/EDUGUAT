const db = require('../config/db');
const { log } = require('../utils/bitacora');
const { subirRecibo, isRecibosConfigured } = require('../utils/googleDrive');

// Fecha local del servidor en formato YYYY-MM-DD. `toISOString()` da UTC,
// que en zonas como Guatemala (UTC-6) avanza al día siguiente después de
// las 6pm local — usar componentes locales evita ese off-by-one.
const hoyLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};

const fmt = (r) => ({
  ...r,
  fecha: r.fecha ? String(r.fecha).slice(0, 10) : null,
  total: r.total != null ? parseFloat(r.total) : null,
});

const getRecibos = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT r.id, r.no_recibo, r.alumno_id,
             COALESCE(CONCAT(a.nombre, ' ', a.apellido), r.alumno_texto) AS alumno_nombre,
             a.clave, a.codigo_estudiante,
             r.meses, r.fecha, r.total, r.observaciones, r.created_at,
             r.anulado, r.anulado_at, r.no_deposito
      FROM recibos r
      LEFT JOIN alumnos a ON r.alumno_id = a.id
      ORDER BY
        -- Numéricos primero (1, 2, 3, ..., 700) ordenados por valor; los
        -- alfanuméricos (ej. "143-195") y los sin número quedan al final.
        CASE WHEN r.no_recibo REGEXP '^[0-9]+$' THEN 0 ELSE 1 END ASC,
        CASE WHEN r.no_recibo REGEXP '^[0-9]+$' THEN CAST(r.no_recibo AS UNSIGNED) ELSE NULL END ASC,
        CASE WHEN r.no_recibo REGEXP '^[0-9]+$' THEN NULL ELSE r.no_recibo END ASC,
        r.id ASC
    `);
    res.json(rows.map(fmt));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al obtener recibos' });
  }
};

const crearRecibo = async (req, res) => {
  const { no_recibo, alumno_id, meses, fecha, total, observaciones, no_deposito } = req.body;
  try {
    const [result] = await db.query(
      `INSERT INTO recibos (no_recibo, alumno_id, meses, fecha, total, observaciones, no_deposito)
       VALUES (?,?,?,?,?,?,?)`,
      [no_recibo || null, alumno_id || null, meses || null,
       fecha || null, total || null, observaciones || null, no_deposito || null]
    );
    const [rows] = await db.query(`
      SELECT r.id, r.no_recibo, r.alumno_id,
             COALESCE(CONCAT(a.nombre, ' ', a.apellido), r.alumno_texto) AS alumno_nombre,
             a.clave, a.codigo_estudiante,
             r.meses, r.fecha, r.total, r.observaciones, r.created_at
      FROM recibos r
      LEFT JOIN alumnos a ON r.alumno_id = a.id
      WHERE r.id = ?
    `, [result.insertId]);
    log(req, 'crear', 'Recibos', `Recibo creado: ${no_recibo || 'sin no.'} alumno_id=${alumno_id}`);
    res.json(fmt(rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al crear recibo' });
  }
};

const actualizarRecibo = async (req, res) => {
  const { id } = req.params;
  const { no_recibo, alumno_id, meses, fecha, total, observaciones, no_deposito } = req.body;
  try {
    await db.query(
      `UPDATE recibos SET no_recibo=?, alumno_id=?, meses=?, fecha=?, total=?, observaciones=?, no_deposito=?
       WHERE id=?`,
      [no_recibo || null, alumno_id || null, meses || null,
       fecha || null, total || null, observaciones || null, no_deposito || null, id]
    );
    log(req, 'editar', 'Recibos', `Recibo actualizado ID ${id}: ${no_recibo || ''}`);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al actualizar recibo' });
  }
};

const eliminarRecibo = async (req, res) => {
  const { id } = req.params;
  try {
    await db.query('DELETE FROM recibos WHERE id=?', [id]);
    log(req, 'eliminar', 'Recibos', `Recibo eliminado ID ${id}`);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al eliminar recibo' });
  }
};

// ─── POST /:id/anular ────────────────────────────────────────────────────────
// Reglas:
//  - Solo se puede anular si la fecha del recibo es HOY (zona del servidor).
//  - Si el recibo está vinculado a mensualidades (no_recibo presente en
//    la tabla `mensualidades`) se "limpian" esas mensualidades para que
//    vuelvan a quedar pendientes (caso colegiatura).
//  - Si no tiene mensualidades vinculadas (Otros Pagos / texto libre /
//    importado), solo se marca como anulado y se conserva el registro.
//  - En ambos casos se prefija "ANULADO" en `meses` y `observaciones`.
const anularRecibo = async (req, res) => {
  const { id } = req.params;
  try {
    const [rows] = await db.query(
      'SELECT id, no_recibo, alumno_id, meses, fecha, total, observaciones, anulado FROM recibos WHERE id = ?',
      [id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Recibo no encontrado' });
    const r = rows[0];

    if (r.anulado) return res.status(400).json({ message: 'El recibo ya está anulado' });

    const hoy = hoyLocal();
    const fechaRecibo = r.fecha ? String(r.fecha).slice(0, 10) : null;
    if (fechaRecibo !== hoy) {
      return res.status(400).json({
        message: `Solo se pueden anular recibos del día de hoy (${hoy}). Este recibo es del ${fechaRecibo || '—'}.`,
      });
    }

    // Si está vinculado a mensualidades, las restauramos a pendientes.
    let mensualidadesAfectadas = 0;
    if (r.no_recibo) {
      const [mens] = await db.query(
        'SELECT id, mes, anio FROM mensualidades WHERE no_recibo = ? AND alumno_id = ?',
        [String(r.no_recibo), r.alumno_id]
      );
      mensualidadesAfectadas = mens.length;
      if (mensualidadesAfectadas > 0) {
        await db.query(
          `UPDATE mensualidades
              SET pagado = 0, monto_abonado = 0, no_recibo = NULL, fecha_pago = NULL
            WHERE no_recibo = ? AND alumno_id = ?`,
          [String(r.no_recibo), r.alumno_id]
        );
      }
    }

    const prefijo = 'ANULADO';
    const nuevasObs = (r.observaciones || '').toString().trim().toUpperCase().startsWith(prefijo)
      ? r.observaciones
      : `${prefijo}${r.observaciones ? ' — ' + r.observaciones : ''}`;
    const nuevosMeses = (r.meses || '').toString().trim().toUpperCase().startsWith(prefijo)
      ? r.meses
      : `${prefijo}${r.meses ? ' — ' + r.meses : ''}`;

    await db.query(
      `UPDATE recibos
          SET anulado = 1, anulado_at = NOW(), observaciones = ?, meses = ?
        WHERE id = ?`,
      [nuevasObs, nuevosMeses, id]
    );

    log(req, 'anular', 'Recibos',
      `Recibo ID ${id} (no ${r.no_recibo || '—'}) anulado. ${mensualidadesAfectadas} mensualidad(es) restauradas.`);

    res.json({
      ok: true,
      mensualidades_restauradas: mensualidadesAfectadas,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al anular recibo' });
  }
};

// Sube un recibo PDF (generado en el cliente) a la carpeta de Drive
// configurada en GOOGLE_DRIVE_RECIBOS_FOLDER_ID. El cliente envía el
// PDF como base64. Si Drive no está configurado se devuelve un 503.
const subirReciboDrive = async (req, res) => {
  const { pdf_base64, filename, no_recibo } = req.body || {};
  if (!pdf_base64 || !filename) {
    return res.status(400).json({ message: 'pdf_base64 y filename son requeridos' });
  }
  if (!isRecibosConfigured()) {
    return res.status(503).json({
      message: 'Google Drive no está configurado para subir recibos. Falta GOOGLE_DRIVE_RECIBOS_FOLDER_ID en el .env del servidor.',
    });
  }
  try {
    const safeName = String(filename).replace(/[\\/:*?"<>|]/g, '_');
    const result = await subirRecibo(pdf_base64, safeName);
    log(req, 'subir', 'Recibos',
      `Recibo ${no_recibo || ''} subido a Drive (${safeName}).`);
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('subirReciboDrive:', err);
    res.status(500).json({ message: err.message || 'Error al subir el recibo a Drive' });
  }
};

// ─── POST /limpiar-duplicados ────────────────────────────────────────────────
// Elimina recibos duplicados que comparten `no_recibo` (típicamente generados
// cuando se corrieron las importaciones de "Pagos colegiatura" y "Pagos
// mensualidades" sobre los mismos números).  Para cada grupo:
//   - Conserva el recibo con el id MÁS BAJO (suele ser el importado primero,
//     con los datos "literales": fecha real, total real, alumno_texto).
//   - Si el conservado no tiene alumno_id pero un duplicado sí, copia ese
//     alumno_id al conservado antes de borrar los duplicados (así no se
//     pierde el vínculo con la ficha del alumno).
//   - Borra el resto de duplicados del grupo.
// Devuelve un resumen con cuántos grupos y cuántos recibos se borraron.
const limpiarDuplicadosRecibos = async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // 1) Detectar grupos con duplicados (mismo no_recibo no nulo).
    const [grupos] = await conn.query(`
      SELECT no_recibo,
             MIN(id) AS keep_id,
             COUNT(*) AS cnt,
             MAX(alumno_id) AS algun_alumno
        FROM recibos
       WHERE no_recibo IS NOT NULL AND TRIM(no_recibo) <> ''
       GROUP BY no_recibo
      HAVING COUNT(*) > 1
    `);

    let gruposLimpiados = 0;
    let recibosBorrados = 0;
    let alumnosVinculados = 0;

    for (const g of grupos) {
      // 2) Si el recibo a conservar no tiene alumno_id pero algún duplicado
      //    sí, copiamos ese alumno_id al conservado.
      if (g.algun_alumno) {
        const [upd] = await conn.query(
          `UPDATE recibos SET alumno_id = ?
            WHERE id = ? AND (alumno_id IS NULL)`,
          [g.algun_alumno, g.keep_id]
        );
        if (upd?.affectedRows) alumnosVinculados++;
      }

      // 3) Borrar todos los duplicados (menos el que conservamos).
      const [del] = await conn.query(
        `DELETE FROM recibos
          WHERE no_recibo = ? AND id <> ?`,
        [g.no_recibo, g.keep_id]
      );
      recibosBorrados += del?.affectedRows || 0;
      gruposLimpiados++;
    }

    await conn.commit();
    log(req, 'limpiar', 'Recibos',
      `Limpieza de duplicados: ${gruposLimpiados} grupos, ${recibosBorrados} recibos borrados, ${alumnosVinculados} re-vinculados a alumno`);
    res.json({
      ok: true,
      grupos: gruposLimpiados,
      borrados: recibosBorrados,
      vinculados_alumno: alumnosVinculados,
    });
  } catch (err) {
    try { await conn.rollback(); } catch (_) {}
    console.error('limpiarDuplicadosRecibos:', err);
    res.status(500).json({ message: 'Error al limpiar duplicados' });
  } finally {
    conn.release();
  }
};

module.exports = { getRecibos, crearRecibo, actualizarRecibo, eliminarRecibo, anularRecibo, subirReciboDrive, limpiarDuplicadosRecibos };
