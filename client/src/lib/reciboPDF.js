// Generación del PDF de un recibo (formato landscape 18cm × 10cm).
// Usado por NuevoPago y OtrosPagos.
import { loadMembrete, drawMembrete } from './membrete';

const fmtFecha = (iso) => {
  if (!iso) return '';
  const [y, m, d] = String(iso).split('-');
  return `${d}/${m}/${y}`;
};

const UNI = ['','uno','dos','tres','cuatro','cinco','seis','siete','ocho','nueve',
             'diez','once','doce','trece','catorce','quince','dieciséis','diecisiete',
             'dieciocho','diecinueve'];
const DEC = ['','diez','veinte','treinta','cuarenta','cincuenta','sesenta','setenta','ochenta','noventa'];
const CEN = ['','ciento','doscientos','trescientos','cuatrocientos','quinientos',
             'seiscientos','setecientos','ochocientos','novecientos'];

function menorMil(n) {
  if (n === 0) return '';
  if (n === 100) return 'cien';
  let s = '';
  if (n >= 100) { s = CEN[Math.floor(n / 100)]; n = n % 100; if (n > 0) s += ' '; }
  if (n >= 20)  { s += DEC[Math.floor(n / 10)]; if (n % 10) s += ' y ' + UNI[n % 10]; }
  else if (n)   { s += UNI[n]; }
  return s;
}

function numLetras(n) {
  n = Math.floor(n);
  if (n === 0) return 'cero';
  let s = '';
  if (n >= 1000000) {
    const m = Math.floor(n / 1000000);
    s += (m === 1 ? 'un millón' : numLetras(m) + ' millones') + ' ';
    n = n % 1000000;
  }
  if (n >= 1000) {
    const k = Math.floor(n / 1000);
    s += (k === 1 ? 'mil' : numLetras(k) + ' mil') + ' ';
    n = n % 1000;
  }
  s += menorMil(n);
  return s.trim();
}

export function totalEnLetras(total) {
  const entero   = Math.floor(total);
  const centavos = Math.round((total - entero) * 100);
  const letras   = numLetras(entero).toUpperCase();
  return centavos > 0
    ? `${letras} CON ${String(centavos).padStart(2, '0')}/100 QUETZALES`
    : `${letras} EXACTOS QUETZALES`;
}

