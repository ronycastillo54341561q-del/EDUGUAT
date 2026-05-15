import { useState, useEffect, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import Sidebar from '../../components/Sidebar';
import API from '../../api/axios';
import { useAniosFiltros } from '../../lib/anios';
import './admin.css';

const anioActual = new Date().getFullYear();
const LECS   = Array.from({ length: 20 }, (_, i) => ({ key: `l${i + 1}`, label: `L${i + 1}` }));
const MESES  = [
  { num: 1, s: 'ENE' }, { num: 2,  s: 'FEB' }, { num: 3,  s: 'MAR' },
  { num: 4, s: 'ABR' }, { num: 5,  s: 'MAY' }, { num: 6,  s: 'JUN' },
  { num: 7, s: 'JUL' }, { num: 8,  s: 'AGO' }, { num: 9,  s: 'SEP' },
  { num: 10, s: 'OCT' }, { num: 11, s: 'NOV' }, { num: 12, s: 'DIC' },
];
const SEMS = [1, 2, 3, 4, 5];
const ASIST_COL = { x: '#c8e6c9', e: '#fff9c4', p: '#bbdefb', f: '#ffcdd2' };

export default function Impresion() {
  const { anios: ANIOS } = useAniosFiltros();
  const [tab,         setTab]         = useState('mec');
  const [anio,        setAnio]        = useState(anioActual);
  const [horario,     setHorario]     = useState('');
  const [laboratorio, setLaboratorio] = useState('');
  const [estado,      setEstado]      = useState('activo');
  const [dia,         setDia]         = useState('');
  const [filtros,     setFiltros]     = useState({ horarios: [], laboratorios: [], dias: [] });
  const [alumnos,     setAlumnos]     = useState([]);
  const [cargando,    setCargando]    = useState(false);
  const [modoAsist,   setModoAsist]   = useState('datos');

  useEffect(() => {
    API.get('/asistencia/filtros').then(({ data }) => setFiltros(data)).catch(console.error);
  }, []);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const p = new URLSearchParams({ anio, estado });
      if (horario)     p.append('horario',     horario);
      if (laboratorio) p.append('laboratorio', laboratorio);
      if (dia)         p.append('dia',         dia);
      const url = tab === 'mec' ? `/mecanografia/notas?${p}` : `/asistencia/grid?${p}`;
      const { data } = await API.get(url);
      setAlumnos(data);
    } catch (err) { console.error(err); }
    finally { setCargando(false); }
  }, [tab, anio, horario, laboratorio, estado, dia]);

  useEffect(() => { cargar(); }, [cargar]);

  // ── Exportar Mecanografía ─────────────────────────────────────────────────
  const exportMec = () => {
    const wb = XLSX.utils.book_new();
    const totalCols = 23; // No + Código + Alumno + 20 lecciones + Examen
    const rows = [
      // Fila 1: título fusionado
      ['MECANOGRAFÍA', ...Array(totalCols - 1).fill('')],
      // Fila 2: subtítulo
      [`Año ${anio}${horario ? ' · Horario: ' + horario : ''}${laboratorio ? ' · Lab: ' + laboratorio : ''}${estado ? ' · ' + estado.charAt(0).toUpperCase() + estado.slice(1) + 's' : ''}`,
        ...Array(totalCols - 1).fill('')],
      // Fila 3: encabezados
      ['No.', 'Código', 'Alumno', ...LECS.map(l => l.label), 'Examen'],
      // Datos
      ...alumnos.map((a, i) => [
        i + 1,
        a.clave,
        `${a.nombre} ${a.apellido}`,
        ...LECS.map(l => a.notas?.[l.key] != null ? parseFloat(a.notas[l.key]) : ''),
        a.notas?.examen != null ? parseFloat(a.notas.examen) : '',
      ]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: totalCols - 1 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: totalCols - 1 } },
    ];
    ws['!cols'] = [{ wch: 4 }, { wch: 11 }, { wch: 28 }, ...Array(21).fill({ wch: 5 })];
    XLSX.utils.book_append_sheet(wb, ws, 'Mecanografía');
    XLSX.writeFile(wb, `mecanografia_${anio}.xlsx`);
  };

  // ── Exportar PDF (render nativo con jsPDF + autoTable) ────────────────────
  const descargarBlobPDF = (pdf, nombre) => {
    // Fallback robusto: genera un Blob y dispara la descarga manualmente.
    // Evita bloqueos silenciosos cuando pdf.save() pierde el contexto del clic.
    try {
      const blob = pdf.output('blob');
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = nombre;
      a.rel      = 'noopener';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 0);
      return true;
    } catch (e) {
      console.error('Fallback blob falló:', e);
      return false;
    }
  };

  const exportarPDF = () => {
    if (alumnos.length === 0) {
      alert('No hay alumnos para exportar. Ajusta los filtros.');
      return;
    }
    try {
      const pdf    = new jsPDF({ orientation: 'l', unit: 'mm', format: 'legal' });
      const pageW  = pdf.internal.pageSize.getWidth();
      const margin = 12;

      // Cabecera
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(15);
      pdf.text(tab === 'mec' ? 'MECANOGRAFÍA' : 'ASISTENCIA', pageW / 2, margin + 4, { align: 'center' });

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      const sub = `Año ${anio}`
        + (estado ? ` · ${estado.charAt(0).toUpperCase() + estado.slice(1)}s` : '')
        + (horario ? ` · Horario: ${horario}` : '')
        + (laboratorio ? ` · Laboratorio: ${laboratorio}` : '')
        + (tab === 'asist' && modoAsist === 'vacio' ? ' · (Vacío)' : '');
      pdf.text(sub, pageW / 2, margin + 9, { align: 'center' });
      pdf.setLineWidth(0.3);
      pdf.line(margin, margin + 11, pageW - margin, margin + 11);

      const startY = margin + 14;

      if (tab === 'mec') {
        const head = [['No.', 'Clave', 'Alumno', ...LECS.map(l => l.label), 'Exam.']];
        const body = alumnos.map((a, i) => [
          i + 1,
          a.clave ?? '',
          `${a.nombre ?? ''} ${a.apellido ?? ''}`.trim(),
          ...LECS.map(l => a.notas?.[l.key] != null ? parseFloat(a.notas[l.key]).toFixed(0) : ''),
          a.notas?.examen != null ? parseFloat(a.notas.examen).toFixed(0) : '',
        ]);
        autoTable(pdf, {
          head, body, startY,
          margin: { left: margin, right: margin },
          theme: 'grid',
          styles: {
            fontSize: 7, cellPadding: 1.2, halign: 'center', valign: 'middle',
            overflow: 'linebreak',
            lineColor: [80, 80, 80], lineWidth: 0.15,
          },
          headStyles: {
            fillColor: [33, 150, 243], textColor: 255, fontStyle: 'bold',
            lineColor: [80, 80, 80], lineWidth: 0.15,
          },
          alternateRowStyles: { fillColor: [245, 245, 245] },
          columnStyles: {
            0: { cellWidth: 7 },
            1: { cellWidth: 15 },
            2: { cellWidth: 42, halign: 'left' },
          },
        });
      } else {
        // Asistencia: dos filas de header (meses + semanas)
        const head = [
          [
            { content: 'No.',    rowSpan: 2 },
            { content: 'Clave',  rowSpan: 2 },
            { content: 'Alumno', rowSpan: 2 },
            ...MESES.map(m => ({ content: m.s, colSpan: 5 })),
          ],
          MESES.flatMap(() => SEMS.map(s => ({ content: String(s) }))),
        ];
        const body = alumnos.map((a, i) => [
          i + 1,
          a.clave ?? '',
          `${a.nombre ?? ''} ${a.apellido ?? ''}`.trim(),
          ...MESES.flatMap(m =>
            SEMS.map(s => {
              if (modoAsist === 'vacio') return '';
              return (a.asistencias?.[`${m.num}_${s}`] || '').toUpperCase();
            })
          ),
        ]);
        const colStyles = {
          0: { cellWidth: 7 },
          1: { cellWidth: 15 },
          2: { cellWidth: 38, halign: 'left' },
        };
        autoTable(pdf, {
          head, body, startY,
          margin: { left: margin, right: margin },
          theme: 'grid',
          styles: {
            fontSize: 6.5, cellPadding: 0.8, halign: 'center', valign: 'middle',
            lineColor: [80, 80, 80], lineWidth: 0.15,
          },
          headStyles: {
            fillColor: [33, 150, 243], textColor: 255, fontStyle: 'bold', fontSize: 7,
            lineColor: [80, 80, 80], lineWidth: 0.15,
          },
          alternateRowStyles: { fillColor: [245, 245, 245] },
          columnStyles: colStyles,
          didParseCell: (d) => {
            if (d.section !== 'body' || d.column.index < 3) return;
            const v = String(d.cell.raw || '').toLowerCase();
            if (v === 'x') d.cell.styles.fillColor = [200, 230, 201];
            else if (v === 'e') d.cell.styles.fillColor = [255, 249, 196];
            else if (v === 'p') d.cell.styles.fillColor = [187, 222, 251];
            else if (v === 'f') d.cell.styles.fillColor = [255, 205, 210];
          },
        });
      }

      const nombre = `${tab === 'mec' ? 'Mecanografia' : 'Asistencia'}_${anio}.pdf`;
      // 1) Intento estándar
      let ok = false;
      try { pdf.save(nombre); ok = true; }
      catch (e) { console.error('pdf.save() falló:', e); }
      // 2) Fallback con Blob si el save no disparó descarga
      if (!ok) ok = descargarBlobPDF(pdf, nombre);
      if (!ok) alert('No se pudo descargar el PDF. Revisa los permisos de descarga del navegador.');
    } catch (err) {
      console.error('Error PDF:', err);
      alert('No se pudo generar el PDF: ' + (err?.message || err));
    }
  };

  // ── Exportar Asistencia ───────────────────────────────────────────────────
  const exportAsist = () => {
    const wb = XLSX.utils.book_new();
    const totalCols = 63; // No + Código + Alumno + 60 celdas
    const subInfo = `Año ${anio}${horario ? ' · Horario: ' + horario : ''}${laboratorio ? ' · Lab: ' + laboratorio : ''}${modoAsist === 'vacio' ? ' · VACÍO (para llenar)' : ' · Con datos guardados'}`;
    const filaT  = ['ASISTENCIA', ...Array(totalCols - 1).fill('')];
    const filaSub= [subInfo,      ...Array(totalCols - 1).fill('')];
    const filaMes = ['', '', '', ...MESES.flatMap(m => [m.s, '', '', '', ''])];
    const filaSem = ['No.', 'Código', 'Alumno', ...MESES.flatMap(() => SEMS)];
    const filas   = alumnos.map((a, i) => [
      i + 1,
      a.clave,
      `${a.nombre} ${a.apellido}`,
      ...MESES.flatMap(m =>
        SEMS.map(s => {
          if (modoAsist === 'vacio') return '';
          return (a.asistencias?.[`${m.num}_${s}`] || '').toUpperCase();
        })
      ),
    ]);
    const ws = XLSX.utils.aoa_to_sheet([filaT, filaSub, filaMes, filaSem, ...filas]);
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: totalCols - 1 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: totalCols - 1 } },
      // Meses (fila 2, empieza en columna 3)
      ...MESES.map((_, i) => ({
        s: { r: 2, c: 3 + i * 5 }, e: { r: 2, c: 7 + i * 5 },
      })),
    ];
    ws['!cols'] = [{ wch: 4 }, { wch: 11 }, { wch: 28 }, ...Array(60).fill({ wch: 3.5 })];
    XLSX.utils.book_append_sheet(wb, ws, 'Asistencia');
    XLSX.writeFile(wb, `asistencia_${anio}.xlsx`);
  };

  const titulo = tab === 'mec' ? 'Listado de Mecanografía' : 'Listado de Asistencia';

  return (
    <div className="admin-layout">
      <Sidebar />
      <div className="admin-content">

        {/* Encabezado — solo visible en pantalla */}
        <div className="no-print">
          <h1>🖨️ Panel de Impresión</h1>
          <p className="subtitle">Genera e imprime listados en formato horizontal (A4 apaisado).</p>

          {/* Tabs */}
          <div className="imp-tabs">
            <button className={`imp-tab${tab === 'mec' ? ' active' : ''}`} onClick={() => setTab('mec')}>
              ⌨️ Mecanografía
            </button>
            <button className={`imp-tab${tab === 'asist' ? ' active' : ''}`} onClick={() => setTab('asist')}>
              📋 Asistencia
            </button>
          </div>

          {/* Filtros */}
          <div className="asist-filtros" style={{ marginTop: '0.5rem' }}>
            <select value={anio} onChange={e => setAnio(parseInt(e.target.value))}>
              {ANIOS.map(y => <option key={y}>{y}</option>)}
            </select>
            <select value={estado} onChange={e => setEstado(e.target.value)}>
              <option value="activo">Activos</option>
              <option value="retirado">Retirados</option>
              <option value="">Todos</option>
            </select>
            {filtros.dias?.length > 0 && (
              <select value={dia} onChange={e => setDia(e.target.value)}>
                <option value="">Todos los días</option>
                {filtros.dias.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            )}
            <select value={horario} onChange={e => setHorario(e.target.value)}>
              <option value="">Todos los horarios</option>
              {filtros.horarios.map(h => <option key={h} value={h}>{h}</option>)}
            </select>
            <select value={laboratorio} onChange={e => setLaboratorio(e.target.value)}>
              <option value="">Todos los laboratorios</option>
              {filtros.laboratorios.map(l => <option key={l} value={l}>{l}</option>)}
            </select>

            {tab === 'asist' && (
              <div className="imp-modo">
                <button
                  className={`imp-modo-btn${modoAsist === 'datos' ? ' active' : ''}`}
                  onClick={() => setModoAsist('datos')}>
                  Con datos guardados
                </button>
                <button
                  className={`imp-modo-btn${modoAsist === 'vacio' ? ' active' : ''}`}
                  onClick={() => setModoAsist('vacio')}>
                  Vacío (para llenar a mano)
                </button>
              </div>
            )}
          </div>

          {/* Acciones */}
          <div className="imp-actions">
            <button className="btn-primary" onClick={tab === 'mec' ? exportMec : exportAsist}>
              📥 Exportar Excel (.xlsx)
            </button>
            <button className="imp-print-btn" onClick={exportarPDF} disabled={cargando || alumnos.length === 0}>
              📄 Exportar PDF
            </button>
            <span style={{ fontSize: '0.8rem', color: '#888' }}>
              {alumnos.length} alumno(s) · Año {anio}
            </span>
          </div>
        </div>

        {/* Encabezado visible SOLO al imprimir / exportar PDF */}
        <div className="print-only imp-print-header">
          <div className="imp-print-header-inner">
            <div className="imp-print-header-title">
              {tab === 'mec' ? 'Mecanografía' : 'Asistencia'}
            </div>
            <div className="imp-print-header-sub">
              Año {anio}
              {estado && ` · ${estado.charAt(0).toUpperCase() + estado.slice(1)}s`}
              {horario     && ` · Horario: ${horario}`}
              {laboratorio && ` · Laboratorio: ${laboratorio}`}
              {tab === 'asist' && modoAsist === 'vacio' && ' · (Vacío — para llenar a mano)'}
            </div>
          </div>
        </div>

        {/* Tabla */}
        <div className="table-container" style={{ marginTop: '0.75rem' }}>
          {cargando ? (
            <div className="no-print" style={{ textAlign: 'center', padding: '3rem', color: '#999' }}>
              Cargando...
            </div>
          ) : tab === 'mec' ? (
            <TablaMec alumnos={alumnos} />
          ) : (
            <TablaAsist alumnos={alumnos} modoAsist={modoAsist} />
          )}
        </div>

      </div>
    </div>
  );
}

