import { useEffect, useMemo, useState } from 'react';
import Sidebar from '../../components/Sidebar';
import API from '../../api/axios';
import { useAniosFiltros } from '../../lib/anios';
import '../../components/Sidebar.css';
import './admin.css';

const ORDEN_SEMANA = ['primera', 'segunda', 'tercera', 'cuarta', 'quinta'];
const DIAS_LABEL   = { lunes:'Lunes', martes:'Martes', miercoles:'Miércoles', jueves:'Jueves', viernes:'Viernes', sabado:'Sábado', domingo:'Domingo' };
const ORDEN_DIAS   = ['lunes','martes','miercoles','jueves','viernes','sabado','domingo'];
const MESES_LBL    = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const CAP          = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : '—';

const fmtQ  = (n) => `Q${Number(n || 0).toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtQ0 = (n) => `Q${Math.round(Number(n || 0)).toLocaleString('es-GT')}`;
const fmtN  = (n) => Number(n || 0).toLocaleString('es-GT');

// Ordena horarios respetando AM/PM y la hora de inicio.
const horarioKey = (h) => {
  if (!h) return 9999;
  const m = String(h).match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!m) return 9999;
  let hh = parseInt(m[1]);
  const mm = parseInt(m[2]);
  const ap = (m[3] || '').toUpperCase();
  if (ap === 'PM' && hh !== 12) hh += 12;
  if (ap === 'AM' && hh === 12) hh = 0;
  return hh * 60 + mm;
};

// ──────────────────────────────────────────────────────────────────────────
// COMPONENTES DE GRÁFICOS (SVG inline)
// ──────────────────────────────────────────────────────────────────────────

/** Líneas comparando dos series con el mismo eje X (típicamente meses). */
const LineChart = ({ data, x, series, height = 220, fmt = fmtQ0, leyenda = true }) => {
  const W = 100; // viewBox virtual
  const H = 100;
  const padL = 8, padR = 3, padT = 6, padB = 14;

  const allVals = series.flatMap(s => data.map(d => Number(d[s.key]) || 0));
  const max = Math.max(...allVals, 1);
  const niceMax = niceCeil(max);

  const xAt = (i) => padL + ((W - padL - padR) * (data.length <= 1 ? 0 : i / (data.length - 1)));
  const yAt = (v) => padT + ((H - padT - padB) * (1 - v / niceMax));

  const pathOf = (key) => data.map((d, i) => {
    const xv = xAt(i), yv = yAt(Number(d[key]) || 0);
    return `${i === 0 ? 'M' : 'L'} ${xv.toFixed(2)} ${yv.toFixed(2)}`;
  }).join(' ');

  // Grid lines de Y
  const grids = 4;
  const lines = Array.from({ length: grids + 1 }, (_, i) => {
    const v = niceMax * (1 - i / grids);
    return { y: padT + (H - padT - padB) * (i / grids), v };
  });

  return (
    <div>
      <div style={{ position: 'relative' }}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" width="100%" height={height} style={{ display:'block' }}>
          {lines.map((l, i) => (
            <line key={i} x1={padL} x2={W - padR} y1={l.y} y2={l.y} stroke="#eef0f5" strokeWidth="0.2" />
          ))}
          {series.map(s => (
            <path key={s.key} d={pathOf(s.key)}
                  fill="none" stroke={s.color} strokeWidth={s.width || 1.2}
                  strokeDasharray={s.dashed ? '1.5,1' : undefined}
                  strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          ))}
          {series.map(s => data.map((d, i) => {
            const v = Number(d[s.key]) || 0;
            return (
              <circle key={`${s.key}-${i}`} cx={xAt(i)} cy={yAt(v)} r={0.9}
                      fill={s.color} stroke="#fff" strokeWidth="0.25" />
            );
          }))}
        </svg>
        {/* labels Y a la izquierda — overlay HTML para tipografía nítida */}
        <div style={{ position:'absolute', left:0, top:0, height:'100%', width:60, pointerEvents:'none' }}>
          {lines.map((l, i) => (
            <div key={i} style={{
              position:'absolute', left:0, right:0,
              top:`${(l.y / H) * 100}%`, transform:'translateY(-50%)',
              fontSize:'0.62rem', color:'#888', paddingLeft:2,
            }}>{fmt(l.v)}</div>
          ))}
        </div>
      </div>
      <div style={{ display:'flex', justifyContent:'space-between', marginTop:2, padding:'0 4px' }}>
        {data.map((d, i) => (
          <span key={i} style={{ fontSize:'0.64rem', color:'#777', flex:1, textAlign:'center', whiteSpace:'nowrap' }}>
            {d[x]}
          </span>
        ))}
      </div>
      {leyenda && (
        <div style={{ display:'flex', gap:14, justifyContent:'center', marginTop:6, flexWrap:'wrap' }}>
          {series.map(s => (
            <span key={s.key} style={{ display:'inline-flex', alignItems:'center', gap:5, fontSize:'0.74rem', color:'#555' }}>
              <span style={{ width:14, height:3, background:s.color, borderRadius:2, display:'inline-block',
                             border: s.dashed ? `1px dashed ${s.color}` : 'none',
                             backgroundColor: s.dashed ? 'transparent' : s.color }} />
              {s.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

/** Barras verticales (una serie). */
const BarChart = ({ data, x, y, color = '#5c6bc0', height = 200, fmt = fmtQ0, baseColor = '#eef0f5' }) => {
  const vals = data.map(d => Number(d[y]) || 0);
  const max = niceCeil(Math.max(...vals, 1));
  return (
    <div>
      <div style={{ display:'flex', alignItems:'flex-end', gap:4, height, padding:'4px 4px 0' }}>
        {data.map((d, i) => {
          const v = Number(d[y]) || 0;
          const h = max > 0 ? Math.round((v / max) * (height - 26)) : 0;
          return (
            <div key={i} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'flex-end', minWidth:0 }}>
              <div style={{ fontSize:'0.62rem', color:'#666', marginBottom:2, whiteSpace:'nowrap' }}>{fmt(v)}</div>
              <div style={{
                width:'82%', height:h, background:color, borderRadius:'4px 4px 0 0',
                boxShadow:'inset 0 -2px 0 rgba(0,0,0,0.07)', transition:'height 0.4s',
              }} title={`${d[x]}: ${fmt(v)}`} />
              <div style={{
                width:'82%', height:2, background:baseColor, borderRadius:'0 0 4px 4px',
              }} />
            </div>
          );
        })}
      </div>
      <div style={{ display:'flex', gap:4, padding:'4px' }}>
        {data.map((d, i) => (
          <span key={i} style={{ flex:1, textAlign:'center', fontSize:'0.66rem', color:'#777', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{d[x]}</span>
        ))}
      </div>
    </div>
  );
};

/** Barras apiladas (asistencia: X, E, P, F). */
const StackedBarChart = ({ data, x, stacks, height = 220 }) => {
  const totals = data.map(d => stacks.reduce((s, k) => s + (Number(d[k.key]) || 0), 0));
  const max = niceCeil(Math.max(...totals, 1));
  return (
    <div>
      <div style={{ display:'flex', alignItems:'flex-end', gap:4, height, padding:'4px 4px 0' }}>
        {data.map((d, i) => {
          const total = totals[i];
          const h = max > 0 ? Math.round((total / max) * (height - 20)) : 0;
          return (
            <div key={i} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'flex-end', minWidth:0 }}>
              <div style={{ fontSize:'0.6rem', color:'#666', marginBottom:2 }}>{fmtN(total)}</div>
              <div style={{ width:'80%', height:h, display:'flex', flexDirection:'column-reverse', borderRadius:'4px 4px 0 0', overflow:'hidden' }}>
                {stacks.map(k => {
                  const v = Number(d[k.key]) || 0;
                  if (total === 0) return null;
                  const seg = Math.round((v / total) * h);
                  return seg > 0 ? <div key={k.key} title={`${k.label}: ${v}`} style={{ height:seg, background:k.color }} /> : null;
                })}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ display:'flex', gap:4, padding:'2px 4px' }}>
        {data.map((d, i) => (
          <span key={i} style={{ flex:1, textAlign:'center', fontSize:'0.66rem', color:'#777' }}>{d[x]}</span>
        ))}
      </div>
      <div style={{ display:'flex', gap:12, justifyContent:'center', marginTop:6, flexWrap:'wrap' }}>
        {stacks.map(k => (
          <span key={k.key} style={{ display:'inline-flex', alignItems:'center', gap:5, fontSize:'0.74rem', color:'#555' }}>
            <span style={{ width:12, height:12, background:k.color, borderRadius:3 }} /> {k.label}
          </span>
        ))}
      </div>
    </div>
  );
};

/** "Sparkline" simple para mostrar la tendencia diaria. */
const Sparkline = ({ data, y, color = '#1a237e', height = 60 }) => {
  const vals = data.map(d => Number(d[y]) || 0);
  const max = Math.max(...vals, 1);
  const W = 100, H = 100;
  const xAt = (i) => (data.length <= 1 ? 0 : (i / (data.length - 1)) * W);
  const yAt = (v) => H - (v / max) * H;
  const d = data.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i).toFixed(2)} ${yAt(Number(p[y]) || 0).toFixed(2)}`).join(' ');
  const area = `${d} L ${W} ${H} L 0 ${H} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" width="100%" height={height} style={{ display:'block' }}>
      <path d={area} fill={color} fillOpacity="0.12" />
      <path d={d} fill="none" stroke={color} strokeWidth="1.2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
};

/** Barras horizontales (top diplomados, top alumnos). */
const HBarChart = ({ data, label, value, fmt = fmtQ0, color = '#1a237e' }) => {
  const max = Math.max(...data.map(d => Number(d[value]) || 0), 1);
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
      {data.map((d, i) => {
        const v = Number(d[value]) || 0;
        return (
          <div key={i} style={{ display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ fontSize:'0.78rem', color:'#333', width:'42%', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={d[label]}>
              {d[label] || '—'}
            </span>
            <div style={{ flex:1, background:'#eef0f5', borderRadius:4, height:14, overflow:'hidden', position:'relative' }}>
              <div style={{ width:`${(v / max) * 100}%`, background:color, height:'100%', borderRadius:4, transition:'width 0.5s' }} />
            </div>
            <span style={{ fontSize:'0.78rem', fontWeight:700, color:'#1a237e', minWidth:70, textAlign:'right' }}>{fmt(v)}</span>
          </div>
        );
      })}
    </div>
  );
};

// "Lindo" tope para escalas (números redondos: 1k, 2k, 5k, 10k...)
function niceCeil(n) {
  if (n <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(n)));
  const f = n / p;
  let nice;
  if      (f <= 1)   nice = 1;
  else if (f <= 2)   nice = 2;
  else if (f <= 2.5) nice = 2.5;
  else if (f <= 5)   nice = 5;
  else               nice = 10;
  return nice * p;
}

// ──────────────────────────────────────────────────────────────────────────
// PIEZAS DE LA UI
// ──────────────────────────────────────────────────────────────────────────

const Card = ({ title, icon, iconBg, children, style, accion }) => (
  <div className="stat-card" style={{ flexDirection:'column', alignItems:'stretch', gap:'0.6rem', padding:'1.1rem', ...style }}>
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8 }}>
      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
        {icon && <span style={{ fontSize:'1.1rem', background:iconBg, borderRadius:8, padding:'4px 6px' }}>{icon}</span>}
        <span style={{ fontWeight:700, color:'#1a237e', fontSize:'0.95rem' }}>{title}</span>
      </div>
      {accion}
    </div>
    {children}
  </div>
);

const ProgBar = ({ valor, total, color }) => {
  const pct = total > 0 ? Math.round((valor / total) * 100) : 0;
  const auto = pct >= 70 ? '#43a047' : pct >= 40 ? '#fb8c00' : '#e53935';
  return (
    <div style={{ background:'#f0f2f5', borderRadius:6, height:18, overflow:'hidden' }}>
      <div style={{
        width:`${pct}%`, background:color || auto, height:'100%', borderRadius:6, transition:'width 0.5s ease',
        display:'flex', alignItems:'center', justifyContent:'flex-end', paddingRight:6,
      }}>
        {pct > 12 && <span style={{ fontSize:'0.72rem', color:'white', fontWeight:700 }}>{pct}%</span>}
      </div>
    </div>
  );
};

const Delta = ({ valor, sufijo = '%' }) => {
  if (valor == null || !isFinite(valor)) {
    return <span style={{ fontSize:'0.78rem', color:'#999' }}>— sin comparativo</span>;
  }
  const sube = valor >= 0;
  const col = sube ? '#2e7d32' : '#c62828';
  return (
    <span style={{ fontSize:'0.82rem', color:col, fontWeight:700 }}>
      {sube ? '▲' : '▼'} {Math.abs(valor).toFixed(1)}{sufijo}
    </span>
  );
};

// ──────────────────────────────────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ──────────────────────────────────────────────────────────────────────────

const Dashboard = () => {
  const { anios, anioActual } = useAniosFiltros();
  const [anio, setAnio] = useState(() => {
    const saved = parseInt(localStorage.getItem('dash_anio'), 10);
    return Number.isInteger(saved) ? saved : new Date().getFullYear();
  });
  useEffect(() => { localStorage.setItem('dash_anio', String(anio)); }, [anio]);

  const [stats,    setStats]    = useState(null);
  const [finanzas, setFinanzas] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [errMsg,   setErrMsg]   = useState('');

  useEffect(() => {
    let vivo = true;
    setCargando(true); setErrMsg('');
    Promise.all([
      API.get('/dashboard/stats',    { params: { anio } }),
      API.get('/dashboard/finanzas', { params: { anio } }),
    ]).then(([s, f]) => {
      if (!vivo) return;
      setStats(s.data); setFinanzas(f.data);
    }).catch(err => {
      console.error(err);
      if (vivo) setErrMsg(err.response?.data?.message || 'No se pudo cargar el dashboard.');
    }).finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, [anio]);

  const s = stats || {};
  const f = finanzas || {};
  const esActual = s.es_anio_actual ?? (anio === anioActual);

  // ── Asistencia hoy / día / semana ──
  const ordenSem  = ORDEN_SEMANA[(s.semana_mes || 1) - 1] || '';
  const diaLabel  = DIAS_LABEL[s.dia_hoy] || CAP(s.dia_hoy);
  const mesLabel  = CAP(s.mes_nombre || '');
  const mesAntLabel = CAP(s.mes_anterior || '');

  // ── Grupos agrupados por laboratorio ──
  const gruposPorLab = useMemo(() => {
    const map = {};
    for (const g of (s.por_grupo || [])) {
      const lab = g.laboratorio || '__sin__';
      (map[lab] = map[lab] || []).push(g);
    }
    const labs = Object.keys(map).sort((a, b) => {
      if (a === '__sin__') return 1;
      if (b === '__sin__') return -1;
      const na = parseInt(a), nb = parseInt(b);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return String(a).localeCompare(String(b));
    });
    return labs.map(lab => ({
      lab,
      total: map[lab].reduce((acc, g) => acc + (g.total || 0), 0),
      grupos: map[lab].sort((a, b) => {
        const da = ORDEN_DIAS.indexOf(a.dia); const db = ORDEN_DIAS.indexOf(b.dia);
        if (da !== db) return (da === -1 ? 99 : da) - (db === -1 ? 99 : db);
        return horarioKey(a.horario) - horarioKey(b.horario);
      }),
    }));
  }, [s.por_grupo]);

  // ── Datos para los gráficos ──
  const dataIngresosMes = useMemo(() => (f.recibos_por_mes || []).map((m, i) => ({
    label:      MESES_LBL[i],
    monto:      m.monto,
    monto_prev: m.monto_prev,
    cantidad:   m.cantidad,
  })), [f.recibos_por_mes]);

  const dataColegMes = useMemo(() => (f.colegiaturas_por_mes || []).map((m, i) => ({
    label:    MESES_LBL[i],
    pagadas:  m.pagadas,
    totales:  m.totales,
    monto:    m.monto,
    pct:      m.totales > 0 ? Math.round((m.pagadas / m.totales) * 100) : 0,
  })), [f.colegiaturas_por_mes]);

  const dataSemanas = useMemo(() => (f.recibos_por_semana || []).map(w => ({
    label:  w.label,
    monto:  w.monto,
    cantidad: w.cantidad,
  })), [f.recibos_por_semana]);

  const dataDias = useMemo(() => (f.recibos_por_dia || []).map(d => ({
    label:  d.label,
    monto:  d.monto,
    cantidad: d.cantidad,
    fecha:  d.fecha_iso,
  })), [f.recibos_por_dia]);

  const dataAnios = useMemo(() => (f.comparativo_anios || []).map(a => ({
    label: String(a.anio),
    monto: a.monto,
    cantidad: a.cantidad,
  })), [f.comparativo_anios]);

  const dataAsist = useMemo(() => (f.asistencia_por_mes || []).map((m, i) => ({
    label: MESES_LBL[i],
    asistio: m.asistio,
    enfermo: m.enfermo,
    permiso: m.permiso,
    falto:   m.falto,
  })), [f.asistencia_por_mes]);

  const totalDiarioUlt30 = dataDias.reduce((acc, d) => acc + d.monto, 0);
  const promDiario       = dataDias.length ? totalDiarioUlt30 / dataDias.length : 0;
  const mejorDia         = dataDias.reduce((mx, d) => (d.monto > (mx?.monto || -1) ? d : mx), null);

  // ──────────────────────────────────────────────────────────────────────
  // RENDER
  // ──────────────────────────────────────────────────────────────────────

  return (
    <div className="admin-layout">
      <Sidebar />
      <div className="admin-content">
        <div style={{ display:'flex', flexWrap:'wrap', justifyContent:'space-between', alignItems:'flex-end', gap:'1rem', marginBottom:'0.5rem' }}>
          <div>
            <h1 style={{ margin:0 }}>Dashboard</h1>
            <p className="subtitle" style={{ margin:'2px 0 0' }}>
              {esActual
                ? `Panel EduGuat — ${diaLabel}, ${mesLabel} ${anio}`
                : `Panel EduGuat — Año ${anio} (vista histórica)`}
            </p>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <label style={{ fontSize:'0.85rem', fontWeight:600, color:'#555' }}>Año:</label>
            <select
              value={anio}
              onChange={e => setAnio(parseInt(e.target.value, 10))}
              style={{ padding:'0.45rem 0.7rem', borderRadius:8, border:'1.5px solid #e0e0e0', fontFamily:'inherit', fontSize:'0.88rem', minWidth:90 }}
            >
              {(anios.includes(anio) ? anios : [anio, ...anios]).map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        </div>

        {errMsg && <div className="msg-err" style={{ marginBottom:'1rem' }}>{errMsg}</div>}
        {cargando && !stats ? (
          <div style={{ padding:'4rem', textAlign:'center', color:'#aaa' }}>Cargando dashboard...</div>
        ) : (
          <>
            {/* ── Fila 1: KPIs ── */}
            <div className="stats-grid" style={{ gridTemplateColumns:'repeat(auto-fit,minmax(170px,1fr))', marginBottom:'1rem' }}>
              <div className="stat-card">
                <div className="stat-icon blue">👨‍🎓</div>
                <div className="stat-info"><h3>{fmtN(s.total_alumnos)}</h3><p>Alumnos activos</p></div>
              </div>
              <div className="stat-card">
                <div className="stat-icon" style={{ background:'#fce4ec', fontSize:'1.6rem', width:48, height:48, borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>📉</div>
                <div className="stat-info"><h3>{fmtN(s.alumnos_retirados)}</h3><p>Alumnos retirados</p></div>
              </div>
              <div className="stat-card">
                <div className="stat-icon" style={{ background:'#e8f5e9', fontSize:'1.6rem', width:48, height:48, borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>🆕</div>
                <div className="stat-info"><h3>{fmtN(s.alumnos_nuevos_anio)}</h3><p>Inscritos {anio}</p></div>
              </div>
              <div className="stat-card">
                <div className="stat-icon purple">🎓</div>
                <div className="stat-info"><h3>{fmtN(s.diplomados_activos)}</h3><p>Con diplomado</p></div>
              </div>
              <div className="stat-card" title="Suma de todos los recibos no anulados emitidos en el año (coincide con el módulo de Recibos).">
                <div className="stat-icon" style={{ background:'#e0f7fa', fontSize:'1.6rem', width:48, height:48, borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>📈</div>
                <div className="stat-info">
                  <h3>{fmtQ0(s.ingresos_anio)}</h3>
                  <p>Ingresos {anio} <Delta valor={f.delta_pct} /></p>
                </div>
              </div>
              <div className="stat-card" title="Sólo colegiaturas (mensualidades pagadas) — subconjunto de ingresos totales.">
                <div className="stat-icon" style={{ background:'#fff8e1', fontSize:'1.6rem', width:48, height:48, borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>💵</div>
                <div className="stat-info"><h3>{fmtQ0(s.ingresos_colegiaturas)}</h3><p>Colegiaturas {anio}</p></div>
              </div>
            </div>

            {/* ── Fila 2: Asistencia + Pagos mes / mes anterior ── */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))', gap:'1rem', marginBottom:'1rem' }}>

              {/* Asistencia hoy (sólo si es año actual) */}
              {esActual ? (
                <Card title="Asistencia hoy" icon="📋" iconBg="#fff3e0">
                  <p style={{ fontSize:'0.8rem', color:'#777', margin:0 }}>
                    {ordenSem ? `${CAP(ordenSem)} semana de ${mesLabel} · ${diaLabel}` : `${mesLabel} · ${diaLabel}`}
                  </p>
                  {s.total_esperados_hoy > 0 ? (
                    <>
                      <div style={{ fontSize:'1.6rem', fontWeight:800, color:'#1a237e', lineHeight:1 }}>
                        {fmtN(s.asistieron_semana ?? 0)}
                        <span style={{ fontSize:'1rem', color:'#888', fontWeight:500 }}> / {fmtN(s.total_esperados_hoy)}</span>
                      </div>
                      <p style={{ fontSize:'0.78rem', color:'#666', margin:'4px 0 0' }}>
                        asistieron esta semana ({diaLabel})
                      </p>
                      <ProgBar valor={s.asistieron_semana ?? 0} total={s.total_esperados_hoy} />
                      {(s.total_esperados_hoy - (s.asistieron_semana ?? 0)) > 0 && (
                        <p style={{ fontSize:'0.75rem', color:'#e53935', margin:0 }}>
                          {s.total_esperados_hoy - s.asistieron_semana} sin registrar esta semana
                        </p>
                      )}
                    </>
                  ) : (
                    <p style={{ fontSize:'0.82rem', color:'#bbb', margin:'8px 0 0' }}>No hay alumnos programados para {diaLabel}</p>
                  )}
                </Card>
              ) : (
                <Card title="Asistencia" icon="📋" iconBg="#fff3e0">
                  <p style={{ fontSize:'0.82rem', color:'#888', margin:0 }}>
                    Vista histórica del año {anio} — revisa el gráfico de asistencia mensual abajo.
                  </p>
                </Card>
              )}

              {/* Pagos mes actual */}
              <Card title={`Colegiaturas — ${CAP(s.mes_actual || mesLabel)}`} icon="💰" iconBg="#e8f5e9">
                <div style={{ fontSize:'1.6rem', fontWeight:800, color:'#1a237e', lineHeight:1 }}>
                  {fmtN(s.pagados_mes ?? 0)}
                  <span style={{ fontSize:'1rem', color:'#888', fontWeight:500 }}> / {fmtN(s.total_mes ?? 0)}</span>
                </div>
                <p style={{ fontSize:'0.78rem', color:'#666', margin:'4px 0 0' }}>
                  {fmtQ(s.monto_mes)} cobrado · sólo alumnos activos
                </p>
                <ProgBar valor={s.pagados_mes ?? 0} total={s.total_mes ?? 1} />
                {(s.total_mes - (s.pagados_mes ?? 0)) > 0 && (
                  <p style={{ fontSize:'0.75rem', color:'#e53935', margin:0 }}>
                    {s.total_mes - s.pagados_mes} pendientes de cobro
                  </p>
                )}
              </Card>

              {/* Pagos mes anterior */}
              <Card title={`Colegiaturas — ${CAP(s.mes_anterior || mesAntLabel)}`} icon="🗓️" iconBg="#f3e5f5">
                <div style={{ fontSize:'1.6rem', fontWeight:800, color:'#1a237e', lineHeight:1 }}>
                  {fmtN(s.pagados_mes_ant ?? 0)}
                  <span style={{ fontSize:'1rem', color:'#888', fontWeight:500 }}> / {fmtN(s.total_mes_ant ?? 0)}</span>
                </div>
                <p style={{ fontSize:'0.78rem', color:'#666', margin:'4px 0 0' }}>
                  {fmtQ(s.monto_mes_ant)} cobrado · sólo alumnos activos
                </p>
                <ProgBar valor={s.pagados_mes_ant ?? 0} total={s.total_mes_ant ?? 1} color="#9c27b0" />
                {(s.total_mes_ant - (s.pagados_mes_ant ?? 0)) > 0 && (
                  <p style={{ fontSize:'0.75rem', color:'#e53935', margin:0 }}>
                    {s.total_mes_ant - s.pagados_mes_ant} pendientes del mes anterior
                  </p>
                )}
              </Card>
            </div>

            {/* ── Fila 3: Ingresos mensuales (línea, año vs año anterior) ── */}
            <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:'1rem', marginBottom:'1rem' }} className="dash-grid-2-1">
              <Card
                title={`Ingresos mensuales — ${anio}`}
                icon="📊"
                iconBg="#e8eaf6"
                accion={<span style={{ fontSize:'0.78rem', color:'#666' }}>
                  Total: <strong style={{ color:'#1a237e' }}>{fmtQ0(f.total_anio)}</strong>
                </span>}
              >
                <LineChart
                  data={dataIngresosMes}
                  x="label"
                  series={[
                    { key:'monto',      label:`Ingresos ${anio}`,        color:'#1a237e', width:1.6 },
                    { key:'monto_prev', label:`Ingresos ${anio - 1}`,    color:'#9fa8da', width:1.2, dashed:true },
                  ]}
                  fmt={fmtQ0}
                  height={240}
                />
              </Card>

              <Card title={`Comparativo anual`} icon="📅" iconBg="#fff3e0">
                {dataAnios.length === 0 ? (
                  <p style={{ fontSize:'0.82rem', color:'#999' }}>Sin datos para comparar.</p>
                ) : (
                  <>
                    <BarChart data={dataAnios} x="label" y="monto" color="#fb8c00" fmt={fmtQ0} height={180} />
                    <div style={{ display:'flex', justifyContent:'space-between', marginTop:6, fontSize:'0.78rem', color:'#666' }}>
                      <span>Recibos: {fmtN(f.cantidad_anio || 0)}</span>
                      <span>Año ant.: <strong>{fmtQ0(f.total_prev)}</strong></span>
                    </div>
                  </>
                )}
              </Card>
            </div>

            {/* ── Fila 4: Colegiaturas mensuales (% cumplimiento) + Semanas ── */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1rem', marginBottom:'1rem' }} className="dash-grid-1-1">

              <Card title={`Cumplimiento de colegiaturas — ${anio}`} icon="✅" iconBg="#e0f7fa">
                <BarChart
                  data={dataColegMes}
                  x="label" y="pagadas"
                  color="#26a69a"
                  fmt={fmtN}
                  height={200}
                />
                <div style={{ fontSize:'0.74rem', color:'#777', marginTop:4 }}>
                  Cuotas <strong>pagadas</strong> por mes (activos). Total cobrado en colegiaturas:
                  <strong style={{ color:'#1a237e' }}> {fmtQ0(s.ingresos_colegiaturas)}</strong>
                </div>
              </Card>

              <Card title="Ingresos por semana (últimas 12)" icon="📆" iconBg="#fce4ec">
                <BarChart data={dataSemanas} x="label" y="monto" color="#ec407a" fmt={fmtQ0} height={200} />
                <div style={{ fontSize:'0.74rem', color:'#777', marginTop:4 }}>
                  Cada barra representa una semana (de lunes a domingo).
                </div>
              </Card>
            </div>

            {/* ── Fila 5: Ingresos diarios ── */}
            <Card title="Ingresos diarios (últimos 30 días)" icon="📅" iconBg="#e8f5e9" style={{ marginBottom:'1rem' }}>
              <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:'1rem', alignItems:'stretch' }} className="dash-grid-2-1">
                <div>
                  <BarChart data={dataDias} x="label" y="monto" color="#43a047" fmt={fmtQ0} height={200} />
                </div>
                <div style={{ display:'flex', flexDirection:'column', justifyContent:'center', gap:10 }}>
                  <div>
                    <div style={{ fontSize:'0.78rem', color:'#666' }}>Total 30 días</div>
                    <div style={{ fontSize:'1.4rem', fontWeight:800, color:'#1a237e' }}>{fmtQ0(totalDiarioUlt30)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize:'0.78rem', color:'#666' }}>Promedio diario</div>
                    <div style={{ fontSize:'1.2rem', fontWeight:700, color:'#1a237e' }}>{fmtQ0(promDiario)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize:'0.78rem', color:'#666' }}>Mejor día</div>
                    <div style={{ fontSize:'1rem', fontWeight:700, color:'#1a237e' }}>
                      {mejorDia ? `${mejorDia.label} · ${fmtQ0(mejorDia.monto)}` : '—'}
                    </div>
                  </div>
                  <Sparkline data={dataDias} y="monto" color="#43a047" height={50} />
                </div>
              </div>
            </Card>

            {/* ── Fila 6: Asistencia mensual ── */}
            <Card title={`Asistencia mensual — ${anio}`} icon="📋" iconBg="#fff3e0" style={{ marginBottom:'1rem' }}>
              <StackedBarChart
                data={dataAsist}
                x="label"
                stacks={[
                  { key:'asistio', label:'Asistió',  color:'#43a047' },
                  { key:'enfermo', label:'Enfermo',  color:'#ffb300' },
                  { key:'permiso', label:'Permiso',  color:'#1e88e5' },
                  { key:'falto',   label:'Faltó',    color:'#e53935' },
                ]}
                height={220}
              />
              <p style={{ fontSize:'0.74rem', color:'#777', marginTop:4 }}>
                Total de registros semanales de asistencia por mes (incluye los 5 indicadores).
              </p>
            </Card>

            {/* ── Fila 7: Top diplomados + Top alumnos ── */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1rem', marginBottom:'1rem' }} className="dash-grid-1-1">
              <Card title={`Top diplomados por ingresos ${anio}`} icon="🎓" iconBg="#e8eaf6">
                {(f.top_diplomados || []).length === 0 ? (
                  <p style={{ fontSize:'0.82rem', color:'#999' }}>Sin datos.</p>
                ) : (
                  <HBarChart data={f.top_diplomados} label="diplomado" value="monto" color="#5c6bc0" />
                )}
              </Card>

              <Card title={`Top alumnos por pagos ${anio}`} icon="🏆" iconBg="#fff8e1">
                {(f.top_alumnos || []).length === 0 ? (
                  <p style={{ fontSize:'0.82rem', color:'#999' }}>Sin recibos en el año.</p>
                ) : (
                  <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                    {f.top_alumnos.map((a, i) => (
                      <div key={a.id} style={{
                        display:'flex', justifyContent:'space-between', alignItems:'center',
                        padding:'6px 10px', background:'#f8f9fe', borderRadius:8, border:'1px solid #e3e8ff',
                      }}>
                        <div style={{ display:'flex', alignItems:'center', gap:8, minWidth:0, flex:1 }}>
                          <span style={{
                            width:22, height:22, borderRadius:'50%', background: i < 3 ? '#fb8c00' : '#9fa8da',
                            color:'#fff', fontSize:'0.72rem', fontWeight:700,
                            display:'inline-flex', alignItems:'center', justifyContent:'center', flexShrink:0,
                          }}>{i + 1}</span>
                          <div style={{ minWidth:0 }}>
                            <div style={{ fontSize:'0.85rem', fontWeight:600, color:'#1a237e', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={a.nombre}>
                              {a.nombre}
                            </div>
                            <div style={{ fontSize:'0.7rem', color:'#888' }}>
                              {a.clave}{a.codigo_estudiante ? ` · ${a.codigo_estudiante}` : ''} · {a.recibos} recibo(s)
                            </div>
                          </div>
                        </div>
                        <strong style={{ color:'#1a237e', fontSize:'0.92rem' }}>{fmtQ0(a.monto)}</strong>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>

            {/* ── Fila 8: Grupos por laboratorio ── */}
            {gruposPorLab.length > 0 && (
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(320px,1fr))', gap:'1rem', marginBottom:'1rem' }}>
                {gruposPorLab.map(({ lab, total, grupos }) => (
                  <Card
                    key={lab}
                    title={lab === '__sin__' ? 'Sin laboratorio' : `Laboratorio ${lab}`}
                    icon="🏫" iconBg="#e3f2fd"
                  >
                    <div style={{ fontSize:'0.78rem', color:'#666' }}>
                      {grupos.length} grupo(s) · <strong style={{ color:'#1a237e' }}>{total}</strong> alumno(s)
                    </div>
                    <div style={{ display:'flex', flexDirection:'column', gap:'0.4rem' }}>
                      {grupos.map((g, i) => (
                        <div key={i} style={{
                          background:'#f8f9fe', borderRadius:8, padding:'0.5rem 0.75rem',
                          display:'flex', justifyContent:'space-between', alignItems:'center',
                          border:'1px solid #e3e8ff',
                        }}>
                          <div style={{ display:'flex', flexDirection:'column' }}>
                            <span style={{ fontSize:'0.82rem', color:'#1a237e', fontWeight:600 }}>
                              {DIAS_LABEL[g.dia] || CAP(g.dia)}
                            </span>
                            <span style={{ fontSize:'0.75rem', color:'#666' }}>{g.horario || '—'}</span>
                          </div>
                          <span style={{ fontSize:'1.1rem', fontWeight:800, color:'#1a237e', marginLeft:8 }}>{g.total}</span>
                        </div>
                      ))}
                    </div>
                  </Card>
                ))}
              </div>
            )}

            {/* ── Fila 9: Distribuciones de alumnos ── */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))', gap:'1rem' }}>
              {(s.por_diplomado || []).length > 0 && (
                <Card title="Alumnos por diplomado" icon="🎓" iconBg="#e8eaf6">
                  <HBarChart data={s.por_diplomado} label="diplomado" value="total" color="#5c6bc0" fmt={fmtN} />
                </Card>
              )}
              {(s.por_tac || []).length > 0 && (
                <Card title="Alumnos por TAC" icon="🏫" iconBg="#fbe9e7">
                  <HBarChart data={s.por_tac} label="tac" value="total" color="#ef6c00" fmt={fmtN} />
                </Card>
              )}
            </div>
          </>
        )}

      </div>
    </div>
  );
};

export default Dashboard;