export async function generarReciboPDF(reciboData, ctx = null, opts = {}) {
  const { skipQR = false, returnBase64 = false, skipDownload = false } = opts;
  const descuento = parseFloat(reciboData.descuento) || 0;
  const { jsPDF }  = await import('jspdf');
  const QRCode     = skipQR ? null : await import('qrcode');

  const mctx = ctx || await loadMembrete('recibos');
  const cfg  = mctx.cfg || {};
  const membrete = mctx.membrete;
  const instNombre = (mctx.institucion?.nombre) || cfg.inst_nombre || 'EDUGUAT';

  const doc = new jsPDF({ orientation: 'l', unit: 'mm', format: [100, 180] });

  const W  = doc.internal.pageSize.getWidth();
  const H  = doc.internal.pageSize.getHeight();
  const ML = 7;
  const MR = W - 7;

  let cursorY;
  if (membrete?.usar) {
    const headerH = Math.min(membrete.altura_mm || 24, 26);
    cursorY = drawMembrete(doc, mctx, {
      x: ML, y: 4, w: MR - ML, h: headerH, withBand: true,
    });
    cursorY += 1;
  } else {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text(instNombre, W / 2, 9, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    if (cfg.inst_direccion) doc.text(cfg.inst_direccion, W / 2, 14.5, { align: 'center' });
    if (cfg.inst_telefono)  doc.text(cfg.inst_telefono,  W / 2, 19,   { align: 'center' });
    doc.setLineWidth(0.5);
    doc.line(ML, 22, MR, 22);
    cursorY = 23;
  }
  const yShift = Math.max(0, cursorY - 23);

  const yBase = 28 + yShift;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(`No. Recibo: ${reciboData.no_recibo}`, ML, yBase);
  doc.text(`Fecha: ${fmtFecha(reciboData.fecha)}`, MR, yBase, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  const idTxt = `Clave: ${reciboData.alumno.clave}${reciboData.alumno.codigo_estudiante ? `  ·  Cód: ${reciboData.alumno.codigo_estudiante}` : ''}`;
  doc.text(idTxt, ML, yBase + 6);
  doc.text(`Alumno: ${reciboData.alumno.nombre} ${reciboData.alumno.apellido}`, ML, yBase + 11.5);

  doc.setLineWidth(0.2);
  doc.line(ML, yBase + 15, MR, yBase + 15);

  if (!skipQR) {
    const qrText = `${String(instNombre).replace(/\s+/g,'-').toUpperCase()}|${reciboData.no_recibo}|${reciboData.alumno.clave}|Q${Number(reciboData.total).toFixed(2)}|${reciboData.fecha}`;
    try {
      const qrDataUrl = await QRCode.default.toDataURL(qrText, { width: 90, margin: 1 });
      doc.addImage(qrDataUrl, 'PNG', MR - 27, yBase + 16, 25, 25);
    } catch (_) { /* falla sin QR */ }
  }

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.text('SON:', ML, yBase + 20);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  const letras = totalEnLetras(reciboData.total);
  doc.text(letras, ML + 11, yBase + 20, { maxWidth: 128 });

  doc.setFontSize(15);
  doc.setFont('helvetica', 'bold');
  doc.text(`Q ${Number(reciboData.total).toFixed(2)}`, ML + 60, yBase + 30, { align: 'center' });

  let lineaDetalle;
  if (descuento > 0) {
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    const descTxt = `Descuento aplicado: Q ${descuento.toFixed(2)}  ·  Total efectivo distribuido: Q ${(Number(reciboData.total) + descuento).toFixed(2)}`;
    doc.text(descTxt, ML + 60, yBase + 35, { align: 'center', maxWidth: MR - ML - 4 });
    lineaDetalle = yBase + 38;
  } else {
    lineaDetalle = yBase + 35;
  }

  doc.setLineWidth(0.2);
  doc.line(ML, lineaDetalle, MR - 30, lineaDetalle);

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.text('Detalle de pago:', ML, lineaDetalle + 5);

  const pieY = H - 14;

  // meses_str: ajusta tamaño de fuente / saltos para que NUNCA invada el pie
  // (donde se imprime el código de validación). Sin esto, cuando hay descuento
  // los dos renglones extra empujaban el detalle hasta encimarlo con el pie.
  const detalleStartY = lineaDetalle + 10;
  const detalleMaxBottom = pieY - 2;
  const detalleAvailH = Math.max(3, detalleMaxBottom - detalleStartY);
  const detalleMaxWidth = MR - ML;
  const detStr = String(reciboData.meses_str || '');
  let detFontSize = 9;
  let detLines;
  for (;;) {
    doc.setFontSize(detFontSize);
    detLines = doc.splitTextToSize(detStr, detalleMaxWidth);
    const lineHmm = detFontSize * 0.3528 * 1.15;
    if (detLines.length * lineHmm <= detalleAvailH || detFontSize <= 6) break;
    detFontSize -= 0.5;
  }
  doc.setFontSize(detFontSize);
  doc.text(detLines, ML, detalleStartY);

  doc.setLineWidth(0.5);
  doc.line(ML, pieY, MR, pieY);

  const codVal = `${instNombre.replace(/\s+/g,'-').toUpperCase()}-${reciboData.no_recibo}-${reciboData.alumno.clave}-${String(reciboData.fecha).replace(/-/g,'')}`;
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'normal');
  doc.text(`Código de validación: ${codVal}`, ML, pieY + 5);
  doc.text('Documento válido como comprobante oficial de pago.', ML, pieY + 10);

  const filename = `Recibo-${reciboData.no_recibo}-${reciboData.alumno.clave}.pdf`;
  if (!skipDownload) doc.save(filename);

  if (returnBase64) {
    // datauristring → "data:application/pdf;filename=...;base64,JVBERi0..."
    const dataUri = doc.output('datauristring');
    const base64  = dataUri.split('base64,')[1] || '';
    return { filename, base64 };
  }
  return { filename };
}
