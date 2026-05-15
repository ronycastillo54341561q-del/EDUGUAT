const express = require('express');
const router = express.Router();
const { verifyToken, verifyRole } = require('../middlewares/authMiddleware');
const { getStats, getFinanzas } = require('../controllers/dashboardController');

router.get('/stats',    verifyToken, verifyRole('admin'), getStats);
router.get('/finanzas', verifyToken, verifyRole('admin'), getFinanzas);

module.exports = router;
