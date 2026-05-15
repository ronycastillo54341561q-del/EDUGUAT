const express = require('express');
const router = express.Router();
const { verifyToken, verifyRole } = require('../middlewares/authMiddleware');
const { getConfig, updateConfig } = require('../controllers/configuracionController');

router.get('/',  verifyToken, getConfig);
router.put('/',  verifyToken, verifyRole('admin'), updateConfig);

module.exports = router;
