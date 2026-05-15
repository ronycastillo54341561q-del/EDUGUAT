// Controlador de importación masiva desde Excel.
// Restringido a super-admin (admin de `sistema_escolar`); el guardia vive en la ruta.
//
// Cada fila se inserta dentro de su propia transacción para permitir éxito parcial:
// si una fila falla (clave duplicada, código repetido, etc.) las demás siguen.
// Reutilizamos la misma forma de generarClave / hash de password / 12 mensualidades
// que `crearAlumno`, así un alumno importado queda idéntico a uno creado por la UI.

const db = require('../config/db');
const bcrypt = require('bcryptjs');
const { log } = require('../utils/bitacora');
const { generarClave } = require('../utils/generarClave');

const CODIGO_REGEX = /^[A-Z][0-9]{3}[A-Z]{3}$/;
const FECHA_REGEX  = /^\d{4}-\d{2}-\d{2}$/;
const DIAS_VALIDOS = new Set([
  'lunes','martes','miercoles','miércoles','jueves','viernes','sabado','sábado','domingo'
]);
const ESTADOS_VALIDOS = new Set(['activo','retirado']);

const MESES_ORD = ['enero','febrero','marzo','abril','mayo','junio',
                   'julio','agosto','septiembre','octubre','noviembre','diciembre'];
const MES_ALIAS = {
  enero: 1, ene: 1, '1': 1, '01': 1,
  febrero: 2, feb: 2, '2': 2, '02': 2,
  marzo: 3, mar: 3, '3': 3, '03': 3,
  abril: 4, abr: 4, '4': 4, '04': 4,
  mayo: 5, may: 5, '5': 5, '05': 5,
  junio: 6, jun: 6, '6': 6, '06': 6,
  julio: 7, jul: 7, '7': 7, '07': 7,
  agosto: 8, ago: 8, '8': 8, '08': 8,
  septiembre: 9, sep: 9, sept: 9, '9': 9, '09': 9,
  octubre: 10, oct: 10, '10': 10,
  noviembre: 11, nov: 11, '11': 11,
  diciembre: 12, dic: 12, '12': 12,
};
const ESTADO_ASIST_ALIAS = {
  x: 'X', a: 'X', asistio: 'X', asistió: 'X', presente: 'X',
  e: 'E', enfermo: 'E', enferma: 'E', enfermedad: 'E',
  p: 'P', permiso: 'P',
  f: 'F', falta: 'F', falto: 'F', faltó: 'F', no_asistio: 'F', 'no asistió': 'F', ausente: 'F',
  r: 'R', recupero: 'R', recuperó: 'R', recuperado: 'R', recuperacion: 'R', recuperación: 'R',
};
const ESTADOS_ASIST_VALIDOS = new Set(['X','E','P','F','R']);

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

