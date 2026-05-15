const express = require('express');
const router = express.Router();
const { verifyToken, verifyRole } = require('../middlewares/authMiddleware');
const { getRelaciones } = require('../controllers/relacionesController');

router.get('/', verifyToken, verifyRole('admin'), getRelaciones);

module.exports = router;
