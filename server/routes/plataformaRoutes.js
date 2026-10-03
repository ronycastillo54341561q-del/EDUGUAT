const express = require('express');
const router = express.Router();
const c = require('../controllers/plataformaController');

// Panel del dueño (academias.eduguat.com).  Auth propia, independiente de
// las sedes: ver controllers/plataformaController.js.
router.post('/login', c.login);

router.use(c.verifyPlataforma);

router.get   ('/me',                                c.me);
router.post  ('/logout',                            c.logout);
router.get   ('/modulos',                           c.modulos);
router.get   ('/sedes',                             c.listar);
router.post  ('/sedes',                             c.crear);
router.put   ('/sedes/:id',                         c.editar);
router.patch ('/sedes/:id/activo',                  c.cambiarActivo);
router.get   ('/sedes/:id/admins',                  c.listarAdmins);
router.post  ('/sedes/:id/admins/:userId/password', c.restablecerPassword);

module.exports = router;
