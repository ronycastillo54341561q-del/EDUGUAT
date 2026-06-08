# EduGuat — Mapa del sistema

Sistema de gestión escolar **multi-sede (multi-tenant)**. Hoy cubre academias;
se está expandiendo para cubrir también **instituciones** (módulo `instituciones`
ya iniciado: `server/controllers/institucionesController.js` + `routes/institucionesRoutes.js`).

> Este archivo es el "grafo" del proyecto: léelo antes de explorar a ciegas.
> Si cambias arquitectura/convenciones, actualízalo.

## Stack

- **Backend** (`server/`): Node 22 + Express 5 (CommonJS), MySQL vía `mysql2/promise`,
  auth con `jsonwebtoken` + `bcryptjs`, backups a Google Drive (`googleapis`).
- **Frontend** (`client/`): React 19 + Vite 8 + React Router 7 (ESM), `axios`,
  PDFs con `jspdf`/`jspdf-autotable`/`html2canvas`, Excel con `xlsx`/`xlsx-js-style`,
  QR con `qrcode`. PWA instalable (`vite-plugin-pwa`).
- **Sin TypeScript, sin tests.** Lint del cliente con ESLint (`npm run lint`).

## Despliegue

- **Backend** → Railway (servicio "EDUGUAT"), root dir `server/`, `npm start` (`node index.js`).
  Puerto **fijo 8080** (`process.env.PORT || 8080`, el fallback DEBE ser 8080).
  Healthcheck en `GET /` (registrado ANTES del static/catch-all del SPA).
- **Frontend** → Vercel (`eduguat.com`, `www.eduguat.com`, `eduguat.vercel.app`).
  Es cross-origin → CORS con whitelist `ALLOWED_ORIGINS` en `server/index.js`.
- **BD** → plugin MySQL de Railway (`mysql.railway.internal:3306`, user `root`).
- **Deploy = `git push` a `main`** (Railway auto-redespliega). Flujo: editar →
  `node -c` (o `npm run build` en cliente) → commit → push. No recrear `PORT` manual en Railway.

## Multi-tenant (el corazón del sistema)

Cada **sede = una base de datos MySQL propia** con el mismo esquema. Núcleo en
`server/config/db.js`:

- Base meta **`eduguat_meta`** (tabla `sedes`) lista todas las sedes. Al arrancar,
  `utils/sedeRegistry.bootstrapTodasLasSedes()` carga cada una (crea BD + esquema + admin si falta).
- 3 sedes "semilla" hardcoded: `sistema_escolar` (Sistec Flores), `m_lozano`, `sistec_jutiapa`.
- `db` exportado es un **Proxy**: `db.query(...)` aterriza en el pool de la sede del
  request actual, resuelta vía `AsyncLocalStorage` (`runWithSede`). **No pases la sede
  por parámetro** — el middleware ya la fija.
- `db` también expone extras: `getPool`, `runWithSede`, `pools`, `SEDES`, `sedesMeta`,
  `getMetaPool`, `registerSede`, `DEFAULT_SEDE`.
- La sede viaja en el **JWT** (`decoded.sede`). Tokens viejos sin sede → `sistema_escolar`.

### Super-admin
El `admin` de la sede `sistema_escolar` es **super-admin**: única cuenta que puede
gestionar sedes/academias. Validado en front (`lib/permissions.isSuperAdmin`, `SUPER_ADMIN_SEDE`)
y duplicado en backend.

## Auth y permisos

- `server/middlewares/authMiddleware.js`:
  - `verifyToken`: valida JWT, **sesión única** (`session_jti`), **timeout por inactividad**
    (10 min, `last_activity`), y corre el resto dentro de `runWithSede`.
  - `verifyRole(...roles)`: chequea el **rol efectivo**. Roles base: `admin`, `oficina`,
    `maestro`, `alumno`. Roles custom heredan de un `base_rol` (tabla `roles_custom`).
- Frontend `client/src/lib/permissions.js`: matriz `PERMS[rol][modulo] = { view, edit }`
  + overrides de roles base + roles custom (cacheados en localStorage). Helpers: `can(rol, modulo, action)`,
  `canExport`, `defaultRoute(rol)`, `ADMIN_PANEL_ROLES`. **El backend SIEMPRE revalida; esto es solo UI.**

## Patrón de un módulo (end-to-end)

Cada feature ("módulo") es una vertical. Para `foo`:

1. **Backend ruta** `server/routes/fooRoutes.js`:
   ```js
   const express = require('express');
   const router = express.Router();
   const { verifyToken, verifyRole } = require('../middlewares/authMiddleware');
   const c = require('../controllers/fooController');
   router.use(verifyToken);
   router.get('/',    c.list);
   router.post('/',   verifyRole('admin'), c.crear);
   router.put('/:id', verifyRole('admin'), c.actualizar);
   router.delete('/:id', verifyRole('admin'), c.eliminar);
   module.exports = router;
   ```
2. **Backend controller** `server/controllers/fooController.js`: usa `const db = require('../config/db')`
   y `db.query(...)` (NO pool manual). Registra acciones con `const { log } = require('../utils/bitacora')`:
   `log(req, 'crear'|'editar'|'eliminar', 'Foo', detalle)`. Valida input, try/catch, `res.status(500)`.
3. **Registrar ruta** en `server/index.js`: `const fooRoutes = require('./routes/fooRoutes')` +
   `app.use('/api/foo', fooRoutes)`.
4. **Frontend página** `client/src/pages/admin/Foo.jsx`: llama a la API con `client/src/api/axios.js`
   (instancia con baseURL + token). Usa `can(rol, 'foo', 'edit')` para gating de UI.
5. **Registrar ruta SPA** en `client/src/App.jsx`:
   `<Route path="/admin/foo" element={<PrivateRoute modulo="foo"><Foo /></PrivateRoute>} />`.
6. **Permisos** en `client/src/lib/permissions.js`: agrega `foo: { view, edit }` a cada rol en `PERMS`.
7. **Sidebar** en `client/src/components/Sidebar.jsx`: agrega el enlace del módulo.

Rutas alumno usan `<PrivateRoute rol="alumno">` y viven en `client/src/pages/alumno/`.

## Convenciones

- Comentarios y mensajes de usuario en **español**.
- Backend CommonJS (`require`), frontend ESM (`import`).
- Campos JSON en MySQL se serializan con `JSON.stringify` al escribir y se parsean al leer
  (ver `parseExtras` en `institucionesController.js`).
- Toda acción mutante se registra en **bitácora** (`utils/bitacora.log`).
- Backups: `utils/backupRunner.js` + `backupCleanup.js`, scripts `npm run db:dump` / `db:restore`.

## Índice de módulos (API ↔ ruta SPA)

`alumnos`, `asistencia`, `mecanografia`, `notas-tac`, `inscritos-tac`, `notas-diplomados`,
`diplomados`, `mensualidades`/`pagos`, `nuevo-pago`, `otros-pagos`, `recibos`, `papeleria`,
`config-pagos`, `cierres`, `dashboard`, `reporte`/`reporte-financiero`, `consultas-reportes`,
`constancias`, `avisos`, `bitacora`, `mis-tablas`, `relaciones`, `catalogos`, `importacion`,
`backups`, `usuarios`, `roles`, `academias`, `sedes`, `instituciones` (nuevo), `alumno` (self-service).

Listado autoritativo de wiring: `server/index.js` (API) y `client/src/App.jsx` (SPA).