const normalizar = s =>
  (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Limpia una celda: trims, convierte vacío → null, opcionalmente cambia
// case (upper o lower). Útil para normalizar campos enum-like que se
// guardan en BD con un casing canónico (ej. estado='activo'/'retirado'
// o dia_clases1='lunes') aunque el Excel venga con mayúsculas.
const cell = (v, { upper = false, lower = false } = {}) => {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  if (s === '') return null;
  if (upper) return s.toUpperCase();
  if (lower) return s.toLowerCase();
  return s;
};

// ── Helpers de búsqueda de alumno ────────────────────────────────────────────
// El identificador puede venir como id numérico, clave (formato libre) o
// codigo_estudiante (A000AAA).  Devuelve la fila o null.
const buscarAlumno = async (conn, identificador) => {
  if (identificador === null || identificador === undefined) return null;
  const raw = String(identificador).trim();
  if (!raw) return null;

  // Numérico puro → id
  if (/^\d+$/.test(raw)) {
    const [rows] = await conn.query(
      'SELECT id, clave, codigo_estudiante, nombre, apellido, cuota_mensual, diplomado FROM alumnos WHERE id=?',
      [parseInt(raw, 10)]
    );
    if (rows.length) return rows[0];
  }

  // Buscar por clave o codigo_estudiante (case-insensitive en codigo)
  const [rows] = await conn.query(
    `SELECT id, clave, codigo_estudiante, nombre, apellido, cuota_mensual, diplomado
       FROM alumnos
      WHERE clave = ? OR UPPER(codigo_estudiante) = UPPER(?)
      LIMIT 1`,
    [raw, raw]
  );
  return rows[0] || null;
};

// Normaliza un texto para comparar nombres: minúsculas, sin acentos,
// colapsa espacios y elimina puntuación.
const normNombre = (s) =>
  String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

// Devuelve la lista de palabras normalizadas (sin acentos, sin puntuación,
// minúsculas) en orden alfabético.  "Castillo López, Rony Alexander" →
// ['alexander','castillo','lopez','rony'].
const palabrasOrdenadas = (s) =>
  normNombre(s).split(/\s+/).filter(Boolean).sort();

// Compara dos cadenas de nombre como multi-conjuntos: ignora el orden
// (apellidos+nombres o nombres+apellidos), acentos, casing y puntuación.
const mismoNombreMultiset = (a, b) => {
  const sa = palabrasOrdenadas(a), sb = palabrasOrdenadas(b);
  if (sa.length !== sb.length) return false;
  for (let i = 0; i < sa.length; i++) if (sa[i] !== sb[i]) return false;
  return true;
};

// Verdadero si todas las palabras de `excel` aparecen en `bd` (subset).
// Útil cuando el Excel trae un nombre o apellido menos que el sistema.
const esSubconjuntoNombre = (bd, excel) => {
  const setBd = new Set(palabrasOrdenadas(bd));
  const we    = palabrasOrdenadas(excel);
  if (we.length === 0) return false;
  return we.every(w => setBd.has(w));
};

// Busca al alumno por nombre completo únicamente (sin clave).  Acepta
// cualquier orden ("Apellido Nombre" o "Nombre Apellido"), ignora acentos
// y mayúsculas, y como tolerancia adicional permite que el Excel tenga
// menos palabras que el sistema (siempre que el match resultante sea único).
const buscarAlumnoPorNombreUnico = async (conn, nombreRaw) => {
  const nombre = String(nombreRaw || '').trim();
  if (!nombre) throw new Error('alumno es obligatorio');
  const [rows] = await conn.query(
    `SELECT id, clave, codigo_estudiante, nombre, apellido, cuota_mensual, diplomado
       FROM alumnos`
  );

  // 1) Match exacto (mismas palabras, distinto orden permitido).
  const exactos = rows.filter(a => mismoNombreMultiset(`${a.nombre} ${a.apellido}`, nombre));
  if (exactos.length === 1) return exactos[0];
  if (exactos.length > 1) {
    throw new Error(
      `Hay ${exactos.length} alumnos con nombre "${nombre}" — agregue apellido o nombre adicional para diferenciarlos`
    );
  }

  // 2) Match por subconjunto (Excel con menos palabras que el sistema).
  const parciales = rows.filter(a => esSubconjuntoNombre(`${a.nombre} ${a.apellido}`, nombre));
  if (parciales.length === 1) return parciales[0];
  if (parciales.length > 1) {
    const opciones = parciales.slice(0, 5).map(a => `"${a.nombre} ${a.apellido}"`).join(', ');
    throw new Error(
      `"${nombre}" coincide con ${parciales.length} alumnos (${opciones}${parciales.length > 5 ? '...' : ''}) — escriba el nombre completo`
    );
  }
  throw new Error(`No existe alumno con nombre "${nombre}"`);
};

// Busca al alumno cuando la clave Y el nombre completo deben coincidir.
// La búsqueda es tolerante: la clave se compara con TRIM/case-insensitive,
// y si la clave del Excel no matchea exactamente intentamos también por
// nombre completo (multiset/subconjunto) para evitar fallar por
// diferencias de formato (ceros a la izquierda, espacios, etc.).
const buscarAlumnoPorClaveYNombre = async (conn, claveRaw, nombreRaw) => {
  const clave  = String(claveRaw  || '').trim();
  const nombre = String(nombreRaw || '').trim();
  if (!clave)  throw new Error('clave es obligatoria');
  if (!nombre) throw new Error('nombre es obligatorio');

  // 1) Match directo de clave (trim + case-insensitive).
  const [rowsClave] = await conn.query(
    `SELECT id, clave, codigo_estudiante, nombre, apellido, cuota_mensual, diplomado
       FROM alumnos
      WHERE TRIM(clave) = ? OR LOWER(TRIM(clave)) = LOWER(?)
      LIMIT 1`,
    [clave, clave]
  );
  if (rowsClave.length) {
    const a = rowsClave[0];
    const completoBd = `${a.nombre} ${a.apellido}`;
    const exact  = mismoNombreMultiset(completoBd, nombre);
    const subset = !exact && esSubconjuntoNombre(completoBd, nombre);
    if (exact || subset) return a;
    // La clave matchea pero el nombre no — aún así, si el nombre
    // identifica de forma única a OTRO alumno con clave parecida,
    // podríamos aceptar.  Por seguridad, lanzamos error claro.
    throw new Error(
      `Nombre no coincide para clave "${clave}". Excel: "${nombre}" — Sistema: "${completoBd}"`
    );
  }

  // 2) Fallback: clave no encontrada.  Buscar por nombre completo y, si
  //    hay un único alumno, devolverlo (asumiendo que la clave del Excel
  //    venía con formato distinto: ceros, prefijo, etc.).
  const [todos] = await conn.query(
    `SELECT id, clave, codigo_estudiante, nombre, apellido, cuota_mensual, diplomado FROM alumnos`
  );
  const exactos = todos.filter(a => mismoNombreMultiset(`${a.nombre} ${a.apellido}`, nombre));
  if (exactos.length === 1) return exactos[0];
  if (exactos.length > 1) {
    throw new Error(
      `Clave "${clave}" no existe y "${nombre}" coincide con ${exactos.length} alumnos — ` +
      `verifica la clave o usa el nombre completo`
    );
  }
  const parciales = todos.filter(a => esSubconjuntoNombre(`${a.nombre} ${a.apellido}`, nombre));
  if (parciales.length === 1) return parciales[0];
  if (parciales.length > 1) {
    throw new Error(
      `Clave "${clave}" no existe y "${nombre}" coincide parcialmente con ${parciales.length} alumnos — usa el nombre completo`
    );
  }
  throw new Error(`No existe alumno con clave "${clave}" ni con nombre "${nombre}"`);
};

// ============================================================================
// IMPORTACIÓN DE ALUMNOS  (existente — sin cambios funcionales)
// ============================================================================

const validarFilaAlumno = (raw) => {
  const errors = [];
  const clean = {
    nombre:            cell(raw.nombre),
    apellido:          cell(raw.apellido),
    codigo_estudiante: cell(raw.codigo_estudiante, { upper: true }),
    fecha_inicio:      cell(raw.fecha_inicio),
    fecha_nacimiento:  cell(raw.fecha_nacimiento),
    encargado:         cell(raw.encargado),
    telefono:          cell(raw.telefono),
    diplomado:         cell(raw.diplomado),
    tac:               cell(raw.tac),
    asesor:            cell(raw.asesor),
    direccion:         cell(raw.direccion),
    establecimiento:   cell(raw.establecimiento),
    observaciones:     cell(raw.observaciones),
    dia_clases1:       cell(raw.dia_clases1, { lower: true }),
    dia_clases2:       cell(raw.dia_clases2, { lower: true }),
    horario:           cell(raw.horario),
    laboratorio:       cell(raw.laboratorio),
    estado:            cell(raw.estado, { lower: true }) || 'activo',
    cuota_mensual:     raw.cuota_mensual,
  };

  if (!clean.nombre)        errors.push('nombre es obligatorio');
  if (!clean.apellido)      errors.push('apellido es obligatorio');
  if (!clean.dia_clases1)   errors.push('dia_clases1 es obligatorio');
  if (!clean.horario)       errors.push('horario es obligatorio');

  if (clean.codigo_estudiante && !CODIGO_REGEX.test(clean.codigo_estudiante)) {
    errors.push('codigo_estudiante debe seguir el formato A000AAA');
  }
  if (clean.fecha_inicio && !FECHA_REGEX.test(clean.fecha_inicio)) {
    errors.push('fecha_inicio debe ser YYYY-MM-DD');
  }
  if (clean.fecha_nacimiento && !FECHA_REGEX.test(clean.fecha_nacimiento)) {
    errors.push('fecha_nacimiento debe ser YYYY-MM-DD');
  }
  if (clean.dia_clases1 && !DIAS_VALIDOS.has(clean.dia_clases1.toLowerCase())) {
    errors.push('dia_clases1 inválido (lunes…domingo)');
  }
  if (clean.dia_clases2 && !DIAS_VALIDOS.has(clean.dia_clases2.toLowerCase())) {
    errors.push('dia_clases2 inválido (lunes…domingo)');
  }
  if (!ESTADOS_VALIDOS.has(clean.estado)) {
    errors.push('estado debe ser "activo" o "retirado"');
  }

  const cuota = Number(clean.cuota_mensual);
  if (!Number.isFinite(cuota) || cuota < 0) {
    errors.push('cuota_mensual debe ser un número ≥ 0');
  } else {
    clean.cuota_mensual = cuota;
  }

  return { ok: errors.length === 0, errors, clean };
};

const insertarFilaAlumno = async (clean) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const clave = await generarClave(conn, clean.fecha_inicio);
    const primerNombre = normalizar(clean.nombre.trim().split(/\s+/)[0]);
    const username = primerNombre + clave;
    const anioInscrito = clean.fecha_inicio
      ? new Date(clean.fecha_inicio + 'T00:00:00').getFullYear()
      : new Date().getFullYear();
    const passwordPlain = username + anioInscrito;
    const hash = await bcrypt.hash(passwordPlain, 10);

    const [userResult] = await conn.query(
      'INSERT INTO usuarios (nombre, email, password, rol) VALUES (?, ?, ?, ?)',
      [`${clean.nombre} ${clean.apellido}`, username, hash, 'alumno']
    );
    const usuario_id = userResult.insertId;

    const [alumnoResult] = await conn.query(`
      INSERT INTO alumnos
      (clave, codigo_estudiante, nombre, apellido, fecha_inicio, fecha_nacimiento,
       encargado, telefono, diplomado, tac, asesor, direccion, establecimiento,
       observaciones, dia_clases1, dia_clases2, horario, laboratorio,
       estado, cuota_mensual, usuario_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      clave, clean.codigo_estudiante, clean.nombre, clean.apellido,
      clean.fecha_inicio, clean.fecha_nacimiento,
      clean.encargado, clean.telefono, clean.diplomado, clean.tac, clean.asesor,
      clean.direccion, clean.establecimiento, clean.observaciones,
      clean.dia_clases1, clean.dia_clases2, clean.horario, clean.laboratorio,
      clean.estado, clean.cuota_mensual, usuario_id,
    ]);
    const alumno_id = alumnoResult.insertId;

    const meses = MESES_ORD;
    const anio = new Date().getFullYear();
    for (const mes of meses) {
      await conn.query(
        'INSERT INTO mensualidades (alumno_id, mes, anio, monto) VALUES (?, ?, ?, ?)',
        [alumno_id, mes, anio, clean.cuota_mensual]
      );
    }

    await conn.commit();
    return {
      id: alumno_id, clave,
      codigo_estudiante: clean.codigo_estudiante,
      usuario: username, password: passwordPlain,
    };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

const importarAlumnos = async (req, res) => {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : null;
  if (!rows || rows.length === 0) {
    return res.status(400).json({ message: 'No se recibieron filas para importar' });
  }
  if (rows.length > 500) {
    return res.status(400).json({ message: 'Máximo 500 filas por importación' });
  }

  const resultados = [];
  let ok = 0, fail = 0;

  for (let i = 0; i < rows.length; i++) {
    const { ok: valido, errors, clean } = validarFilaAlumno(rows[i] || {});
    if (!valido) {
      fail++;
      resultados.push({ row: i + 1, ok: false, error: errors.join('; ') });
      continue;
    }
    try {
      const data = await insertarFilaAlumno(clean);
      ok++;
      resultados.push({
        row: i + 1, ok: true,
        clave: data.clave,
        codigo_estudiante: data.codigo_estudiante,
        usuario: data.usuario,
        password: data.password,
        nombre: clean.nombre,
        apellido: clean.apellido,
      });
    } catch (err) {
      fail++;
      let msg = 'Error al insertar';
      if (err.code === 'ER_DUP_ENTRY') {
        msg = /codigo_estudiante/i.test(err.message)
          ? 'El código de estudiante ya existe'
          : 'La clave o el usuario ya existen';
      } else if (err.message) {
        msg = err.message;
      }
      resultados.push({ row: i + 1, ok: false, error: msg });
    }
  }

  log(req, 'importar', 'Alumnos',
      `Importación masiva: ${ok} creado(s), ${fail} con error de ${rows.length} fila(s)`);

  res.status(200).json({
    total: rows.length,
    creados: ok,
    fallidos: fail,
    resultados,
  });
};

// ============================================================================
// HELPER GENÉRICO PARA IMPORTACIÓN POR ALUMNO + AÑO
// ============================================================================
//
// Todos los demás módulos comparten la misma forma:
//   1. Cada fila trae un identificador (id, clave o codigo_estudiante).
//   2. Se valida el año global (en req.body.anio).
//   3. Se busca el alumno; si no existe, fila falla.
//   4. Se invoca el handler con (conn, alumno, fila, anio) que decide cómo insertar.
//
// El handler debe devolver { detalle?: string } o lanzar Error para indicar fallo.

const procesarLote = async (req, res, modulo, handler, validador = null) => {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : null;
  const anio = parseInt(req.body?.anio, 10) || new Date().getFullYear();

  if (!rows || rows.length === 0) {
    return res.status(400).json({ message: 'No se recibieron filas para importar' });
  }
  if (rows.length > 1000) {
    return res.status(400).json({ message: 'Máximo 1000 filas por importación' });
  }
  if (anio < 2000 || anio > 2100) {
    return res.status(400).json({ message: 'Año inválido' });
  }

  const resultados = [];
  let ok = 0, fail = 0;

  for (let i = 0; i < rows.length; i++) {
    const fila = rows[i] || {};
    const idCelda = fila.alumno_id ?? fila.clave ?? fila.codigo_estudiante ?? fila.codigo;

    if (validador) {
      const verr = validador(fila);
      if (verr.length) {
        fail++;
        resultados.push({ row: i + 1, ok: false, error: verr.join('; ') });
        continue;
      }
    }

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      const alumno = await buscarAlumno(conn, idCelda);
      if (!alumno) {
        throw new Error(`Alumno no encontrado (id/clave/código: "${idCelda || ''}")`);
      }
      const { detalle } = (await handler(conn, alumno, fila, anio)) || {};
      await conn.commit();
      ok++;
      resultados.push({
        row: i + 1, ok: true,
        alumno_id: alumno.id,
        clave: alumno.clave,
        codigo_estudiante: alumno.codigo_estudiante,
        nombre: `${alumno.nombre} ${alumno.apellido}`,
        detalle: detalle || 'Importado correctamente',
      });
    } catch (err) {
      try { await conn.rollback(); } catch (_) {}
      fail++;
      resultados.push({
        row: i + 1, ok: false,
        error: err.message || 'Error al insertar',
      });
    } finally {
      conn.release();
    }
  }

  log(req, 'importar', modulo,
      `Importación masiva ${modulo} año ${anio}: ${ok} ok, ${fail} con error de ${rows.length}`);

  res.status(200).json({ total: rows.length, creados: ok, fallidos: fail, anio, resultados });
};

// ============================================================================
// IMPORTAR ASISTENCIA SEMANAL  →  asistencia_semanal
// ============================================================================
//
// Plantilla (formato ancho — una fila por alumno):
//   clave, nombre, m1_s1, m1_s2, …, m1_s5, m2_s1, …, m12_s5
//
// El alumno se identifica por CLAVE + NOMBRE COMPLETO (ambos deben coincidir;
// el orden apellidos/nombre es irrelevante).  Cada celda con valor inserta o
// actualiza una fila en `asistencia_semanal`; las celdas vacías o con guion
// (`-`) borran la celda existente.  Estados aceptados: X, E, P, F, R.

const ASIST_CELL_REGEX = /^m(\d{1,2})_s([1-5])$/i;

const importarAsistencia = async (req, res) => {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : null;
  const anio = parseInt(req.body?.anio, 10) || new Date().getFullYear();

  if (!rows || rows.length === 0)
    return res.status(400).json({ message: 'No se recibieron filas para importar' });
  if (rows.length > 1000)
    return res.status(400).json({ message: 'Máximo 1000 filas por importación' });
  if (anio < 2000 || anio > 2100)
    return res.status(400).json({ message: 'Año inválido' });

  const resultados = [];
  let ok = 0, fail = 0;

  for (let i = 0; i < rows.length; i++) {
    const fila = rows[i] || {};
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      const alumno = await buscarAlumnoPorClaveYNombre(conn, fila.clave, fila.nombre);

      let inserts = 0, deletes = 0;
      for (const [k, vraw] of Object.entries(fila)) {
        const m = ASIST_CELL_REGEX.exec(k);
        if (!m) continue;
        const mes = parseInt(m[1], 10);
        const semana = parseInt(m[2], 10);
        if (mes < 1 || mes > 12) continue;

        const v = vraw === undefined || vraw === null ? '' : String(vraw).trim();

        // Vacío = no tocar la celda (preserva lo que ya está cargado).
        if (v === '') continue;

        // Guion = borrar explícitamente la celda (útil para re-importar y
        // limpiar estados previos).
        if (v === '-') {
          await conn.query(
            `DELETE FROM asistencia_semanal
              WHERE alumno_id=? AND anio=? AND mes=? AND semana=?`,
            [alumno.id, anio, mes, semana]
          );
          deletes++;
          continue;
        }

        const estado =
          ESTADO_ASIST_ALIAS[v.toLowerCase()] ||
          (ESTADOS_ASIST_VALIDOS.has(v.toUpperCase()) ? v.toUpperCase() : null);
        if (!estado) {
          throw new Error(`mes ${mes} semana ${semana}: estado inválido "${v}" (use X, E, P, F, R o -)`);
        }
        await conn.query(
          `INSERT INTO asistencia_semanal (alumno_id, anio, mes, semana, estado)
           VALUES (?,?,?,?,?)
           ON DUPLICATE KEY UPDATE estado=VALUES(estado)`,
          [alumno.id, anio, mes, semana, estado]
        );
        inserts++;
      }

      // Antes exigíamos al menos una celda con valor; ahora basta con que
      // el alumno haya sido encontrado. Si la fila viene sin asistencias
      // (todas vacías), la importación se considera exitosa pero no toca
      // la BD. Útil para "registrar" alumnos en la importación masiva sin
      // que falle la fila por estar incompleta.
      await conn.commit();
      ok++;
      const detalle = (!inserts && !deletes)
        ? 'Alumno encontrado — sin celdas para actualizar'
        : `${inserts} celda(s) actualizada(s)${deletes ? `, ${deletes} borrada(s)` : ''}`;
      resultados.push({
        row: i + 1, ok: true,
        alumno_id: alumno.id, clave: alumno.clave,
        codigo_estudiante: alumno.codigo_estudiante,
        nombre: `${alumno.nombre} ${alumno.apellido}`,
        detalle,
      });
    } catch (err) {
      try { await conn.rollback(); } catch (_) {}
      fail++;
      resultados.push({ row: i + 1, ok: false, error: err.message || 'Error al insertar' });
    } finally {
      conn.release();
    }
  }

  log(req, 'importar', 'Asistencia',
    `Importación asistencia año ${anio}: ${ok} ok, ${fail} con error de ${rows.length}`);

  res.status(200).json({ total: rows.length, creados: ok, fallidos: fail, anio, resultados });
};

// ============================================================================
// METADATA DE TACs  →  GET /importacion/tacs
// ============================================================================
// Devuelve los TAC distintos registrados en alumnos.tac, ordenados.

const getTacsAcademia = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT DISTINCT tac
         FROM alumnos
        WHERE tac IS NOT NULL AND TRIM(tac) <> ''
        ORDER BY tac`
    );
    res.json(rows.map(r => r.tac));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al listar TACs' });
  }
};

