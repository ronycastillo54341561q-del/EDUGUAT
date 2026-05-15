const express = require('express');
const router = express.Router();
const { verifyToken, verifyRole } = require('../middlewares/authMiddleware');
const ctrl = require('../controllers/mecanografiaController');

router.get('/resumen',    verifyToken, verifyRole('admin','oficina','maestro'), ctrl.getResumenMecanografia);
router.get('/notas',     verifyToken, verifyRole('admin','oficina','maestro'), ctrl.getMecanografiaGrid);
router.post('/notas',    verifyToken, verifyRole('admin','oficina','maestro'), ctrl.guardarMecanografiaGrid);
router.get('/:alumno_id', verifyToken, verifyRole('admin','oficina','maestro'), ctrl.getLeccionesPorAlumno);
router.post('/', verifyToken, verifyRole('admin','oficina','maestro'), ctrl.agregarLeccion);
router.put('/:id', verifyToken, verifyRole('admin','oficina','maestro'), ctrl.editarLeccion);
router.delete('/:id', verifyToken, verifyRole('admin'), ctrl.eliminarLeccion);

module.exports = router;
