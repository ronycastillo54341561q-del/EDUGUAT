const express = require('express');
const router = express.Router();
const { verifyToken, verifyRole } = require('../middlewares/authMiddleware');
const ctrl = require('../controllers/notasDiplomadosController');

router.get('/anual',  verifyToken, verifyRole('admin','oficina','maestro'), ctrl.getNotasDiplomadosAnual);
router.post('/anual', verifyToken, verifyRole('admin'), ctrl.guardarNotasDiplomadosAnual);
router.get('/', verifyToken, verifyRole('admin','oficina','maestro'), ctrl.getNotasDiplomados);
router.post('/', verifyToken, verifyRole('admin'), ctrl.guardarNotaDiplomado);

module.exports = router;
