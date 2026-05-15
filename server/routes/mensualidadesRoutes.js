const express = require('express');
const router = express.Router();
const { verifyToken, verifyRole } = require('../middlewares/authMiddleware');
const ctrl = require('../controllers/mensualidadesController');

router.get('/resumen', verifyToken, verifyRole('admin','oficina','maestro'), ctrl.getResumenMensualidades);
router.get('/grid',    verifyToken, verifyRole('admin','oficina','maestro'), ctrl.getMensualidadesGrid);
router.post('/grid',   verifyToken, verifyRole('admin'), ctrl.guardarMensualidadesGrid);
router.get('/', verifyToken, verifyRole('admin','oficina','maestro'), ctrl.getMensualidadesPorAlumno);
router.put('/:id/pagar', verifyToken, verifyRole('admin'), ctrl.marcarPagada);
router.put('/:id/anular', verifyToken, verifyRole('admin'), ctrl.anularMensualidad);
router.put('/:id/descuento', verifyToken, verifyRole('admin'), ctrl.aplicarDescuento);
router.put('/:id/deshacer', verifyToken, verifyRole('admin'), ctrl.deshacerPago);
router.post('/:id/acreditar',   verifyToken, verifyRole('admin','oficina'), ctrl.acreditarMes);
router.delete('/:id/acreditar', verifyToken, verifyRole('admin','oficina'), ctrl.desacreditarMes);
router.post('/acreditar-directo', verifyToken, verifyRole('admin','oficina'), ctrl.acreditarMesPorAlumno);

// Abono inicial masivo por filtro (alcance global / diplomado / horario / etc).
router.post('/abono-inicial', verifyToken, verifyRole('admin'), ctrl.abonoInicialBulk);

module.exports = router;
