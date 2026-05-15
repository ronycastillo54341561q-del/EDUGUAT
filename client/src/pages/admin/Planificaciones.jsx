import { useState, useEffect } from 'react';
import Sidebar from '../../components/Sidebar';
import API from '../../api/axios';
import { loadMembrete, drawMembrete } from '../../lib/membrete';
import './admin.css';

// Paleta de colores para los encabezados de programa
const PROG_COLORS = [
  { bg: '#1a237e', text: '#fff', sub: '#e8eaf6' },
  { bg: '#1b5e20', text: '#fff', sub: '#e8f5e9' },
  { bg: '#b71c1c', text: '#fff', sub: '#ffebee' },
  { bg: '#e65100', text: '#fff', sub: '#fff3e0' },
  { bg: '#4a148c', text: '#fff', sub: '#f3e5f5' },
  { bg: '#006064', text: '#fff', sub: '#e0f7fa' },
  { bg: '#33691e', text: '#fff', sub: '#f1f8e9' },
  { bg: '#880e4f', text: '#fff', sub: '#fce4ec' },
];

// Convierte el color hex de PROG_COLORS a tripleta RGB para jsPDF
function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const fmtFecha = (d = new Date()) => {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
};

// Genera el PDF "bonito" de la planificación de un diplomado
async function exportarPlanificacionPDF({ diplomado, mctx }) {
  const { jsPDF } = await import('jspdf');

  const cfg = mctx.cfg || {};
  const membrete = mctx.membrete;

  const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'letter' });
  const PW = doc.internal.pageSize.getWidth();
  const PH = doc.internal.pageSize.getHeight();
  const ML = 18;
  const MR = PW - 18;
  const MT = 18;
  const MB = 18;
  const usableW = MR - ML;
  const headerH = membrete?.usar ? Math.max(20, Math.min(membrete.altura_mm || 28, 34)) : 14;

  doc.setFont('helvetica', 'normal');
  const fechaImp = fmtFecha();

  // Encabezado: membrete de dos secciones (o banda simple si está deshabilitado).
  const drawTopBand = () => {
    if (membrete?.usar) {
      drawMembrete(doc, mctx, {
        x: ML, y: 6, w: usableW, h: headerH, withBand: true,
      });
    } else {
      doc.setFillColor(26, 35, 126);
      doc.rect(0, 0, PW, 14, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.text(cfg.inst_nombre || 'EDUGUAT', ML, 9);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      const der = [cfg.inst_direccion, cfg.inst_telefono, cfg.inst_email].filter(Boolean).join(' · ');
      if (der) doc.text(der, MR, 9, { align: 'right' });
      doc.setTextColor(0, 0, 0);
    }
  };

  // Pie con paginación
  const drawFooter = (page, total) => {
    doc.setDrawColor(200);
    doc.setLineWidth(0.2);
    doc.line(ML, PH - MB + 2, MR, PH - MB + 2);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(110);
    doc.text(`Planificación · ${diplomado.nombre}`, ML, PH - MB + 7);
    doc.text(`Generado: ${fechaImp}`, PW / 2, PH - MB + 7, { align: 'center' });
    doc.text(`Página ${page} / ${total}`, MR, PH - MB + 7, { align: 'right' });
    doc.setTextColor(0);
  };

  // Helpers
  const ensureSpace = (cursorY, needed) => cursorY + needed > PH - MB - 4;

  // Recorrido de páginas: jsPDF nos obliga a saber el total al final.
  // Estrategia: dibujamos todo, en cada página llamamos addPage() según haga falta,
  // y al final reescribimos los pies con el total.
  let cursorY;
  const startPage = () => {
    drawTopBand();
    // El membrete ocupa más espacio que la banda original; ajustamos el cursor.
    cursorY = membrete?.usar ? (6 + headerH + 6) : (MT + 4);
  };
  const newPage = () => {
    doc.addPage();
    startPage();
  };

  // Página 1: portada con info del diplomado
  startPage();

  // Título grande
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(26, 35, 126);
  doc.text('PLANIFICACIÓN DEL DIPLOMADO', PW / 2, cursorY + 14, { align: 'center' });

  doc.setFontSize(18);
  doc.setTextColor(0);
  doc.text(diplomado.nombre, PW / 2, cursorY + 24, { align: 'center' });

  // Subtítulo / fecha
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(110);
  doc.text(`Documento generado el ${fechaImp}`, PW / 2, cursorY + 31, { align: 'center' });
  doc.setTextColor(0);

  cursorY += 42;

  // Objetivo general del diplomado
  if (diplomado.objetivo_general) {
    doc.setFillColor(232, 234, 246);
    doc.roundedRect(ML, cursorY, usableW, 8, 2, 2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(26, 35, 126);
    doc.text('OBJETIVO GENERAL', ML + 3, cursorY + 5.5);
    doc.setTextColor(0);
    cursorY += 11;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    const lines = doc.splitTextToSize(diplomado.objetivo_general, usableW - 4);
    doc.text(lines, ML + 2, cursorY + 4);
    cursorY += lines.length * 5 + 4;
  }

  // Objetivos específicos del diplomado
  if (diplomado.objetivos?.length > 0) {
    doc.setFillColor(232, 234, 246);
    doc.roundedRect(ML, cursorY, usableW, 8, 2, 2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(26, 35, 126);
    doc.text('OBJETIVOS ESPECÍFICOS', ML + 3, cursorY + 5.5);
    doc.setTextColor(0);
    cursorY += 11;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    for (const o of diplomado.objetivos) {
      const lines = doc.splitTextToSize(`• ${o.descripcion}`, usableW - 6);
      if (ensureSpace(cursorY, lines.length * 5 + 2)) { newPage(); }
      doc.text(lines, ML + 4, cursorY + 4);
      cursorY += lines.length * 5 + 1.5;
    }
    cursorY += 4;
  }

  // Resumen de programas (índice)
  const programasOrd = [...(diplomado.programas || [])].sort((a, b) => a.orden - b.orden);

  if (programasOrd.length) {
    if (ensureSpace(cursorY, 14)) newPage();
    doc.setFillColor(232, 234, 246);
    doc.roundedRect(ML, cursorY, usableW, 8, 2, 2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(26, 35, 126);
    doc.text('PROGRAMAS A IMPARTIR', ML + 3, cursorY + 5.5);
    doc.setTextColor(0);
    cursorY += 11;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    const totalSem = programasOrd.reduce((s, p) => s + (p.duracion_semanas || 0), 0);
    for (let i = 0; i < programasOrd.length; i++) {
      const p = programasOrd[i];
      if (ensureSpace(cursorY, 6)) newPage();
      doc.text(`${i + 1}. ${p.nombre}  —  ${p.duracion_semanas} semana${p.duracion_semanas !== 1 ? 's' : ''}`, ML + 4, cursorY + 4);
      cursorY += 5.5;
    }
    cursorY += 1;
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(10);
    doc.setTextColor(110);
    doc.text(`Total: ${programasOrd.length} programa${programasOrd.length !== 1 ? 's' : ''} · ${totalSem} semanas`, ML + 4, cursorY + 4);
    doc.setTextColor(0);
    cursorY += 8;
  }

  // Por cada programa: nueva página, datos detallados y contenido por semana
  for (let i = 0; i < programasOrd.length; i++) {
    const p = programasOrd[i];
    const pc = PROG_COLORS[i % PROG_COLORS.length];
    const [r, g, b] = hexToRgb(pc.bg);

    newPage();

    // Banda de color con número y nombre del programa
    doc.setFillColor(r, g, b);
    doc.rect(ML, cursorY, usableW, 14, 'F');

    doc.setFillColor(255, 255, 255);
    doc.circle(ML + 8, cursorY + 7, 5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(r, g, b);
    doc.text(String(i + 1), ML + 8, cursorY + 8.6, { align: 'center' });

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14);
    doc.text(p.nombre, ML + 16, cursorY + 7);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`${p.duracion_semanas} semana${p.duracion_semanas !== 1 ? 's' : ''}`, MR - 3, cursorY + 7, { align: 'right' });
    doc.setTextColor(0);

    cursorY += 18;

    // Objetivo general del programa
    if (p.objetivo_general) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(r, g, b);
      doc.text('Objetivo general', ML, cursorY);
      doc.setTextColor(0);
      cursorY += 5;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(11);
      const lines = doc.splitTextToSize(p.objetivo_general, usableW);
      if (ensureSpace(cursorY, lines.length * 5 + 4)) { newPage(); }
      doc.text(lines, ML, cursorY);
      cursorY += lines.length * 5 + 3;
    }

    // Objetivos específicos del programa
    if (p.objetivos?.length > 0) {
      if (ensureSpace(cursorY, 8)) newPage();
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(r, g, b);
      doc.text('Objetivos específicos', ML, cursorY);
      doc.setTextColor(0);
      cursorY += 5;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(11);
      for (const o of p.objetivos) {
        const lines = doc.splitTextToSize(`• ${o.descripcion}`, usableW - 4);
        if (ensureSpace(cursorY, lines.length * 5 + 1)) { newPage(); }
        doc.text(lines, ML + 2, cursorY);
        cursorY += lines.length * 5 + 1;
      }
      cursorY += 2;
    }

    // Contenido por semana
    if (ensureSpace(cursorY, 12)) newPage();
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(r, g, b);
    doc.text('Contenido por semana', ML, cursorY);
    doc.setTextColor(0);
    cursorY += 4;

    // Tabla simple Semana | Tema
    const colSemW = 22;
    const colTemaW = usableW - colSemW;

    // Header
    if (ensureSpace(cursorY, 10)) newPage();
    doc.setFillColor(r, g, b);
    doc.rect(ML, cursorY, usableW, 7, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Semana', ML + colSemW / 2, cursorY + 5, { align: 'center' });
    doc.text('Tema / Contenido', ML + colSemW + 3, cursorY + 5);
    doc.setTextColor(0);
    cursorY += 7;

    const contenidoOrd = [...(p.contenido || [])].sort((a, b) => a.semana_num - b.semana_num);
    const dur = p.duracion_semanas || 0;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    for (let s = 1; s <= dur; s++) {
      const c = contenidoOrd.find(x => x.semana_num === s);
      const isExamen = s === dur;
      const txt = c?.contenido || (isExamen ? 'Examen final' : '— sin contenido —');
      const lines = doc.splitTextToSize(txt, colTemaW - 4);
      const rowH = Math.max(7, lines.length * 5 + 2);

      if (ensureSpace(cursorY, rowH)) newPage();

      // Fondo zebra
      if (s % 2 === 0) {
        doc.setFillColor(247, 247, 250);
        doc.rect(ML, cursorY, usableW, rowH, 'F');
      }
      // Bordes
      doc.setDrawColor(220);
      doc.setLineWidth(0.15);
      doc.rect(ML, cursorY, usableW, rowH);
      doc.line(ML + colSemW, cursorY, ML + colSemW, cursorY + rowH);

      // Etiqueta de semana
      if (isExamen) {
        doc.setFillColor(211, 47, 47);
        doc.roundedRect(ML + 3, cursorY + 1.5, colSemW - 6, rowH - 3, 1.5, 1.5, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.text('EXAMEN', ML + colSemW / 2, cursorY + rowH / 2 + 1.5, { align: 'center' });
      } else {
        doc.setFillColor(r, g, b);
        doc.roundedRect(ML + 3, cursorY + 1.5, colSemW - 6, rowH - 3, 1.5, 1.5, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.text(`S${s}`, ML + colSemW / 2, cursorY + rowH / 2 + 1.5, { align: 'center' });
      }
      doc.setTextColor(0);
      doc.setFont('helvetica', c?.contenido ? 'normal' : 'italic');
      const textColor = c?.contenido ? 0 : 150;
      doc.setTextColor(textColor);
      doc.text(lines, ML + colSemW + 3, cursorY + 5);
      doc.setTextColor(0);

      cursorY += rowH;
    }
    cursorY += 6;
  }

  // Reescribir pies con paginación correcta
  const total = doc.internal.getNumberOfPages();
  for (let pg = 1; pg <= total; pg++) {
    doc.setPage(pg);
    drawFooter(pg, total);
  }

  const safe = diplomado.nombre.replace(/[^\w\-]+/g, '_').slice(0, 60);
  doc.save(`Planificacion-${safe}.pdf`);
}

export default function Planificaciones() {
  const [diplomados,      setDiplomados]      = useState([]);
  const [cargando,        setCargando]        = useState(false);
  const [verContenido,    setVerContenido]    = useState(null);
  const [exportandoId,    setExportandoId]    = useState(null);

  useEffect(() => {
    setCargando(true);
    API.get('/diplomados')
      .then(({ data }) => setDiplomados(data))
      .catch(console.error)
      .finally(() => setCargando(false));
  }, []);

  const exportar = async (d) => {
    setExportandoId(d.id);
    try {
      const mctx = await loadMembrete('planificaciones');
      await exportarPlanificacionPDF({ diplomado: d, mctx });
    } catch (e) {
      console.error(e);
      alert('Error al generar el PDF');
    } finally {
      setExportandoId(null);
    }
  };

  return (
    <div className="admin-layout">
      <Sidebar />
      <div className="admin-content">
        <h1>Planificaciones</h1>
        <p className="subtitle">
          Cada tarjeta representa un diplomado con sus programas. Pulsa <strong>Ver planificación de programas</strong> para
          desplegar todo el contenido por semana o expórtalo a PDF.
        </p>

        {cargando ? (
          <div style={{ textAlign:'center', padding:'3rem', color:'#999' }}>Cargando...</div>
        ) : diplomados.length === 0 ? (
          <div style={{
            textAlign:'center', padding:'3rem', color:'#888',
            border:'2px dashed #ddd', borderRadius:12, marginTop:'2rem',
          }}>
            No hay diplomados registrados. Crea uno en <strong>Diplomados</strong>.
          </div>
        ) : (
          <div style={{
            display:'grid',
            gridTemplateColumns:'repeat(auto-fill, minmax(360px, 1fr))',
            gap:'1.25rem',
            marginTop:'1rem',
          }}>
            {diplomados.map((d, di) => {
              const programasOrd = [...(d.programas || [])].sort((a,b) => a.orden - b.orden);
              const totalSem = programasOrd.reduce((s,p) => s + (p.duracion_semanas || 0), 0);
              const isOpen = verContenido === d.id;
              const dpc = PROG_COLORS[di % PROG_COLORS.length];
              return (
                <div key={d.id} style={{
                  background:'#fff',
                  border:`1px solid ${isOpen ? dpc.bg : '#e0e0e0'}`,
                  borderRadius:12,
                  boxShadow: isOpen ? '0 4px 16px rgba(0,0,0,.1)' : '0 1px 4px rgba(0,0,0,.06)',
                  overflow:'hidden',
                  gridColumn: isOpen ? '1 / -1' : 'auto',
                  transition:'all .2s',
                }}>
                  {/* Header de la "ventana" */}
                  <div style={{
                    background:dpc.bg, color:dpc.text,
                    padding:'0.75rem 1rem',
                    display:'flex', alignItems:'center', gap:'0.6rem',
                  }}>
                    <h3 style={{ margin:0, fontSize:'1.05rem', flex:1 }}>{d.nombre}</h3>
                    <span style={{
                      background:'rgba(255,255,255,0.18)',
                      borderRadius:999, padding:'2px 10px',
                      fontSize:'0.75rem', fontWeight:700,
                    }}>
                      {programasOrd.length} prog · {totalSem} sem
                    </span>
                  </div>

                  <div style={{ padding:'0.85rem 1rem' }}>
                    {d.objetivo_general && (
                      <p style={{ margin:'0 0 0.6rem', fontSize:'0.83rem', color:'#555' }}>
                        {d.objetivo_general}
                      </p>
                    )}

                    {programasOrd.length === 0 ? (
                      <div style={{ color:'#999', fontSize:'0.85rem', fontStyle:'italic', padding:'0.5rem 0' }}>
                        Este diplomado no tiene programas configurados.
                      </div>
                    ) : (
                      <div style={{ display:'flex', flexWrap:'wrap', gap:'0.3rem', marginBottom:'0.75rem' }}>
                        {programasOrd.map((p, i) => (
                          <span key={p.id} style={{
                            background:'#f5f5f5', border:'1px solid #e0e0e0',
                            borderRadius:999, padding:'2px 9px',
                            fontSize:'0.75rem', color:'#444',
                          }}>
                            {i+1}. {p.nombre} <span style={{ color:'#999' }}>({p.duracion_semanas}s)</span>
                          </span>
                        ))}
                      </div>
                    )}

                    <div style={{ display:'flex', gap:'0.5rem', flexWrap:'wrap' }}>
                      <button
                        onClick={() => setVerContenido(isOpen ? null : d.id)}
                        disabled={programasOrd.length === 0}
                        style={{
                          padding:'0.5rem 0.95rem',
                          background: isOpen ? dpc.bg : '#fff',
                          color: isOpen ? dpc.text : dpc.bg,
                          border: `1.5px solid ${dpc.bg}`,
                          borderRadius:8, fontWeight:700, fontSize:'0.85rem',
                          cursor: programasOrd.length === 0 ? 'not-allowed' : 'pointer',
                          opacity: programasOrd.length === 0 ? 0.5 : 1,
                        }}
                      >
                        {isOpen ? '▲ Ocultar planificación' : '▼ Ver planificación de programas'}
                      </button>
                      <button
                        onClick={() => exportar(d)}
                        disabled={programasOrd.length === 0 || exportandoId === d.id}
                        style={{
                          padding:'0.5rem 0.95rem',
                          background:'#e8f5e9', color:'#1b5e20',
                          border:'1.5px solid #a5d6a7',
                          borderRadius:8, fontWeight:700, fontSize:'0.85rem',
                          cursor: programasOrd.length === 0 ? 'not-allowed' : 'pointer',
                          opacity: programasOrd.length === 0 ? 0.5 : 1,
                        }}
                        title="Exportar la planificación completa como PDF"
                      >
                        {exportandoId === d.id ? 'Generando…' : '📄 Exportar PDF'}
                      </button>
                    </div>

                    {/* Panel desplegable con todo el contenido */}
                    {isOpen && (
                      <div style={{
                        marginTop:'1rem', paddingTop:'1rem',
                        borderTop:'1px dashed #d0d4e8',
                        display:'flex', flexDirection:'column', gap:'0.85rem',
                      }}>
                        {d.objetivos?.length > 0 && (
                          <div style={{
                            background:'#f9f9fc', border:'1px solid #eee',
                            borderRadius:8, padding:'0.6rem 0.85rem',
                          }}>
                            <div style={{ fontWeight:700, fontSize:'0.82rem', color:'#1a237e', marginBottom:4 }}>
                              Objetivos específicos del diplomado
                            </div>
                            <ul style={{ margin:'0 0 0 1.1rem', padding:0, fontSize:'0.83rem', color:'#444' }}>
                              {d.objetivos.map(o => <li key={o.id}>{o.descripcion}</li>)}
                            </ul>
                          </div>
                        )}

                        {programasOrd.map((p, i) => {
                          const pc = PROG_COLORS[i % PROG_COLORS.length];
                          const contenidoOrd = [...(p.contenido || [])].sort((a,b) => a.semana_num - b.semana_num);
                          return (
                            <div key={p.id} style={{
                              border:`1px solid ${pc.bg}`, borderRadius:10,
                              background: pc.sub, overflow:'hidden',
                            }}>
                              <div style={{
                                background:pc.bg, color:pc.text,
                                padding:'0.5rem 0.85rem',
                                display:'flex', alignItems:'center', gap:'0.6rem',
                              }}>
                                <span style={{
                                  background:'#fff', color:pc.bg, borderRadius:'50%',
                                  width:22, height:22, display:'inline-flex',
                                  alignItems:'center', justifyContent:'center',
                                  fontSize:'0.78rem', fontWeight:800,
                                }}>{i + 1}</span>
                                <span style={{ fontWeight:700, fontSize:'0.92rem', flex:1 }}>{p.nombre}</span>
                                <span style={{ fontSize:'0.76rem', opacity:0.85 }}>
                                  {p.duracion_semanas} sem
                                </span>
                              </div>

                              {p.objetivo_general && (
                                <div style={{
                                  padding:'0.45rem 0.85rem', fontSize:'0.82rem',
                                  color:'#444', borderBottom:'1px dashed #d0d4e8',
                                }}>
                                  <strong>Objetivo:</strong> {p.objetivo_general}
                                </div>
                              )}
                              {p.objetivos?.length > 0 && (
                                <div style={{
                                  padding:'0.45rem 0.85rem', fontSize:'0.8rem',
                                  color:'#444', borderBottom:'1px dashed #d0d4e8',
                                }}>
                                  <strong>Objetivos específicos:</strong>
                                  <ul style={{ margin:'0.25rem 0 0 1.1rem', padding:0 }}>
                                    {p.objetivos.map(o => <li key={o.id} style={{ marginBottom:2 }}>{o.descripcion}</li>)}
                                  </ul>
                                </div>
                              )}

                              <div style={{ padding:'0.5rem 0.85rem', background:'#fff' }}>
                                <div style={{ fontSize:'0.78rem', fontWeight:700, color:'#555', marginBottom:'0.4rem' }}>
                                  Contenido por semana
                                </div>
                                <div style={{ display:'flex', flexDirection:'column', gap:'0.3rem' }}>
                                  {Array.from({ length: p.duracion_semanas }, (_, k) => k + 1).map(sn => {
                                    const c = contenidoOrd.find(x => x.semana_num === sn);
                                    const isExamen = sn === p.duracion_semanas;
                                    return (
                                      <div key={sn} style={{
                                        display:'flex', gap:'0.55rem', alignItems:'flex-start',
                                        fontSize:'0.83rem',
                                        borderLeft:`3px solid ${isExamen ? '#d32f2f' : pc.bg}`,
                                        paddingLeft:'0.55rem',
                                      }}>
                                        <span style={{
                                          background: isExamen ? '#d32f2f' : pc.bg,
                                          color:'#fff', borderRadius:4, padding:'1px 6px',
                                          fontSize:'0.7rem', fontWeight:800, flexShrink:0,
                                          minWidth:32, textAlign:'center',
                                        }}>
                                          {isExamen ? 'EX' : `S${sn}`}
                                        </span>
                                        <span style={{
                                          color: c?.contenido ? '#333' : '#aaa',
                                          fontStyle: c?.contenido ? 'normal' : 'italic',
                                        }}>
                                          {c?.contenido || (isExamen ? 'Examen final' : '— sin contenido —')}
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
