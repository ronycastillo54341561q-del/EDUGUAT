const express = require('express');
const router = express.Router();
const { listar, crear, actualizar, toggleEstado, eliminar } = require('../controllers/usuariosController');
const { verifyToken, verifyRole } = require('../middlewares/authMiddleware');

router.use(verifyToken, verifyRole('admin'));

router.get('/',           listar);
router.post('/',          crear);
router.put('/:id',        actualizar);
router.patch('/:id/toggle', toggleEstado);
router.delete('/:id',     eliminar);

module.exports = router;
