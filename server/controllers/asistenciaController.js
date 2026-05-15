const db = require('../config/db');
const { log } = require('../utils/bitacora');

const MESES_COD = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];

// Matriz anual: todos los alumnos × 12 meses × 5 indicadores (X,E,P,F,T)
const getMatrizAsistencia = async (req, res) => {
  const anio       = parseInt(req.query.anio)       || new Date().getFullYear();
  const horario    = req.query.horario    || '';
  const laboratorio = req.query.laboratorio || '';

  const cols = MESES_COD.map((cod, i) => {
    const m = i + 1;
    return `
      COUNT(CASE WHEN MONTH(a.fecha)=${m} AND a.estado='asistio'    THEN 1 END) AS ${cod}_x,
      COUNT(CASE WHEN MONTH(a.fecha)=${m} AND a.estado='enfermo'    THEN 1 END) AS ${cod}_e,
      COUNT(CASE WHEN MONTH(a.fecha)=${m} AND a.estado='permiso'    THEN 1 END) AS ${cod}_p,
      COUNT(CASE WHEN MONTH(a.fecha)=${m} AND a.estado='no_asistio' THEN 1 END) AS ${cod}_f,
      COUNT(CASE WHEN MONTH(a.fecha)=${m}                           THEN 1 END) AS ${cod}_t`;
  }).join(',');

  let where = "al.estado='activo'";
  const params = [anio];
  if (horario)     { where += ' AND al.horario=?';     params.push(horario); }
  if (laboratorio) { where += ' AND al.laboratorio=?'; params.push(laboratorio); }

  try {
    const [rows] = await db.query(`
      SELECT al.id, al.nombre, al.apellido, al.clave, al.codigo_estudiante,
             al.horario, al.laboratorio, ${cols}
      FROM alumnos al
      LEFT JOIN asistencia a ON al.id = a.alumno_id AND YEAR(a.fecha)=?
      WHERE ${where}
      GROUP BY al.id
      ORDER BY al.id ASC
    `, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al obtener matriz de asistencia' });
  }
};

// Valores únicos de horario, laboratorio y días para los filtros.
// Une los valores que ya están guardados en `alumnos` (snapshot) con los
// catálogos activos (`cat_horarios`, `cat_laboratorios`) — así los horarios
// y laboratorios creados desde el panel de Configuración aparecen como opción
// de filtro aunque todavía no haya un alumno inscrito con esos valores.
// horarios_combinados representa cada (dia1[+dia2] horario) como una opción
// única — alumnos con dos días de clase aparecen como un solo grupo.
const getFiltros = async (req, res) => {
  try {
    const [horariosAl] = await db.query(
      "SELECT DISTINCT horario FROM alumnos WHERE horario IS NOT NULL AND horario!=''"
    );
    const [labsAl] = await db.query(
      "SELECT DISTINCT laboratorio FROM alumnos WHERE laboratorio IS NOT NULL AND laboratorio!=''"
    );
    const [dias1] = await db.query(
      "SELECT DISTINCT dia_clases1 AS dia FROM alumnos WHERE dia_clases1 IS NOT NULL AND dia_clases1!=''"
    );
    const [dias2] = await db.query(
      "SELECT DISTINCT dia_clases2 AS dia FROM alumnos WHERE dia_clases2 IS NOT NULL AND dia_clases2!=''"
    );
    const [combosAl] = await db.query(`
      SELECT DISTINCT
        IFNULL(dia_clases1,'') AS dia1,
        IFNULL(dia_clases2,'') AS dia2,
        IFNULL(horario,'')      AS horario
      FROM alumnos
      WHERE dia_clases1 IS NOT NULL AND dia_clases1!=''
        AND horario IS NOT NULL AND horario!=''
    `);

    // Catálogos (activos) — ignorar errores si las tablas todavía no existen.
    let catHorarios = [], catLabs = [];
    try {
      const [rows] = await db.query(
        "SELECT dia1, dia2, hora_inicio, hora_fin FROM cat_horarios WHERE activo=1"
      );
      catHorarios = rows;
    } catch (_) { /* tabla no creada todavía */ }
    try {
      const [rows] = await db.query(
        "SELECT nombre FROM cat_laboratorios WHERE activo=1"
      );
      catLabs = rows;
    } catch (_) { /* tabla no creada todavía */ }

    // Horarios (string "HH:MM a HH:MM") = alumnos ∪ catálogo
    const horariosSet = new Set(horariosAl.map(r => r.horario));
    for (const h of catHorarios) {
      horariosSet.add(`${h.hora_inicio} a ${h.hora_fin}`);
    }

    // Laboratorios = alumnos ∪ catálogo
    const labsSet = new Set(labsAl.map(r => r.laboratorio));
    for (const l of catLabs) labsSet.add(l.nombre);

    // Días = alumnos ∪ catálogo (dia1 + dia2)
    const diasSet = new Set([...dias1.map(r => r.dia), ...dias2.map(r => r.dia)]);
    for (const h of catHorarios) {
      if (h.dia1) diasSet.add(h.dia1);
      if (h.dia2) diasSet.add(h.dia2);
    }

    // horarios_combinados = alumnos ∪ catálogo, deduplicado por (dia1|dia2|horario)
    const combosMap = new Map();
    const addCombo = (dia1, dia2, horario) => {
      if (!dia1 || !horario) return;
      const key = `${dia1}|${dia2 || ''}|${horario}`;
      if (combosMap.has(key)) return;
      combosMap.set(key, {
        dia1,
        dia2:    dia2 || null,
        horario,
        label:   dia2 ? `${dia1}-${dia2} ${horario}` : `${dia1} ${horario}`,
      });
    };
    for (const c of combosAl) addCombo(c.dia1, c.dia2, c.horario);
    for (const h of catHorarios) addCombo(h.dia1, h.dia2, `${h.hora_inicio} a ${h.hora_fin}`);

    res.json({
      horarios:            [...horariosSet].sort(),
      laboratorios:        [...labsSet].sort(),
      dias:                [...diasSet].sort(),
      horarios_combinados: [...combosMap.values()].sort((a, b) => a.label.localeCompare(b.label)),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al obtener filtros' });
  }
};

// Historial de asistencia de un alumno (con filtro opcional de año)
const getAsistenciaPorAlumno = async (req, res) => {
  const { anio } = req.query;
  try {
    let query = 'SELECT * FROM asistencia WHERE alumno_id=?';
    const params = [req.params.alumno_id];
    if (anio) { query += ' AND YEAR(fecha)=?'; params.push(parseInt(anio)); }
    query += ' ORDER BY fecha DESC';
    const [rows] = await db.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Error al obtener asistencia del alumno' });
  }
};

// Registrar o actualizar un registro individual (upsert por alumno_id+fecha)
const registrarAsistencia = async (req, res) => {
  const { alumno_id, fecha, estado, observacion } = req.body;
  try {
    await db.query(`
      INSERT INTO asistencia (alumno_id, fecha, estado, observacion)
      VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE estado=VALUES(estado), observacion=VALUES(observacion)
    `, [alumno_id, fecha, estado, observacion || null]);
    res.json({ message: 'Asistencia registrada' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al registrar asistencia' });
  }
};

// Eliminar un registro de asistencia
const eliminarAsistencia = async (req, res) => {
  try {
    await db.query('DELETE FROM asistencia WHERE id=?', [req.params.id]);
    res.json({ message: 'Registro eliminado' });
  } catch (err) {
    res.status(500).json({ message: 'Error al eliminar registro' });
  }
};

// Grid editable: alumnos con sus 60 celdas (12 meses × 5 semanas)
const getGridAsistencia = async (req, res) => {
  const anio        = parseInt(req.query.anio) || new Date().getFullYear();
  const horario     = req.query.horario     || '';
  const laboratorio = req.query.laboratorio || '';
  const estado      = req.query.estado !== undefined ? req.query.estado : 'activo';
  const dia         = req.query.dia         || '';
  const dia2        = req.query.dia2        || '';

  const conditions = [];
  const params     = [];
  if (estado !== '')  { conditions.push('al.estado=?');     params.push(estado); }
  if (horario)        { conditions.push('al.horario=?');    params.push(horario); }
  if (laboratorio)    { conditions.push('al.laboratorio=?'); params.push(laboratorio); }
  // Filtro de día(s):  si vienen dos, exigimos que el alumno tenga ese par
  // exacto (en cualquier orden); si viene uno, basta con que coincida con
  // dia_clases1 o dia_clases2.
  if (dia && dia2) {
    conditions.push(
      '((al.dia_clases1=? AND al.dia_clases2=?) OR (al.dia_clases1=? AND al.dia_clases2=?))'
    );
    params.push(dia, dia2, dia2, dia);
  } else if (dia) {
    conditions.push('(al.dia_clases1=? OR al.dia_clases2=?)');
    params.push(dia, dia);
  }

  const where = conditions.length ? conditions.join(' AND ') : '1=1';

  try {
    const [alumnos] = await db.query(`
      SELECT al.id, al.clave, al.codigo_estudiante, al.nombre, al.apellido,
             al.horario, al.laboratorio, al.dia_clases1, al.dia_clases2, al.estado
      FROM alumnos al WHERE ${where}
      ORDER BY al.id ASC
    `, params);

    if (alumnos.length === 0) return res.json([]);

    const ids = alumnos.map(a => a.id);
    const [asistencias] = await db.query(
      `SELECT alumno_id, mes, semana, estado FROM asistencia_semanal WHERE anio=? AND alumno_id IN (${ids.map(() => '?').join(',')})`,
      [anio, ...ids]
    );

    const asistMap = {};
    for (const row of asistencias) {
      if (!asistMap[row.alumno_id]) asistMap[row.alumno_id] = {};
      asistMap[row.alumno_id][`${row.mes}_${row.semana}`] = row.estado;
    }

    res.json(alumnos.map(a => ({ ...a, asistencias: asistMap[a.id] || {} })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al obtener grid de asistencia' });
  }
};

// Guardar múltiples celdas en lote
const guardarLoteAsistencia = async (req, res) => {
  const { anio, cambios } = req.body;
  if (!anio || !Array.isArray(cambios) || cambios.length === 0)
    return res.status(400).json({ message: 'Datos inválidos' });

  try {
    for (const c of cambios) {
      if (!c.estado) {
        await db.query(
          'DELETE FROM asistencia_semanal WHERE alumno_id=? AND anio=? AND mes=? AND semana=?',
          [c.alumno_id, anio, c.mes, c.semana]
        );
      } else {
        await db.query(
          `INSERT INTO asistencia_semanal (alumno_id, anio, mes, semana, estado) VALUES (?,?,?,?,?)
           ON DUPLICATE KEY UPDATE estado=VALUES(estado)`,
          [c.alumno_id, anio, c.mes, c.semana, c.estado]
        );
      }
    }
    log(req, 'guardar', 'Asistencia', `Asistencia guardada: ${cambios.length} celdas año ${anio}`);
    res.json({ message: 'Asistencia guardada', total: cambios.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al guardar asistencia' });
  }
};

module.exports = {
  getMatrizAsistencia,
  getFiltros,
  getAsistenciaPorAlumno,
  registrarAsistencia,
  eliminarAsistencia,
  getGridAsistencia,
  guardarLoteAsistencia
};
