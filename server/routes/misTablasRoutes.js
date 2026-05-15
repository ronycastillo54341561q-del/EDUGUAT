const express = require('express');
const router = express.Router();
const {
  listar, obtener, crear, actualizar,
  eliminar, reactivar, eliminarDefinitivo,
  alumnosFiltrados,
} = require('../controllers/misTablasController');
const { verifyToken, verifyRole } = require('../middlewares/authMiddleware');

router.use(verifyToken);

const ROLES = ['admin','oficina','maestro'];

router.get('/_alumnos/filtrar', verifyRole(...ROLES), alumnosFiltrados);
router.get('/', verifyRole(...ROLES), listar);
router.get('/:id', verifyRole(...ROLES), obtener);
router.post('/', verifyRole(...ROLES), crear);
router.put('/:id', verifyRole(...ROLES), actualizar);

// Soft-delete: el DELETE estándar marca la tabla como inactiva.
router.delete('/:id', verifyRole(...ROLES), eliminar);

// Reactivar una tabla en papelera.
router.post('/:id/reactivar', verifyRole(...ROLES), reactivar);

// Eliminación definitiva manual (sólo desde papelera).
router.delete('/:id/eliminar', verifyRole(...ROLES), eliminarDefinitivo);

module.exports = router;