// ============================================================================
// IMPORTAR NOTAS TAC ANUAL  →  notas_tac_anual  (plantilla DINÁMICA)
// ============================================================================
//
// Plantilla esperada (por fila = un alumno):
//   clave, nombre, tac{N}_nota1, tac{N}_nota2, tac{N}_nota3, tac{N}_nota4, ...
// donde {N} es cada TAC existente en la academia (ej. 01, 02, 03).
//
// Identificación por CLAVE + NOMBRE COMPLETO (ambos deben coincidir).
// Para cada bloque de 4 columnas con valor, se hace UPSERT en notas_tac_anual
// con (alumno_id, anio, tac).  Las celdas vacías = sin nota (no insertan).
//
// Compatibilidad: si las columnas son simplemente nota1..nota4 (sin prefijo),
// se asumen del TAC actual del alumno (alumno.tac).

const TAC_NOTA_REGEX = /^tac([^_\s]+)[_\s]?nota([1-4])$/i;

const importarNotasTac = async (req, res) => {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : null;
  const anio = parseInt(req.body?.anio, 10) || new Date().getFullYear();

  if (!rows || rows.length === 0)
    return res.status(400).json({ message: 'No se recibieron filas para importar' });
  if (rows.length > 1000)
    return res.status(400).json({ message: 'Máximo 1000 filas por importación' });
  if (anio < 2000 || anio > 2100)
    return res.status(400).json({ message: 'Año inválido' });

  const resultados = [];
  let ok = 0, fail = 0;

  for (let i = 0; i < rows.length; i++) {
    const fila = rows[i] || {};
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      const alumno = await buscarAlumnoPorClaveYNombre(conn, fila.clave, fila.nombre);

      // Agrupa las celdas con valor por TAC.
      // grupos = { '01': { nota1:85, nota2:90 }, '02': { nota1:80 } }
      const grupos = {};
      for (const [k, v] of Object.entries(fila)) {
        if (k === 'clave' || k === 'nombre') continue;
        if (v === undefined || v === '' || v === null) continue;
        const m = TAC_NOTA_REGEX.exec(String(k).trim());
        let tac, idx;
        if (m) {
          tac = m[1];
          idx = parseInt(m[2], 10);
        } else if (/^nota[1-4]$/i.test(String(k).trim())) {
          tac = alumno.tac || '01';
          idx = parseInt(String(k).trim().slice(-1), 10);
        } else {
          continue; // columna desconocida — se ignora
        }
        const n = Number(v);
        if (!Number.isFinite(n) || n < 0 || n > 100) {
          throw new Error(`"${k}" debe ser número entre 0 y 100 (recibí: ${v})`);
        }
        if (!grupos[tac]) grupos[tac] = {};
        grupos[tac][`nota${idx}`] = parseInt(n, 10);
      }

      const partes = [];
      for (const [tac, fields] of Object.entries(grupos)) {
        const cols = Object.keys(fields);
        if (!cols.length) continue;
        const placeholders = cols.map(() => '?').join(',');
        const updates = cols.map(c => `${c}=VALUES(${c})`).join(',');
        await conn.query(
          `INSERT INTO notas_tac_anual (alumno_id, anio, tac, ${cols.join(',')})
           VALUES (?, ?, ?, ${placeholders})
           ON DUPLICATE KEY UPDATE ${updates}`,
          [alumno.id, anio, tac, ...cols.map(c => fields[c])]
        );
        partes.push(`TAC${tac}: ${cols.map(c => `${c}=${fields[c]}`).join(' ')}`);
      }
      // Si la fila no trajo ninguna nota válida pero el alumno existe, la
      // marcamos como exitosa sin tocar la BD — útil para "registrar" al
      // alumno en el lote masivo sin que falle por estar incompleto.
      await conn.commit();
      ok++;
      resultados.push({
        row: i + 1, ok: true,
        alumno_id: alumno.id, clave: alumno.clave,
        codigo_estudiante: alumno.codigo_estudiante,
        nombre: `${alumno.nombre} ${alumno.apellido}`,
        detalle: partes.length
          ? partes.join(' | ')
          : 'Alumno encontrado — sin celdas para actualizar',
      });
    } catch (err) {
      try { await conn.rollback(); } catch (_) {}
      fail++;
      resultados.push({ row: i + 1, ok: false, error: err.message || 'Error al insertar' });
    } finally {
      conn.release();
    }
  }

  log(req, 'importar', 'Notas TAC',
    `Importación notas TAC año ${anio}: ${ok} ok, ${fail} con error de ${rows.length}`);

  res.status(200).json({ total: rows.length, creados: ok, fallidos: fail, anio, resultados });
};

