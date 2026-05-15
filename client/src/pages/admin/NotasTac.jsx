import { useState, useEffect, useCallback, useMemo } from 'react';
import Sidebar from '../../components/Sidebar';
import ScrollableTable from '../../components/ScrollableTable';
import API from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import { can } from '../../lib/permissions';
import { loadMembrete, drawMembrete } from '../../lib/membrete';
import { useAniosFiltros } from '../../lib/anios';
import './admin.css';

const anioActual = new Date().getFullYear();
const NOTAS  = ['nota1','nota2','nota3','nota4'];
const uniq   = (arr, k) => [...new Set(arr.map(a => a[k]).filter(Boolean))].sort();
const ls     = (k, d)   => localStorage.getItem(k) ?? d;
const gradeColor = v => {
  if (v === '' || v == null) return '';
  const n = parseFloat(v);
  return isNaN(n) ? '' : n >= 60 ? '#c8e6c9' : '#ffcdd2';
};
const ncid = (id, col) => `tc-${id}-${col}`;

const toInt = val => {
  if (val === '' || val == null) return '';
  const n = parseInt(val, 10);
  if (isNaN(n)) return '';
  return String(Math.min(100, Math.max(0, n)));
};

const calcProm = notas => {
  const vals = notas.map(parseFloat).filter(v => !isNaN(v));
  if (!vals.length) return null;
  return (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2);
};

// Promedio sólo cuando las 4 unidades están completas; si falta alguna
// devuelve cadena vacía para dejar la celda en blanco en el PDF.
const calcPromCompleto = notas => {
  const vals = notas.map(parseFloat);
  if (vals.some(v => isNaN(v))) return '';
  return (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2);
};

const fmtFecha = (d = new Date()) => {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = d.getFullYear();
  return `${dd}/${mm}/${yy}`;
};

const TAC_LABELS = { '1': 'Primero', '2': 'Segundo', '3': 'Tercero' };
const TAC_ORDER  = ['1', '2', '3'];

