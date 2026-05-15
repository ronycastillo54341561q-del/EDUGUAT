const express = require('express');
const router = express.Router();
const { verifyToken, verifyRole } = require('../middlewares/authMiddleware');
const { listar, upsert, listarAnios } = require('../controllers/inscritosTacController');

router.use(verifyToken);

router.get('/anios', verifyRole('admin', 'oficina', 'maestro'), listarAnios);
router.get('/',      verifyRole('admin', 'oficina', 'maestro'), listar);
router.put('/:alumno_id', verifyRole('admin', 'oficina'), upsert);

module.exports = router;
