const express = require('express');
const router = express.Router();
const { verifyToken, verifyRole } = require('../middlewares/authMiddleware');
const c = require('../controllers/horariosController');

router.use(verifyToken);

// Franjas horarias (globales)
router.get   ('/franjas',     verifyRole('admin', 'oficina', 'maestro'), c.listFranjas);
router.post  ('/franjas',     verifyRole('admin'), c.crearFranja);
router.put   ('/franjas/:id', verifyRole('admin'), c.actualizarFranja);
router.delete('/franjas/:id', verifyRole('admin'), c.eliminarFranja);

// Parrillas de clase
router.get ('/clases',     verifyRole('admin', 'oficina', 'maestro'), c.listClases);
router.get ('/ocupacion',  verifyRole('admin', 'oficina', 'maestro'), c.ocupacion);
router.get ('/maestros',   verifyRole('admin', 'oficina', 'maestro'), c.maestros);
router.put ('/clases',     verifyRole('admin', 'oficina'), c.guardarClase);

module.exports = router;
