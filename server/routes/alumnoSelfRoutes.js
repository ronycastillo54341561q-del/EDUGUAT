const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/alumnoSelfController');
const avisos  = require('../controllers/avisosController');
const { verifyToken, verifyRole } = require('../middlewares/authMiddleware');

router.use(verifyToken, verifyRole('alumno'));

router.get('/dashboard',     ctrl.getDashboard);
router.get('/perfil',        ctrl.getMiPerfil);
router.get('/asistencia',    ctrl.getMiAsistencia);
router.get('/mensualidades', ctrl.getMisMensualidades);
router.get('/notas',         ctrl.getMisNotas);
router.get('/mecanografia',  ctrl.getMisMecanografia);
router.get('/avisos',        avisos.listarParaAlumno);

module.exports = router;
