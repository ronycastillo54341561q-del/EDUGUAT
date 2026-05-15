const express = require('express');
const router = express.Router();
const { listSedes } = require('../controllers/authController');

// Público: para que la pantalla SedeSelector pueda pintar las sedes
// antes de que exista un JWT.
router.get('/', listSedes);

module.exports = router;
