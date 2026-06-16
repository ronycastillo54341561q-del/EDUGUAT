# Capturas del sistema (fotografías manuales)

Coloca aquí las capturas de pantalla reales de EduGuat. La galería del landing
(sección "El sistema por dentro" → "Así se ve por dentro") las muestra
automáticamente. Si una imagen no existe todavía, en su lugar aparece un marco
de placeholder con el nombre del archivo que falta (no rompe la página).

## Archivos esperados (nombres EXACTOS)

Usa estos nombres para que se enlacen solas. Formato recomendado: **PNG o JPG**,
proporción **16:10** aprox. (p. ej. 1600×1000 px), peso < 400 KB cada una.

| Archivo                | Qué debe mostrar                                  |
|------------------------|---------------------------------------------------|
| `01-dashboard.png`     | Dashboard ejecutivo (KPIs y gráficas)             |
| `02-alumnos.png`       | Listado / ficha de alumnos                        |
| `03-pagos.png`         | Control de pagos y generación de recibos          |
| `04-asistencia.png`    | Asistencia (grid mensual o semanal)               |
| `05-notas.png`         | Registro de notas / boletas                       |
| `06-reportes.png`      | Reportes financieros                              |

> Si prefieres `.jpg`, cambia también la extensión en
> `client/src/components/landing/Galeria.jsx` (arreglo `capturas`).

## Cómo reemplazar
1. Toma la captura dentro del sistema.
2. Renómbrala con el nombre exacto de la tabla.
3. Cópiala dentro de esta carpeta (`client/public/capturas/`).
4. Reconstruye el frontend (`npm run build`) o recarga en desarrollo.
