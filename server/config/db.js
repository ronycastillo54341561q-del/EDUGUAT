const mysql = require('mysql2');
const { AsyncLocalStorage } = require('async_hooks');
require('dotenv').config();

// Sedes "semilla" — estas tres ya tenían datos antes de que el registro
// dinámico existiera, así que las inicializamos siempre.  El resto se
// cargan desde la base meta `eduguat_meta`.
const SEDES_SEMILLA = [
  { id: 'sistema_escolar', nombre: 'Sistec Flores' },
  { id: 'm_lozano',        nombre: 'M Lozano' },
  { id: 'sistec_jutiapa',  nombre: 'Sistec Jutiapa' },
];

const META_DB = 'eduguat_meta';

const baseConfig = {
  user:              process.env.DB_USER,
  password:          process.env.DB_PASSWORD,
  host:              process.env.DB_HOST,
  port:              Number(process.env.DB_PORT) || 3306,
  waitForConnections: true,
  connectionLimit:   10,
  dateStrings:       true,
};

// SEDES y pools son mutables: el router de Academias agrega entradas
// nuevas en runtime cuando un super-admin crea otra sede.
const SEDES = [...SEDES_SEMILLA];
const pools = {};
// Metadata extendida por sede (activo, modulos, email_admin, …) cargada
// desde la base meta.  Si una sede semilla todavía no está en el registro,
// se trata como activa con todos los módulos por defecto.
const sedesMeta = {};

const ensurePool = (id) => {
  if (!pools[id]) {
    pools[id] = mysql.createPool({ ...baseConfig, database: id }).promise();
  }
  return pools[id];
};

for (const { id } of SEDES_SEMILLA) ensurePool(id);

// Pool dedicado a la base meta — se inicializa después de que ésta
// existe (lo crea bootstrapMeta en index.js).
let metaPool = null;
const getMetaPool = () => {
  if (!metaPool) {
    metaPool = mysql.createPool({ ...baseConfig, database: META_DB }).promise();
  }
  return metaPool;
};

// Registra una sede nueva en memoria.  El que llame se encarga de crear
// la base de datos, su esquema y la fila en la tabla meta.
const registerSede = ({ id, nombre, info = null, activo = 1, modulos = null, email_admin = null }) => {
  if (!SEDES.find(s => s.id === id)) {
    SEDES.push({ id, nombre });
  } else {
    const idx = SEDES.findIndex(s => s.id === id);
    SEDES[idx] = { id, nombre };
  }
  sedesMeta[id] = {
    id, nombre, info: info || null, activo: !!activo,
    modulos: Array.isArray(modulos) ? modulos : (modulos ? safeParseModulos(modulos) : null),
    email_admin: email_admin || null,
  };
  ensurePool(id);
  return sedesMeta[id];
};

const safeParseModulos = (raw) => {
  try { return JSON.parse(raw); } catch { return null; }
};

function getPool(sede) {
  if (!pools[sede]) throw new Error(`Sede no válida: ${sede}`);
  return pools[sede];
}

// Contexto asíncrono para propagar la sede del request actual a través
// de los awaits sin tener que pasarla por parámetro.
const sedeContext = new AsyncLocalStorage();

function runWithSede(sede, fn) {
  if (!pools[sede]) throw new Error(`Sede no válida: ${sede}`);
  return sedeContext.run(sede, fn);
}

const DEFAULT_SEDE = process.env.DB_NAME && pools[process.env.DB_NAME]
  ? process.env.DB_NAME
  : 'sistema_escolar';

const EXTRAS = {
  getPool, runWithSede, pools, SEDES, sedesMeta, DEFAULT_SEDE,
  META_DB, getMetaPool, registerSede, ensurePool,
};

const db = new Proxy(function(){}, {
  get(_t, prop) {
    if (prop in EXTRAS) return EXTRAS[prop];
    const sede = sedeContext.getStore() || DEFAULT_SEDE;
    const pool = pools[sede];
    const value = pool[prop];
    return typeof value === 'function' ? value.bind(pool) : value;
  },
});

module.exports = db;