// ── Tabla Mecanografía ────────────────────────────────────────────────────────
function TablaMec({ alumnos }) {
  return (
    <div className="table-scroll">
      <table className="imp-table">
        <thead>
          <tr>
            <th className="imp-th-no">No.</th>
            <th className="imp-th-cod">Clave</th>
            <th className="imp-th-nombre">Alumno</th>
            {LECS.map(l => <th key={l.key} className="imp-th-nota">{l.label}</th>)}
            <th className="imp-th-nota imp-th-examen">Exam.</th>
          </tr>
        </thead>
        <tbody>
          {alumnos.length === 0 ? (
            <tr>
              <td colSpan={23} style={{ textAlign: 'center', padding: '2rem', color: '#999' }}>
                Sin datos. Ajusta los filtros.
              </td>
            </tr>
          ) : alumnos.map((a, i) => (
            <tr key={a.id} className={i % 2 === 0 ? '' : 'imp-tr-alt'}>
              <td className="imp-td-no">{i + 1}</td>
              <td className="imp-td-cod" title={a.codigo_estudiante || 'sin código'}>{a.clave}</td>
              <td className="imp-td-nombre">{a.nombre} {a.apellido}</td>
              {LECS.map(l => (
                <td key={l.key} className="imp-td-nota">
                  {a.notas?.[l.key] != null ? parseFloat(a.notas[l.key]).toFixed(0) : ''}
                </td>
              ))}
              <td className="imp-td-nota imp-td-examen">
                {a.notas?.examen != null ? parseFloat(a.notas.examen).toFixed(0) : ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Tabla Asistencia ──────────────────────────────────────────────────────────
function TablaAsist({ alumnos, modoAsist }) {
  return (
    <div className="table-scroll">
      <table className="imp-table imp-table-asist">
        <thead>
          <tr>
            <th className="imp-th-no"  rowSpan={2}>No.</th>
            <th className="imp-th-cod" rowSpan={2}>Clave</th>
            <th className="imp-th-nombre" rowSpan={2}>Alumno</th>
            {MESES.map(m => (
              <th key={m.num} className="imp-th-mes" colSpan={5}>{m.s}</th>
            ))}
          </tr>
          <tr>
            {MESES.flatMap(m =>
              SEMS.map(s => <th key={`${m.num}-${s}`} className="imp-th-sem">{s}</th>)
            )}
          </tr>
        </thead>
        <tbody>
          {alumnos.length === 0 ? (
            <tr>
              <td colSpan={63} style={{ textAlign: 'center', padding: '2rem', color: '#999' }}>
                Sin datos. Ajusta los filtros.
              </td>
            </tr>
          ) : alumnos.map((a, i) => (
            <tr key={a.id} className={i % 2 === 0 ? '' : 'imp-tr-alt'}>
              <td className="imp-td-no">{i + 1}</td>
              <td className="imp-td-cod" title={a.codigo_estudiante || 'sin código'}>{a.clave}</td>
              <td className="imp-td-nombre">{a.nombre} {a.apellido}</td>
              {MESES.flatMap(m =>
                SEMS.map(s => {
                  const val = modoAsist === 'datos'
                    ? (a.asistencias?.[`${m.num}_${s}`] || '')
                    : '';
                  const bg = val ? ASIST_COL[val] : undefined;
                  return (
                    <td key={`${m.num}-${s}`}
                      className="imp-td-asist"
                      style={bg ? { background: bg } : undefined}>
                      {val ? val.toUpperCase() : ''}
                    </td>
                  );
                })
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
