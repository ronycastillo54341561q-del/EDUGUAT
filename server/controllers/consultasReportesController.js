const db = require('../config/db');

// Helpers de (des)serialización JSON tolerantes con MySQL devolviendo objetos
// JSON nativos o strings dependiendo de la versión del driver.
const parseJSON = (val, fallback) => {
  if (val == null) return fallback;
  if (typeof val === 'object') return val;
  try { return JSON.parse(val); } catch { return fallback; }
};
const toJSON = (val) => JSON.stringify(val ?? null);

// Trae los IDs de usuarios con los que un reporte está compartido.
const cargarCompartidos = async (reporteIds) => {
  if (!reporteIds.length) return {};
  const ph = reporteIds.map(() => '?').join(',');
  const [rows] = await db.query(
    `SELECT reporte_id, usuario_id FROM consultas_reportes_compartidos
      WHERE reporte_id IN (${ph})`,
    reporteIds
  );
  const map = {};
  for (const r of rows) {
    (map[r.reporte_id] ||= []).push(r.usuario_id);
  }
  return map;
};

const serialize = (row, compartidosMap, currentUserId) => ({
  id: row.id,
  nombre: row.nombre,
  filtros: parseJSON(row.filtros, {}),
  seguimiento: parseJSON(row.seguimiento, {}),
  desc: row.descripcion || '',
  count: Number(row.count_alumnos) || 0,
  fecha: row.fecha || '',
  owner_id: row.owner_id,
  owner_nombre: row.owner_nombre || '',
  es_propio: row.owner_id === currentUserId,
  compartidos: compartidosMap[row.id] || [],
  created_at: row.created_at,
  updated_at: row.updated_at,
});

// GET /api/consultas-reportes
// Lista los reportes que el usuario puede ver: los suyos + aquellos donde
// está en la lista de compartidos.
const listar = async (req, res) => {
  try {
    const uid = req.user.id;
    const [rows] = await db.query(
      `SELECT r.id, r.owner_id, r.nombre, r.filtros, r.seguimiento,
              r.descripcion, r.count_alumnos, r.fecha, r.created_at, r.updated_at,
              u.nombre AS owner_nombre
         FROM consultas_reportes r
         LEFT JOIN usuarios u ON u.id = r.owner_id
        WHERE r.owner_id = ?
           OR r.id IN (SELECT reporte_id FROM consultas_reportes_compartidos WHERE usuario_id = ?)
        ORDER BY r.updated_at DESC, r.id DESC`,
      [uid, uid]
    );
    const ids = rows.map(r => r.id);
    const compartidosMap = await cargarCompartidos(ids);
    res.json(rows.map(r => serialize(r, compartidosMap, uid)));
  } catch (err) {
    console.error('consultasReportes.listar:', err);
    res.status(500).json({ message: 'Error al listar reportes' });
  }
};

// POST /api/consultas-reportes
// Crea un reporte nuevo.  Body: { nombre, filtros, seguimiento?, desc?, count?, fecha?, compartidos?: number[] }
const crear = async (req, res) => {
  try {
    const uid = req.user.id;
    const { nombre, filtros, seguimiento, desc, count, fecha } = req.body || {};
    const compartidos = Array.isArray(req.body?.compartidos) ? req.body.compartidos.filter(Number.isInteger) : [];
    if (!nombre || typeof nombre !== 'string') {
      return res.status(400).json({ message: 'Nombre requerido' });
    }
    if (!filtros || typeof filtros !== 'object') {
      return res.status(400).json({ message: 'Filtros requeridos' });
    }
    const [r] = await db.query(
      `INSERT INTO consultas_reportes
         (owner_id, nombre, filtros, seguimiento, descripcion, count_alumnos, fecha)
       VALUES (?,?,?,?,?,?,?)`,
      [uid, nombre.trim(), toJSON(filtros), toJSON(seguimiento || {}),
       desc || '', Number(count) || 0, fecha || '']
    );
    const reporteId = r.insertId;
    if (compartidos.length) {
      // Filtra al propio owner (no tiene sentido auto-compartirse).
      const filtered = compartidos.filter(id => id !== uid);
      if (filtered.length) {
        const values = filtered.map(() => '(?,?)').join(',');
        const params = [];
        for (const u of filtered) { params.push(reporteId, u); }
        await db.query(
          `INSERT IGNORE INTO consultas_reportes_compartidos (reporte_id, usuario_id) VALUES ${values}`,
          params
        );
      }
    }
    const [[row]] = await db.query(
      `SELECT r.id, r.owner_id, r.nombre, r.filtros, r.seguimiento,
              r.descripcion, r.count_alumnos, r.fecha, r.created_at, r.updated_at,
              u.nombre AS owner_nombre
         FROM consultas_reportes r
         LEFT JOIN usuarios u ON u.id = r.owner_id
        WHERE r.id = ?`,
      [reporteId]
    );
    const compartidosMap = await cargarCompartidos([reporteId]);
    res.json(serialize(row, compartidosMap, uid));
  } catch (err) {
    console.error('consultasReportes.crear:', err);
    res.status(500).json({ message: 'Error al crear reporte' });
  }
};

