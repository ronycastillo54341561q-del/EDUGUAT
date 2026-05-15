const express = require('express');
const router = express.Router();
const { verifyToken, verifyRole } = require('../middlewares/authMiddleware');
const ctrl = require('../controllers/cierresController');

router.use(verifyToken);

router.get ('/',           verifyRole('admin','oficina'), ctrl.listarCierres);
router.get ('/hoy',        verifyRole('admin','oficina'), ctrl.obtenerCierreFecha);
router.get ('/:id',        verifyRole('admin','oficina'), ctrl.obtenerCierre);
router.post('/',           verifyRole('admin','oficina'), ctrl.crearCierre);
router.put ('/:id',        verifyRole('admin','oficina'), ctrl.actualizarCierre);
router.post('/:id/revisar', verifyRole('admin'),          ctrl.revisarCierre);

module.exports = router;
