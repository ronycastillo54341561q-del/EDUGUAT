const express = require('express');
const router = express.Router();
const { verifyToken, verifyRole, verifyPermiso } = require('../middlewares/authMiddleware');
const ctrl = require('../controllers/notasDiplomadosController');

// Las escrituras se autorizan por la matriz de permisos del módulo Roles
// (`verifyPermiso`), no por el rol base: cualquier rol con lectura+escritura
// sobre `notasDiplomados` puede guardar notas.  Sin override configurado, el
// default sigue siendo sólo admin, igual que antes.
router.get('/anual',  verifyToken, verifyRole('admin','oficina','maestro'), ctrl.getNotasDiplomadosAnual);
router.post('/anual', verifyToken, verifyPermiso('notasDiplomados', 'edit', ['admin']), ctrl.guardarNotasDiplomadosAnual);
router.get('/', verifyToken, verifyRole('admin','oficina','maestro'), ctrl.getNotasDiplomados);
router.post('/', verifyToken, verifyPermiso('notasDiplomados', 'edit', ['admin']), ctrl.guardarNotaDiplomado);

module.exports = router;
