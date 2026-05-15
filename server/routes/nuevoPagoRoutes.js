const express = require('express');
const router = express.Router();
const { verifyToken, verifyRole } = require('../middlewares/authMiddleware');
const { getEstadoAlumno, procesarPago, procesarOtroPago } = require('../controllers/nuevoPagoController');

router.get('/estado/:alumno_id', verifyToken, verifyRole('admin','oficina'), getEstadoAlumno);
router.post('/procesar', verifyToken, verifyRole('admin','oficina'), procesarPago);
router.post('/otros',    verifyToken, verifyRole('admin','oficina'), procesarOtroPago);

module.exports = router;
