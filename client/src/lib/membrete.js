// Helpers para el "membrete" (encabezado institucional) que cada módulo
// usa al exportar PDFs. Estructura: bloque izquierdo con imagen + bloque
// derecho con información de la institución centrada verticalmente.
//
// La configuración de cada módulo vive en la tabla `configuracion` con la
// clave  membrete_<modulo>  y se persiste como JSON.

import API from '../api/axios';

export const MODULOS_MEMBRETE = [
  { id: 'recibos',         label: 'Recibos (Nuevo Pago)' },
  { id: 'notas_tac',       label: 'Notas TAC' },
  { id: 'planificaciones', label: 'Planificaciones' },
  { id: 'constancias',     label: 'Constancias' },
];

// Estructura por defecto al crear un membrete vacío.
export const membreteDefault = () => ({
  usar:               1,            // 1 = aplicar membrete; 0 = encabezado simple
  imagen:             '',           // data URL (png/jpg) o '' (sin imagen)
  altura_mm:          30,           // alto total del bloque
  ancho_img_mm:       55,           // ancho del bloque de imagen
  institucion_id:     null,         // referencia a tabla `instituciones`
  banda_color:        '#1a237e',    // color de la banda inferior decorativa
  banda_alto_mm:      1.2,
  info_extra:         [],           // [{ nombre, descripcion }]
  mostrar_tipo:       1,
  mostrar_resolucion: 1,
  mostrar_fecha:      1,
  mostrar_ubicacion:  1,
});

// Lee el JSON guardado en /config bajo la clave  membrete_<modulo>.
export const parseMembrete = (cfg, modulo) => {
  const raw = cfg?.[`membrete_${modulo}`];
  if (!raw) return membreteDefault();
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return { ...membreteDefault(), ...parsed };
  } catch {
    return membreteDefault();
  }
};

// Carga la configuración global y la lista de instituciones, y devuelve el
// objeto listo para dibujar el membrete del módulo solicitado.
export async function loadMembrete(modulo) {
  const [{ data: cfg }, { data: instituciones }] = await Promise.all([
    API.get('/config').catch(() => ({ data: {} })),
    API.get('/instituciones').catch(() => ({ data: [] })),
  ]);
  const m = parseMembrete(cfg || {}, modulo);
  const inst = m.institucion_id
    ? (instituciones || []).find(i => i.id === m.institucion_id)
    : null;
  return { membrete: m, institucion: inst, cfg: cfg || {} };
}

