import { useState, useEffect, useCallback, useRef } from 'react';
import Sidebar from '../../components/Sidebar';
import API from '../../api/axios';
import { useAniosFiltros } from '../../lib/anios';
import './admin.css';

/* ══════════════ Constantes ══════════════ */
const MESES = [
  { num:1,  cod:'enero',       lab:'Ene' },
  { num:2,  cod:'febrero',     lab:'Feb' },
  { num:3,  cod:'marzo',       lab:'Mar' },
  { num:4,  cod:'abril',       lab:'Abr' },
  { num:5,  cod:'mayo',        lab:'May' },
  { num:6,  cod:'junio',       lab:'Jun' },
  { num:7,  cod:'julio',       lab:'Jul' },
  { num:8,  cod:'agosto',      lab:'Ago' },
  { num:9,  cod:'septiembre',  lab:'Sep' },
  { num:10, cod:'octubre',     lab:'Oct' },
  { num:11, cod:'noviembre',   lab:'Nov' },
  { num:12, cod:'diciembre',   lab:'Dic' },
];
const SEMANAS    = [1, 2, 3, 4, 5];
const ANIO_HOY   = new Date().getFullYear();
const MES_HOY    = new Date().getMonth() + 1;

const SEG_DRAFT_KEY = 'eduguat_seg_draft';
const FILTRO_KEY    = 'eduguat_filtros';
const REPORTES_KEY  = 'eduguat_reportes';

const CAP       = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
const nuevoId   = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const fechaHoy  = () => new Date().toLocaleDateString('es-GT');

// Normaliza el mapa de seguimiento. Convierte la versión antigua
// (un único string `observacion`) en el array `observaciones`.
const normalizeSeg = (raw) => {
  if (!raw || typeof raw !== 'object') return {};
  const out = {};
  for (const [id, v] of Object.entries(raw)) {
    if (!v || typeof v !== 'object') continue;
    let obs = Array.isArray(v.observaciones) ? v.observaciones : [];
    if (!obs.length && v.observacion) {
      obs = [{ id: nuevoId(), texto: v.observacion, fecha: v.fecha || fechaHoy() }];
    }
    const { observacion, ...rest } = v;
    out[id] = { ...rest, observaciones: obs };
  }
  return out;
};

const FILTROS_DEFAULT = {
  anio: ANIO_HOY, operador: 'igual', mes_ref: MES_HOY,
  tac: '', horario: '', laboratorio: '', dia: '',
};

const ASIST_COL = {
  x: { bg:'#c8e6c9', fg:'#1b5e20' },
  e: { bg:'#fff9c4', fg:'#e65100' },
  p: { bg:'#bbdefb', fg:'#0d47a1' },
  f: { bg:'#ffcdd2', fg:'#b71c1c' },
  r: { bg:'#d1c4e9', fg:'#4527a0' },
};

/* ── LocalStorage helpers ── */
const lsSegDraft = () => { try { return normalizeSeg(JSON.parse(localStorage.getItem(SEG_DRAFT_KEY) || '{}')); } catch { return {}; } };
const saveSegDraft = v => localStorage.setItem(SEG_DRAFT_KEY, JSON.stringify(v));
const clearSegDraft = () => localStorage.removeItem(SEG_DRAFT_KEY);
const lsFiltro   = () => { try { return { ...FILTROS_DEFAULT, ...JSON.parse(localStorage.getItem(FILTRO_KEY) || '{}') }; } catch { return FILTROS_DEFAULT; } };
const saveFiltro = v => localStorage.setItem(FILTRO_KEY, JSON.stringify(v));
// Solo usada una vez en el arranque para migrar reportes históricos
// guardados antes de mover la persistencia al servidor.
const lsReportes = () => {
  try {
    const raw = JSON.parse(localStorage.getItem(REPORTES_KEY) || '[]');
    return raw.map(r => ({ ...r, seguimiento: normalizeSeg(r.seguimiento) }));
  } catch { return []; }
};

const descFiltro = f => {
  const extras = [f.tac, f.horario, f.laboratorio, f.dia].filter(Boolean).join(', ');
  if (f.operador === 'sin') {
    return `Todos · ${f.anio}${extras ? ` · ${extras}` : ''}`;
  }
  const mes = MESES.find(m => m.num === f.mes_ref)?.cod || '';
  const op  = f.operador === 'mayor' ? 'Mayores a' : f.operador === 'menor' ? 'Menores a' : 'Iguales a';
  return `${op} ${CAP(mes)} ${f.anio}${extras ? ` · ${extras}` : ''}`;
};

/* ══════════════ Helpers de pills ══════════════ */
const pillEstado = (mes, pago, cuota) => {
  if (!pago) return { tipo:'sin', label:mes.lab, sym:'—' };
  if (pago.anulado)   return { tipo:'anulado',   label:mes.lab, sym:'✕' };
  if (pago.descuento) return { tipo:'descuento', label:mes.lab, sym:'★' };
  if (pago.pagado) {
    const esAbono = pago.monto < cuota - 0.01;
    return { tipo: esAbono ? 'abono' : 'pagado', label:mes.lab, sym: esAbono ? '~' : '✓' };
  }
  return { tipo: mes.num <= MES_HOY ? 'atrasado' : 'pendiente', label:mes.lab, sym: mes.num <= MES_HOY ? '!' : '○' };
};

const PILL_STYLE = {
  pagado:    { bg:'#e8f5e9', fg:'#2e7d32', bo:'#a5d6a7' },
  abono:     { bg:'#fff8e1', fg:'#e65100', bo:'#ffe082' },
  descuento: { bg:'#e1f5fe', fg:'#01579b', bo:'#81d4fa' },
  atrasado:  { bg:'#ffebee', fg:'#c62828', bo:'#ef9a9a' },
  pendiente: { bg:'#fff3e0', fg:'#e65100', bo:'#ffcc80' },
  anulado:   { bg:'#f5f5f5', fg:'#9e9e9e', bo:'#e0e0e0' },
  sin:       { bg:'#fafafa', fg:'#d0d0d0', bo:'#eeeeee' },
};

