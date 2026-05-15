const express = require('express');
const router = express.Router();
const { verifyToken, verifyRole } = require('../middlewares/authMiddleware');
const ctrl = require('../controllers/configPagosController');

router.get('/',     verifyToken, verifyRole('admin','oficina'), ctrl.listar);
router.post('/',    verifyToken, verifyRole('admin'),           ctrl.crear);
router.put('/:id',  verifyToken, verifyRole('admin'),           ctrl.actualizar);
router.delete('/:id', verifyToken, verifyRole('admin'),         ctrl.eliminar);

module.exports = router;
