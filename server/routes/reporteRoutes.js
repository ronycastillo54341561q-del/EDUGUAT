const express = require('express');
const router = express.Router();
const { verifyToken, verifyRole } = require('../middlewares/authMiddleware');
const { buscarAlumnos, getReporteAlumno, getReporteFinanciero } = require('../controllers/reporteController');

router.get('/alumnos/buscar', verifyToken, verifyRole('admin','oficina','maestro'), buscarAlumnos);
router.get('/alumno/:id',     verifyToken, verifyRole('admin','oficina','maestro'), getReporteAlumno);
router.get('/financiero',     verifyToken, verifyRole('admin','oficina'), getReporteFinanciero);

module.exports = router;
