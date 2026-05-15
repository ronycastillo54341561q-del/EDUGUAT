const express = require('express');
const router = express.Router();
const { verifyToken, verifyRole } = require('../middlewares/authMiddleware');
const c = require('../controllers/institucionesController');

router.use(verifyToken);

router.get   ('/',     c.list);
router.post  ('/',     verifyRole('admin'), c.crear);
router.put   ('/:id',  verifyRole('admin'), c.actualizar);
router.delete('/:id',  verifyRole('admin'), c.eliminar);

module.exports = router;
