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

## Tipo de inquilino: `academia` vs `institucion`

Cada sede tiene un `tipo` (`sedesMeta[id].tipo`, viaja en el objeto `sede` del
front vía `useAuth().sede.tipo`). El esquema de BD es **el mismo**; algunas
pantallas se **adaptan** según el tipo, sin duplicar módulos:

- **Alumnos** (`client/src/pages/admin/Alumnos.jsx`): tabla y formulario
  **dirigidos por columnas** (`columnasAcademia` / `columnasInstitucion`). Para
  `institucion` se ocultan Diplomado/TAC/Asesor/Laboratorio/Establecimiento y se
  muestran **Grado, Sección, Maestro guía, Plan/Días** (`fecha_inicio` se
  etiqueta "Fecha de inscripción"). Campos nuevos en `alumnos` (nullables, las
  academias nunca los llenan): `grado`, `seccion`, `maestro_guia`, `plan_clases`,
  `dias_clase` (CSV snapshot de los días del plan). La cuota mensual se mantiene.
- **Configuración** (`Configuracion.jsx`): para `institucion` se muestran las
  pestañas **Planes de Clase / Grados / Secciones** en vez de Horarios/Laboratorios/
  Establecimientos. Nuevos catálogos: `cat_planes_clase` (nombre + `dias` CSV),
  `cat_grados`, `cat_secciones` (CRUD en `catalogosController` + `/api/catalogos/*`).
  Un "plan" define el bloque de días; al inscribir se elige un plan y **un solo
  horario** (rango) para todos esos días.
- **Asistencia** (`Asistencia.jsx` despacha a `AsistenciaInstitucion.jsx` cuando
  `tipo==='institucion'`): academias siguen con el grid **anual semanal**
  (`asistencia_semanal`); instituciones usan asistencia **diaria por mes**
  (tabla `asistencia_diaria`, un registro por `(alumno, fecha)`, mismos códigos
  x/e/p/f/r). El grid muestra sólo las fechas de clase del mes (derivadas del
  `dias_clase` de cada alumno), agrupadas por semana; celdas grises = no es día
  de clase. Endpoints `GET /asistencia/diaria` y `POST /asistencia/diaria/lote`.
- **Cursos por grado** (`cat_cursos`: grado[nombre]+nombre+maestro+dias CSV+horas):
  se gestionan en Configuración → Grados (cada grado se expande para administrar
  sus cursos). CRUD en `/api/catalogos/cursos`. Se ligan al grado por **nombre**
  (coincide con `alumnos.grado`).
- **Consultas** (`Consultas.jsx`, branch interno por tipo): para `institucion` los
  filtros son **grado/sección/plan** (en vez de tac/día/horario/laboratorio), las
  tarjetas muestran grado/sección/maestro guía y **se oculta la asistencia** (los
  exports Excel/PDF también cambian de columnas). `reporte/financiero` acepta los
  params `grado/seccion/plan` (aditivos).
- **Mis Tablas** (`MisTablas.jsx`, branch interno): el wizard usa `COLS_ALUMNO_INST`
  (grado/sección/maestro guía/plan/días) y filtros grado/sección/plan para
  instituciones. `/mis-tablas/_alumnos/filtrar` acepta esos params y devuelve los
  campos de institución.
- **Reporte de Alumno** (`ReporteAlumno.jsx` despacha a `ReporteAlumnoInstitucion.jsx`):
  academias ven mecanografía/TAC/diplomados + asistencia semanal; instituciones ven
  datos de inscripción (grado/sección/plan/maestro guía), **calendario de asistencia
  por mes** (celdas teñidas por estado, colapsable por mes), **cursos del grado**
  (maestro/horario) y un filtro que limita el calendario a los días del curso elegido.
  Pagos se mantienen en ambos. El backend (`reporteController.getReporteAlumno`)
  agrega `asistenciaDiaria` y `cursos` a la respuesta (toleran tablas inexistentes).

