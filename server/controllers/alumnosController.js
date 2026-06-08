const db = require('../config/db');
const bcrypt = require('bcryptjs');
const { log } = require('../utils/bitacora');
const { generarClave } = require('../utils/generarClave');

const normalizar = s =>
  (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

const CODIGO_REGEX = /^[A-Z][0-9]{3}[A-Z]{3}$/;

// Obtener todos los alumnos
const getAlumnos = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT a.*, u.email
      FROM alumnos a
      LEFT JOIN usuarios u ON a.usuario_id = u.id
      ORDER BY a.id ASC
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al obtener alumnos' });
  }
};

// Obtener un alumno por ID
const getAlumnoById = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT a.*, u.email
      FROM alumnos a
      LEFT JOIN usuarios u ON a.usuario_id = u.id
      WHERE a.id = ?
    `, [req.params.id]);

    if (rows.length === 0)
      return res.status(404).json({ message: 'Alumno no encontrado' });

    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ message: 'Error al obtener alumno' });
  }
};

// Crear alumno
const crearAlumno = async (req, res) => {
  const {
    codigo_estudiante, nombre, apellido, fecha_inicio, fecha_nacimiento,
    encargado, telefono, diplomado, tac, asesor, direccion, establecimiento,
    observaciones, dia_clases1, dia_clases2, horario, laboratorio,
    estado, cuota_mensual,
    // Campos de instituciones (nullables; las academias no los envían)
    grado, seccion, maestro_guia, plan_clases, dias_clase
  } = req.body;

  const codigoEst = (codigo_estudiante || '').trim().toUpperCase() || null;
  if (codigoEst && !CODIGO_REGEX.test(codigoEst)) {
    return res.status(400).json({ message: 'Código de estudiante inválido. Formato esperado: A000AAA (letra, 3 dígitos, 3 letras).' });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const clave = await generarClave(conn, fecha_inicio);
    const primerNombre = normalizar(nombre.trim().split(/\s+/)[0]);
    const username = primerNombre + clave;
    const anioInscrito = fecha_inicio ? new Date(fecha_inicio + 'T00:00:00').getFullYear() : new Date().getFullYear();
    const passwordPlain = username + anioInscrito;

    const hash = await bcrypt.hash(passwordPlain, 10);
    const [userResult] = await conn.query(
      'INSERT INTO usuarios (nombre, email, password, rol) VALUES (?, ?, ?, ?)',
      [`${nombre} ${apellido}`, username, hash, 'alumno']
    );
    const usuario_id = userResult.insertId;

    // Crear alumno
    const [alumnoResult] = await conn.query(`
      INSERT INTO alumnos
      (clave, codigo_estudiante, nombre, apellido, fecha_inicio, fecha_nacimiento,
       encargado, telefono, diplomado, tac, asesor, direccion, establecimiento,
       observaciones, dia_clases1, dia_clases2, horario, laboratorio,
       grado, seccion, maestro_guia, plan_clases, dias_clase,
       estado, cuota_mensual, usuario_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      clave, codigoEst, nombre, apellido, fecha_inicio || null, fecha_nacimiento || null,
      encargado, telefono, diplomado, tac, asesor || null, direccion, establecimiento,
      observaciones, dia_clases1, dia_clases2 || null, horario, laboratorio,
      grado || null, seccion || null, maestro_guia || null, plan_clases || null, dias_clase || null,
      estado || 'activo', cuota_mensual, usuario_id
    ]);

    const alumno_id = alumnoResult.insertId;

    // Generar 12 mensualidades automáticamente
    const meses = ['enero','febrero','marzo','abril','mayo','junio',
                   'julio','agosto','septiembre','octubre','noviembre','diciembre'];
    const anio = new Date().getFullYear();

    for (const mes of meses) {
      await conn.query(
        'INSERT INTO mensualidades (alumno_id, mes, anio, monto) VALUES (?, ?, ?, ?)',
        [alumno_id, mes, anio, cuota_mensual]
      );
    }

    await conn.commit();
    log(req, 'crear', 'Alumnos', `Alumno creado: ${nombre} ${apellido} (clave ${clave}${codigoEst ? `, código ${codigoEst}` : ''})`);
    res.status(201).json({ message: 'Alumno creado correctamente', id: alumno_id, clave, codigo_estudiante: codigoEst, usuario: username, password: passwordPlain });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    if (err.code === 'ER_DUP_ENTRY') {
      const msg = /codigo_estudiante/i.test(err.message) ? 'El código de estudiante ya existe' : 'La clave o el usuario ya existen';
      return res.status(400).json({ message: msg });
    }
    res.status(500).json({ message: 'Error al crear alumno' });
  } finally {
    conn.release();
  }
};

