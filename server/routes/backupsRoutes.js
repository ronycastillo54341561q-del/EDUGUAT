// ╔═══════════════════════════════════════════════════════════════════════╗
// ║  backupsRoutes.js                                                     ║
// ║                                                                       ║
// ║  Rutas REST para el módulo de backups.  Como el backup cubre TODO el  ║
// ║  servidor (todas las sedes), restringimos el acceso a 'admin'.        ║
// ║  Si en algún momento querés que solo el super-admin de la sede        ║
// ║  semilla pueda gestionarlos, agregás un check extra que mire          ║
// ║  req.user.sede === 'sistema_escolar'.                                 ║
// ╚═══════════════════════════════════════════════════════════════════════╝

const express = require('express');
const router  = express.Router();

const { verifyToken, verifyRole } = require('../middlewares/authMiddleware');
const {
  crear, listar, descargar, eliminar,
} = require('../controllers/backupsController');

// Todas las rutas debajo requieren JWT válido + rol admin.
router.use(verifyToken, verifyRole('admin'));

router.get('/',                listar);
router.post('/',               crear);
router.get('/:id/download',    descargar);
router.delete('/:id',          eliminar);

module.exports = router;
