const express = require('express');
const router = express.Router();
const { verifyToken, verifyRole } = require('../middlewares/authMiddleware');
const ctrl = require('../controllers/papeleriaController');

router.get('/',    verifyToken, verifyRole('admin','oficina'), ctrl.getPapeleria);
router.post('/',   verifyToken, verifyRole('admin','oficina'), ctrl.crearPapeleria);
router.put('/:id', verifyToken, verifyRole('admin','oficina'), ctrl.actualizarPapeleria);
router.post('/:id/anular', verifyToken, verifyRole('admin','oficina'), ctrl.anularPapeleria);
router.delete('/:id', verifyToken, verifyRole('admin'), ctrl.eliminarPapeleria);

module.exports = router;