// Convierte "#1a237e" → [r,g,b]
export function hexToRgb(hex) {
  const h = String(hex || '#1a237e').replace('#', '');
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  const n = parseInt(full || '1a237e', 16) || 0x1a237e;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const fmtFecha = (raw) => {
  if (!raw) return '';
  const s = String(raw).slice(0, 10);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
};

// Construye las líneas que se imprimirán en el bloque derecho.
export function membreteLineas({ membrete, institucion, cfg }) {
  const lineas = [];
  // Nombre principal
  const nombre =
    institucion?.nombre ||
    cfg?.inst_nombre ||
    'INSTITUCIÓN';
  lineas.push({ text: String(nombre).toUpperCase(), bold: true, size: 12.5 });

  if (institucion) {
    if (membrete.mostrar_tipo && institucion.tipo)
      lineas.push({ text: institucion.tipo, size: 8.6 });
    if (membrete.mostrar_resolucion && institucion.resolucion)
      lineas.push({ text: `Resolución: ${institucion.resolucion}`, size: 8.4 });
    if (membrete.mostrar_fecha && institucion.fecha)
      lineas.push({ text: `Fecha: ${fmtFecha(institucion.fecha)}`, size: 8.4 });
    if (membrete.mostrar_ubicacion && institucion.ubicacion)
      lineas.push({ text: institucion.ubicacion, size: 8.4 });
    for (const ex of (institucion.extras || [])) {
      if (!ex?.nombre && !ex?.descripcion) continue;
      const t = [ex.nombre, ex.descripcion].filter(Boolean).join(': ');
      lineas.push({ text: t, size: 8.2 });
    }
  } else {
    if (cfg?.inst_direccion) lineas.push({ text: cfg.inst_direccion, size: 8.6 });
    const extra = [cfg?.inst_telefono, cfg?.inst_email].filter(Boolean).join(' · ');
    if (extra) lineas.push({ text: extra, size: 8.4 });
  }

  for (const ex of (membrete.info_extra || [])) {
    if (!ex?.nombre && !ex?.descripcion) continue;
    const t = [ex.nombre, ex.descripcion].filter(Boolean).join(': ');
    lineas.push({ text: t, size: 8.2 });
  }
  return lineas;
}

// Dibuja el membrete en un documento jsPDF.
//
//   doc       jsPDF instance
//   ctx       { membrete, institucion, cfg } (resultado de loadMembrete)
//   opts      { x, y, w, h?, withBand?: bool }
//
// Devuelve la `y` justo debajo del bloque (incluida la banda decorativa).
export function drawMembrete(doc, ctx, opts) {
  const { membrete, institucion, cfg } = ctx;
  const { x = 0, y = 0, w, withBand = true } = opts || {};
  const h        = opts?.h || (membrete.altura_mm || 30);
  const bandH    = withBand ? (membrete.banda_alto_mm || 1.2) : 0;

  // Imagen del bloque izquierdo
  const imgW = Math.min(membrete.ancho_img_mm || 55, w * 0.45);
  const hasImg = !!membrete.imagen;

  if (hasImg) {
    try {
      // jsPDF detecta el formato del data URL automáticamente cuando se
      // pasa "PNG"/"JPEG"; intentamos primero PNG y fallback JPEG.
      let format = 'PNG';
      if (/^data:image\/jpe?g/i.test(membrete.imagen)) format = 'JPEG';
      const padding = 1.5;
      doc.addImage(
        membrete.imagen, format,
        x + padding, y + padding,
        imgW - padding * 2, h - padding * 2,
        undefined, 'FAST'
      );
    } catch { /* si falla (ej. SVG), seguimos sin imagen */ }
  } else {
    // Placeholder visual cuando no hay imagen.
    doc.setFillColor(245, 245, 250);
    doc.rect(x, y, imgW, h, 'F');
    doc.setDrawColor(220);
    doc.setLineWidth(0.2);
    doc.rect(x, y, imgW, h);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8);
    doc.setTextColor(160);
    doc.text('(logo)', x + imgW / 2, y + h / 2 + 1, { align: 'center' });
    doc.setTextColor(0);
  }

  // Línea separadora vertical
  doc.setDrawColor(210);
  doc.setLineWidth(0.25);
  doc.line(x + imgW + 0.5, y + 2, x + imgW + 0.5, y + h - 2);

  // Bloque derecho: información centrada verticalmente
  const rightX = x + imgW + 4;
  const rightW = w - imgW - 4;
  const lineas = membreteLineas({ membrete, institucion, cfg });
  // alturas reales en mm — aprox 0.42 * size
  const heights = lineas.map(l => (l.size || 9) * 0.42 + 0.6);
  const totalH  = heights.reduce((s, v) => s + v, 0);
  let cy        = y + (h - totalH) / 2 + heights[0] * 0.7;

  doc.setTextColor(20, 20, 30);
  for (let i = 0; i < lineas.length; i++) {
    const ln = lineas[i];
    doc.setFont('helvetica', ln.bold ? 'bold' : 'normal');
    doc.setFontSize(ln.size || 9);
    const txt = doc.splitTextToSize(ln.text, rightW)[0] || ln.text;
    doc.text(txt, rightX + rightW / 2, cy, { align: 'center' });
    cy += heights[i];
  }
  doc.setTextColor(0);

  // Banda decorativa inferior
  if (withBand && bandH > 0) {
    const [r, g, b] = hexToRgb(membrete.banda_color || '#1a237e');
    doc.setFillColor(r, g, b);
    doc.rect(x, y + h, w, bandH, 'F');
  }

  return y + h + bandH;
}

// HTML del membrete (para preview en pantalla y export Word).
export function membreteHTML(ctx) {
  const { membrete, institucion, cfg } = ctx;
  const lineas = membreteLineas({ membrete, institucion, cfg });
  const escape = (s) => String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const izq = membrete.imagen
    ? `<img src="${escape(membrete.imagen)}" style="max-height:80px;max-width:100%;object-fit:contain"/>`
    : `<div style="color:#aaa;font-style:italic;font-size:11px">(logo)</div>`;
  const der = lineas.map(ln => `
    <div style="font-weight:${ln.bold ? 700 : 400};font-size:${(ln.size || 9) + 2}px;line-height:1.25">${escape(ln.text)}</div>
  `).join('');
  return `
    <table style="width:100%;border-collapse:collapse;margin-bottom:6px">
      <tr>
        <td style="width:35%;padding:6px;border-right:1px solid #ddd;text-align:center;vertical-align:middle">
          ${izq}
        </td>
        <td style="padding:6px;text-align:center;vertical-align:middle">
          ${der}
        </td>
      </tr>
    </table>
    <div style="height:${membrete.banda_alto_mm || 1.2}mm;background:${membrete.banda_color || '#1a237e'}"></div>
  `;
}
