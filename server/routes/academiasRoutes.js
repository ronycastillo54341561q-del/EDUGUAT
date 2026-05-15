const express = require('express');
const router = express.Router();
const { verifyToken, verifyRole } = require('../middlewares/authMiddleware');
const {
  listModulos, listAcademias, getAcademia,
  crearAcademia, editarAcademia, toggleActivo,
} = require('../controllers/academiasController');

// Sólo el admin de la sede semilla `sistema_escolar` puede gestionar academias.
const onlySuperAdmin = (req, res, next) => {
  if (req.user?.rol === 'admin' && req.user?.sede === 'sistema_escolar') return next();
  return res.status(403).json({ message: 'Sólo el super-administrador puede gestionar academias' });
};

router.use(verifyToken, verifyRole('admin'), onlySuperAdmin);

router.get('/modulos',     listModulos);
router.get('/',            listAcademias);
router.get('/:id',         getAcademia);
router.post('/',           crearAcademia);
router.put('/:id',         editarAcademia);
router.patch('/:id/activo', toggleActivo);

module.exports = router;
