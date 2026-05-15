const express = require('express');
const router = express.Router();
const { verifyToken, verifyRole } = require('../middlewares/authMiddleware');
const c = require('../controllers/constanciasController');

router.use(verifyToken, verifyRole('admin', 'oficina'));

// Plantillas
router.get('/plantillas',      c.listarPlantillas);
router.get('/plantillas/:id',  c.obtenerPlantilla);
router.post('/plantillas',     c.crearPlantilla);
router.put('/plantillas/:id',  c.actualizarPlantilla);
router.delete('/plantillas/:id', c.eliminarPlantilla);

// Alumnos para generar la constancia
router.get('/filtros',  c.filtrosDisponibles);
router.get('/alumnos',  c.listarAlumnos);

module.exports = router;
