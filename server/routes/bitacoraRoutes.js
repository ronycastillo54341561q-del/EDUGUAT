const express = require('express');
const router = express.Router();
const { verifyToken, verifyRole } = require('../middlewares/authMiddleware');
const { getBitacora, getModulos } = require('../controllers/bitacoraController');

router.get('/', verifyToken, verifyRole('admin'), getBitacora);
router.get('/modulos', verifyToken, verifyRole('admin'), getModulos);

module.exports = router;
