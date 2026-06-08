import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Sidebar from '../../components/Sidebar';
import api from '../../api/axios';
import { useAniosFiltros } from '../../lib/anios';
import './admin.css';
import './ReporteAlumno.css';

const MESES = [
  'enero','febrero','marzo','abril','mayo','junio',
  'julio','agosto','septiembre','octubre','noviembre','diciembre'
];
const MESES_LABEL = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'
];

const ASIST_COLORES = {
  x: { bg: '#c8e6c9', color: '#1b5e20', label: 'X' },
  e: { bg: '#fff9c4', color: '#e65100', label: 'E' },
  p: { bg: '#bbdefb', color: '#0d47a1', label: 'P' },
  f: { bg: '#ffcdd2', color: '#b71c1c', label: 'F' },
  r: { bg: '#d1c4e9', color: '#4527a0', label: 'R' },
};
const ASIST_LABELS = { x: 'Asistió', e: 'Enfermo', p: 'Permiso', f: 'Falta', r: 'Recuperó' };
const DOW_LABELS = ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa'];
const DIA_NUM = { domingo: 0, lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6 };

const pad = (n) => String(n).padStart(2, '0');
const fmtFecha = (f) => {
  if (!f) return '—';
  const d = new Date(f);
  return d.toLocaleDateString('es-GT', { day: '2-digit', month: '2-digit', year: 'numeric' });
};
const fmtHorarioCurso = (c) =>
  (c.hora_inicio && c.hora_fin) ? `${c.hora_inicio} a ${c.hora_fin}` : (c.hora_inicio || c.hora_fin || '');

const clasificarPago = (p) => {
  if (p.acreditado)                            return 'acreditado';
  if (p.anulado)                               return 'anulado';
  if (p.descuento_100)                         return 'descuento';
  if (p.pagado)                                return 'cancelado';
  if ((parseFloat(p.monto_abonado) || 0) > 0) return 'abono';
  return 'pendiente';
};