- **Nóminas** (`Nominas.jsx`, módulo **exclusivo de instituciones**): pago a
  colaboradores. Tablas `colaboradores`, `nominas`, `nomina_renglones`
  (percepciones/deducciones como JSON TEXT, suma manual → líquido). Una nómina
  autogenera un renglón por colaborador activo (salario base). Período mensual o
  quincenal. Boleta de pago PDF por colaborador (ventana de impresión con datos de
  `/config`). API `/api/nominas` (colaboradores + nóminas + renglones + pagar).
  Gating: es un **módulo solo-institución** — `INSTITUCION_MODULES = {'nominas'}` en
  `Sidebar.jsx` y `PrivateRoute.jsx` lo ocultan/bloquean en academias aunque tengan
  `modulos=null`. Va en `MODULOS_INSTITUCION_DEFAULT`; quítalo de la lista de módulos
  de una sede pública. La sede demo `inst_demo` se re-sincroniza al default en cada boot.

- **Horarios de Clase** (`Horarios.jsx`, **módulo solo-institución**): armador de
  parrilla por grado/sección. Tablas `horario_franjas` (bloques de tiempo globales =
  "timbre") y `horario_clases` (celda `(grado,seccion,dia,hora_inicio)` → curso +
  maestro, UNIQUE por esa tupla). UX guiada: defines franjas una vez (filas), eliges
  grado+sección, clic en cada casilla → eliges curso y el **maestro se autocompleta**
  desde `cat_cursos.maestro` (editable). Detecta **choques de maestro** (mismo maestro
  en otro grupo a la misma hora → casilla roja), "aplicar a toda la semana", e
  **imprime** el horario (grado/sección). API `/api/horarios` (franjas, clases,
  ocupacion, maestros). Gating idéntico a nóminas (`INSTITUCION_MODULES`).

> No bifurques creando módulos paralelos: extiende la vertical existente con una
> rama `esInstitucion = sede?.tipo === 'institucion'`. Academias debe quedar idéntico.
> Módulos solo-institución (nóminas, horarios): añádelos a `INSTITUCION_MODULES`
> (Sidebar+PrivateRoute) y a `MODULOS_INSTITUCION_DEFAULT` (sedeRegistry).

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
`backups`, `usuarios`, `roles`, `academias`, `sedes`, `instituciones` (nuevo),
`nominas` y `horarios` (solo instituciones), `alumno` (self-service).

Listado autoritativo de wiring: `server/index.js` (API) y `client/src/App.jsx` (SPA).

## Landing público (marketing)

Sitio público en `/` + páginas `/preguntas-frecuentes`, `/contacto`, `/mas-sistemas`
(rutas SPA en `App.jsx`, sin auth). Vive en `client/src/components/landing/` +
`client/src/pages/{Landing,PreguntasFrecuentes,Contacto,MasSistemas}.jsx`. **No tocar
el SEO** de `client/index.html` (meta/JSON-LD ya posicionados). Convenciones:

- **Iconos**: NO emojis. Set SVG de línea propio en `components/landing/Icon.jsx`
  (`<Icon name="..." />`, hereda `currentColor`). Agrega nuevos paths a `PATHS`.
- **Animaciones**: `Reveal.jsx` (scroll-reveal con IntersectionObserver; variantes
  `lp-reveal--left/right/zoom/blur` en `Landing.css`), `ScrollProgress.jsx` (barra
  superior), `Loader.jsx` (pantalla de carga con monograma "Ed" + barra, una vez por
  sesión vía `sessionStorage 'lp_intro'`). Todo respeta `prefers-reduced-motion`.
- **FAQ**: datos en `faqData.js`, render en `FAQ.jsx` (acordeón; `completo` = todas).
- **Galería**: `Galeria.jsx` muestra capturas reales desde `client/public/capturas/`
  (`01-dashboard.png` … `06-reportes.png`, ver README ahí); si falta una, muestra un
  placeholder con el nombre del archivo en vez de romperse.
- **Contacto**: el form (`Contact.jsx`) no tiene backend de correo → abre `mailto:`
  prellenado a **info@miguatemala.com** (correo corporativo). EduGuat se presenta como
  producto de **MiGuatemala** (`miguatemala.com`) en Footer y página "Más sistemas".
- Tokens de color/diseño en `:root` de `client/src/pages/Landing.css`.