// ============================================================================
// METADATA DE EXÁMENES DE DIPLOMADOS  →  GET /importacion/diplomados-programas
// ============================================================================
//
// Devuelve la lista plana de EXÁMENES de cada diplomado que se usan como
// columnas en la plantilla de Notas Diplomados.  Se excluye explícitamente
// el "Examen Final" porque ese se calcula/asigna en otro flujo y no debe
// formar parte de la importación masiva.
//
// El orden es por d.id (orden de creación = Operador, Programador, Diseño)
// y dentro de cada diplomado por e.orden.  Diplomados nuevos se agregan al
// final automáticamente.

const getProgramasDiplomados = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT e.id, e.nombre, e.orden,
              e.diplomado_id, d.nombre AS diplomado_nombre
         FROM dip_examenes e
         JOIN dip_diplomados d ON d.id = e.diplomado_id
        WHERE e.activo=1 AND d.activo=1
          AND LOWER(TRIM(e.nombre)) NOT LIKE '%examen final%'
        ORDER BY d.id, e.orden, e.id`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al listar exámenes de diplomados' });
  }
};

// ============================================================================
// IMPORTAR NOTAS DIPLOMADO  →  diplomado_notas
// ============================================================================
//
// Plantilla dinámica:
//   clave, nombre, <programa_1>, <programa_2>, ..., <programa_N>
// donde <programa_X> es el nombre exacto de cada programa activo de cada
// diplomado (ej. Windows, Word, Publisher, PowerPoint, Excel, Examen Final,
// Scratch, Python, C#, Photoshop, Illustrator, Filmora, ...).
//
// Identificación por CLAVE + NOMBRE COMPLETO (ambos deben coincidir).
// Cada celda con valor inserta/actualiza una fila en diplomado_notas
// (alumno_id, anio, materia=<programa>, nota).

const importarNotasDiplomados = async (req, res) => {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : null;
  const anio = parseInt(req.body?.anio, 10) || new Date().getFullYear();
  // Mapa enviado por el frontend para resolver cada encabezado de columna a
  // un (materia, diplomado).  Forma nueva:
  //   { "Parcial Operador Windows": { materia: "Parcial", diplomadoNombre: "Operador Windows" } }
  // Forma vieja (compat): { "Parcial (Programador)": "Parcial" }.
  const headerMapRaw = (req.body?.headerMap && typeof req.body.headerMap === 'object')
    ? req.body.headerMap : {};
  // Normalizamos a la forma nueva.
  const headerMap = {};
  for (const [k, v] of Object.entries(headerMapRaw)) {
    if (v && typeof v === 'object') headerMap[k] = v;
    else if (typeof v === 'string') headerMap[k] = { materia: v, diplomadoNombre: null };
  }

  if (!rows || rows.length === 0)
    return res.status(400).json({ message: 'No se recibieron filas para importar' });
  if (rows.length > 1000)
    return res.status(400).json({ message: 'Máximo 1000 filas por importación' });
  if (anio < 2000 || anio > 2100)
    return res.status(400).json({ message: 'Año inválido' });

  // Resolución de los programas/exámenes válidos por (nombre, diplomado).
  // Reflejamos la convención del frontend para el encabezado de cada columna:
  //   - La PRIMERA aparición de un nombre en el orden (d.id, e.orden) queda
  //     sin sufijo (ej. "Parcial" = del primer diplomado).
  //   - Las apariciones siguientes se cualifican como "Parcial (Programador)".
  // El mapa permite resolver headers vía `progMap` si no llega `headerMap`
  // desde el frontend.  Excluimos "Examen Final" porque la plantilla tampoco
  // lo incluye.
  const examenes = [];
  try {
    const [exs] = await db.query(
      `SELECT e.nombre, d.nombre AS diplomado_nombre
         FROM dip_examenes e
         JOIN dip_diplomados d ON d.id = e.diplomado_id
        WHERE e.activo=1 AND d.activo=1
          AND LOWER(TRIM(e.nombre)) NOT LIKE '%examen final%'
        ORDER BY d.id, e.orden, e.id`
    );
    examenes.push(...exs);
  } catch (_) { /* tabla puede no existir todavía */ }

  // headerNormalizado → { materia, diplomadoNombre }
  const progMap = new Map();
  const usados = new Map();
  for (const e of examenes) {
    const base = String(e.nombre || '').trim();
    const n = (usados.get(base) || 0) + 1;
    usados.set(base, n);
    const header = n === 1 ? base : `${base} (${e.diplomado_nombre})`;
    progMap.set(normNombre(header), { materia: base, diplomadoNombre: e.diplomado_nombre });
  }
  // materias cuyo nombre aparece en más de un diplomado (ej. "Parcial" en el
  // seed original) — solo para estas aplicamos el chequeo de coincidencia con
  // el diplomado del alumno.  Si el nombre del examen ya es único entre
  // diplomados (ej. "Parcial Operador"), la materia almacenada identifica
  // por sí sola al diplomado y no hace falta filtrar por alumno.diplomado.
  const materiaAmbigua = new Set();
  const conteoMateria = new Map();
  for (const e of examenes) {
    const base = String(e.nombre || '').trim();
    conteoMateria.set(base, (conteoMateria.get(base) || 0) + 1);
  }
  for (const [n, c] of conteoMateria) if (c > 1) materiaAmbigua.add(n);

  const resultados = [];
  let ok = 0, fail = 0;

  for (let i = 0; i < rows.length; i++) {
    const fila = rows[i] || {};
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      const alumno = await buscarAlumnoPorClaveYNombre(conn, fila.clave, fila.nombre);
      const dipAlumno = normNombre(alumno.diplomado || '');

      // Recorre todas las celdas que NO son clave/nombre y que correspondan
      // a un examen conocido.  Inserta cada nota por separado, comprobando
      // que la columna pertenezca al diplomado del alumno (evita duplicar
      // un "Parcial" entre dos diplomados distintos del mismo alumno).
      const insertados = [];
      const ignorados = [];
      for (const [k, v] of Object.entries(fila)) {
        if (k === 'clave' || k === 'nombre') continue;
        if (v === undefined || v === '' || v === null) continue;
        // Prioridad: headerMap del frontend (siempre cualificado), luego progMap.
        const info = headerMap[k] || progMap.get(normNombre(k));
        if (!info) continue; // columna desconocida — se ignora
        const materia = info.materia;
        const colDip = normNombre(info.diplomadoNombre || '');

        // Solo filtramos por diplomado cuando el nombre del examen es
        // AMBIGUO (aparece en más de un diplomado).  Si la materia ya es
        // única (ej. "Parcial Operador" sólo existe en el diplomado
        // Operador), la propia materia identifica al diplomado y no
        // necesitamos rechazar la celda aunque alumno.diplomado apunte a
        // otro — eso permite registrar notas de diplomados pasados o
        // paralelos sin tener que tocar el campo `diplomado` del alumno.
        if (materiaAmbigua.has(materia)
            && colDip && dipAlumno && colDip !== dipAlumno) {
          ignorados.push(`${k} (alumno en "${alumno.diplomado}", columna de "${info.diplomadoNombre}")`);
          continue;
        }

        const n = Number(v);
        if (!Number.isFinite(n) || n < 0 || n > 100) {
          throw new Error(`"${k}" debe ser número entre 0 y 100 (recibí: ${v})`);
        }
        const nota = parseInt(n, 10);
        await conn.query(
          `INSERT INTO diplomado_notas (alumno_id, anio, materia, nota)
           VALUES (?,?,?,?)
           ON DUPLICATE KEY UPDATE nota=VALUES(nota)`,
          [alumno.id, anio, materia, nota]
        );
        insertados.push(`${materia}=${nota}`);
      }
      // Filas sin notas se aceptan: si el alumno existe la fila se cuenta
      // como exitosa pero no toca la BD.
      await conn.commit();
      ok++;
      let detalle = insertados.length
        ? `${insertados.length} nota(s): ${insertados.join(', ')}`
        : 'Alumno encontrado — sin celdas para actualizar';
      if (ignorados.length) {
        detalle += ` | Omitidas ${ignorados.length}: ${ignorados.join('; ')}`;
      }
      resultados.push({
        row: i + 1, ok: true,
        alumno_id: alumno.id, clave: alumno.clave,
        codigo_estudiante: alumno.codigo_estudiante,
        nombre: `${alumno.nombre} ${alumno.apellido}`,
        detalle,
      });
    } catch (err) {
      try { await conn.rollback(); } catch (_) {}
      fail++;
      resultados.push({ row: i + 1, ok: false, error: err.message || 'Error al insertar' });
    } finally {
      conn.release();
    }
  }

  log(req, 'importar', 'Notas Diplomados',
    `Importación notas diplomados año ${anio}: ${ok} ok, ${fail} con error de ${rows.length}`);

  res.status(200).json({ total: rows.length, creados: ok, fallidos: fail, anio, resultados });
};

// ============================================================================
// IMPORTAR MECANOGRAFÍA  →  mecanografia_notas
// ============================================================================
//
// Plantilla (formato ancho — una fila por alumno):
//   clave, nombre, l1, l2, …, l20, examen
//
// El alumno se identifica por CLAVE + NOMBRE COMPLETO (ambos deben coincidir;
// el orden apellidos/nombre es irrelevante), igual que la importación de
// Asistencia. Las celdas vacías se ignoran. Si la fila no trae ninguna nota
// pero el alumno existe, la fila se considera exitosa (no toca la BD).

const MEC_COLS = ['l1','l2','l3','l4','l5','l6','l7','l8','l9','l10',
                  'l11','l12','l13','l14','l15','l16','l17','l18','l19','l20','examen'];

const importarMecanografia = async (req, res) => {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : null;
  const anio = parseInt(req.body?.anio, 10) || new Date().getFullYear();

  if (!rows || rows.length === 0)
    return res.status(400).json({ message: 'No se recibieron filas para importar' });
  if (rows.length > 1000)
    return res.status(400).json({ message: 'Máximo 1000 filas por importación' });
  if (anio < 2000 || anio > 2100)
    return res.status(400).json({ message: 'Año inválido' });

  const resultados = [];
  let ok = 0, fail = 0;

  for (let i = 0; i < rows.length; i++) {
    const fila = rows[i] || {};
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      const alumno = await buscarAlumnoPorClaveYNombre(conn, fila.clave, fila.nombre);

      // Validación de rangos numéricos (no exigimos al menos una nota).
      const cols = [];
      const vals = [];
      for (const k of MEC_COLS) {
        const raw = fila[k];
        if (raw === undefined || raw === '' || raw === null) continue;
        const n = Number(raw);
        if (!Number.isFinite(n) || n < 0 || n > 100) {
          throw new Error(`${k}: debe ser 0-100 (recibido "${raw}")`);
        }
        cols.push(k);
        vals.push(parseInt(n, 10));
      }

      let detalle;
      if (cols.length) {
        const placeholders = cols.map(() => '?').join(',');
        const updates = cols.map(c => `${c}=VALUES(${c})`).join(',');
        await conn.query(
          `INSERT INTO mecanografia_notas (alumno_id, anio, ${cols.join(',')})
           VALUES (?, ?, ${placeholders})
           ON DUPLICATE KEY UPDATE ${updates}`,
          [alumno.id, anio, ...vals]
        );
        detalle = `${cols.length} celda(s) actualizada(s)`;
      } else {
        detalle = 'Alumno encontrado — sin celdas para actualizar';
      }

      await conn.commit();
      ok++;
      resultados.push({
        row: i + 1, ok: true,
        alumno_id: alumno.id, clave: alumno.clave,
        codigo_estudiante: alumno.codigo_estudiante,
        nombre: `${alumno.nombre} ${alumno.apellido}`,
        detalle,
      });
    } catch (err) {
      try { await conn.rollback(); } catch (_) {}
      fail++;
      resultados.push({ row: i + 1, ok: false, error: err.message || 'Error al insertar' });
    } finally {
      conn.release();
    }
  }

  log(req, 'importar', 'Mecanografía',
    `Importación mecanografía año ${anio}: ${ok} ok, ${fail} con error de ${rows.length}`);

  res.status(200).json({ total: rows.length, creados: ok, fallidos: fail, anio, resultados });
};

// ============================================================================
// IMPORTAR PAGOS DE COLEGIATURA  →  recibos + mensualidades
// ============================================================================
//
// Plantilla simple (una fila por recibo):
//   no_recibo, alumno, descripcion, fecha, total, observaciones
//
// El alumno se identifica únicamente por NOMBRE COMPLETO (apellidos y
// nombre, en cualquier orden).  El mes que se cubre se deriva de la fecha
// del recibo (mes calendario), o se puede pasar explícito en `descripcion`
// con el nombre del mes (ej. "Marzo 2026").
//
// Crea el recibo en `recibos`, asegura la mensualidad correspondiente y la
// marca como pagada con el monto del recibo.

// Extrae el primer nombre de mes que aparezca en una cadena, o null.
const detectarMes = (texto) => {
  const t = String(texto || '').toLowerCase();
  for (const k of Object.keys(MES_ALIAS)) {
    if (k.length < 3) continue;          // saltar números '1','01' etc.
    if (t.includes(k)) return MES_ALIAS[k];
  }
  return null;
};

const importarPagos = async (req, res) => {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : null;
  const anio = parseInt(req.body?.anio, 10) || new Date().getFullYear();

  if (!rows || rows.length === 0)
    return res.status(400).json({ message: 'No se recibieron filas para importar' });
  if (rows.length > 1000)
    return res.status(400).json({ message: 'Máximo 1000 filas por importación' });
  if (anio < 2000 || anio > 2100)
    return res.status(400).json({ message: 'Año inválido' });

  const resultados = [];
  let ok = 0, fail = 0;

  for (let i = 0; i < rows.length; i++) {
    const fila = rows[i] || {};
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      // Inserción cruda: cada celda del Excel se guarda tal como vino, sin
      // lookup contra `alumnos` ni manipulación de `mensualidades`.  Todos
      // los campos son obligatorios (excepto `observaciones`).
      const noRecibo = cell(fila.no_recibo);
      const alumnoTxt = cell(fila.alumno);
      const desc      = cell(fila.descripcion);
      const fechaRaw  = cell(fila.fecha);
      const obs       = cell(fila.observaciones);

      if (!noRecibo)  throw new Error('no_recibo es obligatorio');
      if (!alumnoTxt) throw new Error('alumno es obligatorio');
      if (!desc)      throw new Error('descripcion es obligatoria');
      if (!fechaRaw)  throw new Error('fecha es obligatoria');
      if (!FECHA_REGEX.test(fechaRaw))
        throw new Error('fecha debe ser YYYY-MM-DD');

      const totalRaw = fila.total;
      if (totalRaw === '' || totalRaw == null || totalRaw === undefined)
        throw new Error('total es obligatorio');
      const totalNum = Number(totalRaw);
      if (!Number.isFinite(totalNum)) throw new Error('total debe ser numérico');
      if (totalNum < 0) throw new Error('total no puede ser negativo');
      const total = parseFloat(totalNum.toFixed(2));

      // Inserción literal en `recibos`: el nombre del alumno va al campo
      // `alumno_texto` (texto libre); la descripción va al campo `meses`
      // (que es el que se muestra junto al recibo en el listado).
      //
      // Idempotente por `no_recibo`: si ya existe un recibo con ese número
      // lo actualizamos en lugar de crear un duplicado.  Esto permite
      // re-importar el mismo Excel sin generar duplicados.
      const [existe] = await conn.query(
        `SELECT id FROM recibos WHERE no_recibo = ? LIMIT 1`,
        [noRecibo]
      );
      if (existe.length) {
        await conn.query(
          `UPDATE recibos
              SET alumno_texto = ?, meses = ?, fecha = ?, total = ?, observaciones = ?
            WHERE id = ?`,
          [alumnoTxt, desc, fechaRaw, total, obs, existe[0].id]
        );
      } else {
        await conn.query(
          `INSERT INTO recibos
             (no_recibo, alumno_id, alumno_texto, meses, fecha, total, observaciones)
           VALUES (?,?,?,?,?,?,?)`,
          [noRecibo, null, alumnoTxt, desc, fechaRaw, total, obs]
        );
      }

      await conn.commit();
      ok++;
      resultados.push({
        row: i + 1, ok: true,
        alumno_id: null, clave: null, codigo_estudiante: null,
        nombre: alumnoTxt,
        detalle: `Recibo ${noRecibo} — ${desc} Q${total}`,
      });
    } catch (err) {
      try { await conn.rollback(); } catch (_) {}
      fail++;
      resultados.push({ row: i + 1, ok: false, error: err.message || 'Error al insertar' });
    } finally {
      conn.release();
    }
  }

  log(req, 'importar', 'Pagos',
    `Importación pagos año ${anio}: ${ok} ok, ${fail} con error de ${rows.length}`);

  res.status(200).json({ total: rows.length, creados: ok, fallidos: fail, anio, resultados });
};

// ============================================================================
// IMPORTAR PAGOS MENSUALIDADES  →  recibos + mensualidades  (formato ancho)
// ============================================================================
//
// Plantilla (una fila por alumno):
//   clave, nombre, enero, febrero, marzo, ..., diciembre
//
// Identificación por CLAVE + NOMBRE COMPLETO (cualquier orden, multiset
// tolerante — igual que las notas TAC y Diplomados).  Cada celda mensual
// con valor representa el `no_recibo` del pago de esa mensualidad.  El
// monto cobrado es la `cuota_mensual` del alumno y la fecha del recibo
// es el día 1 del mes correspondiente del año seleccionado.

const importarPagosMensualidades = async (req, res) => {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : null;
  const anio = parseInt(req.body?.anio, 10) || new Date().getFullYear();

  if (!rows || rows.length === 0)
    return res.status(400).json({ message: 'No se recibieron filas para importar' });
  if (rows.length > 1000)
    return res.status(400).json({ message: 'Máximo 1000 filas por importación' });
  if (anio < 2000 || anio > 2100)
    return res.status(400).json({ message: 'Año inválido' });

  const resultados = [];
  let ok = 0, fail = 0;

  for (let i = 0; i < rows.length; i++) {
    const fila = rows[i] || {};
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      const alumno = await buscarAlumnoPorClaveYNombre(conn, fila.clave, fila.nombre);
      const cuota  = parseFloat(alumno.cuota_mensual) || 0;

      // El Excel es la fuente de verdad: antes de aplicar las celdas
      // reseteamos todas las mensualidades del alumno para este año y
      // borramos los recibos previos del año para evitar duplicados con
      // pagos antiguos que el Excel ya no contemple.
      const [resetInfo] = await conn.query(
        `UPDATE mensualidades
            SET no_recibo=NULL, pagado=0, fecha_pago=NULL, monto_abonado=0
          WHERE alumno_id=? AND anio=?`,
        [alumno.id, anio]
      );
      // Solo borramos los recibos "sintéticos" generados por este mismo
      // import (alumno_texto IS NULL).  Los recibos "literales" de
      // `importarPagos` (que sí traen alumno_texto con el nombre original)
      // se conservan aunque ya estén enlazados al alumno por alumno_id.
      const [delInfo] = await conn.query(
        `DELETE FROM recibos
          WHERE alumno_id=? AND YEAR(fecha)=? AND alumno_texto IS NULL`,
        [alumno.id, anio]
      );

      const detalles = [];
      for (let mIdx = 0; mIdx < 12; mIdx++) {
        const mesNombre = MESES_ORD[mIdx];
        const mesNum    = mIdx + 1;
        const raw       = fila[mesNombre];
        const noRecibo  = cell(raw);
        if (!noRecibo) continue;

        const fecha    = `${anio}-${String(mesNum).padStart(2, '0')}-01`;
        const montoMen = cuota;

        // 1) Asegurar mensualidad
        await conn.query(
          `INSERT IGNORE INTO mensualidades
             (alumno_id, mes, anio, monto, pagado, anulado, monto_abonado)
           VALUES (?, ?, ?, ?, 0, 0, 0)`,
          [alumno.id, mesNombre, anio, montoMen]
        );
        const [mensRows] = await conn.query(
          `SELECT id, monto FROM mensualidades
            WHERE alumno_id=? AND anio=? AND mes=?`,
          [alumno.id, anio, mesNombre]
        );
        if (!mensRows.length) throw new Error(`No se pudo crear la mensualidad de ${mesNombre}`);
        const m = mensRows[0];
        const montoFinal = parseFloat(m.monto) || montoMen;
        await conn.query(
          `UPDATE mensualidades
              SET no_recibo=?, pagado=1, fecha_pago=?, monto_abonado=?
            WHERE id=?`,
          [noRecibo, fecha, montoFinal, m.id]
        );

        // 2) Crear o enlazar el recibo en `recibos`.
        //    Si ya existe un recibo con ese `no_recibo` (típicamente
        //    importado primero por `importarPagos` con los datos literales),
        //    NO creamos uno nuevo — solo le ponemos el `alumno_id` para
        //    enlazarlo al alumno.  Esto evita los duplicados que pasaban
        //    cuando se corrían los dos imports sobre el mismo set de
        //    números de recibo.
        const [existeRec] = await conn.query(
          `SELECT id, alumno_id FROM recibos WHERE no_recibo = ? LIMIT 1`,
          [noRecibo]
        );
        if (existeRec.length) {
          if (!existeRec[0].alumno_id) {
            await conn.query(
              `UPDATE recibos SET alumno_id = ? WHERE id = ?`,
              [alumno.id, existeRec[0].id]
            );
          }
        } else {
          await conn.query(
            `INSERT INTO recibos
               (no_recibo, alumno_id, alumno_texto, meses, fecha, total, observaciones)
             VALUES (?,?,?,?,?,?,?)`,
            [noRecibo, alumno.id, null, `${cap(mesNombre)} ${anio}`, fecha, montoFinal, null]
          );
        }

        detalles.push(`${cap(mesNombre)} #${noRecibo}`);
      }

      // Permitido: alumno sin pagos en este año (todas las celdas vacías).
      // Se reporta como ok con detalle "sin pagos" para que el usuario lo
      // identifique en el resumen sin tratarlo como error.
      const reciboseliminados = delInfo?.affectedRows || 0;
      await conn.commit();
      ok++;
      resultados.push({
        row: i + 1, ok: true,
        alumno_id: alumno.id, clave: alumno.clave,
        codigo_estudiante: alumno.codigo_estudiante,
        nombre: `${alumno.nombre} ${alumno.apellido}`,
        detalle: detalles.length
          ? `${detalles.length} pago(s): ${detalles.join(', ')}` +
            (reciboseliminados ? ` (sustituyó ${reciboseliminados} recibo(s) previos)` : '')
          : `Sin pagos en ${anio}` + (reciboseliminados
              ? ` — eliminados ${reciboseliminados} recibo(s) previo(s)`
              : ''),
      });
    } catch (err) {
      try { await conn.rollback(); } catch (_) {}
      fail++;
      resultados.push({ row: i + 1, ok: false, error: err.message || 'Error al insertar' });
    } finally {
      conn.release();
    }
  }

  log(req, 'importar', 'Pagos Mensualidades',
    `Importación pagos mensualidades año ${anio}: ${ok} ok, ${fail} con error de ${rows.length}`);

  res.status(200).json({ total: rows.length, creados: ok, fallidos: fail, anio, resultados });
};

