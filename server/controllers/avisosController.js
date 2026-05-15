const db = require('../config/db');
const { log } = require('../utils/bitacora');

const SCOPES = ['global', 'horario', 'laboratorio', 'diplomado', 'dia', 'alumno'];

const listarStaff = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT * FROM avisos
        WHERE expira_at IS NULL OR expira_at >= CURDATE()
        ORDER BY created_at DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error('avisos.listarStaff:', err);
    res.status(500).json({ message: 'Error al obtener avisos' });
  }
};

const crear = async (req, res) => {
  const {
    titulo, mensaje, scope,
    filtro_dia, filtro_horario, filtro_laboratorio,
    filtro_diplomado, filtro_alumno_id, expira_at,
  } = req.body;

  if (!titulo?.trim() || !mensaje?.trim()) {
    return res.status(400).json({ message: 'Título y mensaje son obligatorios' });
  }
  if (!SCOPES.includes(scope)) {
    return res.status(400).json({ message: 'Scope inválido' });
  }
  if (scope === 'horario' && !filtro_horario) {
    return res.status(400).json({ message: 'Falta el horario' });
  }
  if (scope === 'laboratorio' && !filtro_laboratorio) {
    return res.status(400).json({ message: 'Falta el laboratorio' });
  }
  if (scope === 'diplomado' && !filtro_diplomado) {
    return res.status(400).json({ message: 'Falta el diplomado' });
  }
  if (scope === 'dia' && !filtro_dia) {
    return res.status(400).json({ message: 'Falta el día' });
  }
  if (scope === 'alumno' && !filtro_alumno_id) {
    return res.status(400).json({ message: 'Falta el alumno' });
  }

  try {
    const [r] = await db.query(
      `INSERT INTO avisos
        (autor_id, autor_nombre, autor_rol, titulo, mensaje, scope,
         filtro_dia, filtro_horario, filtro_laboratorio, filtro_diplomado,
         filtro_alumno_id, expira_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        req.user.id, req.user.nombre, req.user.rol,
        titulo.trim(), mensaje.trim(), scope,
        scope === 'dia'         ? filtro_dia         : null,
        scope === 'horario'     ? filtro_horario     : null,
        scope === 'laboratorio' ? filtro_laboratorio : null,
        scope === 'diplomado'   ? filtro_diplomado   : null,
        scope === 'alumno'      ? filtro_alumno_id   : null,
        expira_at || null,
      ]
    );
    log(req, 'crear', 'Avisos', `Aviso "${titulo}" (scope: ${scope})`);
    res.status(201).json({ id: r.insertId, message: 'Aviso publicado' });
  } catch (err) {
    console.error('avisos.crear:', err);
    res.status(500).json({ message: 'Error al crear aviso' });
  }
};

const eliminar = async (req, res) => {
  const { id } = req.params;
  try {
    const [rows] = await db.query('SELECT autor_id, titulo FROM avisos WHERE id=?', [id]);
    if (!rows.length) return res.status(404).json({ message: 'Aviso no encontrado' });
    const aviso = rows[0];
    // Sólo el autor o un admin puede borrar
    if (req.user.rol !== 'admin' && aviso.autor_id !== req.user.id) {
      return res.status(403).json({ message: 'Sólo el autor o un admin puede eliminar este aviso' });
    }
    await db.query('DELETE FROM avisos WHERE id=?', [id]);
    log(req, 'eliminar', 'Avisos', `Aviso "${aviso.titulo}" eliminado`);
    res.json({ message: 'Aviso eliminado' });
  } catch (err) {
    console.error('avisos.eliminar:', err);
    res.status(500).json({ message: 'Error al eliminar aviso' });
  }
};

// Lista los avisos que aplican al alumno autenticado.
// Cruza el scope con los datos del alumno (horario, laboratorio, diplomado, días).
const listarParaAlumno = async (req, res) => {
  try {
    const [als] = await db.query(
      `SELECT id, horario, laboratorio, diplomado, dia_clases1, dia_clases2
         FROM alumnos WHERE usuario_id=?`,
      [req.user.id]
    );
    if (!als.length) return res.status(404).json({ message: 'Alumno no encontrado' });
    const a = als[0];

    const [rows] = await db.query(
      `SELECT id, autor_nombre, autor_rol, titulo, mensaje, scope,
              filtro_dia, filtro_horario, filtro_laboratorio, filtro_diplomado,
              expira_at, created_at
         FROM avisos
        WHERE (expira_at IS NULL OR expira_at >= CURDATE())
          AND (
            scope = 'global'
            OR (scope = 'horario'     AND filtro_horario     = ?)
            OR (scope = 'laboratorio' AND filtro_laboratorio = ?)
            OR (scope = 'diplomado'   AND filtro_diplomado   = ?)
            OR (scope = 'dia'         AND filtro_dia IN (?, ?))
            OR (scope = 'alumno'      AND filtro_alumno_id   = ?)
          )
        ORDER BY created_at DESC`,
      [a.horario || '', a.laboratorio || '', a.diplomado || '',
       a.dia_clases1 || '', a.dia_clases2 || '', a.id]
    );
    res.json(rows);
  } catch (err) {
    console.error('avisos.listarParaAlumno:', err);
    res.status(500).json({ message: 'Error al obtener avisos' });
  }
};

module.exports = { listarStaff, crear, eliminar, listarParaAlumno };