async function exportarNotasPDF({ alumnos, pending = {}, anio, establecimiento, mctx }) {
  const { jsPDF } = await import('jspdf');

  const cfg = mctx.cfg || {};
  const membrete = mctx.membrete;
  const instNombre = (mctx.institucion?.nombre) || cfg.inst_nombre || 'EDUGUAT';

  // Construye una sección por TAC (1, 2, 3). Sólo se incluyen TACs con alumnos.
  const secciones = TAC_ORDER.map(tac => {
    const filas = alumnos
      .filter(a => String(a.tac || '') === tac || (a.notasPorTac && a.notasPorTac[tac]))
      .map(a => {
        const base  = (a.notasPorTac && a.notasPorTac[tac]) || {};
        const notas = { ...base };
        for (const n of NOTAS) {
          const k = `${a.id}__${tac}__${n}`;
          if (k in pending) notas[n] = pending[k] === '' ? null : pending[k];
        }
        const u1 = notas.nota1, u2 = notas.nota2, u3 = notas.nota3, u4 = notas.nota4;
        const norm = v => (v === '' || v == null ? '' : String(v));
        return {
          nom:  `${a.nombre || ''} ${a.apellido || ''}`.trim(),
          gra:  TAC_LABELS[tac],
          u1:   norm(u1),
          u2:   norm(u2),
          u3:   norm(u3),
          u4:   norm(u4),
          prom: calcPromCompleto([u1, u2, u3, u4]),
        };
      })
      .sort((a, b) => a.nom.localeCompare(b.nom, 'es', { sensitivity: 'base' }));
    return { tac, label: TAC_LABELS[tac], filas };
  }).filter(s => s.filas.length > 0);

  if (!secciones.length) return;

  const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'letter' });
  const PW = doc.internal.pageSize.getWidth();   // 215.9
  const PH = doc.internal.pageSize.getHeight();  // 279.4
  const ML = 16;
  const MR = PW - 16;
  const MB = 16;
  const usableW = MR - ML;

  doc.setFont('helvetica', 'normal');
  const fechaImpresion = fmtFecha();

  // Paleta moderna educativa (azul académico).
  const C_BAND      = [30, 58, 138];   // navy 800
  const C_BAND_TX   = [255, 255, 255];
  const C_SECT_BG   = [219, 234, 254]; // blue 100
  const C_SECT_TX   = [30, 58, 138];
  const C_TH_BG     = [241, 245, 249]; // slate 100
  const C_TH_TX     = [15, 23, 42];    // slate 900
  const C_BORDER    = [203, 213, 225]; // slate 300
  const C_RULE      = [148, 163, 184]; // slate 400
  const C_ZEBRA     = [248, 250, 252]; // slate 50
  const C_TEXT      = [30, 30, 30];
  const C_MUTED     = [110, 110, 110];
  const C_PROM_OK   = [22, 101, 52];
  const C_PROM_BAD  = [153, 27, 27];

  // Columnas. La columna Alumno absorbe el ancho restante.
  const cols = [
    { key: 'n',    label: '#',        w: 8,  align: 'center' },
    { key: 'nom',  label: 'Alumno',   w: 0,  align: 'left'   },
    { key: 'gra',  label: 'Grado',    w: 20, align: 'center' },
    { key: 'u1',   label: 'Nota 1',   w: 14, align: 'center' },
    { key: 'u2',   label: 'Nota 2',   w: 14, align: 'center' },
    { key: 'u3',   label: 'Nota 3',   w: 14, align: 'center' },
    { key: 'u4',   label: 'Nota 4',   w: 14, align: 'center' },
    { key: 'prom', label: 'Promedio', w: 18, align: 'center' },
  ];
  const fixedW = cols.reduce((s, c) => s + c.w, 0);
  cols.find(c => c.key === 'nom').w = usableW - fixedW;

  const sectionH = 8;
  const tHeadH   = 6.8;
  const rowH     = 5.8;
  const footerH  = 8;
  const limitY   = PH - MB - footerH;

  // Encabezado compacto para páginas siguientes (sin membrete grande).
  // Solo título + año + página, para no repetir el logo institucional.
  const drawNextHeader = () => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...C_BAND);
    doc.text(`Reporte de Notas TAC ${anio}`, ML, 10);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...C_MUTED);
    doc.text(String(establecimiento), MR, 10, { align: 'right' });
    doc.setDrawColor(...C_RULE);
    doc.setLineWidth(0.3);
    doc.line(ML, 13, MR, 13);
    return 18;
  };

  const drawHeader = (isFirst = true) => {
    if (!isFirst) return drawNextHeader();
    if (membrete?.usar) {
      const headerH = Math.max(20, Math.min(membrete.altura_mm || 30, 36));
      drawMembrete(doc, mctx, { x: ML, y: 6, w: usableW, h: headerH, withBand: true });

      // Bloque adicional con establecimiento + fecha bajo el membrete.
      const yy = 6 + headerH + 5;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(...C_SECT_TX);
      doc.text('ESTABLECIMIENTO', ML, yy);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(40, 40, 40);
      doc.text(String(establecimiento), ML + 36, yy);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(...C_SECT_TX);
      doc.text('FECHA DE ENTREGA', MR, yy, { align: 'right' });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(40, 40, 40);
      doc.text(fechaImpresion, MR, yy + 4, { align: 'right' });

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.2);
      doc.setTextColor(40, 40, 40);
      doc.text(`Reporte de Notas TAC ${anio}`, ML, yy + 4);

      doc.setDrawColor(...C_RULE);
      doc.setLineWidth(0.3);
      doc.line(ML, yy + 7, MR, yy + 7);
      return yy + 11;
    }

    // Banda superior con identidad institucional (modo simple).
    doc.setFillColor(...C_BAND);
    doc.rect(0, 0, PW, 14, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(...C_BAND_TX);
    doc.text(instNombre, ML, 9);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.2);
    doc.text(`Reporte de Notas TAC ${anio}`, MR, 9, { align: 'right' });

    // Datos institucionales bajo la banda.
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(60, 60, 60);
    let yy = 19;
    if (cfg.inst_direccion) { doc.text(cfg.inst_direccion, ML, yy); yy += 4; }
    const linea2 = [cfg.inst_telefono, cfg.inst_email].filter(Boolean).join(' · ');
    if (linea2) { doc.text(linea2, ML, yy); yy += 4; }

    // Bloque derecho: establecimiento + fecha.
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...C_SECT_TX);
    doc.text('ESTABLECIMIENTO', MR, 19, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(40, 40, 40);
    doc.text(String(establecimiento), MR, 23, { align: 'right' });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...C_SECT_TX);
    doc.text('FECHA DE ENTREGA', MR, 28, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(40, 40, 40);
    doc.text(fechaImpresion, MR, 32, { align: 'right' });

    doc.setDrawColor(...C_RULE);
    doc.setLineWidth(0.3);
    doc.line(ML, 35, MR, 35);

    return 39;
  };

  const drawSectionTitle = (y, sec, continuedNote = '') => {
    doc.setFillColor(...C_SECT_BG);
    doc.rect(ML, y, usableW, sectionH, 'F');
    doc.setFillColor(...C_BAND);
    doc.rect(ML, y, 1.6, sectionH, 'F');
    doc.setDrawColor(...C_RULE);
    doc.setLineWidth(0.3);
    doc.line(ML, y + sectionH, MR, y + sectionH);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(...C_SECT_TX);
    const left = `TAC ${sec.tac}  ·  ${sec.label}`;
    doc.text(left, ML + 4, y + sectionH - 2.3);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    const right = `${sec.filas.length} alumno${sec.filas.length === 1 ? '' : 's'}` + (continuedNote ? `  ·  ${continuedNote}` : '');
    doc.text(right, MR - 2, y + sectionH - 2.3, { align: 'right' });
  };

  const drawTableHeader = (y) => {
    doc.setFillColor(...C_TH_BG);
    doc.rect(ML, y, usableW, tHeadH, 'F');
    doc.setDrawColor(...C_BORDER);
    doc.setLineWidth(0.15);
    doc.rect(ML, y, usableW, tHeadH);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.7);
    doc.setTextColor(...C_TH_TX);
    let x = ML;
    for (const c of cols) {
      const tx = c.align === 'center' ? x + c.w / 2 : x + 1.8;
      doc.text(c.label, tx, y + tHeadH - 2, { align: c.align });
      x += c.w;
      if (x < ML + usableW - 0.05) doc.line(x, y, x, y + tHeadH);
    }
  };

  const drawRow = (y, row, idx) => {
    if (idx % 2 === 1) {
      doc.setFillColor(...C_ZEBRA);
      doc.rect(ML, y, usableW, rowH, 'F');
    }
    doc.setDrawColor(...C_BORDER);
    doc.setLineWidth(0.1);
    doc.rect(ML, y, usableW, rowH);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.6);
    doc.setTextColor(...C_TEXT);

    let x = ML;
    for (const c of cols) {
      const raw = c.key === 'n' ? String(idx + 1) : String(row[c.key] ?? '');
      const baseY = y + rowH - 1.9;

      if (c.key === 'nom') {
        // Encoge el cuerpo (hasta 6.5 pt) antes de cortar con elipsis para que
        // el nombre completo quepa siempre que sea posible.
        const maxW = c.w - 3;
        let size = 8.6;
        let txt  = raw;
        doc.setFontSize(size);
        while (doc.getTextWidth(txt) > maxW && size > 6.5) {
          size -= 0.2;
          doc.setFontSize(size);
        }
        while (doc.getTextWidth(txt) > maxW && txt.length > 4) {
          txt = txt.slice(0, -2);
        }
        if (txt !== raw && !txt.endsWith('…')) txt += '…';
        doc.text(txt, x + 1.8, baseY, { align: 'left' });
        doc.setFontSize(8.6);
      } else if (c.key === 'prom' && raw !== '') {
        const n = parseFloat(raw);
        const ok = !isNaN(n) && n >= 60;
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...(ok ? C_PROM_OK : C_PROM_BAD));
        doc.text(raw, x + c.w / 2, baseY, { align: 'center' });
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...C_TEXT);
      } else if (raw !== '') {
        const tx = c.align === 'center' ? x + c.w / 2 : x + 1.8;
        doc.text(raw, tx, baseY, { align: c.align });
      }

      x += c.w;
      if (x < ML + usableW - 0.05) doc.line(x, y, x, y + rowH);
    }
  };

  const drawFooter = (page, total) => {
    doc.setDrawColor(...C_BORDER);
    doc.setLineWidth(0.15);
    doc.line(ML, PH - MB + 2, MR, PH - MB + 2);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.4);
    doc.setTextColor(...C_MUTED);
    doc.text(`Generado: ${fechaImpresion}`, ML, PH - MB + 7);
    doc.text(`Página ${page} de ${total}`, MR, PH - MB + 7, { align: 'right' });
  };

  const drawFirma = (y) => {
    const colW = (usableW - 16) / 2;
    doc.setDrawColor(70, 70, 70);
    doc.setLineWidth(0.4);
    doc.line(ML + 6, y, ML + 6 + colW, y);
    doc.line(MR - 6 - colW, y, MR - 6, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...C_MUTED);
    doc.text('Firma de recibido', ML + 6 + colW / 2, y + 4.5, { align: 'center' });
    doc.text('Sello', MR - 6 - colW / 2, y + 4.5, { align: 'center' });
  };

  // Render por flujo: cada sección abre una nueva página si lo que falta no
  // alcanza para el cabezal de sección + cabezal de tabla + 1 fila.
  // Solo la primera página lleva el membrete completo; las demás usan un
  // encabezado compacto para no repetir el logo institucional.
  let y = drawHeader(true);

  for (const sec of secciones) {
    const minStart = sectionH + tHeadH + rowH + 1;
    if (y + minStart > limitY) {
      doc.addPage();
      y = drawHeader(false);
    }
    let i = 0;
    let firstChunk = true;
    while (i < sec.filas.length) {
      drawSectionTitle(y, sec, firstChunk ? '' : '(continúa)');
      y += sectionH;
      drawTableHeader(y);
      y += tHeadH;
      let idx = 0;
      while (i < sec.filas.length && y + rowH <= limitY) {
        drawRow(y, sec.filas[i], idx);
        y += rowH;
        i++;
        idx++;
      }
      if (i < sec.filas.length) {
        doc.addPage();
        y = drawHeader(false);
        firstChunk = false;
      }
    }
    y += 5;
  }

  // Firma. Si entra en la página actual la pega al pie; si no, abre una nueva.
  const firmaH = 14;
  if (y + firmaH > limitY) {
    doc.addPage();
    y = drawHeader(false);
  } else {
    y = Math.max(y + 8, limitY - firmaH);
  }
  drawFirma(y);

  // Numeración X de Y al final.
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    drawFooter(p, total);
  }

  const safeEst = establecimiento.replace(/[^\w\-]+/g, '_').slice(0, 40);
  doc.save(`Notas-TAC-${anio}-${safeEst}.pdf`);
}

