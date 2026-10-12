const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { verifyToken, verifyRole } = require('../middlewares/authMiddleware');
const { getPortalConfig, savePortalConfig } = require('../utils/portalAlumno');
const { log } = require('../utils/bitacora');

// Configuración del portal del alumno (sólo el admin de la sede).
router.use(verifyToken, verifyRole('admin'));

router.get('/', async (req, res) => {
  res.json(await getPortalConfig(db));
});

router.put('/', async (req, res) => {
  try {
    const cfg = await savePortalConfig(db, req.body);
    log(req, 'editar', 'Portal del Alumno', 'Actualizó la configuración del portal del alumno');
    res.json(cfg);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al guardar la configuración del portal' });
  }
});

module.exports = router;
