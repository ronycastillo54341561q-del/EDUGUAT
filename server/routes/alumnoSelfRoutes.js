const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/alumnoSelfController');
const avisos  = require('../controllers/avisosController');
const { verifyToken, verifyRole } = require('../middlewares/authMiddleware');

const { requiereModulo } = ctrl;

router.use(verifyToken, verifyRole('alumno'));

router.get('/portal',        ctrl.getPortal);
router.get('/dashboard',     ctrl.getDashboard);
router.get('/perfil',        ctrl.getMiPerfil);
router.get('/asistencia',    requiereModulo('asistencia'),   ctrl.getMiAsistencia);
router.get('/mensualidades', requiereModulo('pagos'),        ctrl.getMisMensualidades);
router.get('/notas',         requiereModulo('notas'),        ctrl.getMisNotas);
router.get('/mecanografia',  requiereModulo('mecanografia'), ctrl.getMisMecanografia);
router.get('/avisos',        requiereModulo('avisos'),       avisos.listarParaAlumno);

module.exports = router;