export default function NotasTac() {
  const { usuario } = useAuth();
  const puedeEditar = can(usuario?.rol, 'notasTac', 'edit');
  const { anios: ANIOS } = useAniosFiltros();
  const [anio,             setAnio]             = useState(() => parseInt(ls('tac_anio', anioActual)) || anioActual);
  const [fEstado,          setFEstado]          = useState(() => ls('tac_estado',  'activo'));
  const [fHorario,         setFHorario]         = useState(() => ls('tac_horario', ''));
  const [fLaboratorio,     setFLaboratorio]     = useState(() => ls('tac_lab',     ''));
  const [fDia,             setFDia]             = useState(() => ls('tac_dia',     ''));
  const [fTac,             setFTac]             = useState(() => ls('tac_tac',     ''));
  const [fEstablecimiento, setFEstablecimiento] = useState(() => ls('tac_estab',   ''));
  const [filtros,          setFiltros]          = useState({ horarios: [], laboratorios: [], dias: [] });
  const [alumnos,          setAlumnos]          = useState([]);
  const [cargando,         setCargando]         = useState(false);
  const [pending,          setPending]          = useState({});
  const [guardando,        setGuardando]        = useState(false);
  const [msg,              setMsg]              = useState('');
  const [exportando,       setExportando]       = useState(false);

  useEffect(() => { localStorage.setItem('tac_anio',    anio);         }, [anio]);
  useEffect(() => { localStorage.setItem('tac_estado',  fEstado);      }, [fEstado]);
  useEffect(() => { localStorage.setItem('tac_horario', fHorario);     }, [fHorario]);
  useEffect(() => { localStorage.setItem('tac_lab',     fLaboratorio); }, [fLaboratorio]);
  useEffect(() => { localStorage.setItem('tac_dia',     fDia);         }, [fDia]);
  useEffect(() => { localStorage.setItem('tac_tac',     fTac);         }, [fTac]);
  useEffect(() => { localStorage.setItem('tac_estab',   fEstablecimiento); }, [fEstablecimiento]);

  useEffect(() => {
    API.get('/asistencia/filtros').then(({ data }) => setFiltros(data)).catch(console.error);
  }, []);

  const cargar = useCallback(async () => {
    setCargando(true); setPending({});
    try {
      const p = new URLSearchParams({ anio });
      if (fEstado)      p.append('estado',      fEstado);
      if (fHorario)     p.append('horario',     fHorario);
      if (fLaboratorio) p.append('laboratorio', fLaboratorio);
      if (fDia)         p.append('dia',         fDia);
      // tac y establecimiento se filtran en cliente para ver histórico por año
      const { data } = await API.get(`/notas-tac/anual?${p}`);
      setAlumnos(data);
    } catch (err) { console.error(err); }
    finally { setCargando(false); }
  }, [anio, fEstado, fHorario, fLaboratorio, fDia]);

  useEffect(() => { cargar(); }, [cargar]);

  // TACs visibles = unión del TAC actual del alumno (`a.tac`) y los TAC
  // donde el alumno tenga notas guardadas en este año (`a.notasPorTac`).
  // Esto permite ver el histórico: si un alumno estudió TAC 1 en 2024 y
  // ahora cursa TAC 3, sus notas de TAC 1 siguen apareciendo bajo esa pestaña
  // al filtrar por 2024.
  const tacs = useMemo(() => {
    const set = new Set();
    for (const a of alumnos) {
      if (a.tac) set.add(String(a.tac));
      for (const k of Object.keys(a.notasPorTac || {})) {
        if (k) set.add(String(k));
      }
    }
    return [...set].sort();
  }, [alumnos]);
  const establecimientos = uniq(alumnos, 'establecimiento');

  // Si todavía no hay TAC activo (o el guardado ya no existe en la lista),
  // selecciona el primero disponible.  Esto se comporta como las pestañas de
  // Notas Diplomados: siempre hay una pestaña activa.
  useEffect(() => {
    if (!tacs.length) return;
    if (!fTac || !tacs.includes(fTac)) setFTac(tacs[0]);
  }, [tacs, fTac]);

  // Filtro cliente: el alumno aparece en la pestaña fTac si:
  //   1) Su TAC actual (ficha) es fTac — para inscripciones del año en curso.
  //   2) O tiene notas históricas registradas en fTac para el año seleccionado
  //      (preserva el registro aunque el alumno haya cambiado de TAC).
  const alumnosFiltrados = alumnos.filter(a => {
    if (fEstablecimiento && a.establecimiento !== fEstablecimiento) return false;
    if (fTac) {
      const esActual    = String(a.tac || '') === String(fTac);
      const tieneHistor = !!(a.notasPorTac && a.notasPorTac[fTac]);
      if (!esActual && !tieneHistor) return false;
    }
    return true;
  });

  // Las notas viven ahora por TAC.  La clave del pending incluye el TAC
  // activo para evitar mezclar notas de distintos TACs entre sí.
  const getVal = (alumnoId, campo) => {
    const k = `${alumnoId}__${fTac}__${campo}`;
    if (k in pending) return pending[k];
    const a = alumnos.find(x => x.id === alumnoId);
    return a?.notasPorTac?.[fTac]?.[campo] ?? '';
  };

  const setVal = (alumnoId, campo, raw) =>
    setPending(prev => ({ ...prev, [`${alumnoId}__${fTac}__${campo}`]: toInt(raw) }));

  const COLS_NAV = NOTAS;
  const navigate = (alumnoId, campo, dir) => {
    const ai = alumnosFiltrados.findIndex(a => a.id === alumnoId);
    const ci = COLS_NAV.indexOf(campo);
    let na = ai, nc = ci;
    if (dir === 'right') { nc < COLS_NAV.length - 1 ? nc++ : (na < alumnosFiltrados.length - 1 && (na++, nc = 0)); }
    else if (dir === 'left')  { nc > 0 ? nc-- : (na > 0 && (na--, nc = COLS_NAV.length - 1)); }
    else if (dir === 'down')  { na < alumnosFiltrados.length - 1 && na++; }
    else if (dir === 'up')    { na > 0 && na--; }
    document.getElementById(ncid(alumnosFiltrados[na]?.id, COLS_NAV[nc]))?.focus();
  };

  const handleKey = (e, alumnoId, campo) => {
    const dirs = { ArrowRight:'right', ArrowLeft:'left', ArrowDown:'down', ArrowUp:'up' };
    if (dirs[e.key]) { e.preventDefault(); navigate(alumnoId, campo, dirs[e.key]); }
    else if (e.key === 'Enter') { e.preventDefault(); navigate(alumnoId, campo, 'down'); }
    else if (e.key === 'Tab')   { e.preventDefault(); navigate(alumnoId, campo, e.shiftKey ? 'left' : 'right'); }
  };

  const hasChanges = Object.keys(pending).length > 0;

  // Para el export usamos TODOS los alumnos del establecimiento (sin filtrar
  // por TAC) — el PDF agrupa los 3 TAC en un solo documento.
  const alumnosEstab = useMemo(
    () => fEstablecimiento ? alumnos.filter(a => a.establecimiento === fEstablecimiento) : [],
    [alumnos, fEstablecimiento]
  );

  const exportar = async () => {
    if (!fEstablecimiento || !alumnosEstab.length) return;
    setExportando(true);
    try {
      const mctx = await loadMembrete('notas_tac');
      await exportarNotasPDF({
        alumnos:         alumnosEstab,
        pending,
        anio,
        establecimiento: fEstablecimiento,
        mctx,
      });
    } catch (e) {
      console.error(e);
      setMsg('err'); setTimeout(() => setMsg(''), 3000);
    } finally {
      setExportando(false);
    }
  };

  const guardar = async () => {
    setGuardando(true);
    try {
      // El pending key es `${alumno_id}__${tac}__${campo}`
      const cambios = Object.entries(pending).map(([k, valor]) => {
        const [alumno_id, tac, campo] = k.split('__');
        return {
          alumno_id: Number(alumno_id),
          tac,
          campo,
          valor: valor === '' ? null : valor,
        };
      });
      await API.post('/notas-tac/anual', { anio, cambios });
      setAlumnos(prev => prev.map(a => {
        const notasPorTac = { ...(a.notasPorTac || {}) };
        Object.entries(pending).forEach(([k, v]) => {
          const [aid, tac, campo] = k.split('__');
          if (Number(aid) !== a.id) return;
          notasPorTac[tac] = { ...(notasPorTac[tac] || {}), [campo]: v === '' ? null : v };
        });
        const propio = (a.tac && notasPorTac[a.tac]) ? notasPorTac[a.tac]
                    : (Object.values(notasPorTac)[0] || {});
        return { ...a, notasPorTac, notas: propio };
      }));
      setPending({});
      setMsg('ok'); setTimeout(() => setMsg(''), 3000);
    } catch { setMsg('err'); setTimeout(() => setMsg(''), 3000); }
    finally { setGuardando(false); }
  };

  return (
    <div className="admin-layout">
      <Sidebar />
      <div className="admin-content">
        <h1>📝 Notas TAC</h1>
        <p className="subtitle">Ingresa las 4 notas por alumno. El promedio se calcula automáticamente.</p>

        <div className="asist-filtros">
          <select value={anio} onChange={e => setAnio(Number(e.target.value))}>
            {ANIOS.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <select value={fEstado} onChange={e => setFEstado(e.target.value)}>
            <option value="activo">Activos</option>
            <option value="retirado">Retirados</option>
            <option value="">Todos</option>
          </select>
          {filtros.dias?.length > 0 && (
            <select value={fDia} onChange={e => setFDia(e.target.value)}>
              <option value="">Todos los días</option>
              {filtros.dias.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          )}
          <select value={fHorario} onChange={e => setFHorario(e.target.value)}>
            <option value="">Todos los horarios</option>
            {filtros.horarios.map(h => <option key={h} value={h}>{h}</option>)}
          </select>
          <select value={fLaboratorio} onChange={e => setFLaboratorio(e.target.value)}>
            <option value="">Todos los laboratorios</option>
            {filtros.laboratorios.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
          {establecimientos.length > 0 && (
            <select value={fEstablecimiento} onChange={e => setFEstablecimiento(e.target.value)}>
              <option value="">Todos los establecimientos</option>
              {establecimientos.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
          )}
          {fEstablecimiento && (
            <button
              onClick={exportar}
              disabled={exportando || alumnosEstab.length === 0}
              title={`Exportar notas de los 3 TAC del establecimiento "${fEstablecimiento}" como PDF`}
              style={{
                padding: '0.4rem 0.9rem', background: '#e8f5e9',
                border: '1px solid #a5d6a7', borderRadius: 8,
                cursor: exportando ? 'wait' : 'pointer',
                fontSize: '0.88rem', fontWeight: 600, color: '#1b5e20',
              }}
            >
              {exportando ? 'Generando...' : '📄 Exportar notas (PDF)'}
            </button>
          )}
        </div>

        {tacs.length > 0 && (
          <div className="dip-tabs">
            {tacs.map(t => (
              <button
                key={t}
                className={`dip-tab${String(fTac) === String(t) ? ' active' : ''}`}
                onClick={() => { setFTac(t); setPending({}); }}
              >
                TAC {t}
              </button>
            ))}
          </div>
        )}

        {hasChanges && (
          <div className="asist-save-bar">
            <span style={{ fontSize: '0.88rem', color: '#7b5800' }}>{Object.keys(pending).length} cambio(s) pendiente(s)</span>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="btn-cancel" onClick={() => setPending({})} disabled={guardando}>Descartar</button>
              <button className="btn-primary" onClick={guardar} disabled={guardando}>
                {guardando ? 'Guardando...' : 'Guardar Cambios'}
              </button>
            </div>
          </div>
        )}
        {msg === 'ok'  && <div className="msg-ok"  style={{ marginBottom: '0.75rem' }}>Cambios guardados correctamente</div>}
        {msg === 'err' && <div className="msg-err" style={{ marginBottom: '0.75rem' }}>Error al guardar cambios</div>}

        <div className="table-container">
          {cargando ? <div style={{ textAlign: 'center', padding: '3rem', color: '#999' }}>Cargando...</div> : (
            <ScrollableTable>
              <table className="nota-grid">
                <thead>
                  <tr>
                    <th className="ng-th-fijo">Clave</th>
                    <th className="ng-th-fijo" style={{ minWidth: 150 }}>Alumno</th>
                    {NOTAS.map((n, i) => (
                      <th key={n} className={`ng-th-col${i === 0 ? ' ng-sep' : ''}`}>Nota {i + 1}</th>
                    ))}
                    <th className="ng-th-prom">Promedio</th>
                  </tr>
                </thead>
                <tbody>
                  {alumnosFiltrados.length === 0 ? (
                    <tr><td colSpan={2 + NOTAS.length + 1} style={{ textAlign: 'center', padding: '2rem', color: '#999' }}>No hay alumnos con los filtros seleccionados</td></tr>
                  ) : alumnosFiltrados.map(a => {
                    const vals = NOTAS.map(n => getVal(a.id, n));
                    const prom = calcProm(vals);
                    const promColor = prom == null ? '#999' : parseFloat(prom) >= 60 ? '#2e7d32' : '#c62828';
                    return (
                      <tr key={a.id}>
                        <td className="ng-td-fijo ng-codigo" title={a.codigo_estudiante || 'sin código'}>{a.clave}</td>
                        <td className="ng-td-fijo ng-nombre">{a.nombre} {a.apellido}</td>
                        {NOTAS.map((n, i) => {
                          const val = vals[i];
                          return (
                            <td key={n} className={`ng-cell${i === 0 ? ' ng-sep' : ''}`} style={{ background: gradeColor(val) }}>
                              <input
                                id={ncid(a.id, n)}
                                type="number" min="0" max="100" step="1"
                                value={val}
                                onChange={e => puedeEditar && setVal(a.id, n, e.target.value)}
                                onKeyDown={e => handleKey(e, a.id, n)}
                                readOnly={!puedeEditar}
                                className="ng-input"
                                style={{ background: 'transparent', cursor: puedeEditar ? 'text' : 'default' }}
                              />
                            </td>
                          );
                        })}
                        <td className="ng-prom" style={{ color: promColor }}>
                          {prom ?? '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </ScrollableTable>
          )}
        </div>
      </div>
    </div>
  );
}
