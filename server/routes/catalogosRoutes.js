const express = require('express');
const router = express.Router();
const { verifyToken, verifyRole } = require('../middlewares/authMiddleware');
const c = require('../controllers/catalogosController');

router.use(verifyToken);

// Endpoint global para selects (lectura para cualquier usuario autenticado)
router.get('/todos', c.getTodos);

// Horarios de clase
router.get   ('/horarios',      c.listHorarios);
router.post  ('/horarios',      verifyRole('admin'), c.crearHorario);
router.put   ('/horarios/:id',  verifyRole('admin'), c.actualizarHorario);
router.delete('/horarios/:id',  verifyRole('admin'), c.eliminarHorario);

// Laboratorios
router.get   ('/laboratorios',     c.listLabs);
router.post  ('/laboratorios',     verifyRole('admin'), c.crearLab);
router.put   ('/laboratorios/:id', verifyRole('admin'), c.actualizarLab);
router.delete('/laboratorios/:id', verifyRole('admin'), c.eliminarLab);

// Establecimientos
router.get   ('/establecimientos',     c.listEstabs);
router.post  ('/establecimientos',     verifyRole('admin'), c.crearEstab);
router.put   ('/establecimientos/:id', verifyRole('admin'), c.actualizarEstab);
router.delete('/establecimientos/:id', verifyRole('admin'), c.eliminarEstab);

// Planes de días de clase (instituciones)
router.get   ('/planes',      c.listPlanes);
router.post  ('/planes',      verifyRole('admin'), c.crearPlan);
router.put   ('/planes/:id',  verifyRole('admin'), c.actualizarPlan);
router.delete('/planes/:id',  verifyRole('admin'), c.eliminarPlan);

// Cursos por grado (instituciones)
router.get   ('/cursos',      c.listCursos);
router.post  ('/cursos',      verifyRole('admin'), c.crearCurso);
router.put   ('/cursos/:id',  verifyRole('admin'), c.actualizarCurso);
router.delete('/cursos/:id',  verifyRole('admin'), c.eliminarCurso);

// Grados (instituciones)
router.get   ('/grados',      c.listGrados);
router.post  ('/grados',      verifyRole('admin'), c.crearGrado);
router.put   ('/grados/:id',  verifyRole('admin'), c.actualizarGrado);
router.delete('/grados/:id',  verifyRole('admin'), c.eliminarGrado);

// Secciones (instituciones)
router.get   ('/secciones',     c.listSecciones);
router.post  ('/secciones',     verifyRole('admin'), c.crearSeccion);
router.put   ('/secciones/:id', verifyRole('admin'), c.actualizarSeccion);
router.delete('/secciones/:id', verifyRole('admin'), c.eliminarSeccion);

// Cuotas
router.get   ('/cuotas',     c.listCuotas);
router.post  ('/cuotas',     verifyRole('admin'), c.crearCuota);
router.put   ('/cuotas/:id', verifyRole('admin'), c.actualizarCuota);
router.delete('/cuotas/:id', verifyRole('admin'), c.eliminarCuota);

// Cuentas bancarias (oficina solo lista; admin gestiona)
router.get   ('/cuentas',      c.listCuentas);
router.post  ('/cuentas',      verifyRole('admin'), c.crearCuenta);
router.put   ('/cuentas/:id',  verifyRole('admin'), c.actualizarCuenta);
router.delete('/cuentas/:id',  verifyRole('admin'), c.eliminarCuenta);

module.exports = router;
