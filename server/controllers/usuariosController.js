const { getPool } = require('../config/db');
const bcrypt = require('bcryptjs');

const ROLES_BASE = ['admin', 'oficina', 'maestro'];

// Valida que el rol sea uno base o un slug de rol custom existente y activo.
const esRolValido = async (pool, rol) => {
  if (ROLES_BASE.includes(rol)) return true;
  const [[r]] = await pool.query(
    'SELECT id FROM roles_custom WHERE slug = ? AND activo = 1',
    [rol]
  );
  return !!r;
};

const listar = async (req, res) => {
  try {
    const pool = getPool(req.user.sede);
    // Excluye solo a los alumnos (rol='alumno') del listado de "Usuarios y
    // Roles" — los demás (base + custom) se gestionan acá.
    const [rows] = await pool.query(
      `SELECT id, nombre, email, rol, activo, created_at
         FROM usuarios
        WHERE rol <> 'alumno'
        ORDER BY created_at DESC, id DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error('usuarios.listar:', err);
    res.status(500).json({ message: 'Error en el servidor' });
  }
};

const crear = async (req, res) => {
  const { nombre, email, password, rol, activo } = req.body;

  if (!nombre || !email || !password || !rol) {
    return res.status(400).json({ message: 'Faltan datos obligatorios' });
  }

  try {
    const pool = getPool(req.user.sede);
    if (!(await esRolValido(pool, rol))) {
      return res.status(400).json({ message: 'Rol no válido' });
    }
    const [existe] = await pool.query('SELECT id FROM usuarios WHERE email = ?', [email]);
    if (existe.length > 0) {
      return res.status(400).json({ message: 'El email ya está registrado' });
    }
    const hash = await bcrypt.hash(password, 10);
    const estado = activo === 0 || activo === false ? 0 : 1;
    const [r] = await pool.query(
      'INSERT INTO usuarios (nombre, email, password, rol, activo) VALUES (?, ?, ?, ?, ?)',
      [nombre, email, hash, rol, estado]
    );
    res.status(201).json({ id: r.insertId, message: 'Usuario creado correctamente' });
  } catch (err) {
    console.error('usuarios.crear:', err);
    res.status(500).json({ message: 'Error en el servidor' });
  }
};

const actualizar = async (req, res) => {
  const { id } = req.params;
  const { nombre, email, rol, activo, password } = req.body;

  try {
    const pool = getPool(req.user.sede);
    if (rol && !(await esRolValido(pool, rol))) {
      return res.status(400).json({ message: 'Rol no válido' });
    }
    const [rows] = await pool.query('SELECT id, rol FROM usuarios WHERE id = ?', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }
    if (rows[0].rol === 'alumno') {
      return res.status(400).json({ message: 'Este endpoint no gestiona alumnos' });
    }

    const sets = [];
    const params = [];
    if (nombre !== undefined) { sets.push('nombre = ?'); params.push(nombre); }
    if (email  !== undefined) { sets.push('email = ?');  params.push(email);  }
    if (rol    !== undefined) { sets.push('rol = ?');    params.push(rol);    }
    if (activo !== undefined) { sets.push('activo = ?'); params.push(activo ? 1 : 0); }
    if (password) {
      const hash = await bcrypt.hash(password, 10);
      sets.push('password = ?'); params.push(hash);
    }
    if (sets.length === 0) {
      return res.json({ message: 'Sin cambios' });
    }
    params.push(id);
    await pool.query(`UPDATE usuarios SET ${sets.join(', ')} WHERE id = ?`, params);
    res.json({ message: 'Usuario actualizado' });
  } catch (err) {
    console.error('usuarios.actualizar:', err);
    res.status(500).json({ message: 'Error en el servidor' });
  }
};

const toggleEstado = async (req, res) => {
  const { id } = req.params;
  try {
    const pool = getPool(req.user.sede);
    const [rows] = await pool.query('SELECT id, activo, rol FROM usuarios WHERE id = ?', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }
    if (rows[0].rol === 'alumno') {
      return res.status(400).json({ message: 'Este endpoint no gestiona alumnos' });
    }
    const nuevo = rows[0].activo ? 0 : 1;
    await pool.query('UPDATE usuarios SET activo = ? WHERE id = ?', [nuevo, id]);
    res.json({ activo: nuevo });
  } catch (err) {
    console.error('usuarios.toggleEstado:', err);
    res.status(500).json({ message: 'Error en el servidor' });
  }
};

const eliminar = async (req, res) => {
  const { id } = req.params;
  try {
    const pool = getPool(req.user.sede);
    const [rows] = await pool.query('SELECT id, rol FROM usuarios WHERE id = ?', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }
    if (rows[0].rol === 'alumno') {
      return res.status(400).json({ message: 'Este endpoint no gestiona alumnos' });
    }
    if (Number(id) === Number(req.user.id)) {
      return res.status(400).json({ message: 'No puedes eliminarte a ti mismo' });
    }
    await pool.query('DELETE FROM usuarios WHERE id = ?', [id]);
    res.json({ message: 'Usuario eliminado' });
  } catch (err) {
    console.error('usuarios.eliminar:', err);
    res.status(500).json({ message: 'Error en el servidor' });
  }
};

module.exports = { listar, crear, actualizar, toggleEstado, eliminar };
