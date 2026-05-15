const express = require('express');
const router = express.Router();
const { verifyToken, verifyRole } = require('../middlewares/authMiddleware');
const {
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
} = require('../controllers/importacionController');

// Cualquier admin (super-admin o admin de sede) puede hacer importaciones
// masivas.  La importación sólo afecta a la sede activa del usuario, así que
// no es necesario restringirla al super-admin.
router.use(verifyToken, verifyRole('admin'));

router.post('/alumnos',             importarAlumnos);
router.post('/asistencia',          importarAsistencia);
router.post('/notas-tac',           importarNotasTac);
router.post('/notas-diplomados',    importarNotasDiplomados);
router.post('/mecanografia',        importarMecanografia);
router.post('/pagos',               importarPagos);
router.post('/pagos-mensualidades', importarPagosMensualidades);
router.post('/recibos-diplomados',  importarRecibosDiplomados);

// Metadata para construir las plantillas dinámicas
router.get('/diplomados-programas', getProgramasDiplomados);
router.get('/tacs',                 getTacsAcademia);

module.exports = router;
