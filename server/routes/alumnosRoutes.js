const express = require('express');
const router = express.Router();
const {
  getAlumnos, getAlumnoById, crearAlumno, editarAlumno, eliminarAlumno, actualizarPassword
} = require('../controllers/alumnosController');
const { verifyToken, verifyRole } = require('../middlewares/authMiddleware');

router.use(verifyToken);

router.get('/', verifyRole('admin','oficina','maestro'), getAlumnos);
router.get('/:id', verifyRole('admin','oficina','maestro'), getAlumnoById);
router.post('/', verifyRole('admin','oficina'), crearAlumno);
router.put('/:id', verifyRole('admin','oficina'), editarAlumno);
router.put('/:id/password', verifyRole('admin'), actualizarPassword);
router.delete('/:id', verifyRole('admin'), eliminarAlumno);

module.exports = router;