/* ══════════════ Exportar Excel (CSV) ══════════════ */
const exportarExcel = (resultado, seguimiento, filtros) => {
  const headers = [
    'Clave','Código','Nombre','Apellido','Teléfono','Encargado','Establecimiento',
    'TAC','Días','Horario','Laboratorio','Cuota',
    ...MESES.map(m => m.lab),
    'Verificado','Observación',
  ];
  const rows = resultado.map(a => {
    const seg  = seguimiento[a.id] || {};
    const dias = [a.dia_clases1, a.dia_clases2].filter(Boolean).join('+');
    const pagoCols = MESES.map(m => {
      const p = a.pagos[m.cod];
      if (!p) return '—';
      if (p.anulado) return 'Anulado';
      if (p.descuento) return 'Descuento';
      if (p.pagado) return p.monto < a.cuota_mensual - 0.01 ? `Abono Q${p.monto.toFixed(2)}` : `Pagado Q${p.monto.toFixed(2)}`;
      return m.num <= MES_HOY ? 'Atrasado' : 'Pendiente';
    });
    const obsTxt = (seg.observaciones || []).map(o => o.texto).filter(Boolean).join(' · ');
    return [
      a.clave, a.codigo_estudiante || '', a.nombre, a.apellido,
      a.telefono || '', a.encargado || '', a.establecimiento || '',
      a.tac || '', dias, a.horario || '', a.laboratorio || '',
      a.cuota_mensual,
      ...pagoCols,
      seg.verificado ? 'Sí' : 'No',
      obsTxt,
    ];
  });
  const csv = [headers, ...rows]
    .map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `reporte_${descFiltro(filtros).replace(/[\s·,/]/g, '_').replace(/_+/g,'_')}.csv`;
  a.click();
  URL.revokeObjectURL(url);
};

