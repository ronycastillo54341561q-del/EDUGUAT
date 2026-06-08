const express = require('express');
const router = express.Router();
const { verifyToken, verifyRole } = require('../middlewares/authMiddleware');
const c = require('../controllers/nominasController');

router.use(verifyToken);

// Colaboradores
router.get   ('/colaboradores',      verifyRole('admin', 'oficina'), c.listColaboradores);
router.post  ('/colaboradores',      verifyRole('admin'), c.crearColaborador);
router.put   ('/colaboradores/:id',  verifyRole('admin'), c.actualizarColaborador);
router.delete('/colaboradores/:id',  verifyRole('admin'), c.eliminarColaborador);

// Nóminas
router.get   ('/',        verifyRole('admin', 'oficina'), c.listNominas);
router.get   ('/:id',     verifyRole('admin', 'oficina'), c.getNomina);
router.post  ('/',        verifyRole('admin'), c.crearNomina);
router.put   ('/:id',     verifyRole('admin'), c.actualizarNomina);
router.delete('/:id',     verifyRole('admin'), c.eliminarNomina);
router.put   ('/:id/renglon/:rid', verifyRole('admin', 'oficina'), c.actualizarRenglon);
router.post  ('/:id/pagar',         verifyRole('admin'), c.marcarPagada);

module.exports = router;
