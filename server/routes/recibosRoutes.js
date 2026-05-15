const express = require('express');
const router = express.Router();
const { verifyToken, verifyRole } = require('../middlewares/authMiddleware');
const ctrl = require('../controllers/recibosController');

router.get('/',    verifyToken, verifyRole('admin','oficina'), ctrl.getRecibos);
router.post('/',   verifyToken, verifyRole('admin','oficina'), ctrl.crearRecibo);
router.post('/upload-drive', verifyToken, verifyRole('admin','oficina'), ctrl.subirReciboDrive);
router.post('/limpiar-duplicados', verifyToken, verifyRole('admin'), ctrl.limpiarDuplicadosRecibos);
router.put('/:id', verifyToken, verifyRole('admin','oficina'), ctrl.actualizarRecibo);
router.post('/:id/anular', verifyToken, verifyRole('admin','oficina'), ctrl.anularRecibo);
router.delete('/:id', verifyToken, verifyRole('admin'), ctrl.eliminarRecibo);

module.exports = router;
