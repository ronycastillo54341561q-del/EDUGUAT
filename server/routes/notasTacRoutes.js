const express = require('express');
const router = express.Router();
const { verifyToken, verifyRole } = require('../middlewares/authMiddleware');
const ctrl = require('../controllers/notasTacController');

router.get('/anual',  verifyToken, verifyRole('admin','oficina','maestro'), ctrl.getNotasTacAnual);
router.post('/anual', verifyToken, verifyRole('admin','oficina'), ctrl.guardarNotasTacAnual);
router.get('/', verifyToken, verifyRole('admin','oficina','maestro'), ctrl.getNotasTac);
router.put('/:alumno_id', verifyToken, verifyRole('admin','oficina'), ctrl.guardarNotasTac);

module.exports = router;
