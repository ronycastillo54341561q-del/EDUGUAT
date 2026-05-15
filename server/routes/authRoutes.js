const express = require('express');
const router = express.Router();
const { login, logout, crearUsuario, getMe } = require('../controllers/authController');
const { verifyToken, verifyRole } = require('../middlewares/authMiddleware');

// Público
router.post('/login', login);

// Cierra la sesión del lado server (limpia jti).
router.post('/logout', verifyToken, logout);

// Solo admin puede crear usuarios
router.post('/crear', verifyToken, verifyRole('admin'), crearUsuario);

// Obtener mi info
router.get('/me', verifyToken, getMe);

module.exports = router;