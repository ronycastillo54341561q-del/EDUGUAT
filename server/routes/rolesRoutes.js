const express = require('express');
const router = express.Router();
const { verifyToken, verifyRole } = require('../middlewares/authMiddleware');
const ctrl = require('../controllers/rolesController');

// Solo admins pueden gestionar roles personalizados.
router.get('/modulos',     verifyToken, verifyRole('admin'), ctrl.getModulos);
router.get('/base',        verifyToken, verifyRole('admin'), ctrl.listarBase);
router.put('/base/:slug',  verifyToken, verifyRole('admin'), ctrl.actualizarBase);
router.get('/',            verifyToken, verifyRole('admin'), ctrl.listar);
router.get('/:id',         verifyToken, verifyRole('admin'), ctrl.obtener);
router.post('/',           verifyToken, verifyRole('admin'), ctrl.crear);
router.put('/:id',         verifyToken, verifyRole('admin'), ctrl.actualizar);
router.delete('/:id',      verifyToken, verifyRole('admin'), ctrl.eliminar);

module.exports = router;
