const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();
require('./config/db');
const { bootstrapTodasLasSedes } = require('./utils/sedeRegistry');

// Asegura la base meta, carga TODAS las sedes desde `eduguat_meta.sedes`
// y bootstrappea cada una (BD + esquema + admin).  Errores aislados por
// sede; nunca detiene el arranque del servidor.
(async () => {
  await bootstrapTodasLasSedes();
})();

const authRoutes          = require('./routes/authRoutes');
const sedesRoutes         = require('./routes/sedesRoutes');
const alumnosRoutes       = require('./routes/alumnosRoutes');
const asistenciaRoutes    = require('./routes/asistenciaRoutes');
const mecanografiaRoutes  = require('./routes/mecanografiaRoutes');
const notasTacRoutes      = require('./routes/notasTacRoutes');
const notasDiplomadosRoutes = require('./routes/notasDiplomadosRoutes');
const mensualidadesRoutes = require('./routes/mensualidadesRoutes');
const recibosRoutes       = require('./routes/recibosRoutes');
const papeleriaRoutes     = require('./routes/papeleriaRoutes');
const dashboardRoutes     = require('./routes/dashboardRoutes');
const alumnoSelfRoutes    = require('./routes/alumnoSelfRoutes');
const reporteRoutes       = require('./routes/reporteRoutes');
const consultasReportesRoutes = require('./routes/consultasReportesRoutes');
const bitacoraRoutes      = require('./routes/bitacoraRoutes');
const nuevoPagoRoutes     = require('./routes/nuevoPagoRoutes');
const configuracionRoutes = require('./routes/configuracionRoutes');
const diplomadosRoutes    = require('./routes/diplomadosRoutes');
const misTablasRoutes     = require('./routes/misTablasRoutes');
const catalogosRoutes     = require('./routes/catalogosRoutes');
const usuariosRoutes      = require('./routes/usuariosRoutes');
const cierresRoutes       = require('./routes/cierresRoutes');
const avisosRoutes        = require('./routes/avisosRoutes');
const academiasRoutes     = require('./routes/academiasRoutes');
const constanciasRoutes   = require('./routes/constanciasRoutes');
const importacionRoutes   = require('./routes/importacionRoutes');
const inscritosTacRoutes  = require('./routes/inscritosTacRoutes');
const institucionesRoutes = require('./routes/institucionesRoutes');
const nominasRoutes       = require('./routes/nominasRoutes');
const horariosRoutes      = require('./routes/horariosRoutes');
const configPagosRoutes   = require('./routes/configPagosRoutes');
const backupsRoutes       = require('./routes/backupsRoutes');
const rolesRoutes         = require('./routes/rolesRoutes');
const relacionesRoutes    = require('./routes/relacionesRoutes');

const app = express();

// Orígenes permitidos para el frontend (Vercel/dominios) que llama al
// backend en Railway.  Las peticiones sin cabecera `Origin` (el propio
// SPA servido desde client/dist, health-checks de Railway, curl,
// server-to-server) se dejan pasar: no son CORS y bloquearlas rompería
// el self-hosting del frontend y los chequeos de salud.
const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:5173',
  'https://eduguat.com',
  'https://www.eduguat.com',
  'https://eduguat-landing.vercel.app',
  'https://eduguat.vercel.app',
];

const corsOptions = {
  origin(origin, callback) {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error(`Origen no permitido por CORS: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '20mb' }));

app.use('/api/auth',             authRoutes);
app.use('/api/sedes',            sedesRoutes);
app.use('/api/academias',        academiasRoutes);
app.use('/api/alumnos',          alumnosRoutes);
app.use('/api/asistencia',       asistenciaRoutes);
app.use('/api/mecanografia',     mecanografiaRoutes);
app.use('/api/notas-tac',        notasTacRoutes);
app.use('/api/notas-diplomados', notasDiplomadosRoutes);
app.use('/api/mensualidades',    mensualidadesRoutes);
app.use('/api/recibos',          recibosRoutes);
app.use('/api/papeleria',        papeleriaRoutes);
app.use('/api/dashboard',        dashboardRoutes);
app.use('/api/alumno',           alumnoSelfRoutes);
app.use('/api/reporte',          reporteRoutes);
app.use('/api/consultas-reportes', consultasReportesRoutes);
app.use('/api/bitacora',         bitacoraRoutes);
app.use('/api/nuevo-pago',       nuevoPagoRoutes);
app.use('/api/config',           configuracionRoutes);
app.use('/api/diplomados',       diplomadosRoutes);
app.use('/api/mis-tablas',       misTablasRoutes);
app.use('/api/catalogos',        catalogosRoutes);
app.use('/api/usuarios',         usuariosRoutes);
app.use('/api/cierres',          cierresRoutes);
app.use('/api/avisos',           avisosRoutes);
app.use('/api/constancias',      constanciasRoutes);
app.use('/api/importacion',      importacionRoutes);
app.use('/api/inscritos-tac',    inscritosTacRoutes);
app.use('/api/instituciones',    institucionesRoutes);
app.use('/api/nominas',          nominasRoutes);
app.use('/api/horarios',         horariosRoutes);
app.use('/api/config-pagos',     configPagosRoutes);
app.use('/api/backups',          backupsRoutes);
app.use('/api/roles',            rolesRoutes);
app.use('/api/relaciones',       relacionesRoutes);

// Healthcheck para Railway. Debe ir ANTES de express.static y del
// catch-all del SPA: ambos capturan "/" y, como en Railway no existe
// client/dist (el frontend vive en Vercel), "/" devolvería un error.
app.get('/', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date() });
});

// Sirve el frontend buildeado (client/dist) — para que un solo túnel
// (cloudflared al puerto 5000) exponga app + API.
const clientDist = path.resolve(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDist));
app.get(/^\/(?!api).*/, (req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

// Railway inyecta PORT = el "target port" del dominio público (8080).
// Si por algún motivo no viene, caemos a 8080 (no 5000) para seguir
// alineados con el proxy de Railway y evitar "Application failed to
// respond".  En local, exporta PORT si quieres otro puerto.
const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor corriendo en puerto ${PORT} (process.env.PORT=${process.env.PORT ?? 'undefined'})`);
});