// ============================================================================
// IMPORTAR RECIBOS DE DIPLOMADOS  →  recibos_diplomados
// ============================================================================
//
// Plantilla simple (una fila por recibo):
//   no_recibo, alumno, descripcion, fecha, total, observaciones, diplomado
//
// El alumno se identifica únicamente por NOMBRE COMPLETO (apellidos y
// nombre, en cualquier orden).  `diplomado` es opcional (texto libre).

const importarRecibosDiplomados = async (req, res) => {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : null;
  const anio = parseInt(req.body?.anio, 10) || new Date().getFullYear();

  if (!rows || rows.length === 0)
    return res.status(400).json({ message: 'No se recibieron filas para importar' });
  if (rows.length > 1000)
    return res.status(400).json({ message: 'Máximo 1000 filas por importación' });
  if (anio < 2000 || anio > 2100)
    return res.status(400).json({ message: 'Año inválido' });

  const resultados = [];
  let ok = 0, fail = 0;

  for (let i = 0; i < rows.length; i++) {
    const fila = rows[i] || {};
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      // Búsqueda flexible: si no existe alumno con ese nombre se permite
      // (caso "anulado").  La ambigüedad (>1 match) sigue siendo error.
      let alumno = null;
      const alumnoTxt = cell(fila.alumno);
      if (!alumnoTxt) throw new Error('alumno es obligatorio');
      try {
        alumno = await buscarAlumnoPorNombreUnico(conn, alumnoTxt);
      } catch (e) {
        if (!/No existe alumno/i.test(e.message)) throw e;
      }

      // Total opcional: si viene vacío o no numérico, se asume 0.
      const totalRaw = fila.total;
      const totalNum = Number(totalRaw);
      const total = (totalRaw === '' || totalRaw == null || !Number.isFinite(totalNum))
        ? 0
        : parseFloat(totalNum.toFixed(2));
      if (total < 0) throw new Error('total no puede ser negativo');

      const fecha = cell(fila.fecha) && FECHA_REGEX.test(fila.fecha)
                      ? String(fila.fecha).trim()
                      : `${anio}-01-01`;
      const dip   = cell(fila.diplomado);
      const desc  = cell(fila.descripcion);
      const obs   = cell(fila.observaciones);

      let noRecibo = cell(fila.no_recibo);
      if (!noRecibo) {
        // Correlativo basado en la tabla `papeleria` (es donde se guarda y
        // donde el módulo "Recibos" del frontend lee).
        const [r2] = await conn.query(
          `SELECT COALESCE(MAX(CAST(no_recibo AS UNSIGNED)), 999) + 1 AS next_no
             FROM papeleria WHERE no_recibo REGEXP '^[0-9]+$'`
        );
        noRecibo = String(r2[0].next_no);
      }

      // Construimos la descripción.  Si no hay alumno asociado, anteponemos
      // el texto que escribió el usuario (ej. "anulado") para que se vea.
      const partes = [];
      if (!alumno) partes.push(alumnoTxt);
      if (dip)     partes.push(dip);
      if (desc)    partes.push(desc);
      const descCompleta = partes.join(' · ') || null;

      // El módulo "Recibos" (con encabezado "Descripción") lee de la tabla
      // `papeleria`.  Mantenemos también copia en `recibos_diplomados` por
      // compatibilidad con reportes históricos.
      await conn.query(
        `INSERT INTO papeleria (no_recibo, alumno_id, descripcion, fecha, total, observaciones)
         VALUES (?,?,?,?,?,?)`,
        [noRecibo, alumno?.id || null, descCompleta, fecha, total, obs]
      );
      await conn.query(
        `INSERT INTO recibos_diplomados
           (no_recibo, alumno_id, diplomado, descripcion, fecha, total, observaciones)
         VALUES (?,?,?,?,?,?,?)`,
        [noRecibo, alumno?.id || null, dip, desc, fecha, total, obs]
      );

      await conn.commit();
      ok++;
      resultados.push({
        row: i + 1, ok: true,
        alumno_id: alumno?.id || null,
        clave: alumno?.clave || null,
        codigo_estudiante: alumno?.codigo_estudiante || null,
        nombre: alumno ? `${alumno.nombre} ${alumno.apellido}` : alumnoTxt,
        detalle: alumno
          ? `Recibo ${noRecibo}${dip ? ' — ' + dip : ''} Q${total}`
          : `Recibo ${noRecibo} sin alumno (texto: "${alumnoTxt}") Q${total}`,
      });
    } catch (err) {
      try { await conn.rollback(); } catch (_) {}
      fail++;
      resultados.push({ row: i + 1, ok: false, error: err.message || 'Error al insertar' });
    } finally {
      conn.release();
    }
  }

  log(req, 'importar', 'Recibos Diplomados',
    `Importación recibos diplomados año ${anio}: ${ok} ok, ${fail} con error de ${rows.length}`);

  res.status(200).json({ total: rows.length, creados: ok, fallidos: fail, anio, resultados });
};

module.exports = {
  importarAlumnos,
  importarAsistencia,
  importarNotasTac,
  importarNotasDiplomados,
  importarMecanografia,
  importarPagos,
  importarPagosMensualidades,
  importarRecibosDiplomados,
  getProgramasDiplomados,
  getTacsAcademia,
  validarFila: validarFilaAlumno,  // compatibilidad
};