// Actualizar contraseña de alumno
const actualizarPassword = async (req, res) => {
  const { password } = req.body;
  if (!password || password.length < 4)
    return res.status(400).json({ message: 'La contraseña debe tener al menos 4 caracteres' });
  try {
    const [rows] = await db.query('SELECT usuario_id FROM alumnos WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ message: 'Alumno no encontrado' });
    const hash = await bcrypt.hash(password, 10);
    await db.query('UPDATE usuarios SET password = ? WHERE id = ?', [hash, rows[0].usuario_id]);
    log(req, 'editar', 'Alumnos', `Contraseña actualizada para alumno ID ${req.params.id}`);
    res.json({ message: 'Contraseña actualizada correctamente' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al actualizar contraseña' });
  }
};

// Editar alumno (la `clave` es inmutable; sólo se permite editar codigo_estudiante)
const editarAlumno = async (req, res) => {
  const {
    codigo_estudiante, nombre, apellido, fecha_inicio, fecha_nacimiento,
    encargado, telefono, diplomado, tac, asesor, direccion, establecimiento,
    observaciones, dia_clases1, dia_clases2, horario, laboratorio,
    estado, cuota_mensual,
    // Campos de instituciones (nullables; las academias no los envían)
    grado, seccion, maestro_guia, plan_clases, dias_clase
  } = req.body;

  const codigoEst = (codigo_estudiante || '').trim().toUpperCase() || null;
  if (codigoEst && !CODIGO_REGEX.test(codigoEst)) {
    return res.status(400).json({ message: 'Código de estudiante inválido. Formato esperado: A000AAA (letra, 3 dígitos, 3 letras).' });
  }

  try {
    await db.query(`
      UPDATE alumnos SET
        codigo_estudiante=?, nombre=?, apellido=?, fecha_inicio=?, fecha_nacimiento=?,
        encargado=?, telefono=?, diplomado=?, tac=?, asesor=?, direccion=?, establecimiento=?,
        observaciones=?, dia_clases1=?, dia_clases2=?, horario=?, laboratorio=?,
        grado=?, seccion=?, maestro_guia=?, plan_clases=?, dias_clase=?,
        estado=?, cuota_mensual=?
      WHERE id=?
    `, [
      codigoEst, nombre, apellido, fecha_inicio || null, fecha_nacimiento || null,
      encargado, telefono, diplomado, tac, asesor || null, direccion, establecimiento,
      observaciones, dia_clases1, dia_clases2 || null, horario, laboratorio,
      grado || null, seccion || null, maestro_guia || null, plan_clases || null, dias_clase || null,
      estado, cuota_mensual, req.params.id
    ]);

    log(req, 'editar', 'Alumnos', `Alumno editado ID ${req.params.id}: ${nombre} ${apellido}`);
    res.json({ message: 'Alumno actualizado correctamente' });
  } catch (err) {
    console.error(err);
    if (err.code === 'ER_DUP_ENTRY')
      return res.status(400).json({ message: 'El código de estudiante ya está en uso' });
    res.status(500).json({ message: 'Error al actualizar alumno' });
  }
};

// Eliminar alumno
const eliminarAlumno = async (req, res) => {
  try {
    await db.query('DELETE FROM alumnos WHERE id = ?', [req.params.id]);
    log(req, 'eliminar', 'Alumnos', `Alumno eliminado ID ${req.params.id}`);
    res.json({ message: 'Alumno eliminado correctamente' });
  } catch (err) {
    res.status(500).json({ message: 'Error al eliminar alumno' });
  }
};

module.exports = { getAlumnos, getAlumnoById, crearAlumno, editarAlumno, eliminarAlumno, actualizarPassword };
