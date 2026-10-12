// Configuración del portal del alumno, por sede.
//
// Se guarda como JSON en la tabla `configuracion` (clave 'portal_alumno'),
// así no requiere tablas nuevas.  Los DEFAULTS reproducen el comportamiento
// que había antes de existir esta configuración (todo visible y publicado),
// salvo `soloActivos`: por defecto un alumno inactivo/retirado ya no entra.
//
// Recibe el pool explícito porque el login corre fuera de runWithSede.

const CLAVE = 'portal_alumno';

// Módulos del portal que el admin puede ocultar (Dashboard y Perfil siempre se ven).
const MODULOS = ['asistencia', 'notas', 'pagos', 'mecanografia', 'avisos'];

const DEFAULTS = {
  modulos: { asistencia: true, notas: true, pagos: true, mecanografia: true, avisos: true },
  publicar: {
    tac: [true, true, true, true],   // nota1..nota4
    diplomado: true,
    mecanografia: true,
  },
  notasSoloSolventes: false,
  soloActivos: true,
};

const bool = (v, d) => (typeof v === 'boolean' ? v : d);

// Mezcla lo guardado con los defaults y descarta claves desconocidas.
const normalizar = (raw) => {
  const r = raw && typeof raw === 'object' ? raw : {};
  const m = r.modulos || {};
  const p = r.publicar || {};
  const tac = Array.isArray(p.tac) ? p.tac : [];
  return {
    modulos: Object.fromEntries(MODULOS.map(k => [k, bool(m[k], DEFAULTS.modulos[k])])),
    publicar: {
      tac: DEFAULTS.publicar.tac.map((d, i) => bool(tac[i], d)),
      diplomado: bool(p.diplomado, DEFAULTS.publicar.diplomado),
      mecanografia: bool(p.mecanografia, DEFAULTS.publicar.mecanografia),
    },
    notasSoloSolventes: bool(r.notasSoloSolventes, DEFAULTS.notasSoloSolventes),
    soloActivos: bool(r.soloActivos, DEFAULTS.soloActivos),
  };
};

const getPortalConfig = async (pool) => {
  try {
    const [[row]] = await pool.query('SELECT valor FROM configuracion WHERE clave = ?', [CLAVE]);
    return normalizar(row?.valor ? JSON.parse(row.valor) : null);
  } catch {
    return normalizar(null);
  }
};

const savePortalConfig = async (pool, raw) => {
  const cfg = normalizar(raw);
  await pool.query(
    `INSERT INTO configuracion (clave, valor) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE valor = VALUES(valor)`,
    [CLAVE, JSON.stringify(cfg)]
  );
  return cfg;
};

// Estado del alumno ligado a un usuario ('activo' | 'inactivo' | 'retirado' | null).
const estadoAlumnoDeUsuario = async (pool, usuarioId) => {
  const [[row]] = await pool.query('SELECT estado FROM alumnos WHERE usuario_id = ?', [usuarioId]);
  return row ? row.estado : null;
};

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
               'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

// Año y mes (1..12) actuales en hora de Guatemala (el servidor corre en UTC).
const hoyGuatemala = () => {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: 'America/Guatemala', year: 'numeric', month: 'numeric' })
      .formatToParts(new Date()).map(x => [x.type, x.value])
  );
  return { anio: parseInt(p.year, 10), mes: parseInt(p.month, 10) };
};

// Solvente = no debe ninguna mensualidad del año en curso hasta el mes actual
// (inclusive).  Las anuladas y las de descuento 100% no cuentan como deuda.
const esSolvente = async (pool, alumnoId) => {
  const { anio, mes } = hoyGuatemala();
  const mesesHastaHoy = MESES.slice(0, mes);
  const [[row]] = await pool.query(
    `SELECT COUNT(*) AS pendientes FROM mensualidades
      WHERE alumno_id = ? AND anio = ? AND mes IN (?)
        AND pagado = 0 AND anulado = 0 AND descuento_100 = 0`,
    [alumnoId, anio, mesesHastaHoy]
  );
  return Number(row.pendientes) === 0;
};

module.exports = {
  MODULOS,
  DEFAULTS,
  normalizar,
  getPortalConfig,
  savePortalConfig,
  estadoAlumnoDeUsuario,
  esSolvente,
};