// ─── Calendario mensual con celdas teñidas por estado ───────────────────────
function MonthCalendar({ anio, mes, asistMap, allowedDows }) {
  const first = new Date(anio, mes - 1, 1).getDay();
  const totalDias = new Date(anio, mes, 0).getDate();
  const cells = [];
  for (let i = 0; i < first; i++) cells.push(null);
  for (let d = 1; d <= totalDias; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  return (
    <table className="rpt-cal">
      <thead>
        <tr>{DOW_LABELS.map(d => <th key={d}>{d}</th>)}</tr>
      </thead>
      <tbody>
        {weeks.map((week, wi) => (
          <tr key={wi}>
            {week.map((d, di) => {
              if (d == null) return <td key={di} className="rpt-cal-empty" />;
              const fecha = `${anio}-${pad(mes)}-${pad(d)}`;
              const dow = new Date(anio, mes - 1, d).getDay();
              const estado = asistMap[fecha];
              const visible = estado && (!allowedDows || allowedDows.has(dow));
              const col = visible ? ASIST_COLORES[estado] : null;
              return (
                <td
                  key={di}
                  className="rpt-cal-day"
                  style={col ? { background: col.bg, color: col.color, fontWeight: 700 } : {}}
                  title={visible ? ASIST_LABELS[estado] : undefined}
                >
                  <span className="rpt-cal-num">{d}</span>
                  {visible && <span className="rpt-cal-mark">{col.label}</span>}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const ReporteAlumnoInstitucion = () => {
  const { anios: ANIOS_FILTRO } = useAniosFiltros();
  const [busqueda, setBusqueda]       = useState('');
  const [sugerencias, setSugerencias] = useState([]);
  const [alumnoSel, setAlumnoSel]     = useState(null);
  const [mostrarSug, setMostrarSug]   = useState(false);
  const [reporte, setReporte]         = useState(null);
  const [cargando, setCargando]       = useState(false);
  const [error, setError]             = useState('');
  const [accesoAbierto, setAccesoAbierto] = useState(false);
  const [cursoFiltro, setCursoFiltro] = useState(''); // nombre del curso o ''
  const [mesesAbiertos, setMesesAbiertos] = useState({});
  const [anio, setAnio] = useState(() => {
    const saved = localStorage.getItem('pag_anio');
    return saved ? parseInt(saved) : new Date().getFullYear();
  });

  const searchRef = useRef(null);
  const debounceR = useRef(null);

  useEffect(() => {
    const h = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) setMostrarSug(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const buscar = useCallback(async (q) => {
    if (!q.trim()) { setSugerencias([]); return; }
    try {
      const { data } = await api.get(`/reporte/alumnos/buscar?q=${encodeURIComponent(q)}`);
      setSugerencias(data);
      setMostrarSug(true);
    } catch { setSugerencias([]); }
  }, []);

  const onBusquedaChange = (e) => {
    const val = e.target.value;
    setBusqueda(val);
    setAlumnoSel(null);
    setReporte(null);
    if (debounceR.current) clearTimeout(debounceR.current);
    debounceR.current = setTimeout(() => buscar(val), 280);
  };

  const seleccionarAlumno = (a) => {
    setAlumnoSel(a);
    setBusqueda(`${a.nombre} ${a.apellido}`);
    setSugerencias([]);
    setMostrarSug(false);
    setReporte(null);
  };

  const generarReporte = async () => {
    if (!alumnoSel) return;
    setCargando(true);
    setError('');
    setReporte(null);
    setAccesoAbierto(false);
    setCursoFiltro('');
    setMesesAbiertos({});
    try {
      const { data } = await api.get(`/reporte/alumno/${alumnoSel.id}?anio=${anio}`);
      setReporte(data);
    } catch (err) {
      setError(err.response?.data?.message || 'Error al generar el reporte');
    } finally {
      setCargando(false);
    }
  };

  const al      = reporte?.alumno;
  const pag     = reporte?.pagos || [];
  const cursos   = useMemo(() => reporte?.cursos || [], [reporte]);
  const asistRaw = useMemo(() => reporte?.asistenciaDiaria || [], [reporte]);

  const asistMap = useMemo(() => {
    const m = {};
    for (const a of asistRaw) m[a.fecha] = String(a.estado || '').toLowerCase();
    return m;
  }, [asistRaw]);

  // Días de la semana permitidos según el curso filtrado (null = todos).
  const allowedDows = useMemo(() => {
    if (!cursoFiltro) return null;
    const curso = cursos.find(c => c.nombre === cursoFiltro);
    if (!curso) return null;
    const set = new Set((curso.dias || []).map(d => DIA_NUM[d]).filter(n => n !== undefined));
    return set.size ? set : null;
  }, [cursoFiltro, cursos]);

  // Meses con registros (respeta el filtro de curso para los conteos).
  const mesesConDatos = useMemo(() => {
    const map = {}; // mesNum -> { x,e,p,f,r,total }
    for (const a of asistRaw) {
      const [, mm, dd] = a.fecha.split('-').map(Number);
      const dow = new Date(Number(a.fecha.slice(0, 4)), mm - 1, dd).getDay();
      if (allowedDows && !allowedDows.has(dow)) continue;
      const est = String(a.estado || '').toLowerCase();
      if (!map[mm]) map[mm] = { x: 0, e: 0, p: 0, f: 0, r: 0, total: 0 };
      if (map[mm][est] !== undefined) map[mm][est]++;
      map[mm].total++;
    }
    return map;
  }, [asistRaw, allowedDows]);

  const resumenAsist = useMemo(() => {
    const acc = { x: 0, e: 0, p: 0, f: 0, r: 0, total: 0 };
    for (const m of Object.values(mesesConDatos)) {
      for (const k of Object.keys(acc)) acc[k] += m[k];
    }
    return acc;
  }, [mesesConDatos]);

  const toggleMes = (n) => setMesesAbiertos(s => ({ ...s, [n]: !s[n] }));

  // ── Pagos ──
  const pagVisibles = pag.filter(p => {
    if (p.esperado === false) return p.pagado || p.acreditado || (parseFloat(p.monto_abonado) || 0) > 0;
    return true;
  });
  const montoReal = (p) => {
    const tipo = clasificarPago(p);
    if (tipo === 'cancelado') return parseFloat(p.monto) || parseFloat(al?.cuota_mensual || 0);
    if (tipo === 'abono')     return parseFloat(p.monto_abonado) || 0;
    if (tipo === 'pendiente') return parseFloat(p.monto) || parseFloat(al?.cuota_mensual || 0);
    return parseFloat(p.monto || 0) || parseFloat(al?.cuota_mensual || 0);
  };
  const proximoPago = pagVisibles.find(p => ['pendiente', 'abono'].includes(clasificarPago(p)));
  const pagosResumen = {
    cancelados: pagVisibles.filter(p => clasificarPago(p) === 'cancelado').length,
    pendientes: pagVisibles.filter(p => clasificarPago(p) === 'pendiente').length,
    total: pagVisibles.reduce((s, p) => {
      const t = clasificarPago(p);
      if (t === 'cancelado') return s + (parseFloat(p.monto) || parseFloat(al?.cuota_mensual || 0));
      if (t === 'abono')     return s + (parseFloat(p.monto_abonado) || 0);
      return s;
    }, 0),
  };

  const diasInscripcion = [al?.dias_clase ? al.dias_clase.split(',').filter(Boolean).join(', ') : '']
    .filter(Boolean)[0] || '—';

  return (
    <div className="admin-layout">
      <Sidebar />
      <main className="admin-content">
        <h1>📊 Reporte de Alumno</h1>
        <p className="subtitle">Busca un alumno y genera su reporte de inscripción, asistencia, cursos y pagos</p>

        {/* Buscador */}
        <div className="rpt-search-card">
          <div className="rpt-search-row">
            <div className="rpt-search-wrapper" ref={searchRef}>
              <input
                type="text"
                className="search-input"
                style={{ width: 340, maxWidth: '100%' }}
                placeholder="Buscar por clave, código o nombre…"
                value={busqueda}
                onChange={onBusquedaChange}
                onFocus={() => sugerencias.length > 0 && setMostrarSug(true)}
                autoComplete="off"
              />
              {mostrarSug && sugerencias.length > 0 && (
                <div className="rpt-suggestions">
                  {sugerencias.map(a => (
                    <div key={a.id} className="rpt-suggestion-item" onMouseDown={() => seleccionarAlumno(a)}>
                      <span className="rpt-sug-nombre">{a.nombre} {a.apellido}</span>
                      <span className="rpt-sug-codigo">{a.clave}{a.codigo_estudiante ? ` · ${a.codigo_estudiante}` : ''}</span>
                      <span className={`badge ${a.estado === 'activo' ? 'badge-activo' : 'badge-retirado'}`}>{a.estado}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 600, whiteSpace: 'nowrap' }}>Año:</label>
              <select
                value={anio}
                onChange={e => setAnio(parseInt(e.target.value))}
                style={{ padding: '0.5rem 0.75rem', borderRadius: 8, border: '1.5px solid #e0e0e0', fontFamily: 'inherit', fontSize: '0.88rem' }}
              >
                {ANIOS_FILTRO.map(y => <option key={y}>{y}</option>)}
              </select>
            </div>

            <button className="btn-primary" onClick={generarReporte} disabled={!alumnoSel || cargando}>
              {cargando ? '⏳ Generando…' : '📄 Generar Reporte'}
            </button>
          </div>

          {alumnoSel && (
            <div className="rpt-sel-chip">
              ✅ Seleccionado: <strong>{alumnoSel.nombre} {alumnoSel.apellido}</strong> — {alumnoSel.clave}{alumnoSel.codigo_estudiante ? ` (${alumnoSel.codigo_estudiante})` : ''}
            </div>
          )}
        </div>

        {error && <div className="msg-err">{error}</div>}

        {reporte && al && (
          <div className="rpt-reporte">
            {/* Cabecera */}
            <div className="rpt-header">
              <div>
                <h2>{al.nombre} {al.apellido}</h2>
                <p>
                  Clave: <strong>{al.clave}</strong>
                  {al.codigo_estudiante ? <> · Código: <strong>{al.codigo_estudiante}</strong></> : null}
                  {al.grado ? <> · {al.grado}</> : null}
                  {al.seccion ? <> · Sección {al.seccion}</> : null}
                </p>
              </div>
              <span className={`badge ${al.estado === 'activo' ? 'badge-activo' : 'badge-retirado'}`}>{al.estado}</span>
            </div>

            {/* Datos personales + Inscripción */}
            <div className="rpt-grid-2">
              <div className="rpt-card">
                <h3 className="rpt-card-title">👤 Datos Personales</h3>
                <div className="rpt-card-body">
                  <div className="rpt-info-grid">
                    <div className="rpt-info-item">
                      <span className="rpt-info-label">Nombre completo</span>
                      <span className="rpt-info-value">{al.nombre} {al.apellido}</span>
                    </div>
                    <div className="rpt-info-item">
                      <span className="rpt-info-label">Fecha de nacimiento</span>
                      <span className="rpt-info-value">{fmtFecha(al.fecha_nacimiento)}</span>
                    </div>
                    <div className="rpt-info-item">
                      <span className="rpt-info-label">Encargado</span>
                      <span className="rpt-info-value">{al.encargado || '—'}</span>
                    </div>
                    <div className="rpt-info-item">
                      <span className="rpt-info-label">Teléfono</span>
                      <span className="rpt-info-value">{al.telefono || '—'}</span>
                    </div>
                    <div className="rpt-info-item rpt-info-full">
                      <span className="rpt-info-label">Dirección</span>
                      <span className="rpt-info-value">{al.direccion || '—'}</span>
                    </div>
                    {al.observaciones && (
                      <div className="rpt-info-item rpt-info-full">
                        <span className="rpt-info-label">Observaciones</span>
                        <span className="rpt-info-value">{al.observaciones}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="rpt-card">
                <h3 className="rpt-card-title">🏫 Información de Inscripción</h3>
                <div className="rpt-card-body">
                  <div className="rpt-info-grid">
                    <div className="rpt-info-item">
                      <span className="rpt-info-label">Clave</span>
                      <span className="rpt-info-value" style={{ fontFamily: 'monospace' }}>{al.clave}</span>
                    </div>
                    <div className="rpt-info-item">
                      <span className="rpt-info-label">Código estudiante</span>
                      <span className="rpt-info-value" style={{ fontFamily: 'monospace' }}>{al.codigo_estudiante || '—'}</span>
                    </div>
                    <div className="rpt-info-item">
                      <span className="rpt-info-label">Fecha de inscripción</span>
                      <span className="rpt-info-value">{fmtFecha(al.fecha_inicio)}</span>
                    </div>
                    <div className="rpt-info-item">
                      <span className="rpt-info-label">Grado</span>
                      <span className="rpt-info-value">{al.grado || '—'}</span>
                    </div>
                    <div className="rpt-info-item">
                      <span className="rpt-info-label">Sección</span>
                      <span className="rpt-info-value">{al.seccion || '—'}</span>
                    </div>
                    <div className="rpt-info-item">
                      <span className="rpt-info-label">Maestro guía</span>
                      <span className="rpt-info-value">{al.maestro_guia || '—'}</span>
                    </div>
                    <div className="rpt-info-item">
                      <span className="rpt-info-label">Plan de clases</span>
                      <span className="rpt-info-value">{al.plan_clases || '—'}</span>
                    </div>
                    <div className="rpt-info-item">
                      <span className="rpt-info-label">Días de clase</span>
                      <span className="rpt-info-value">{diasInscripcion}</span>
                    </div>
                    <div className="rpt-info-item">
                      <span className="rpt-info-label">Horario</span>
                      <span className="rpt-info-value">{al.horario || '—'}</span>
                    </div>
                    <div className="rpt-info-item">
                      <span className="rpt-info-label">Cuota mensual</span>
                      <span className="rpt-info-value">Q {parseFloat(al.cuota_mensual || 0).toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Acceso al sistema */}
            <div className="rpt-card">
              <button type="button" className="rpt-section-toggle" onClick={() => setAccesoAbierto(v => !v)} aria-expanded={accesoAbierto}>
                <span className="rpt-section-toggle-title">🔐 Acceso al Sistema</span>
                <span className="rpt-section-toggle-action">
                  <span className="rpt-section-toggle-text">{accesoAbierto ? 'Ocultar' : 'Ver'}</span>
                  <span className={`rpt-section-toggle-icon ${accesoAbierto ? 'open' : ''}`}>▼</span>
                </span>
              </button>
              {accesoAbierto && (
                <div className="rpt-section-body">
                  <div className="rpt-info-grid">
                    <div className="rpt-info-item">
                      <span className="rpt-info-label">Correo electrónico</span>
                      <span className="rpt-info-value email-val">{al.email || '—'}</span>
                    </div>
                    <div className="rpt-info-item">
                      <span className="rpt-info-label">Contraseña</span>
                      <span className="rpt-info-value pass-val">🔒 Protegida (cifrada)</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Cursos del grado */}
            <div className="rpt-card">
              <h3 className="rpt-card-title">📚 Cursos {al.grado ? `— ${al.grado}` : ''}</h3>
              <div className="rpt-card-body">
                {!al.grado ? (
                  <div style={{ color: '#999', fontSize: '0.88rem' }}>El alumno no tiene grado asignado.</div>
                ) : cursos.length === 0 ? (
                  <div style={{ color: '#999', fontSize: '0.88rem' }}>
                    No hay cursos configurados para este grado. Agrégalos en <strong>Configuración → Grados</strong>.
                  </div>
                ) : (
                  <div className="rpt-cursos-grid">
                    {cursos.map(c => (
                      <div key={c.id} className="rpt-curso-card">
                        <div className="rpt-curso-nombre">{c.nombre}</div>
                        <div className="rpt-curso-info">👨‍🏫 {c.maestro || 'Sin maestro asignado'}</div>
                        {(c.dias?.length > 0 || fmtHorarioCurso(c)) && (
                          <div className="rpt-curso-info">
                            🗓️ {[(c.dias || []).join(', '), fmtHorarioCurso(c)].filter(Boolean).join(' · ')}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Asistencia (calendario por mes) */}
            <div className="rpt-card">
              <h3 className="rpt-card-title">📅 Asistencia — {anio}</h3>
              <div className="rpt-card-body">
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <label style={{ fontSize: '0.82rem', fontWeight: 600 }}>Filtrar por curso:</label>
                    <select value={cursoFiltro} onChange={e => setCursoFiltro(e.target.value)}
                            style={{ padding: '0.4rem 0.6rem', borderRadius: 8, border: '1.5px solid #e0e0e0', fontSize: '0.85rem' }}>
                      <option value="">Todos los días</option>
                      {cursos.map(c => <option key={c.id} value={c.nombre}>{c.nombre}</option>)}
                    </select>
                  </div>
                  <span style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                    {Object.entries(ASIST_COLORES).map(([k, v]) => (
                      <span key={k} style={{ background: v.bg, color: v.color, borderRadius: 4, padding: '1px 7px', fontWeight: 700, fontSize: '0.76rem' }}>
                        {v.label} = {ASIST_LABELS[k]}
                      </span>
                    ))}
                  </span>
                </div>

                <div style={{ fontSize: '0.82rem', color: '#555', marginBottom: '0.75rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <span>Asistió: <strong style={{ color: '#1b5e20' }}>{resumenAsist.x}</strong></span>
                  <span>Recuperó: <strong style={{ color: '#4527a0' }}>{resumenAsist.r}</strong></span>
                  <span>Faltas: <strong style={{ color: '#b71c1c' }}>{resumenAsist.f}</strong></span>
                  <span>Enfermo: <strong style={{ color: '#e65100' }}>{resumenAsist.e}</strong></span>
                  <span>Permiso: <strong style={{ color: '#0d47a1' }}>{resumenAsist.p}</strong></span>
                  <span>Total marcas: <strong>{resumenAsist.total}</strong></span>
                </div>

                {Object.keys(mesesConDatos).length === 0 ? (
                  <div style={{ color: '#999', fontSize: '0.88rem' }}>
                    Sin registros de asistencia para {anio}{cursoFiltro ? ` en el curso ${cursoFiltro}` : ''}.
                  </div>
                ) : (
                  <div className="rpt-meses-lista">
                    {MESES.map((_, i) => {
                      const num = i + 1;
                      const datos = mesesConDatos[num];
                      if (!datos) return null;
                      const abierto = !!mesesAbiertos[num];
                      return (
                        <div key={num} className="rpt-mes-card">
                          <button type="button" className="rpt-section-toggle" onClick={() => toggleMes(num)} aria-expanded={abierto}>
                            <span className="rpt-section-toggle-title">
                              {MESES_LABEL[i]}
                              <span className="rpt-section-badge">
                                {datos.x + datos.r} asist. · {datos.f} falta(s)
                              </span>
                            </span>
                            <span className="rpt-section-toggle-action">
                              <span className="rpt-section-toggle-text">{abierto ? 'Ocultar' : 'Ver'}</span>
                              <span className={`rpt-section-toggle-icon ${abierto ? 'open' : ''}`}>▼</span>
                            </span>
                          </button>
                          {abierto && (
                            <div className="rpt-section-body">
                              <MonthCalendar anio={anio} mes={num} asistMap={asistMap} allowedDows={allowedDows} />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Pagos */}
            <div className="rpt-card">
              <h3 className="rpt-card-title">💰 Pagos — Año {anio}</h3>
              {pagVisibles.length === 0 ? (
                <div className="rpt-card-body" style={{ color: '#999', fontSize: '0.88rem' }}>
                  Sin registros de pago para {anio}.
                </div>
              ) : (
                <>
                  {proximoPago && (
                    <div style={{ margin: '0.75rem 1.25rem 0', padding: '0.6rem 1rem', background: '#e3f2fd', border: '1.5px solid #90caf9', borderRadius: 8, fontSize: '0.85rem', fontWeight: 600, color: '#0d47a1' }}>
                      📅 Próximo mes a pagar: <strong style={{ textTransform: 'capitalize' }}>{proximoPago.mes}</strong> — Q {montoReal(proximoPago).toFixed(2)}
                    </div>
                  )}
                  <div className="pagos-grid">
                    {pagVisibles.map(p => {
                      const tipoPago = clasificarPago(p);
                      const nr = (p.no_recibo || '').trim();
                      let cardCls = 'pago-card', badgeCls = '', badgeTxt = '';
                      if (tipoPago === 'acreditado')     { cardCls += ' descuento'; badgeCls = 'descuento-b'; badgeTxt = p.acreditado_msg || 'Gratis'; }
                      else if (tipoPago === 'anulado')   { cardCls += ' anulado';   badgeCls = 'anulado-b';   badgeTxt = 'Anulado'; }
                      else if (tipoPago === 'descuento') { cardCls += ' descuento'; badgeCls = 'descuento-b'; badgeTxt = '100% desc.'; }
                      else if (tipoPago === 'cancelado') { cardCls += ' pagado';    badgeCls = 'pagado-b';    badgeTxt = 'Cancelado'; }
                      else if (tipoPago === 'abono')     { cardCls += ' abono';     badgeCls = 'abono-b';     badgeTxt = 'Abono'; }
                      else                              { cardCls += ' pendiente'; badgeCls = 'pendiente-b'; badgeTxt = 'Pendiente'; }
                      return (
                        <div key={p.id || p.mes} className={cardCls}>
                          <div className="pago-mes">{p.mes}</div>
                          <span className={`pago-estado-badge ${badgeCls}`}>{badgeTxt}</span>
                          <div className="pago-monto">{tipoPago === 'acreditado' ? '—' : `Q ${montoReal(p).toFixed(2)}`}</div>
                          <div className="pago-detalle">
                            {tipoPago === 'cancelado' && <>
                              <span>Recibo: <strong>{nr}</strong></span>
                              {p.fecha_pago && <span>Fecha: {fmtFecha(p.fecha_pago)}</span>}
                            </>}
                            {tipoPago === 'abono' && <>
                              <span>Abonado: <strong>Q {parseFloat(p.monto_abonado).toFixed(2)}</strong></span>
                              <span style={{ color: '#c62828' }}>Pendiente: <strong>Q {(parseFloat(p.monto) - parseFloat(p.monto_abonado)).toFixed(2)}</strong></span>
                            </>}
                            {tipoPago === 'pendiente' && <span style={{ color: '#f57f17' }}>Sin pagar</span>}
                            {tipoPago === 'acreditado' && <span style={{ color: '#0d47a1' }}>Mes acreditado / no se cobra</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="pagos-resumen">
                    <div className="pagos-resumen-item">Cancelados: <span>{pagosResumen.cancelados}</span></div>
                    <div className="pagos-resumen-item">Pendientes: <span>{pagosResumen.pendientes}</span></div>
                    <div className="pagos-resumen-item">Total cobrado: <span>Q {pagosResumen.total.toFixed(2)}</span></div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default ReporteAlumnoInstitucion;