/* ══════════════ Exportar PDF ══════════════ */
const exportarPDF = (resultado, seguimiento, filtros) => {
  const mesClase = (m, p, cuota) => {
    if (!p) return '<span style="color:#ccc">—</span>';
    if (p.anulado)   return '<span style="background:#eee;color:#999;padding:1px 4px;border-radius:3px;font-size:9px">Anul</span>';
    if (p.descuento) return '<span style="background:#e1f5fe;color:#01579b;padding:1px 4px;border-radius:3px;font-size:9px">★ Des</span>';
    if (p.pagado) {
      const ab = p.monto < cuota - 0.01;
      return `<span style="background:${ab?'#fff8e1':'#c8e6c9'};color:${ab?'#e65100':'#1b5e20'};padding:1px 4px;border-radius:3px;font-size:9px">${ab?'~':'✓'}Q${p.monto.toFixed(0)}</span>`;
    }
    return m.num <= MES_HOY
      ? '<span style="background:#ffcdd2;color:#b71c1c;padding:1px 4px;border-radius:3px;font-size:9px">!</span>'
      : '<span style="color:#aaa;font-size:9px">○</span>';
  };
  const mesesTh = MESES.map(m => `<th>${m.lab}</th>`).join('');
  const filas   = resultado.map(a => {
    const seg  = seguimiento[a.id] || {};
    const dias = [a.dia_clases1, a.dia_clases2].filter(Boolean).map(CAP).join('+');
    const info = [a.tac, [dias, a.horario, a.laboratorio ? 'Lab.'+a.laboratorio : ''].filter(Boolean).join(' ')].filter(Boolean).join(' · ');
    const mesesTd = MESES.map(m => `<td style="text-align:center;padding:3px 2px">${mesClase(m, a.pagos[m.cod], a.cuota_mensual)}</td>`).join('');
    const obsHtml = (seg.observaciones || []).map(o => o.texto).filter(Boolean).join(' · ');
    return `<tr${seg.verificado ? ' style="background:#f0fff4"' : ''}>
      <td style="font-family:monospace;font-size:9px;white-space:nowrap">${a.clave}${a.codigo_estudiante ? '<br/><span style=\"color:#666\">'+a.codigo_estudiante+'</span>' : ''}</td>
      <td style="white-space:nowrap"><strong>${a.apellido}, ${a.nombre}</strong></td>
      <td style="white-space:nowrap">${a.telefono || '—'}</td>
      <td style="white-space:nowrap">${a.encargado || '—'}</td>
      <td style="font-size:9px;white-space:nowrap">${info || '—'}</td>
      ${mesesTd}
      <td style="text-align:center">${seg.verificado ? '✓' : ''}</td>
      <td style="font-size:9px">${obsHtml}</td>
    </tr>`;
  }).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
<title>Reporte EduGuat</title>
<style>
  body{font-family:Arial,sans-serif;font-size:10px;margin:15px;color:#222}
  h1{color:#1a237e;font-size:15px;margin:0 0 3px}
  .meta{color:#666;font-size:9px;margin-bottom:12px}
  table{width:100%;border-collapse:collapse}
  th{background:#1a237e;color:#fff;padding:5px 6px;font-size:9px;font-weight:700;text-align:center;white-space:nowrap}
  th:nth-child(1),th:nth-child(2),th:nth-child(3),th:nth-child(4),th:nth-child(5){text-align:left}
  td{padding:4px 5px;border-bottom:1px solid #eee;vertical-align:middle}
  tr:hover{background:#f5f7ff}
  .footer{margin-top:14px;font-size:8px;color:#aaa;text-align:right}
  @page{size:landscape;margin:1cm}
  @media print{body{margin:0}}
</style></head><body>
<h1>EduGuat — Reporte de Consulta</h1>
<div class="meta">
  Filtro: <strong>${descFiltro(filtros)}</strong>&nbsp;&nbsp;·&nbsp;&nbsp;
  Generado: ${new Date().toLocaleString('es-GT')}&nbsp;&nbsp;·&nbsp;&nbsp;
  ${resultado.length} alumno${resultado.length !== 1 ? 's' : ''}
</div>
<table>
<thead><tr>
  <th>Clave</th><th>Alumno</th><th>Teléfono</th><th>Encargado</th><th>TAC / Horario</th>
  ${mesesTh}<th>✓</th><th>Observación</th>
</tr></thead>
<tbody>${filas}</tbody>
</table>
<div class="footer">EduGuat · ${new Date().getFullYear()}</div>
<script>window.onload=()=>{window.print();}<\/script>
</body></html>`;

  const win = window.open('', '_blank', 'width=1100,height=700');
  win.document.write(html);
  win.document.close();
};

/* ══════════════ Componente Pill ══════════════ */
const Pill = ({ estado, title }) => {
  const s = PILL_STYLE[estado.tipo] || PILL_STYLE.sin;
  return (
    <div title={title} style={{
      display:'flex', flexDirection:'column', alignItems:'center',
      width:38, padding:'3px 2px', borderRadius:7, cursor:'default',
      background:s.bg, color:s.fg, border:`1.5px solid ${s.bo}`,
      fontSize:'0.66rem', fontWeight:700, lineHeight:1.3,
    }}>
      {estado.label}
      <span style={{ fontSize:'0.74rem', fontWeight:800 }}>{estado.sym}</span>
    </div>
  );
};

/* ══════════════ Fila asistencia ══════════════ */
const FilaAsist = ({ label, semanas }) => (
  <tr>
    <td style={{ fontSize:'0.7rem', color:'#888', padding:'1px 6px', whiteSpace:'nowrap' }}>{label}</td>
    {SEMANAS.map(s => {
      const est = (semanas?.[s] || '').toLowerCase();
      const col = ASIST_COL[est];
      return (
        <td key={s} style={{ padding:'1px 2px', textAlign:'center' }}>
          {col
            ? <span style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', width:18, height:18, borderRadius:4, background:col.bg, color:col.fg, fontSize:'0.64rem', fontWeight:700 }}>{est.toUpperCase()}</span>
            : <span style={{ display:'inline-block', width:18, height:18, borderRadius:4, background:'#f0f0f0' }} />}
        </td>
      );
    })}
  </tr>
);

/* ══════════════ Tarjeta de alumno ══════════════ */
const TarjetaAlumno = ({ alumno, seg, onSeg, onObsAdd, onObsUpdate, onObsDelete }) => {
  const [verAsist, setVerAsist] = useState(false);
  const dias        = [alumno.dia_clases1, alumno.dia_clases2].filter(Boolean).map(CAP).join('+');
  const horarioFull = [dias, alumno.horario, alumno.laboratorio ? `Lab.${alumno.laboratorio}` : ''].filter(Boolean).join(' ');
  const mesesAtras  = MESES.filter(m => {
    const p = alumno.pagos[m.cod];
    return m.num <= MES_HOY && (!p || (!p.pagado && !p.anulado && !p.descuento));
  });
  const verificado   = !!seg?.verificado;
  const observaciones = seg?.observaciones || [];

  return (
    <div className={`cq-tarjeta${verificado ? ' cq-verificada' : ''}`}>
      <div className="cq-header">
        <div className="cq-header-left">
          <label className="cq-check-wrap" title="Marcar como verificado">
            <input type="checkbox" checked={verificado} onChange={e => onSeg(alumno, { verificado: e.target.checked })} />
            <span className="cq-checkmark" />
          </label>
          <span className="cq-codigo" title={alumno.codigo_estudiante || 'sin código'}>{alumno.clave}</span>
          <span className="cq-nombre">{alumno.nombre} {alumno.apellido}</span>
          {verificado && <span className="cq-badge-ok">✓ Verificado</span>}
          {mesesAtras.length > 0 && !verificado && (
            <span className="cq-badge-atras">Debe: {mesesAtras.map(m => m.lab).join(', ')}</span>
          )}
        </div>
        <div className="cq-header-meta">
          {alumno.telefono        && <span>📞 {alumno.telefono}</span>}
          {alumno.encargado       && <span>👤 {alumno.encargado}</span>}
          {alumno.establecimiento && <span>🏫 {alumno.establecimiento}</span>}
          {alumno.tac             && <span>📍 {alumno.tac}</span>}
          {horarioFull            && <span>🕐 {horarioFull}</span>}
        </div>
      </div>

      <div className="cq-body">
        <div className="cq-pills-row">
          {MESES.map(m => {
            const est = pillEstado(m, alumno.pagos[m.cod], alumno.cuota_mensual);
            const p   = alumno.pagos[m.cod];
            const tip = p ? `Q${p.monto?.toFixed(2)}${p.no_recibo ? ' · R:'+p.no_recibo : ''}${p.fecha_pago ? ' · '+p.fecha_pago : ''}` : '';
            return <Pill key={m.cod} estado={est} title={tip} />;
          })}
        </div>
        <div className="cq-obs-section">
          <div className="cq-obs-list">
            {observaciones.length === 0 ? (
              <button className="cq-obs-add" type="button" onClick={() => onObsAdd(alumno)}>
                ＋ Agregar observación
              </button>
            ) : (
              <>
                {observaciones.map(o => (
                  <div key={o.id} className="cq-obs-row">
                    <input
                      className="cq-obs-input" type="text" placeholder="Observación..."
                      value={o.texto || ''}
                      onChange={e => onObsUpdate(alumno, o.id, e.target.value)}
                    />
                    <button
                      className="cq-obs-del" type="button"
                      title="Eliminar observación"
                      onClick={() => onObsDelete(alumno.id, o.id)}
                    >✕</button>
                  </div>
                ))}
                <button className="cq-obs-add" type="button" onClick={() => onObsAdd(alumno)}>
                  ＋ Otra observación
                </button>
              </>
            )}
          </div>
          <button className={`cq-asist-btn${verAsist ? ' activo' : ''}`} onClick={() => setVerAsist(v => !v)}>
            {verAsist ? '▲ Asistencia' : '▼ Asistencia'}
          </button>
        </div>
        {verAsist && (
          <div className="cq-asist-wrap">
            <table style={{ borderCollapse:'collapse' }}>
              <thead>
                <tr>
                  <th style={{ fontSize:'0.65rem', color:'#bbb', fontWeight:400, padding:'1px 6px' }}>Mes</th>
                  {SEMANAS.map(s => <th key={s} style={{ fontSize:'0.65rem', color:'#bbb', fontWeight:400, width:22, textAlign:'center' }}>S{s}</th>)}
                </tr>
              </thead>
              <tbody>
                {MESES.map(m => <FilaAsist key={m.num} label={m.lab} semanas={alumno.asistencia[m.num]} />)}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

/* ══════════════ Sección Seguimiento ══════════════ */
const SeccionSeguimiento = ({ seguimiento, onEliminar }) => {
  const [abierto, setAbierto] = useState(false);
  const entradas = Object.entries(seguimiento);
  if (entradas.length === 0) return null;
  const verificados = entradas.filter(([, v]) => v.verificado).length;
  return (
    <div className="cq-seguimiento">
      <button className="cq-seg-toggle" onClick={() => setAbierto(a => !a)}>
        {abierto ? '▲' : '▼'} Seguimiento
        <span className="cq-seg-badge">{verificados}/{entradas.length} verificados</span>
      </button>
      {abierto && (
        <div className="cq-seg-tabla-wrap">
          <table className="cq-seg-tabla">
            <thead>
              <tr><th>✓</th><th>Clave</th><th>Alumno</th><th>Observación</th><th>Guardado</th><th></th></tr>
            </thead>
            <tbody>
              {entradas.map(([id, v]) => {
                const obsTxt = (v.observaciones || []).map(o => o.texto).filter(Boolean).join(' · ');
                return (
                  <tr key={id} className={v.verificado ? 'cq-seg-row-ok' : ''}>
                    <td style={{ textAlign:'center' }}>{v.verificado ? '✓' : '—'}</td>
                    <td style={{ fontFamily:'monospace', fontSize:'0.8rem' }}>{v.codigo}</td>
                    <td>{v.nombre}</td>
                    <td style={{ color:'#666', fontSize:'0.82rem' }}>{obsTxt || '—'}</td>
                    <td style={{ color:'#aaa', fontSize:'0.75rem', whiteSpace:'nowrap' }}>{v.fecha || ''}</td>
                    <td><button className="cq-seg-del" title="Quitar" onClick={() => onEliminar(id)}>✕</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

/* ══════════════ Sección Reportes guardados ══════════════ */
const SeccionReportes = ({ reportes, reporteActivoId, onCargar, onEliminar, onRenombrar, onCompartir }) => {
  const [abierto,     setAbierto]     = useState(false);
  const [editId,      setEditId]      = useState(null);
  const [editNombre,  setEditNombre]  = useState('');
  const inputRef = useRef(null);

  if (reportes.length === 0) return null;

  const iniciarEdit = r => { setEditId(r.id); setEditNombre(r.nombre); setTimeout(() => inputRef.current?.focus(), 40); };
  const confirmarEdit = () => { if (editNombre.trim()) onRenombrar(editId, editNombre.trim()); setEditId(null); };

  return (
    <div className="cq-rep-seccion">
      <button className="cq-rep-toggle" onClick={() => setAbierto(a => !a)}>
        {abierto ? '▲' : '▼'} Reportes guardados
        <span className="cq-rep-badge">{reportes.length}</span>
      </button>
      {abierto && (
        <div className="cq-rep-lista">
          {reportes.map(r => {
            const esPropio = r.es_propio !== false; // por defecto true para compatibilidad
            const compartidoConmigo = !esPropio;
            return (
              <div key={r.id} className={`cq-rep-item${r.id === reporteActivoId ? ' activo' : ''}`}>
                <div className="cq-rep-info">
                  {editId === r.id ? (
                    <input
                      ref={inputRef}
                      className="cq-rep-edit"
                      value={editNombre}
                      onChange={e => setEditNombre(e.target.value)}
                      onBlur={confirmarEdit}
                      onKeyDown={e => { if (e.key === 'Enter') confirmarEdit(); if (e.key === 'Escape') setEditId(null); }}
                    />
                  ) : (
                    <span className="cq-rep-nombre">
                      {r.nombre}
                      {compartidoConmigo && (
                        <span style={{ marginLeft:6, fontSize:'0.7rem', color:'#7e57c2', fontWeight:600 }}>
                          🤝 Compartido por {r.owner_nombre || 'otro usuario'}
                        </span>
                      )}
                      {esPropio && Array.isArray(r.compartidos) && r.compartidos.length > 0 && (
                        <span style={{ marginLeft:6, fontSize:'0.7rem', color:'#3949ab', fontWeight:600 }}>
                          🤝 Compartido con {r.compartidos.length}
                        </span>
                      )}
                    </span>
                  )}
                  <span className="cq-rep-meta">{r.desc} · {r.count} alumnos · {r.fecha}</span>
                </div>
                <div className="cq-rep-actions">
                  <button title="Abrir reporte" onClick={() => { onCargar(r); setAbierto(false); }}>📂</button>
                  {esPropio && <button title="Renombrar" onClick={() => iniciarEdit(r)}>✏️</button>}
                  {esPropio && <button title="Compartir con otros usuarios" onClick={() => onCompartir(r)}>👥</button>}
                  {esPropio
                    ? <button title="Eliminar" onClick={() => onEliminar(r)}>🗑</button>
                    : <button title="Solo el creador puede eliminar" disabled style={{ opacity:0.35, cursor:'not-allowed' }}>🗑</button>
                  }
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

/* ══════════════ Modal Compartir reporte ══════════════ */
const ModalCompartir = ({ reporte, usuarios, onConfirmar, onCancelar }) => {
  const [seleccion, setSeleccion] = useState(() => new Set(reporte.compartidos || []));
  const [filtro,    setFiltro]    = useState('');
  const toggle = (id) => {
    setSeleccion(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };
  const filtrados = usuarios.filter(u =>
    !filtro ||
    u.nombre?.toLowerCase().includes(filtro.toLowerCase()) ||
    u.email?.toLowerCase().includes(filtro.toLowerCase())
  );
  return (
    <div className="cq-modal-overlay" onClick={onCancelar}>
      <div className="cq-modal" onClick={e => e.stopPropagation()} style={{ maxWidth:520 }}>
        <h3 className="cq-modal-title">👥 Compartir reporte</h3>
        <p className="cq-modal-sub">
          <strong>{reporte.nombre}</strong><br/>
          Los usuarios seleccionados podrán abrirlo y marcar verificados / observaciones, pero no podrán renombrarlo ni eliminarlo.
        </p>
        <input
          className="cq-modal-input"
          type="text"
          placeholder="Buscar usuario..."
          value={filtro}
          onChange={e => setFiltro(e.target.value)}
        />
        <div style={{ maxHeight:280, overflowY:'auto', border:'1px solid #e0e0e0', borderRadius:6, marginTop:8, padding:'4px 0' }}>
          {filtrados.length === 0 && (
            <div style={{ padding:'12px', color:'#999', fontSize:'0.85rem', textAlign:'center' }}>
              No hay usuarios disponibles para compartir.
            </div>
          )}
          {filtrados.map(u => (
            <label key={u.id} style={{
              display:'flex', alignItems:'center', gap:8, padding:'6px 12px', cursor:'pointer',
              background: seleccion.has(u.id) ? '#e8f5e9' : 'transparent',
            }}>
              <input
                type="checkbox"
                checked={seleccion.has(u.id)}
                onChange={() => toggle(u.id)}
              />
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:600, fontSize:'0.9rem' }}>{u.nombre}</div>
                <div style={{ fontSize:'0.75rem', color:'#777' }}>{u.email} · {u.rol}</div>
              </div>
            </label>
          ))}
        </div>
        <div className="cq-modal-btns" style={{ marginTop:12 }}>
          <button className="cq-modal-cancel" onClick={onCancelar}>Cancelar</button>
          <button className="btn-primary cq-modal-ok" onClick={() => onConfirmar([...seleccion])}>
            Guardar ({seleccion.size})
          </button>
        </div>
      </div>
    </div>
  );
};

/* ══════════════ Modal Confirmar eliminación ══════════════ */
const ModalConfirmEliminar = ({ reporte, onConfirmar, onCancelar }) => {
  const compartidos = Array.isArray(reporte.compartidos) ? reporte.compartidos.length : 0;
  return (
    <div className="cq-modal-overlay" onClick={onCancelar}>
      <div className="cq-modal" onClick={e => e.stopPropagation()} style={{ maxWidth:440 }}>
        <h3 className="cq-modal-title" style={{ color:'#c62828' }}>🗑 Eliminar reporte</h3>
        <p className="cq-modal-sub" style={{ color:'#333', fontSize:'0.95rem' }}>
          ¿Seguro que quieres eliminar <strong>{reporte.nombre}</strong>?<br/><br/>
          Se perderá su seguimiento (verificados, observaciones).
          {compartidos > 0 && (
            <>
              <br/><br/>
              <span style={{ color:'#c62828', fontWeight:600 }}>
                ⚠️ Este reporte está compartido con {compartidos} usuario{compartidos !== 1 ? 's' : ''}; también dejarán de verlo.
              </span>
            </>
          )}
          <br/><br/>
          Esta acción no se puede deshacer.
        </p>
        <div className="cq-modal-btns" style={{ marginTop:12 }}>
          <button className="cq-modal-cancel" onClick={onCancelar}>Cancelar</button>
          <button
            className="cq-modal-ok"
            onClick={onConfirmar}
            style={{ background:'#c62828', color:'#fff', border:'none', padding:'0.5rem 1.2rem', borderRadius:6, fontWeight:600, cursor:'pointer' }}
          >
            Sí, eliminar
          </button>
        </div>
      </div>
    </div>
  );
};

/* ══════════════ Modal Guardar Reporte ══════════════ */
const ModalGuardar = ({ filtros, count, reporteActivo, onConfirmar, onCancelar }) => {
  const [nombre, setNombre] = useState(reporteActivo?.nombre || descFiltro(filtros));
  const inputRef = useRef(null);
  useEffect(() => { inputRef.current?.focus(); inputRef.current?.select(); }, []);
  return (
    <div className="cq-modal-overlay" onClick={onCancelar}>
      <div className="cq-modal" onClick={e => e.stopPropagation()}>
        <h3 className="cq-modal-title">💾 Guardar Reporte</h3>
        <p className="cq-modal-sub">{descFiltro(filtros)} · {count} alumnos</p>
        <input
          ref={inputRef}
          className="cq-modal-input"
          type="text"
          placeholder="Nombre del reporte..."
          value={nombre}
          onChange={e => setNombre(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && nombre.trim()) onConfirmar(nombre.trim()); if (e.key === 'Escape') onCancelar(); }}
        />
        <div className="cq-modal-btns">
          <button className="cq-modal-cancel" onClick={onCancelar}>Cancelar</button>
          <button className="btn-primary cq-modal-ok" onClick={() => nombre.trim() && onConfirmar(nombre.trim())} disabled={!nombre.trim()}>
            {reporteActivo ? 'Actualizar' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
};

/* ══════════════ Página principal ══════════════ */
export default function Consultas() {
  const { anios: ANIOS } = useAniosFiltros();
  const [filtros,       setFiltros]       = useState(lsFiltro);
  const [resultado,     setResultado]     = useState(null);
  const [cargando,      setCargando]      = useState(false);
  const [error,         setError]         = useState('');
  const [seguimiento,   setSeguimiento]   = useState(lsSegDraft);
  const [reportes,      setReportes]      = useState([]);
  const [reporteActivo, setReporteActivo] = useState(null); // objeto reporte cargado actualmente
  const [modalGuardar,  setModalGuardar]  = useState(false);
  const [modalCompartir, setModalCompartir] = useState(null); // reporte a compartir
  const [modalEliminar, setModalEliminar]  = useState(null);  // reporte a eliminar
  const [usuariosCompartibles, setUsuariosCompartibles] = useState([]);
  const [uiFiltros,     setUiFiltros]     = useState({ horarios:[], laboratorios:[], dias:[], tacs:[] });

  // ref para que generar() siempre lea los filtros más recientes
  const filtrosRef = useRef(filtros);
  useEffect(() => { filtrosRef.current = filtros; }, [filtros]);
  useEffect(() => { saveFiltro(filtros); }, [filtros]);

  // Persiste el seguimiento donde corresponda: si hay un reporte activo,
  // se sube al servidor; si no, se guarda como borrador en localStorage
  // hasta que se cree o cargue un reporte.
  // Para evitar requests por cada tecla escrita en una observación,
  // los cambios se debouncean a 500ms.
  const segGuardadoRef = useRef(null);
  useEffect(() => {
    if (reporteActivo) {
      const id = reporteActivo.id;
      const timer = setTimeout(() => {
        // Solo sube si cambió respecto al último valor sincronizado para
        // este reporte (evita re-sincronizar tras cargarReporte).
        const key = `${id}::${JSON.stringify(seguimiento)}`;
        if (segGuardadoRef.current === key) return;
        segGuardadoRef.current = key;
        API.put(`/consultas-reportes/${id}`, { seguimiento }).catch(err => {
          console.error('Error guardando seguimiento:', err);
        });
      }, 500);
      return () => clearTimeout(timer);
    } else {
      saveSegDraft(seguimiento);
    }
  }, [seguimiento, reporteActivo]);

  /* Cargar opciones de filtros UI */
  useEffect(() => {
    API.get('/asistencia/filtros').then(({ data }) => setUiFiltros(prev => ({ ...prev, ...data }))).catch(console.error);
    API.get('/alumnos').then(({ data }) => {
      const tacs = [...new Set(data.map(a => a.tac).filter(Boolean))].sort();
      setUiFiltros(prev => ({ ...prev, tacs }));
    }).catch(console.error);
  }, []);

  /* Cargar reportes desde el servidor + migrar locales si los hay */
  useEffect(() => {
    const cargarYMigrar = async () => {
      try {
        const { data } = await API.get('/consultas-reportes');
        // Migración one-shot: cualquier reporte en localStorage que no esté
        // en el servidor se sube como un reporte nuevo del usuario actual.
        const locales = lsReportes();
        let finales = data;
        if (locales.length) {
          const nombresServidor = new Set(data.map(r => r.nombre));
          const pendientes = locales.filter(l => !nombresServidor.has(l.nombre));
          for (const l of pendientes) {
            try {
              const { data: nuevo } = await API.post('/consultas-reportes', {
                nombre: l.nombre,
                filtros: l.filtros,
                seguimiento: l.seguimiento || {},
                desc: l.desc || '',
                count: l.count || 0,
                fecha: l.fecha || fechaHoy(),
                compartidos: [],
              });
              finales = [nuevo, ...finales];
            } catch (err) {
              console.error('Error migrando reporte local:', l.nombre, err);
            }
          }
          // Limpia localStorage tras intentar migrar (los logs avisan si
          // alguno falló — se conserva igual el contenido en `nombresServidor`).
          localStorage.removeItem(REPORTES_KEY);
        }
        setReportes(finales);
      } catch (err) {
        console.error('Error cargando reportes:', err);
      }
    };
    cargarYMigrar();
    API.get('/consultas-reportes/_usuarios-compartibles')
      .then(({ data }) => setUsuariosCompartibles(data))
      .catch(err => console.error('Error cargando usuarios compartibles:', err));
  }, []);

  /* Seguimiento */
  const onSeg = useCallback((alumno, cambio) => {
    setSeguimiento(prev => {
      const prevSeg = prev[alumno.id] || { observaciones: [] };
      return { ...prev, [alumno.id]: {
        ...prevSeg, ...cambio,
        nombre: `${alumno.nombre} ${alumno.apellido}`,
        codigo: alumno.clave,
        fecha:  fechaHoy(),
      }};
    });
  }, []);

  const eliminarSeg = useCallback(id => {
    setSeguimiento(prev => { const c = { ...prev }; delete c[id]; return c; });
  }, []);

  const onObsAdd = useCallback((alumno) => {
    setSeguimiento(prev => {
      const prevSeg = prev[alumno.id] || { observaciones: [] };
      const obs = [...(prevSeg.observaciones || []), { id: nuevoId(), texto: '', fecha: fechaHoy() }];
      return { ...prev, [alumno.id]: {
        ...prevSeg, observaciones: obs,
        nombre: `${alumno.nombre} ${alumno.apellido}`,
        codigo: alumno.clave,
        fecha:  fechaHoy(),
      }};
    });
  }, []);

  const onObsUpdate = useCallback((alumno, obsId, texto) => {
    setSeguimiento(prev => {
      const prevSeg = prev[alumno.id] || { observaciones: [] };
      const obs = (prevSeg.observaciones || []).map(o =>
        o.id === obsId ? { ...o, texto, fecha: fechaHoy() } : o
      );
      return { ...prev, [alumno.id]: {
        ...prevSeg, observaciones: obs,
        nombre: `${alumno.nombre} ${alumno.apellido}`,
        codigo: alumno.clave,
        fecha:  fechaHoy(),
      }};
    });
  }, []);

  const onObsDelete = useCallback((alumnoId, obsId) => {
    setSeguimiento(prev => {
      const prevSeg = prev[alumnoId];
      if (!prevSeg) return prev;
      const obs = (prevSeg.observaciones || []).filter(o => o.id !== obsId);
      return { ...prev, [alumnoId]: { ...prevSeg, observaciones: obs } };
    });
  }, []);

  /* Reportes (persistencia servidor) */
  const guardarReporte = useCallback(async (nombre) => {
    const desc  = descFiltro(filtrosRef.current);
    const count = resultado?.length ?? 0;
    try {
      if (reporteActivo) {
        const { data } = await API.put(`/consultas-reportes/${reporteActivo.id}`, {
          nombre, filtros: filtrosRef.current, desc, count, fecha: fechaHoy(), seguimiento,
        });
        setReportes(prev => prev.map(r => r.id === data.id ? data : r));
        setReporteActivo(data);
        // Sincroniza la guardia anti-duplicado del efecto de seguimiento.
        segGuardadoRef.current = `${data.id}::${JSON.stringify(seguimiento)}`;
      } else {
        const { data } = await API.post('/consultas-reportes', {
          nombre, filtros: filtrosRef.current, seguimiento, desc, count, fecha: fechaHoy(),
        });
        setReportes(prev => [data, ...prev]);
        setReporteActivo(data);
        segGuardadoRef.current = `${data.id}::${JSON.stringify(seguimiento)}`;
        clearSegDraft();
      }
      setModalGuardar(false);
    } catch (err) {
      console.error('guardarReporte:', err);
      setError(err.response?.data?.message || 'Error al guardar reporte');
    }
  }, [resultado, reporteActivo, seguimiento]);

  const cargarReporte = useCallback((r) => {
    setReporteActivo(r);
    const segNorm = normalizeSeg(r.seguimiento || {});
    setSeguimiento(segNorm);
    // Marca este estado como "ya sincronizado" para que el efecto de
    // autoguardado no haga un PUT redundante apenas se carga.
    segGuardadoRef.current = `${r.id}::${JSON.stringify(segNorm)}`;
    clearSegDraft();
    setFiltros(r.filtros);
    setCargando(true);
    setError('');
    setResultado(null);
    const f = r.filtros;
    const p = new URLSearchParams({ anio: f.anio, operador: f.operador, mes_ref: f.mes_ref });
    if (f.tac)         p.set('tac',         f.tac);
    if (f.horario)     p.set('horario',      f.horario);
    if (f.laboratorio) p.set('laboratorio',  f.laboratorio);
    if (f.dia)         p.set('dia',          f.dia);
    API.get(`/reporte/financiero?${p}`)
      .then(({ data }) => setResultado(data))
      .catch(err => setError(err.response?.data?.message || 'Error al cargar reporte'))
      .finally(() => setCargando(false));
  }, []);

  const eliminarReporte = useCallback(async (id) => {
    try {
      await API.delete(`/consultas-reportes/${id}`);
      setReportes(prev => prev.filter(r => r.id !== id));
      if (reporteActivo?.id === id) { setReporteActivo(null); setResultado(null); }
      setModalEliminar(null);
    } catch (err) {
      console.error('eliminarReporte:', err);
      setError(err.response?.data?.message || 'Error al eliminar reporte');
    }
  }, [reporteActivo]);

  const renombrarReporte = useCallback(async (id, nombre) => {
    try {
      const { data } = await API.put(`/consultas-reportes/${id}`, { nombre });
      setReportes(prev => prev.map(r => r.id === id ? data : r));
      if (reporteActivo?.id === id) setReporteActivo(data);
    } catch (err) {
      console.error('renombrarReporte:', err);
      setError(err.response?.data?.message || 'Error al renombrar reporte');
    }
  }, [reporteActivo]);

  const compartirReporte = useCallback(async (id, compartidos) => {
    try {
      const { data } = await API.put(`/consultas-reportes/${id}`, { compartidos });
      setReportes(prev => prev.map(r => r.id === id ? data : r));
      if (reporteActivo?.id === id) setReporteActivo(data);
      setModalCompartir(null);
    } catch (err) {
      console.error('compartirReporte:', err);
      setError(err.response?.data?.message || 'Error al compartir reporte');
    }
  }, [reporteActivo]);

  /* Generar consulta */
  const generar = useCallback(async () => {
    const f = filtrosRef.current;
    setCargando(true);
    setError('');
    setResultado(null);
    setReporteActivo(null);
    setSeguimiento({});
    clearSegDraft();
    try {
      const p = new URLSearchParams({ anio: f.anio, operador: f.operador, mes_ref: f.mes_ref });
      if (f.tac)         p.set('tac',         f.tac);
      if (f.horario)     p.set('horario',      f.horario);
      if (f.laboratorio) p.set('laboratorio',  f.laboratorio);
      if (f.dia)         p.set('dia',          f.dia);
      const { data } = await API.get(`/reporte/financiero?${p}`);
      setResultado(data);
    } catch (err) {
      setError(err.response?.data?.message || 'Error al generar consulta');
    } finally {
      setCargando(false);
    }
  }, []);

  const mesLabel   = CAP(MESES.find(m => m.num === filtros.mes_ref)?.cod || '');
  const totalVerif = resultado ? resultado.filter(a => seguimiento[a.id]?.verificado).length : 0;

  return (
    <div className="admin-layout">
      <Sidebar />
      <div className="admin-content">

        {/* ── Topbar ── */}
        <div className="cq-topbar">
          <div>
            <h1 style={{ margin:0, fontSize:'1.3rem', color:'#1a237e', fontWeight:700 }}>🔎 Consultas</h1>
            {reporteActivo && (
              <p style={{ margin:'2px 0 0', fontSize:'0.8rem', color:'#3949ab' }}>
                📂 {reporteActivo.nombre}
              </p>
            )}
          </div>
          <div style={{ display:'flex', gap:'0.5rem', flexWrap:'wrap', alignItems:'center' }}>
            {resultado !== null && (
              <>
                <button className="cq-btn-export" onClick={() => exportarExcel(resultado, seguimiento, filtros)}>
                  📊 Excel
                </button>
                <button className="cq-btn-export" onClick={() => exportarPDF(resultado, seguimiento, filtros)}>
                  🖨️ PDF
                </button>
                <button className="cq-btn-guardar" onClick={() => setModalGuardar(true)}>
                  💾 {reporteActivo ? 'Actualizar reporte' : 'Guardar reporte'}
                </button>
              </>
            )}
          </div>
        </div>

        {/* ── Reportes guardados ── */}
        <SeccionReportes
          reportes={reportes}
          reporteActivoId={reporteActivo?.id}
          onCargar={cargarReporte}
          onEliminar={(r) => setModalEliminar(r)}
          onRenombrar={renombrarReporte}
          onCompartir={(r) => setModalCompartir(r)}
        />

        {/* ── Seguimiento ── */}
        <SeccionSeguimiento seguimiento={seguimiento} onEliminar={eliminarSeg} />

        {/* ── Filtros ── */}
        <div className="cq-filtros-panel">
          <div className="cq-filtros-row">
            <div className="cq-fg">
              <label>Año</label>
              <select value={filtros.anio} onChange={e => setFiltros(f => ({ ...f, anio: Number(e.target.value) }))}>
                {ANIOS.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div className="cq-fg cq-fg-wide">
              <label>Alumnos con pagos</label>
              <div style={{ display:'flex', gap:'0.4rem' }}>
                <select value={filtros.operador} onChange={e => setFiltros(f => ({ ...f, operador: e.target.value }))} style={{ flex:1 }}>
                  <option value="sin">Sin filtro (todos)</option>
                  <option value="mayor">Mayores a</option>
                  <option value="igual">Iguales a</option>
                  <option value="menor">Menores a</option>
                </select>
                <select
                  value={filtros.mes_ref}
                  onChange={e => setFiltros(f => ({ ...f, mes_ref: Number(e.target.value) }))}
                  style={{ flex:1 }}
                  disabled={filtros.operador === 'sin'}
                  title={filtros.operador === 'sin' ? 'No aplica cuando el filtro de pagos está desactivado' : ''}
                >
                  {MESES.map(m => <option key={m.num} value={m.num}>{CAP(m.cod)}</option>)}
                </select>
              </div>
            </div>
            {uiFiltros.tacs?.length > 0 && (
              <div className="cq-fg">
                <label>TAC</label>
                <select value={filtros.tac} onChange={e => setFiltros(f => ({ ...f, tac: e.target.value }))}>
                  <option value="">Todos</option>
                  {uiFiltros.tacs.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            )}
            {uiFiltros.dias?.length > 0 && (
              <div className="cq-fg">
                <label>Día</label>
                <select value={filtros.dia} onChange={e => setFiltros(f => ({ ...f, dia: e.target.value }))}>
                  <option value="">Todos</option>
                  {uiFiltros.dias.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
            )}
            {uiFiltros.horarios?.length > 0 && (
              <div className="cq-fg">
                <label>Horario</label>
                <select value={filtros.horario} onChange={e => setFiltros(f => ({ ...f, horario: e.target.value }))}>
                  <option value="">Todos</option>
                  {uiFiltros.horarios.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            )}
            {uiFiltros.laboratorios?.length > 0 && (
              <div className="cq-fg">
                <label>Laboratorio</label>
                <select value={filtros.laboratorio} onChange={e => setFiltros(f => ({ ...f, laboratorio: e.target.value }))}>
                  <option value="">Todos</option>
                  {uiFiltros.laboratorios.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
            )}
            <div className="cq-fg" style={{ alignSelf:'flex-end' }}>
              <button className="btn-primary" onClick={generar} disabled={cargando} style={{ width:'100%', padding:'0.5rem' }}>
                {cargando ? 'Buscando...' : '🔍 Buscar'}
              </button>
            </div>
          </div>
          <div className="cq-filtro-desc">
            {filtros.operador === 'sin'   && `Todos los alumnos activos del ${filtros.anio} (sin filtrar por pagos).`}
            {filtros.operador === 'mayor' && `Alumnos con al menos un mes pagado DESPUÉS de ${mesLabel} ${filtros.anio}.`}
            {filtros.operador === 'igual' && `Alumnos que han pagado ${mesLabel} ${filtros.anio}.`}
            {filtros.operador === 'menor' && `Alumnos sin pagos o cuyos pagos son todos ANTES de ${mesLabel} ${filtros.anio}.`}
          </div>
        </div>

        {error && <div className="msg-err" style={{ margin:'0 0 0.75rem' }}>{error}</div>}

        {/* ── Resultados ── */}
        {resultado !== null && (
          <div className="cq-resultados">
            <div className="cq-result-header">
              <span style={{ fontWeight:700, color:'#1a237e' }}>
                {resultado.length === 0
                  ? 'Sin resultados para esa condición.'
                  : `${resultado.length} alumno${resultado.length !== 1 ? 's' : ''}`}
              </span>
              {resultado.length > 0 && (
                <span style={{ fontSize:'0.8rem', color:'#888' }}>
                  {totalVerif} / {resultado.length} verificados
                  {' · '}
                  Q{resultado.reduce((s, a) => {
                    const pend = MESES.filter(m => m.num <= MES_HOY)
                      .filter(m => { const p = a.pagos[m.cod]; return !p || (!p.pagado && !p.anulado && !p.descuento); }).length;
                    return s + pend * a.cuota_mensual;
                  }, 0).toLocaleString('es-GT', { minimumFractionDigits:2 })} adeudado aprox.
                </span>
              )}
            </div>
            <div className="cq-lista">
              {resultado.map(alumno => (
                <TarjetaAlumno
                  key={alumno.id}
                  alumno={alumno}
                  seg={seguimiento[alumno.id]}
                  onSeg={onSeg}
                  onObsAdd={onObsAdd}
                  onObsUpdate={onObsUpdate}
                  onObsDelete={onObsDelete}
                />
              ))}
            </div>
          </div>
        )}

        {resultado === null && !cargando && (
          <div style={{ textAlign:'center', padding:'3rem', color:'#bbb' }}>
            {reporteActivo
              ? <p>Cargando reporte <strong>{reporteActivo.nombre}</strong>…</p>
              : <p>Configura el filtro y presiona <strong>🔍 Buscar</strong></p>}
          </div>
        )}
      </div>

      {/* ── Modal guardar ── */}
      {modalGuardar && (
        <ModalGuardar
          filtros={filtros}
          count={resultado?.length ?? 0}
          reporteActivo={reporteActivo}
          onConfirmar={guardarReporte}
          onCancelar={() => setModalGuardar(false)}
        />
      )}

      {/* ── Modal compartir ── */}
      {modalCompartir && (
        <ModalCompartir
          reporte={modalCompartir}
          usuarios={usuariosCompartibles}
          onConfirmar={(ids) => compartirReporte(modalCompartir.id, ids)}
          onCancelar={() => setModalCompartir(null)}
        />
      )}

      {/* ── Modal confirmar eliminación ── */}
      {modalEliminar && (
        <ModalConfirmEliminar
          reporte={modalEliminar}
          onConfirmar={() => eliminarReporte(modalEliminar.id)}
          onCancelar={() => setModalEliminar(null)}
        />
      )}
    </div>
  );
}
