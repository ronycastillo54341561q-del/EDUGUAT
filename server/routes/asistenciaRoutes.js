const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/asistenciaController');
const { verifyToken, verifyRole } = require('../middlewares/authMiddleware');

router.use(verifyToken);

// IMPORTANTE: rutas estáticas antes de las dinámicas (/:id)
router.get('/matriz',  verifyRole('admin','oficina','maestro'), ctrl.getMatrizAsistencia);
router.get('/filtros', verifyRole('admin','oficina','maestro'), ctrl.getFiltros);
router.get('/grid',    verifyRole('admin','oficina','maestro'), ctrl.getGridAsistencia);
router.post('/lote',   verifyRole('admin','oficina','maestro'), ctrl.guardarLoteAsistencia);
// Asistencia diaria (instituciones)
router.get('/diaria',      verifyRole('admin','oficina','maestro'), ctrl.getAsistenciaDiaria);
router.post('/diaria/lote', verifyRole('admin','oficina','maestro'), ctrl.guardarLoteDiaria);
router.get('/:alumno_id', ctrl.getAsistenciaPorAlumno);

router.post('/', verifyRole('admin','oficina','maestro'), ctrl.registrarAsistencia);
router.delete('/:id', verifyRole('admin'), ctrl.eliminarAsistencia);

module.exports = router;
