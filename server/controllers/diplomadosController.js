const db = require('../config/db');
const { log } = require('../utils/bitacora');

/* ─────────────────────────────────────────────────────────────────
 * Estructura del módulo
 *
 *  dip_diplomados            (Tecnico Operador, Programador, ...)
 *    ├── dip_diplomado_objetivos   (objetivos específicos del diplomado)
 *    └── dip_programas         (Windows, Word, Publisher, ...)
 *          ├── dip_programa_objetivos    (objetivos específicos del programa)
 *          └── dip_programa_contenido    (contenido por semana)
 *
 *  El campo `orden` en dip_programas define en qué secuencia se imparten
 *  los programas dentro del diplomado: ese mismo orden es el que se usa
 *  en NotasDiplomados para listar las columnas y en Planificaciones.
 * ────────────────────────────────────────────────────────────────*/

/* ──────────────  GET /diplomados  ────────────── */
// Devuelve los diplomados activos con sus objetivos y programas anidados.
const getAll = async (req, res) => {
  try {
    const incluirInactivos = req.query.incluirInactivos === '1';
    const whereDip = incluirInactivos ? '1=1' : 'activo=1';

    const [diplomados] = await db.query(
      `SELECT id, nombre, objetivo_general, activo
         FROM dip_diplomados
        WHERE ${whereDip}
        ORDER BY nombre`
    );
    if (!diplomados.length) return res.json([]);

    const dipIds = diplomados.map(d => d.id);
    const ph = dipIds.map(() => '?').join(',');

    const [dipObjs] = await db.query(
      `SELECT id, diplomado_id, descripcion, orden
         FROM dip_diplomado_objetivos
        WHERE diplomado_id IN (${ph})
        ORDER BY diplomado_id, orden, id`,
      dipIds
    );

    const [examenes] = await db.query(
      `SELECT id, diplomado_id, nombre, orden
         FROM dip_examenes
        WHERE diplomado_id IN (${ph}) AND activo=1
        ORDER BY diplomado_id, orden, id`,
      dipIds
    );

    const [programas] = await db.query(
      `SELECT id, diplomado_id, nombre, objetivo_general, duracion_semanas, orden, activo
         FROM dip_programas
        WHERE diplomado_id IN (${ph}) AND activo=1
        ORDER BY diplomado_id, orden, id`,
      dipIds
    );

    let progObjs = [];
    let progCont = [];
    if (programas.length) {
      const progIds = programas.map(p => p.id);
      const ph2 = progIds.map(() => '?').join(',');
      [progObjs] = await db.query(
        `SELECT id, programa_id, descripcion, orden
           FROM dip_programa_objetivos
          WHERE programa_id IN (${ph2})
          ORDER BY programa_id, orden, id`,
        progIds
      );
      [progCont] = await db.query(
        `SELECT id, programa_id, semana_num, contenido
           FROM dip_programa_contenido
          WHERE programa_id IN (${ph2})
          ORDER BY programa_id, semana_num`,
        progIds
      );
    }

    const dipObjMap = {};
    dipObjs.forEach(o => { (dipObjMap[o.diplomado_id] ||= []).push(o); });

    const examMap = {};
    examenes.forEach(e => { (examMap[e.diplomado_id] ||= []).push(e); });

    const progObjMap = {};
    progObjs.forEach(o => { (progObjMap[o.programa_id] ||= []).push(o); });

    const progContMap = {};
    progCont.forEach(c => { (progContMap[c.programa_id] ||= []).push(c); });

    const progByDip = {};
    programas.forEach(p => {
      (progByDip[p.diplomado_id] ||= []).push({
        ...p,
        objetivos: progObjMap[p.id] || [],
        contenido: progContMap[p.id] || [],
      });
    });

    res.json(diplomados.map(d => ({
      ...d,
      objetivos: dipObjMap[d.id] || [],
      programas: progByDip[d.id] || [],
      examenes:  examMap[d.id]   || [],
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al obtener diplomados' });
  }
};

/* ──────────────  POST /diplomados  ────────────── */
// Crea el diplomado, sus objetivos y la lista inicial de programas
// (sólo nombre/duración; los detalles de cada programa se editan luego).
const crear = async (req, res) => {
  const {
    nombre,
    objetivo_general = '',
    objetivos = [],
    programas = [],
  } = req.body;

  if (!nombre?.trim())
    return res.status(400).json({ message: 'nombre es requerido' });

  try {
    const [r] = await db.query(
      'INSERT INTO dip_diplomados (nombre, objetivo_general, activo) VALUES (?,?,1)',
      [nombre.trim(), (objetivo_general || '').trim()]
    );
    const did = r.insertId;

    for (let i = 0; i < objetivos.length; i++) {
      const desc = (typeof objetivos[i] === 'string' ? objetivos[i] : objetivos[i]?.descripcion)?.trim();
      if (!desc) continue;
      await db.query(
        'INSERT INTO dip_diplomado_objetivos (diplomado_id, descripcion, orden) VALUES (?,?,?)',
        [did, desc, i]
      );
    }

    for (let i = 0; i < programas.length; i++) {
      const p = programas[i] || {};
      const pn = (typeof p === 'string' ? p : p.nombre)?.trim();
      if (!pn) continue;
      const dur = Math.max(1, Math.min(52, parseInt(p.duracion_semanas) || 1));
      await db.query(
        'INSERT INTO dip_programas (diplomado_id, nombre, objetivo_general, duracion_semanas, orden, activo) VALUES (?,?,?,?,?,1)',
        [did, pn, '', dur, i]
      );
    }

    log(req, 'crear', 'Diplomados', `Diplomado: ${nombre.trim()}`);
    res.json({ ok: true, id: did });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al crear diplomado' });
  }
};

/* ──────────────  PUT /diplomados/:id  ──────────────
 * Actualiza la cabecera y los objetivos del diplomado.
 * Para los programas: se preserva el id de los existentes (para no
 * romper la unión por nombre con diplomado_notas) y se permite
 * agregar nuevos, quitar los borrados y cambiar el orden.
 * ─────────────────────────────────────────────────── */
const actualizar = async (req, res) => {
  const { id } = req.params;
  const {
    nombre,
    objetivo_general = '',
    objetivos = [],
    programas = [],
  } = req.body;

  if (!nombre?.trim())
    return res.status(400).json({ message: 'nombre es requerido' });

  try {
    await db.query(
      'UPDATE dip_diplomados SET nombre=?, objetivo_general=? WHERE id=?',
      [nombre.trim(), (objetivo_general || '').trim(), id]
    );

    // Objetivos específicos: borrar y reinsertar (es seguro, no hay FK externa)
    await db.query('DELETE FROM dip_diplomado_objetivos WHERE diplomado_id=?', [id]);
    for (let i = 0; i < objetivos.length; i++) {
      const desc = (typeof objetivos[i] === 'string' ? objetivos[i] : objetivos[i]?.descripcion)?.trim();
      if (!desc) continue;
      await db.query(
        'INSERT INTO dip_diplomado_objetivos (diplomado_id, descripcion, orden) VALUES (?,?,?)',
        [id, desc, i]
      );
    }

    // Programas: conservar IDs existentes, marcar como inactivo los que faltan
    const [existentes] = await db.query(
      'SELECT id FROM dip_programas WHERE diplomado_id=? AND activo=1',
      [id]
    );
    const idsViejos = existentes.map(r => r.id);
    const idsConservados = new Set();

    for (let i = 0; i < programas.length; i++) {
      const p = programas[i] || {};
      const pn = (p.nombre || '').trim();
      if (!pn) continue;
      const dur = Math.max(1, Math.min(52, parseInt(p.duracion_semanas) || 1));
      if (p.id && idsViejos.includes(p.id)) {
        await db.query(
          'UPDATE dip_programas SET nombre=?, duracion_semanas=?, orden=? WHERE id=? AND diplomado_id=?',
          [pn, dur, i, p.id, id]
        );
        idsConservados.add(p.id);
      } else {
        await db.query(
          'INSERT INTO dip_programas (diplomado_id, nombre, objetivo_general, duracion_semanas, orden, activo) VALUES (?,?,?,?,?,1)',
          [id, pn, '', dur, i]
        );
      }
    }

    const idsBorrar = idsViejos.filter(x => !idsConservados.has(x));
    if (idsBorrar.length) {
      const ph = idsBorrar.map(() => '?').join(',');
      await db.query(`UPDATE dip_programas SET activo=0 WHERE id IN (${ph})`, idsBorrar);
    }

    log(req, 'editar', 'Diplomados', `Diplomado ID ${id}: ${nombre.trim()}`);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al actualizar diplomado' });
  }
};

/* ──────────────  DELETE /diplomados/:id  ────────────── */
const eliminar = async (req, res) => {
  const { id } = req.params;
  try {
    await db.query('UPDATE dip_diplomados SET activo=0 WHERE id=?', [id]);
    log(req, 'eliminar', 'Diplomados', `Diplomado ID ${id}`);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al eliminar diplomado' });
  }
};

/* ─────────  PUT /diplomados/:id/programas/orden  ─────────
 * Reordena los programas de un diplomado. Recibe { ids: [pid1, pid2,...] }
 * en el orden deseado. Esto cambia el orden con el que se muestran
 * tanto en NotasDiplomados (columnas) como en Planificaciones.
 * ───────────────────────────────────────────────────────── */
const reordenarProgramas = async (req, res) => {
  const { id } = req.params;
  const { ids = [] } = req.body;
  if (!Array.isArray(ids))
    return res.status(400).json({ message: 'ids debe ser un array' });
  try {
    for (let i = 0; i < ids.length; i++) {
      await db.query(
        'UPDATE dip_programas SET orden=? WHERE id=? AND diplomado_id=?',
        [i, ids[i], id]
      );
    }
    log(req, 'editar', 'Diplomados', `Reordenar programas diplomado ${id}`);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al reordenar programas' });
  }
};

/* ─────────  PUT /diplomados/programas/:pid  ─────────
 * Edición detallada de un programa (panel de operador):
 * nombre, objetivo general, objetivos específicos,
 * duración en semanas y contenido por semana.
 * ──────────────────────────────────────────────────── */
const actualizarPrograma = async (req, res) => {
  const { pid } = req.params;
  const {
    nombre,
    objetivo_general = '',
    duracion_semanas,
    objetivos = [],
    contenido = [],
  } = req.body;

  if (!nombre?.trim() || !duracion_semanas)
    return res.status(400).json({ message: 'nombre y duracion_semanas son requeridos' });

  const dur = Math.max(1, Math.min(52, parseInt(duracion_semanas) || 1));

  try {
    await db.query(
      'UPDATE dip_programas SET nombre=?, objetivo_general=?, duracion_semanas=? WHERE id=?',
      [nombre.trim(), (objetivo_general || '').trim(), dur, pid]
    );

    await db.query('DELETE FROM dip_programa_objetivos WHERE programa_id=?', [pid]);
    for (let i = 0; i < objetivos.length; i++) {
      const desc = (typeof objetivos[i] === 'string' ? objetivos[i] : objetivos[i]?.descripcion)?.trim();
      if (!desc) continue;
      await db.query(
        'INSERT INTO dip_programa_objetivos (programa_id, descripcion, orden) VALUES (?,?,?)',
        [pid, desc, i]
      );
    }

    // Contenido: borramos y reinsertamos sólo las semanas dentro del rango actual
    await db.query('DELETE FROM dip_programa_contenido WHERE programa_id=?', [pid]);
    for (const c of contenido) {
      const sn = parseInt(c.semana_num);
      if (!sn || sn < 1 || sn > dur) continue;
      const txt = (c.contenido || '').trim();
      if (!txt) continue;
      await db.query(
        'INSERT INTO dip_programa_contenido (programa_id, semana_num, contenido) VALUES (?,?,?)',
        [pid, sn, txt]
      );
    }

    log(req, 'editar', 'Diplomados', `Programa ID ${pid}: ${nombre.trim()}`);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al actualizar programa' });
  }
};

/* ─────────  GET /diplomados/programas  ─────────
 * Lista plana de programas activos con su diplomado padre.
 * Pensado para Planificaciones, que selecciona programas sueltos.
 * ─────────────────────────────────────────────── */
const listProgramasFlat = async (_req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT p.id, p.nombre, p.duracion_semanas, p.orden,
              p.diplomado_id, d.nombre AS diplomado_nombre
         FROM dip_programas p
         JOIN dip_diplomados d ON d.id = p.diplomado_id
        WHERE p.activo=1 AND d.activo=1
        ORDER BY d.nombre, p.orden, p.id`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al listar programas' });
  }
};

/* ─────────  GET /diplomados/:id/examenes  ───────── */
const listExamenes = async (req, res) => {
  const { id } = req.params;
  try {
    const [rows] = await db.query(
      'SELECT id, nombre, orden FROM dip_examenes WHERE diplomado_id=? AND activo=1 ORDER BY orden, id',
      [id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al listar exámenes' });
  }
};

/* ─────────  POST /diplomados/:id/examenes  ─────────
 * Reemplaza la lista completa de exámenes del diplomado.
 * Recibe { examenes: [{ id?, nombre }] } en el orden deseado.
 * Conserva los IDs de los exámenes existentes (clave para no romper la unión
 * por nombre con diplomado_notas si el usuario los renombra).
 * ──────────────────────────────────────────────────── */
const guardarExamenes = async (req, res) => {
  const { id } = req.params;
  const { examenes = [] } = req.body;
  if (!Array.isArray(examenes))
    return res.status(400).json({ message: 'examenes debe ser un array' });

  try {
    const [existentes] = await db.query(
      'SELECT id FROM dip_examenes WHERE diplomado_id=? AND activo=1',
      [id]
    );
    const idsViejos = existentes.map(r => r.id);
    const idsConservados = new Set();

    for (let i = 0; i < examenes.length; i++) {
      const e = examenes[i] || {};
      const nombre = (e.nombre || '').trim();
      if (!nombre) continue;
      if (e.id && idsViejos.includes(e.id)) {
        await db.query(
          'UPDATE dip_examenes SET nombre=?, orden=? WHERE id=? AND diplomado_id=?',
          [nombre, i, e.id, id]
        );
        idsConservados.add(e.id);
      } else {
        await db.query(
          'INSERT INTO dip_examenes (diplomado_id, nombre, orden, activo) VALUES (?,?,?,1)',
          [id, nombre, i]
        );
      }
    }

    const idsBorrar = idsViejos.filter(x => !idsConservados.has(x));
    if (idsBorrar.length) {
      const ph = idsBorrar.map(() => '?').join(',');
      await db.query(`UPDATE dip_examenes SET activo=0 WHERE id IN (${ph})`, idsBorrar);
    }

    log(req, 'editar', 'Diplomados', `Exámenes diplomado ${id}: ${examenes.length}`);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al guardar exámenes' });
  }
};

/* ─────────  PUT /diplomados/:id/examenes/orden  ───────── */
const reordenarExamenes = async (req, res) => {
  const { id } = req.params;
  const { ids = [] } = req.body;
  if (!Array.isArray(ids))
    return res.status(400).json({ message: 'ids debe ser un array' });
  try {
    for (let i = 0; i < ids.length; i++) {
      await db.query(
        'UPDATE dip_examenes SET orden=? WHERE id=? AND diplomado_id=?',
        [i, ids[i], id]
      );
    }
    log(req, 'editar', 'Diplomados', `Reordenar exámenes diplomado ${id}`);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al reordenar exámenes' });
  }
};

module.exports = {
  getAll,
  crear,
  actualizar,
  eliminar,
  reordenarProgramas,
  actualizarPrograma,
  listProgramasFlat,
  listExamenes,
  guardarExamenes,
  reordenarExamenes,
};