// PUT /api/consultas-reportes/:id
// Actualiza un reporte.  Reglas:
//   • Cualquier usuario con acceso (owner o compartido) puede actualizar
//     `seguimiento` (verificados y observaciones — flujo de trabajo común).
//   • Sólo el owner puede cambiar `nombre`, `filtros`, `desc`, `count`,
//     `fecha`, o la lista de `compartidos`.
const actualizar = async (req, res) => {
  try {
    const uid = req.user.id;
    const id = parseInt(req.params.id);
    if (!id) return res.status(400).json({ message: 'ID inválido' });

    const [[reporte]] = await db.query(
      'SELECT id, owner_id FROM consultas_reportes WHERE id = ?',
      [id]
    );
    if (!reporte) return res.status(404).json({ message: 'Reporte no encontrado' });

    const esOwner = reporte.owner_id === uid;
    let acceso = esOwner;
    if (!acceso) {
      const [[sh]] = await db.query(
        'SELECT 1 AS ok FROM consultas_reportes_compartidos WHERE reporte_id = ? AND usuario_id = ?',
        [id, uid]
      );
      acceso = !!sh;
    }
    if (!acceso) return res.status(403).json({ message: 'No tienes acceso a este reporte' });

    const sets = [];
    const params = [];

    // seguimiento → cualquier usuario con acceso
    if (req.body?.seguimiento !== undefined) {
      sets.push('seguimiento = ?');
      params.push(toJSON(req.body.seguimiento));
    }

    // El resto sólo lo cambia el owner
    if (esOwner) {
      if (typeof req.body?.nombre === 'string' && req.body.nombre.trim()) {
        sets.push('nombre = ?');
        params.push(req.body.nombre.trim());
      }
      if (req.body?.filtros && typeof req.body.filtros === 'object') {
        sets.push('filtros = ?');
        params.push(toJSON(req.body.filtros));
      }
      if (typeof req.body?.desc === 'string') {
        sets.push('descripcion = ?');
        params.push(req.body.desc);
      }
      if (req.body?.count !== undefined) {
        sets.push('count_alumnos = ?');
        params.push(Number(req.body.count) || 0);
      }
      if (typeof req.body?.fecha === 'string') {
        sets.push('fecha = ?');
        params.push(req.body.fecha);
      }
    }

    if (sets.length) {
      params.push(id);
      await db.query(
        `UPDATE consultas_reportes SET ${sets.join(', ')} WHERE id = ?`,
        params
      );
    }

    // Lista de compartidos: sólo el owner puede reemplazarla.  Si el body
    // trae `compartidos` se hace replace-all (borra los actuales e inserta
    // los nuevos).  Si no viene la propiedad, se deja como está.
    if (esOwner && Array.isArray(req.body?.compartidos)) {
      const ids = req.body.compartidos.filter(Number.isInteger).filter(x => x !== uid);
      await db.query(
        'DELETE FROM consultas_reportes_compartidos WHERE reporte_id = ?',
        [id]
      );
      if (ids.length) {
        const values = ids.map(() => '(?,?)').join(',');
        const params2 = [];
        for (const u of ids) { params2.push(id, u); }
        await db.query(
          `INSERT IGNORE INTO consultas_reportes_compartidos (reporte_id, usuario_id) VALUES ${values}`,
          params2
        );
      }
    }

    const [[row]] = await db.query(
      `SELECT r.id, r.owner_id, r.nombre, r.filtros, r.seguimiento,
              r.descripcion, r.count_alumnos, r.fecha, r.created_at, r.updated_at,
              u.nombre AS owner_nombre
         FROM consultas_reportes r
         LEFT JOIN usuarios u ON u.id = r.owner_id
        WHERE r.id = ?`,
      [id]
    );
    const compartidosMap = await cargarCompartidos([id]);
    res.json(serialize(row, compartidosMap, uid));
  } catch (err) {
    console.error('consultasReportes.actualizar:', err);
    res.status(500).json({ message: 'Error al actualizar reporte' });
  }
};

// DELETE /api/consultas-reportes/:id
// Sólo el creador puede borrar.  Borra también la fila de compartidos (FK
// suelta — borramos manualmente porque no hay constraint).
const eliminar = async (req, res) => {
  try {
    const uid = req.user.id;
    const id = parseInt(req.params.id);
    if (!id) return res.status(400).json({ message: 'ID inválido' });

    const [[reporte]] = await db.query(
      'SELECT id, owner_id FROM consultas_reportes WHERE id = ?',
      [id]
    );
    if (!reporte) return res.status(404).json({ message: 'Reporte no encontrado' });
    if (reporte.owner_id !== uid) {
      return res.status(403).json({ message: 'Sólo el creador del reporte puede eliminarlo' });
    }

    await db.query('DELETE FROM consultas_reportes_compartidos WHERE reporte_id = ?', [id]);
    await db.query('DELETE FROM consultas_reportes WHERE id = ?', [id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('consultasReportes.eliminar:', err);
    res.status(500).json({ message: 'Error al eliminar reporte' });
  }
};

// GET /api/consultas-reportes/_usuarios-compartibles
// Lista los usuarios de la sede con los que se puede compartir un reporte.
// Excluye alumnos y al usuario actual.
const usuariosCompartibles = async (req, res) => {
  try {
    const uid = req.user.id;
    const [rows] = await db.query(
      `SELECT id, nombre, email, rol
         FROM usuarios
        WHERE activo = 1 AND rol <> 'alumno' AND id <> ?
        ORDER BY nombre ASC`,
      [uid]
    );
    res.json(rows);
  } catch (err) {
    console.error('consultasReportes.usuariosCompartibles:', err);
    res.status(500).json({ message: 'Error al listar usuarios' });
  }
};

module.exports = { listar, crear, actualizar, eliminar, usuariosCompartibles };
