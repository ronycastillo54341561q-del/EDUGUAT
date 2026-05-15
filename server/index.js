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
const configPagosRoutes   = require('./routes/configPagosRoutes');
const backupsRoutes       = require('./routes/backupsRoutes');
const rolesRoutes         = require('./routes/rolesRoutes');
const relacionesRoutes    = require('./routes/relacionesRoutes');

const app = express();

app.use(cors());
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
app.use('/api/config-pagos',     configPagosRoutes);
app.use('/api/backups',          backupsRoutes);
app.use('/api/roles',            rolesRoutes);
app.use('/api/relaciones',       relacionesRoutes);

// Sirve el frontend buildeado (client/dist) — para que un solo túnel
// (cloudflared al puerto 5000) exponga app + API.
const clientDist = path.resolve(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDist));
app.get(/^\/(?!api).*/, (req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});
