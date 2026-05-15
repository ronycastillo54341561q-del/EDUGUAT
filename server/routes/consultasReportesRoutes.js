const express = require('express');
const router = express.Router();
const { verifyToken, verifyRole } = require('../middlewares/authMiddleware');
const {
  listar, crear, actualizar, eliminar, usuariosCompartibles,
} = require('../controllers/consultasReportesController');

router.use(verifyToken, verifyRole('admin', 'oficina'));

router.get('/_usuarios-compartibles', usuariosCompartibles);
router.get('/',     listar);
router.post('/',    crear);
router.put('/:id',  actualizar);
router.delete('/:id', eliminar);

module.exports = router;
