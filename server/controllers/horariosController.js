const db = require('../config/db');
const { log } = require('../utils/bitacora');

/* ═══════════════ FRANJAS HORARIAS (globales) ═══════════════ */
const listFranjas = async (_req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id, hora_inicio, hora_fin, etiqueta, orden FROM horario_franjas ORDER BY orden, hora_inicio'
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al listar franjas' });
  }
};

const crearFranja = async (req, res) => {
  const { hora_inicio, hora_fin, etiqueta = '', orden = 0 } = req.body;
  if (!hora_inicio || !hora_fin) return res.status(400).json({ message: 'Hora inicio y fin son requeridas' });
  try {
    const [r] = await db.query(
      'INSERT INTO horario_franjas (hora_inicio, hora_fin, etiqueta, orden) VALUES (?,?,?,?)',
      [hora_inicio, hora_fin, etiqueta || null, Number(orden) || 0]
    );
    log(req, 'crear', 'Horarios', `Franja ${hora_inicio}-${hora_fin}`);
    res.json({ ok: true, id: r.insertId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al crear franja' });
  }
};

const actualizarFranja = async (req, res) => {
  const { id } = req.params;
  const { hora_inicio, hora_fin, etiqueta = '', orden = 0 } = req.body;
  if (!hora_inicio || !hora_fin) return res.status(400).json({ message: 'Hora inicio y fin son requeridas' });
  try {
    await db.query(
      'UPDATE horario_franjas SET hora_inicio=?, hora_fin=?, etiqueta=?, orden=? WHERE id=?',
      [hora_inicio, hora_fin, etiqueta || null, Number(orden) || 0, id]
    );
    log(req, 'editar', 'Horarios', `Franja ID ${id}`);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al actualizar franja' });
  }
};

const eliminarFranja = async (req, res) => {
  const { id } = req.params;
  try {
    await db.query('DELETE FROM horario_franjas WHERE id=?', [id]);
    log(req, 'eliminar', 'Horarios', `Franja ID ${id}`);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al eliminar franja' });
  }
};

/* ═══════════════ CLASES (celdas de la parrilla) ═══════════════ */
const listClases = async (req, res) => {
  const grado   = req.query.grado || '';
  const seccion = req.query.seccion || '';
  try {
    const [rows] = await db.query(
      `SELECT id, grado, seccion, dia, hora_inicio, hora_fin, curso, maestro
         FROM horario_clases WHERE grado=? AND seccion=?`,
      [grado, seccion]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al listar horario' });
  }
};

// Ocupación de maestros (todas las asignaciones) — para detectar choques.
const ocupacion = async (_req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT grado, seccion, dia, hora_inicio, hora_fin, maestro
         FROM horario_clases
        WHERE maestro IS NOT NULL AND maestro<>''`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al obtener ocupación' });
  }
};

// Lista de nombres de maestros sugeridos (de cursos + colaboradores).
const maestros = async (_req, res) => {
  const set = new Set();
  try {
    const [c] = await db.query(`SELECT DISTINCT maestro FROM cat_cursos WHERE maestro IS NOT NULL AND maestro<>''`);
    for (const r of c) set.add(r.maestro.trim());
  } catch (_) { /* tabla puede no existir */ }
  try {
    const [c] = await db.query(`SELECT CONCAT(nombre,' ',apellido) AS n FROM colaboradores WHERE estado='activo'`);
    for (const r of c) set.add(r.n.trim());
  } catch (_) { /* nóminas puede no estar */ }
  res.json([...set].filter(Boolean).sort());
};

// Upsert/borrado de celda(s). Si `dias` (array) viene, aplica a varios días;
// si no, usa `dia`. curso vacío => borra la celda.
const guardarClase = async (req, res) => {
  const { grado, seccion = '', hora_inicio, hora_fin, curso = '', maestro = '' } = req.body;
  if (!grado || !hora_inicio || !hora_fin)
    return res.status(400).json({ message: 'grado, hora_inicio y hora_fin son requeridos' });
  const dias = Array.isArray(req.body.dias) && req.body.dias.length
    ? req.body.dias
    : (req.body.dia ? [req.body.dia] : []);
  if (!dias.length) return res.status(400).json({ message: 'Día requerido' });

  try {
    for (const dia of dias) {
      if (!String(curso).trim() && !String(maestro).trim()) {
        await db.query(
          'DELETE FROM horario_clases WHERE grado=? AND seccion=? AND dia=? AND hora_inicio=?',
          [grado, seccion, dia, hora_inicio]
        );
      } else {
        await db.query(
          `INSERT INTO horario_clases (grado, seccion, dia, hora_inicio, hora_fin, curso, maestro)
           VALUES (?,?,?,?,?,?,?)
           ON DUPLICATE KEY UPDATE hora_fin=VALUES(hora_fin), curso=VALUES(curso), maestro=VALUES(maestro)`,
          [grado, seccion, dia, hora_inicio, hora_fin, String(curso).trim() || null, String(maestro).trim() || null]
        );
      }
    }
    log(req, 'editar', 'Horarios', `Horario ${grado} ${seccion} ${hora_inicio} (${dias.join(',')})`);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al guardar horario' });
  }
};

module.exports = {
  listFranjas, crearFranja, actualizarFranja, eliminarFranja,
  listClases, ocupacion, maestros, guardarClase,
};
