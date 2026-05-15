// Gestión de academias (sedes) — sólo accesible para super-admin
// (admin de la sede semilla `sistema_escolar`).  Permite crear nuevas
// sedes con módulos seleccionables, editar metadatos, activar/desactivar
// y listar todas (incluyendo inactivas) para el panel.

const {
  SEDES, sedesMeta, pools,
} = require('../config/db');
const {
  insertarSede, actualizarSede, actualizarActivo,
} = require('../utils/sedeRegistry');
const { bootstrapSede } = require('../utils/sedeBootstrap');

// Catálogo central de módulos disponibles.  Se sincroniza con el sidebar
// (client/src/components/Sidebar.jsx) y la matriz de permisos.
const MODULOS_DISPONIBLES = [
  { id: 'dashboard',        label: 'Dashboard' },
  { id: 'alumnos',          label: 'Alumnos' },
  { id: 'diplomados',       label: 'Diplomados' },
  { id: 'asistencia',       label: 'Asistencia' },
  { id: 'planificaciones',  label: 'Planificaciones' },
  { id: 'mecanografia',     label: 'Mecanografía' },
  { id: 'notasTac',         label: 'Notas TAC' },
  { id: 'inscritosTac',     label: 'Inscritos TAC' },
  { id: 'notasDiplomados',  label: 'Notas Diplomados' },
  { id: 'reporteAlumno',    label: 'Reporte Alumno' },
  { id: 'consultas',        label: 'Consultas' },
  { id: 'impresion',        label: 'Impresión' },
  { id: 'misTablas',        label: 'Mis Tablas' },
  { id: 'nuevoPago',        label: 'Nuevo Pago' },
  { id: 'otrosPagos',       label: 'Otros Pagos' },
  { id: 'pagos',            label: 'Pagos' },
  { id: 'recibos',          label: 'Recibos' },
  { id: 'papeleria',        label: 'Papelería' },
  { id: 'avisos',           label: 'Avisos' },
  { id: 'usuarios',         label: 'Usuarios' },
  { id: 'configuracion',    label: 'Configuración' },
  { id: 'bitacora',         label: 'Bitácora' },
  { id: 'importar',         label: 'Importar Datos' },
  { id: 'manual',           label: 'Manual' },
];

const IDS_VALIDOS = new Set(MODULOS_DISPONIBLES.map(m => m.id));

// Convierte "Sistec Quetzaltenango" → "sistec_quetzaltenango"
const slugify = (s) => String(s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '')
  .slice(0, 60);

// El nombre de base de datos en MySQL debe pasar este filtro.
const idValido = (id) => /^[a-z][a-z0-9_]{2,59}$/.test(id);

const sanitizarModulos = (raw) => {
  if (!Array.isArray(raw)) return null;
  const limpios = raw.filter(m => IDS_VALIDOS.has(m));
  return limpios.length ? limpios : null;
};

const listModulos = (_req, res) => {
  res.json(MODULOS_DISPONIBLES);
};

// Lista TODAS las academias (activas + inactivas) para el panel admin.
const listAcademias = (_req, res) => {
  const out = SEDES.map(s => {
    const m = sedesMeta[s.id] || {};
    return {
      id: s.id,
      nombre: s.nombre,
      info: m.info || null,
      activo: m.activo !== false,
      modulos: m.modulos || null,
      email_admin: m.email_admin || null,
    };
  });
  res.json(out);
};

const getAcademia = (req, res) => {
  const { id } = req.params;
  if (!pools[id]) return res.status(404).json({ message: 'Sede no encontrada' });
  const meta = sedesMeta[id] || {};
  const base = SEDES.find(s => s.id === id);
  res.json({
    id,
    nombre: base?.nombre || meta.nombre || id,
    info: meta.info || null,
    activo: meta.activo !== false,
    modulos: meta.modulos || null,
    email_admin: meta.email_admin || null,
  });
};

const crearAcademia = async (req, res) => {
  let { id, nombre, info, modulos, email_admin, admin_password } = req.body || {};
  nombre = String(nombre || '').trim();
  if (!nombre) return res.status(400).json({ message: 'Nombre requerido' });

  id = String(id || slugify(nombre));
  if (!idValido(id)) {
    return res.status(400).json({
      message: 'ID inválido. Sólo letras minúsculas, números y guion bajo (3-60 caracteres, comienza con letra)',
    });
  }
  if (pools[id]) return res.status(409).json({ message: 'Ya existe una sede con ese ID' });

  const modulosLimpios = sanitizarModulos(modulos);
  const emailLimpio = email_admin ? String(email_admin).trim().toLowerCase() : null;

  try {
    // 1) Persiste en meta + registra en memoria + crea pool.
    await insertarSede({
      id, nombre, info: info || null,
      modulos: modulosLimpios, email_admin: emailLimpio,
    });

    // 2) Crea la BD física, esquema, admin por defecto, mensualidades.
    const adminOverride = emailLimpio
      ? { email: emailLimpio, password: admin_password || 'admin123', nombre: `Admin ${nombre}` }
      : null;
    await bootstrapSede(id, adminOverride);

    res.status(201).json({
      id, nombre,
      info: info || null,
      activo: true,
      modulos: modulosLimpios,
      email_admin: emailLimpio,
    });
  } catch (err) {
    console.error('crearAcademia error:', err);
    res.status(500).json({ message: 'No se pudo crear la academia: ' + err.message });
  }
};

const editarAcademia = async (req, res) => {
  const { id } = req.params;
  if (!pools[id]) return res.status(404).json({ message: 'Sede no encontrada' });

  const { nombre, info, modulos, email_admin } = req.body || {};
  const patch = {};
  if (nombre !== undefined)  patch.nombre = String(nombre).trim();
  if (info !== undefined)    patch.info = info ? String(info) : null;
  if (modulos !== undefined) patch.modulos = sanitizarModulos(modulos);
  if (email_admin !== undefined) {
    patch.email_admin = email_admin ? String(email_admin).trim().toLowerCase() : null;
  }

  if (patch.nombre === '') {
    return res.status(400).json({ message: 'El nombre no puede estar vacío' });
  }

  try {
    await actualizarSede(id, patch);
    const meta = sedesMeta[id] || {};
    const base = SEDES.find(s => s.id === id);
    res.json({
      id,
      nombre: base?.nombre || id,
      info: meta.info || null,
      activo: meta.activo !== false,
      modulos: meta.modulos || null,
      email_admin: meta.email_admin || null,
    });
  } catch (err) {
    console.error('editarAcademia error:', err);
    res.status(500).json({ message: 'No se pudo actualizar la academia' });
  }
};

const toggleActivo = async (req, res) => {
  const { id } = req.params;
  if (!pools[id]) return res.status(404).json({ message: 'Sede no encontrada' });

  const activo = !!req.body?.activo;

  // No permitimos desactivar la propia sede del super-admin (se quedaría
  // sin acceso al panel).
  if (!activo && req.user?.sede === id) {
    return res.status(400).json({
      message: 'No puedes desactivar la sede desde la que iniciaste sesión',
    });
  }

  try {
    await actualizarActivo(id, activo);
    res.json({ id, activo });
  } catch (err) {
    console.error('toggleActivo error:', err);
    res.status(500).json({ message: 'No se pudo actualizar el estado' });
  }
};

module.exports = {
  listModulos,
  listAcademias,
  getAcademia,
  crearAcademia,
  editarAcademia,
  toggleActivo,
  MODULOS_DISPONIBLES,
};
