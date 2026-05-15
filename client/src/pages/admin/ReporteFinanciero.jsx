import { useState, useEffect } from 'react';
import Sidebar from '../../components/Sidebar';
import API from '../../api/axios';
import './admin.css';

/* ─────────────────── constantes ─────────────────── */
const MESES = [
  { num:1, cod:'enero',       lab:'Ene' },
  { num:2, cod:'febrero',     lab:'Feb' },
  { num:3, cod:'marzo',       lab:'Mar' },
  { num:4, cod:'abril',       lab:'Abr' },
  { num:5, cod:'mayo',        lab:'May' },
  { num:6, cod:'junio',       lab:'Jun' },
  { num:7, cod:'julio',       lab:'Jul' },
  { num:8, cod:'agosto',      lab:'Ago' },
  { num:9, cod:'septiembre',  lab:'Sep' },
  { num:10,cod:'octubre',     lab:'Oct' },
  { num:11,cod:'noviembre',   lab:'Nov' },
  { num:12,cod:'diciembre',   lab:'Dic' },
];
const SEMANAS = [1,2,3,4,5];
const MES_ACTUAL = new Date().getMonth() + 1; // 1-based
const ANIO_ACTUAL = new Date().getFullYear();
const ANIOS = Array.from({ length: 5 }, (_, i) => ANIO_ACTUAL - i + 1);

const ASIST_COL = {
  x: { bg:'#c8e6c9', color:'#1b5e20', label:'X' },
  e: { bg:'#fff9c4', color:'#e65100', label:'E' },
  p: { bg:'#bbdefb', color:'#0d47a1', label:'P' },
  f: { bg:'#ffcdd2', color:'#b71c1c', label:'F' },
};

const CAP = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : '—';

/* ─────────────────── helpers ─────────────────── */
const diasLabel = a => [a.dia_clases1, a.dia_clases2]
  .filter(Boolean).map(CAP).join(' + ');

const horarioLabel = a => {
  const partes = [diasLabel(a), a.horario, a.laboratorio ? `Lab. ${a.laboratorio}` : ''].filter(Boolean);
  return partes.join(' · ') || '—';
};

// Determina si un mes está "atrasado" (mes <= mes actual, sin pagar y sin anular)
const esAtrasado = (mesNum, pago, mesActual) =>
  mesNum <= mesActual && (!pago || (!pago.pagado && !pago.anulado));

/* ─────────────────── pill de pago ─────────────────── */
const PillPago = ({ mesNum, mes, pago, mesActual, cuota }) => {
  if (!pago) {
    // Sin registro: mes futuro o sin mensualidad creada
    if (mesNum > mesActual) return <div className="rf-pill rf-pill-vacio">{mes.lab}</div>;
    return <div className="rf-pill rf-pill-sin">{mes.lab}<span>—</span></div>;
  }
  if (pago.anulado) return <div className="rf-pill rf-pill-anulado">{mes.lab}<span>✕</span></div>;
  if (pago.pagado) {
    const esAbono = pago.monto < cuota - 0.01;
    return (
      <div className={`rf-pill ${esAbono ? 'rf-pill-abono' : 'rf-pill-pagado'}`} title={`Q${pago.monto.toFixed(2)}${pago.no_recibo ? ' · R:'+pago.no_recibo : ''}${pago.fecha_pago ? ' · '+pago.fecha_pago : ''}`}>
        {mes.lab}<span>{esAbono ? '~' : '✓'}</span>
      </div>
    );
  }
  // Pendiente
  const atras = esAtrasado(mesNum, pago, mesActual);
  return (
    <div className={`rf-pill ${atras ? 'rf-pill-atrasado' : 'rf-pill-pendiente'}`}>
      {mes.lab}<span>{atras ? '!' : '○'}</span>
    </div>
  );
};

