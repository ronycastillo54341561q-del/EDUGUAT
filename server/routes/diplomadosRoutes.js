const express = require('express');
const router = express.Router();
const { verifyToken, verifyRole } = require('../middlewares/authMiddleware');
const {
  getAll,
  crear,
  actualizar,
  eliminar,
  reordenarProgramas,
  actualizarPrograma,
  listProgramasFlat,
  listExamenes,
  guardarExamenes,
  reordenarExamenes,
} = require('../controllers/diplomadosController');

router.get('/programas',           verifyToken, listProgramasFlat);
router.get('/',                    verifyToken, getAll);
router.post('/',                   verifyToken, verifyRole('admin'), crear);
router.put('/:id',                 verifyToken, verifyRole('admin'), actualizar);
router.delete('/:id',              verifyToken, verifyRole('admin'), eliminar);
router.put('/:id/programas/orden', verifyToken, verifyRole('admin'), reordenarProgramas);
router.put('/programas/:pid',      verifyToken, verifyRole('admin'), actualizarPrograma);
router.get('/:id/examenes',        verifyToken, listExamenes);
router.put('/:id/examenes',        verifyToken, verifyRole('admin'), guardarExamenes);
router.put('/:id/examenes/orden',  verifyToken, verifyRole('admin'), reordenarExamenes);

module.exports = router;
