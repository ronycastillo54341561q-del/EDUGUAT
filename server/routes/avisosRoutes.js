const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/avisosController');
const { verifyToken, verifyRole } = require('../middlewares/authMiddleware');

router.use(verifyToken);

// Staff: crear, listar y eliminar
router.get('/',     verifyRole('admin', 'oficina', 'maestro'), ctrl.listarStaff);
router.post('/',    verifyRole('admin', 'oficina', 'maestro'), ctrl.crear);
router.delete('/:id', verifyRole('admin', 'oficina', 'maestro'), ctrl.eliminar);

module.exports = router;