/* ─────────────────── fila de asistencia por mes ─────────────────── */
const FilaAsistencia = ({ mesNum, label, semanas }) => {
  const tieneDatos = Object.keys(semanas || {}).length > 0;
  return (
    <tr>
      <td style={{ fontSize:'0.72rem', color:'#777', padding:'1px 6px', whiteSpace:'nowrap' }}>{label}</td>
      {SEMANAS.map(s => {
        const est = semanas?.[s]?.toLowerCase();
        const col = ASIST_COL[est];
        return (
          <td key={s} style={{ padding:'1px 2px', textAlign:'center' }}>
            {col ? (
              <span style={{ display:'inline-block', width:18, height:18, borderRadius:4, fontSize:'0.68rem', fontWeight:700, background:col.bg, color:col.color, lineHeight:'18px' }}>
                {col.label}
              </span>
            ) : (
              <span style={{ display:'inline-block', width:18, height:18, borderRadius:4, background:'#f5f5f5', lineHeight:'18px' }} />
            )}
          </td>
        );
      })}
    </tr>
  );
};

/* ─────────────────── tarjeta de alumno ─────────────────── */
const TarjetaAlumno = ({ alumno, anio, mesActual }) => {
  const mesesAtrasados = MESES
    .filter(m => m.num <= mesActual)
    .filter(m => {
      const p = alumno.pagos[m.cod];
      return !p || (!p.pagado && !p.anulado);
    })
    .map(m => m.lab);

  return (
    <div className="rf-tarjeta">
      {/* Cabecera alumno */}
      <div className="rf-header">
        <div className="rf-header-main">
          <span className="rf-codigo" title={alumno.codigo_estudiante || 'sin código'}>{alumno.clave}</span>
          <span className="rf-nombre">{alumno.nombre} {alumno.apellido}</span>
          {mesesAtrasados.length > 0 && (
            <span className="rf-badge-atrasado">Debe: {mesesAtrasados.join(', ')}</span>
          )}
        </div>
        <div className="rf-header-meta">
          {alumno.telefono && <span>📞 {alumno.telefono}</span>}
          {alumno.encargado && <span>👤 {alumno.encargado}</span>}
          {alumno.establecimiento && <span>🏫 {alumno.establecimiento}</span>}
          {alumno.tac && <span>📍 TAC: {alumno.tac}</span>}
          <span>🕐 {horarioLabel(alumno)}</span>
        </div>
      </div>

      {/* Pills de pagos */}
      <div className="rf-pagos-section">
        <span className="rf-section-label">PAGOS {anio}</span>
        <div className="rf-pills">
          {MESES.map(m => (
            <PillPago
              key={m.cod}
              mesNum={m.num}
              mes={m}
              pago={alumno.pagos[m.cod]}
              mesActual={mesActual}
              cuota={alumno.cuota_mensual}
            />
          ))}
        </div>
        <div style={{ fontSize:'0.75rem', color:'#888', marginTop:4, display:'flex', gap:'1rem', flexWrap:'wrap' }}>
          <span><span style={{ color:'#2e7d32', fontWeight:700 }}>✓</span> Pagado</span>
          <span><span style={{ color:'#e65100', fontWeight:700 }}>~</span> Abono</span>
          <span><span style={{ color:'#c62828', fontWeight:700 }}>!</span> Atrasado</span>
          <span><span style={{ color:'#f57c00', fontWeight:700 }}>○</span> Pendiente</span>
          <span><span style={{ color:'#999', fontWeight:700 }}>✕</span> Anulado</span>
        </div>
      </div>

      {/* Grid de asistencia */}
      <div className="rf-asist-section">
        <span className="rf-section-label">ASISTENCIA {anio}</span>
        <div style={{ overflowX:'auto' }}>
          <table style={{ borderCollapse:'collapse', fontSize:'0.72rem' }}>
            <thead>
              <tr>
                <th style={{ fontSize:'0.68rem', color:'#aaa', padding:'1px 6px', fontWeight:400 }}>Mes</th>
                {SEMANAS.map(s => (
                  <th key={s} style={{ fontSize:'0.68rem', color:'#aaa', width:22, textAlign:'center', fontWeight:400 }}>S{s}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MESES.map(m => (
                <FilaAsistencia
                  key={m.num}
                  mesNum={m.num}
                  label={m.lab}
                  semanas={alumno.asistencia[m.num]}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

/* ─────────────────── página principal ─────────────────── */
export default function ReporteFinanciero() {
  const [anio,        setAnio]        = useState(ANIO_ACTUAL);
  const [hastaMes,    setHastaMes]    = useState(MES_ACTUAL);
  const [condicion,   setCondicion]   = useState('atrasado');
  const [maxPagados,  setMaxPagados]  = useState(1);
  const [tac,         setTac]         = useState('');
  const [horario,     setHorario]     = useState('');
  const [laboratorio, setLaboratorio] = useState('');
  const [dia,         setDia]         = useState('');
  const [filtros,     setFiltros]     = useState({ horarios:[], laboratorios:[], dias:[], tacs:[] });

  const [resultado,   setResultado]   = useState(null);
  const [cargando,    setCargando]    = useState(false);
  const [error,       setError]       = useState('');

  useEffect(() => {
    API.get('/asistencia/filtros').then(({ data }) => setFiltros(data)).catch(console.error);
    // also get tac list
    API.get('/alumnos').then(({ data }) => {
      const tacs = [...new Set(data.map(a => a.tac).filter(Boolean))].sort();
      setFiltros(prev => ({ ...prev, tacs }));
    }).catch(console.error);
  }, []);

  const generar = async () => {
    setCargando(true);
    setError('');
    setResultado(null);
    try {
      const p = new URLSearchParams({ anio, hasta_mes: hastaMes, condicion });
      if (condicion === 'max_pagados') p.set('max_pagados', maxPagados);
      if (tac)         p.set('tac',         tac);
      if (horario)     p.set('horario',      horario);
      if (laboratorio) p.set('laboratorio',  laboratorio);
      if (dia)         p.set('dia',          dia);
      const { data } = await API.get(`/reporte/financiero?${p}`);
      setResultado(data);
    } catch (err) {
      setError(err.response?.data?.message || 'Error al generar reporte');
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="admin-layout">
      <Sidebar />
      <div className="admin-content">
        <h1>💸 Reporte Financiero</h1>
        <p className="subtitle">Genera un listado de alumnos según sus condiciones de pago, con detalle de mensualidades y asistencia.</p>

        {/* Panel de filtros */}
        <div className="table-container" style={{ padding:'1.25rem', marginBottom:'1.25rem' }}>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(170px,1fr))', gap:'0.75rem', alignItems:'end' }}>

            <div className="form-group" style={{ margin:0 }}>
              <label style={{ fontSize:'0.8rem', fontWeight:600, color:'#555', display:'block', marginBottom:4 }}>Año</label>
              <select value={anio} onChange={e => setAnio(Number(e.target.value))}>
                {ANIOS.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>

            <div className="form-group" style={{ margin:0 }}>
              <label style={{ fontSize:'0.8rem', fontWeight:600, color:'#555', display:'block', marginBottom:4 }}>Revisar hasta</label>
              <select value={hastaMes} onChange={e => setHastaMes(Number(e.target.value))}>
                {MESES.map(m => <option key={m.num} value={m.num}>{m.cod.charAt(0).toUpperCase()+m.cod.slice(1)}</option>)}
              </select>
            </div>

            <div className="form-group" style={{ margin:0 }}>
              <label style={{ fontSize:'0.8rem', fontWeight:600, color:'#555', display:'block', marginBottom:4 }}>Condición</label>
              <select value={condicion} onChange={e => setCondicion(e.target.value)}>
                <option value="atrasado">Con al menos 1 mes pendiente</option>
                <option value="sin_pago">Sin ningún pago</option>
                <option value="max_pagados">Pagaron máximo N meses</option>
              </select>
            </div>

            {condicion === 'max_pagados' && (
              <div className="form-group" style={{ margin:0 }}>
                <label style={{ fontSize:'0.8rem', fontWeight:600, color:'#555', display:'block', marginBottom:4 }}>Máx. meses pagados</label>
                <input type="number" min={0} max={12} value={maxPagados}
                  onChange={e => setMaxPagados(Number(e.target.value))}
                  style={{ width:'100%' }} />
              </div>
            )}

            {filtros.tacs?.length > 0 && (
              <div className="form-group" style={{ margin:0 }}>
                <label style={{ fontSize:'0.8rem', fontWeight:600, color:'#555', display:'block', marginBottom:4 }}>TAC</label>
                <select value={tac} onChange={e => setTac(e.target.value)}>
                  <option value="">Todos los TAC</option>
                  {filtros.tacs.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            )}

            {filtros.dias?.length > 0 && (
              <div className="form-group" style={{ margin:0 }}>
                <label style={{ fontSize:'0.8rem', fontWeight:600, color:'#555', display:'block', marginBottom:4 }}>Día de clases</label>
                <select value={dia} onChange={e => setDia(e.target.value)}>
                  <option value="">Todos los días</option>
                  {filtros.dias.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
            )}

            {filtros.horarios?.length > 0 && (
              <div className="form-group" style={{ margin:0 }}>
                <label style={{ fontSize:'0.8rem', fontWeight:600, color:'#555', display:'block', marginBottom:4 }}>Horario</label>
                <select value={horario} onChange={e => setHorario(e.target.value)}>
                  <option value="">Todos los horarios</option>
                  {filtros.horarios.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            )}

            {filtros.laboratorios?.length > 0 && (
              <div className="form-group" style={{ margin:0 }}>
                <label style={{ fontSize:'0.8rem', fontWeight:600, color:'#555', display:'block', marginBottom:4 }}>Laboratorio</label>
                <select value={laboratorio} onChange={e => setLaboratorio(e.target.value)}>
                  <option value="">Todos los laboratorios</option>
                  {filtros.laboratorios.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
            )}

            <div style={{ display:'flex', alignItems:'flex-end' }}>
              <button className="btn-primary" onClick={generar} disabled={cargando} style={{ width:'100%', padding:'0.55rem 1rem' }}>
                {cargando ? 'Generando...' : '🔍 Generar Reporte'}
              </button>
            </div>
          </div>

          {/* Descripción de la condición */}
          <div style={{ marginTop:'0.75rem', padding:'0.6rem 0.9rem', background:'#f8f9fe', borderRadius:7, fontSize:'0.82rem', color:'#555', borderLeft:'3px solid #5c6bc0' }}>
            {condicion === 'atrasado' && `Mostrará alumnos activos que tengan al menos 1 mes sin pagar entre Enero y ${CAP(MESES[hastaMes-1]?.cod)} del ${anio}.`}
            {condicion === 'sin_pago'  && `Mostrará alumnos activos que NO hayan pagado ningún mes entre Enero y ${CAP(MESES[hastaMes-1]?.cod)} del ${anio}.`}
            {condicion === 'max_pagados' && `Mostrará alumnos activos que hayan pagado como máximo ${maxPagados} mes(es) entre Enero y ${CAP(MESES[hastaMes-1]?.cod)} del ${anio}.`}
          </div>
        </div>

        {error && <div className="msg-err" style={{ marginBottom:'1rem' }}>{error}</div>}

        {/* Resultados */}
        {resultado !== null && (
          <>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.75rem' }}>
              <p style={{ fontWeight:700, color:'#1a237e', fontSize:'1rem' }}>
                {resultado.length === 0 ? 'No se encontraron alumnos con esa condición.' : `${resultado.length} alumno${resultado.length !== 1 ? 's' : ''} encontrado${resultado.length !== 1 ? 's' : ''}`}
              </p>
              {resultado.length > 0 && (
                <span style={{ fontSize:'0.8rem', color:'#888' }}>
                  Total adeudado aprox: Q{resultado.reduce((sum, a) => {
                    const pend = MESES.filter(m => m.num <= MES_ACTUAL).filter(m => {
                      const p = a.pagos[m.cod]; return !p || (!p.pagado && !p.anulado);
                    }).length;
                    return sum + pend * a.cuota_mensual;
                  }, 0).toLocaleString('es-GT', { minimumFractionDigits:2 })}
                </span>
              )}
            </div>

            <div className="rf-lista">
              {resultado.map(alumno => (
                <TarjetaAlumno
                  key={alumno.id}
                  alumno={alumno}
                  anio={anio}
                  mesActual={MES_ACTUAL}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
