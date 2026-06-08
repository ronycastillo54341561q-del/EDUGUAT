import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Sidebar from '../../components/Sidebar';
import ScrollableTable from '../../components/ScrollableTable';
import api from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import { useAniosFiltros } from '../../lib/anios';
import ReporteAlumnoInstitucion from './ReporteAlumnoInstitucion';
import './admin.css';
import './ReporteAlumno.css';

const MESES = [
  'enero','febrero','marzo','abril','mayo','junio',
  'julio','agosto','septiembre','octubre','noviembre','diciembre'
];

const NOTA_MINIMA = 60;

const COLORES_GRAFICO = [
  '#1a237e', '#e65100', '#1b5e20', '#880e4f',
  '#0277bd', '#4527a0', '#00695c', '#bf360c'
];

const MESES_ASIST = [
  { num: 1, label: 'Enero' },    { num: 2,  label: 'Febrero' },
  { num: 3, label: 'Marzo' },    { num: 4,  label: 'Abril' },
  { num: 5, label: 'Mayo' },     { num: 6,  label: 'Junio' },
  { num: 7, label: 'Julio' },    { num: 8,  label: 'Agosto' },
  { num: 9, label: 'Septiembre'},{ num: 10, label: 'Octubre' },
  { num: 11, label: 'Noviembre'},{ num: 12, label: 'Diciembre' },
];

const ASIST_COLORES = {
  x: { bg: '#c8e6c9', color: '#1b5e20', label: 'X' },
  e: { bg: '#fff9c4', color: '#e65100', label: 'E' },
  p: { bg: '#bbdefb', color: '#0d47a1', label: 'P' },
  f: { bg: '#ffcdd2', color: '#b71c1c', label: 'F' },
  r: { bg: '#d1c4e9', color: '#4527a0', label: 'R' },
};

const ASIST_LABELS = {
  x: 'Asistió',
  e: 'Enfermo',
  p: 'Permiso',
  f: 'Falta',
  r: 'Recuperó',
};

const fmtFecha = (f) => {
  if (!f) return '—';
  const d = new Date(f);
  return d.toLocaleDateString('es-GT', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

// Determina el estado del pago usando el campo pagado y monto_abonado
const clasificarPago = (p) => {
  if (p.acreditado)                            return 'acreditado';
  if (p.anulado)                               return 'anulado';
  if (p.descuento_100)                         return 'descuento';
  if (p.pagado)                                return 'cancelado';
  if ((parseFloat(p.monto_abonado) || 0) > 0) return 'abono';
  return 'pendiente';
};

// Normaliza nombre de materia/diplomado para comparación tolerante.
const normTxt = s => String(s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().trim();

// ─── Gráfico de línea SVG (tipo bolsa de valores) ────────────────────────────
const GraficoLineal = ({ cols, anios, byAnio }) => {
  if (!cols?.length || anios.length === 0) {
    return <p className="grafico-sin-datos">No hay notas de diplomados registradas.</p>;
  }

  const W = 700, H = 240;
  const ML = 45, MR = 26, MT = 24, MB = 52;
  const plotW = W - ML - MR;
  const plotH = H - MT - MB;
  const n     = cols.length;

  const xPos = i  => ML + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const yPos = v  => MT + plotH - (v / 100) * plotH;

  const yTicks = [0, 20, 40, 60, 80, 100];

  return (
    <div>
      <div className="grafico-anios-leyenda">
        {anios.map((a, i) => (
          <div key={a} className="grafico-leyenda-item">
            <div className="grafico-leyenda-dot" style={{ background: COLORES_GRAFICO[i % COLORES_GRAFICO.length] }} />
            {a}
          </div>
        ))}
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }}>
        {yTicks.map(t => (
          <g key={t}>
            <line
              x1={ML} y1={yPos(t)} x2={ML + plotW} y2={yPos(t)}
              stroke={t === NOTA_MINIMA ? '#ffcdd2' : '#e8eaf6'}
              strokeWidth={t === NOTA_MINIMA ? '1.5' : '1'}
              strokeDasharray={t === NOTA_MINIMA ? '5 3' : undefined}
            />
            <text x={ML - 6} y={yPos(t) + 4} fontSize="10" textAnchor="end" fill={t === NOTA_MINIMA ? '#e57373' : '#aaa'}>
              {t}
            </text>
          </g>
        ))}
        <text x={ML + plotW + 3} y={yPos(NOTA_MINIMA) + 4} fontSize="9" fill="#e57373">mín</text>

        {cols.map((c, i) => (
          <line key={c.key} x1={xPos(i)} y1={MT} x2={xPos(i)} y2={MT + plotH} stroke="#f0f0f0" strokeWidth="1" />
        ))}

        <line x1={ML} y1={MT}          x2={ML}          y2={MT + plotH} stroke="#d0d0d0" strokeWidth="1.5" />
        <line x1={ML} y1={MT + plotH}  x2={ML + plotW}  y2={MT + plotH} stroke="#d0d0d0" strokeWidth="1.5" />

        {cols.map((c, i) => (
          <text key={c.key} x={xPos(i)} y={H - MB + 18} fontSize="10" textAnchor="middle" fill="#555">
            {c.label}
          </text>
        ))}

        {anios.map((anio, ai) => {
          const color  = COLORES_GRAFICO[ai % COLORES_GRAFICO.length];
          const notas  = byAnio[anio] || {};
          const points = cols.map((c, i) => {
            const v = notas[c.key] != null ? parseFloat(notas[c.key]) : null;
            return { x: xPos(i), y: v != null ? yPos(v) : null, v };
          });

          let dPath = '', inLine = false;
          for (const p of points) {
            if (p.y == null) { inLine = false; continue; }
            if (!inLine) { dPath += `M ${p.x.toFixed(1)} ${p.y.toFixed(1)} `; inLine = true; }
            else          dPath += `L ${p.x.toFixed(1)} ${p.y.toFixed(1)} `;
          }

          return (
            <g key={anio}>
              {dPath && (() => {
                const valid = points.filter(p => p.y != null);
                if (valid.length < 2) return null;
                const areaPath = dPath + ` L ${valid[valid.length-1].x.toFixed(1)} ${(MT+plotH).toFixed(1)} L ${valid[0].x.toFixed(1)} ${(MT+plotH).toFixed(1)} Z`;
                return <path d={areaPath} fill={color} fillOpacity="0.07" />;
              })()}
              {dPath && (
                <path d={dPath} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
              )}
              {points.map((p, i) => p.y != null && (
                <g key={i}>
                  <circle cx={p.x} cy={p.y} r="4.5" fill={color} stroke="white" strokeWidth="1.5" />
                  <text x={p.x} y={p.y - 9} fontSize="9" textAnchor="middle" fill={color} fontWeight="700">
                    {p.v?.toFixed(0)}
                  </text>
                </g>
              ))}
            </g>
          );
        })}
      </svg>
    </div>
  );
};

// ─── Tarjeta colapsable: encabezado tipo botón "Ver" ─────────────────────────
const SeccionColapsable = ({ titulo, abierta, onToggle, badge, children }) => (
  <div className="rpt-card">
    <button
      type="button"
      className="rpt-section-toggle"
      onClick={onToggle}
      aria-expanded={abierta}
    >
      <span className="rpt-section-toggle-title">
        {titulo}
        {badge}
      </span>
      <span className="rpt-section-toggle-action">
        <span className="rpt-section-toggle-text">
          {abierta ? 'Ocultar' : 'Ver'}
        </span>
        <span className={`rpt-section-toggle-icon ${abierta ? 'open' : ''}`}>▼</span>
      </span>
    </button>
    {abierta && <div className="rpt-section-body">{children}</div>}
  </div>
);

// ─── Despachador por tipo de inquilino ───────────────────────────────────────
const ReporteAlumno = () => {
  const { sede } = useAuth();
  if (sede?.tipo === 'institucion') return <ReporteAlumnoInstitucion />;
  return <ReporteAlumnoAcademia />;
};

// ─── Componente principal (academias) ────────────────────────────────────────
const ReporteAlumnoAcademia = () => {
  const { anios: ANIOS_FILTRO } = useAniosFiltros();
  const [busqueda,     setBusqueda]     = useState('');
  const [sugerencias,  setSugerencias]  = useState([]);
  const [alumnoSel,    setAlumnoSel]    = useState(null);
  const [mostrarSug,   setMostrarSug]   = useState(false);
  const [reporte,      setReporte]      = useState(null);
  const [cargando,     setCargando]     = useState(false);
  const [error,        setError]        = useState('');
  const [mostrarGrafs, setMostrarGrafs] = useState({});
  const [seccionAbierta, setSeccionAbierta] = useState({
    acceso: false,
    mec: false,
    tac: false,
  });
  // Diplomados abiertos por id (el actual se abre por defecto al cargar reporte).
  const [dipAbiertos, setDipAbiertos] = useState({});
  const [anio,         setAnio]         = useState(() => {
    const saved = localStorage.getItem('pag_anio');
    return saved ? parseInt(saved) : new Date().getFullYear();
  });

  const searchRef = useRef(null);
  const debounceR = useRef(null);

  useEffect(() => {
    const h = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target))
        setMostrarSug(false);
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
    } catch {
      setSugerencias([]);
    }
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
    setMostrarGrafs({});
    setSeccionAbierta({ acceso: false, mec: false, tac: false });
    setDipAbiertos({});
  };

  const generarReporte = async () => {
    if (!alumnoSel) return;
    setCargando(true);
    setError('');
    setReporte(null);
    setMostrarGrafs({});
    setSeccionAbierta({ acceso: false, mec: false, tac: false });
    setDipAbiertos({});
    try {
      const { data } = await api.get(`/reporte/alumno/${alumnoSel.id}?anio=${anio}`);
      setReporte(data);
      // Abre por defecto solo el diplomado actual del alumno (si existe).
      const catalogo = data?.diplomadosCatalogo || [];
      const actual = catalogo.find(d => normTxt(d.nombre) === normTxt(data?.alumno?.diplomado));
      if (actual) setDipAbiertos({ [actual.id]: true });
    } catch (err) {
      setError(err.response?.data?.message || 'Error al generar el reporte');
    } finally {
      setCargando(false);
    }
  };

  // ── Derivaciones del reporte ──────────────────────────────────────────────
  const al   = reporte?.alumno;
  const mec  = reporte?.mecanografia || [];
  const tac  = reporte?.tac          || [];
  const dip  = reporte?.diplomados   || [];
  const catalogo = reporte?.diplomadosCatalogo || [];
  const pag  = reporte?.pagos        || [];
  const asistRaw = reporte?.asistencia || [];

  const asistMap = asistRaw.reduce((acc, a) => {
    acc[`${a.mes}_${a.semana}`] = String(a.estado || '').toLowerCase();
    return acc;
  }, {});
  const totalAsistidas = asistRaw.filter(a => {
    const e = String(a.estado || '').toLowerCase();
    return e === 'x' || e === 'r';
  }).length;
  const totalRegistros = asistRaw.length;

  const tacPorNivel = useMemo(() => {
    const norm = v => String(v || '').replace(/\D/g, '') || String(v || '').trim();
    const m = { 1: [], 2: [], 3: [] };
    for (const t of tac) {
      const lvl = parseInt(norm(t.tac), 10);
      if (lvl >= 1 && lvl <= 3) m[lvl].push(t);
    }
    for (const k of Object.keys(m)) m[k].sort((a, b) => a.anio - b.anio);
    return m;
  }, [tac]);

  // Diplomados con columnas dinámicas desde el catálogo del backend.
  // Para evitar que una materia compartida (p. ej. "Parcial") aparezca en
  // varios diplomados a la vez, se desambigua igual que en notas-diplomados:
  //   - si el examen sólo existe en un diplomado → ahí va la nota
  //   - si existe en varios → prefiere el diplomado actual del alumno;
  //     si no coincide con ninguno, se asigna al primero del catálogo.
  const dipPorTipo = useMemo(() => {
    if (!catalogo.length) return [];

    // Índice: materia normalizada → [{ dipId, examName }]
    const examIdx = new Map();
    for (const d of catalogo) {
      for (const ex of (d.examenes || [])) {
        const k = normTxt(ex.nombre);
        if (!examIdx.has(k)) examIdx.set(k, []);
        examIdx.get(k).push({ dipId: d.id, examName: ex.nombre });
      }
    }
    const dipActualNombre = normTxt(al?.diplomado);

    // Por diplomado: año → { examName(canónico): nota }
    const porDip = new Map();
    for (const d of catalogo) porDip.set(d.id, {});

    for (const n of dip) {
      const k = normTxt(n.materia);
      const candidatos = examIdx.get(k) || [];
      if (!candidatos.length) continue;
      let elegido;
      if (candidatos.length === 1) {
        elegido = candidatos[0];
      } else {
        const match = candidatos.find(c => {
          const dipNombre = normTxt(catalogo.find(x => x.id === c.dipId)?.nombre);
          return dipNombre === dipActualNombre;
        });
        elegido = match || candidatos[0];
      }
      const bucket = porDip.get(elegido.dipId);
      if (!bucket[n.anio]) bucket[n.anio] = {};
      bucket[n.anio][elegido.examName] = n.nota;
    }

    return catalogo.map(d => {
      const cols = [...(d.examenes || [])]
        .sort((a, b) => a.orden - b.orden)
        .map(e => ({ key: e.nombre, label: e.nombre }));
      const byAnio = porDip.get(d.id) || {};
      const anios = Object.keys(byAnio).map(Number).sort((a, b) => a - b);
      const esActual = normTxt(d.nombre) === dipActualNombre;
      return { dip: d, cols, anios, byAnio, esActual };
    });
  }, [catalogo, dip, al]);

  const pagVisibles = pag.filter(p => {
    if (p.esperado === false) {
      return p.pagado || p.acreditado || (parseFloat(p.monto_abonado) || 0) > 0;
    }
    return true;
  });

  const proximoPago = pagVisibles.find(p => {
    const t = clasificarPago(p);
    return t === 'pendiente' || t === 'abono';
  });

  const pagosResumen = {
    cancelados:  pagVisibles.filter(p => clasificarPago(p) === 'cancelado').length,
    abonos:      pagVisibles.filter(p => clasificarPago(p) === 'abono').length,
    pendientes:  pagVisibles.filter(p => clasificarPago(p) === 'pendiente').length,
    acreditados: pagVisibles.filter(p => clasificarPago(p) === 'acreditado').length,
    anulados:    pagVisibles.filter(p => p.anulado).length,
    total: pagVisibles.reduce((s, p) => {
      const t = clasificarPago(p);
      if (t === 'cancelado') return s + (parseFloat(p.monto) || parseFloat(al?.cuota_mensual || 0));
      if (t === 'abono')     return s + (parseFloat(p.monto_abonado) || 0);
      return s;
    }, 0),
  };

  const [regalando, setRegalando] = useState(null);
  const [regalandoErr, setRegalandoErr] = useState('');

  const confirmarRegalar = async () => {
    if (!regalando) return;
    setRegalandoErr('');
    try {
      const p = regalando.p;
      const msg = (regalando.mensaje || 'Gratis').trim() || 'Gratis';
      if (p.id) {
        await api.post(`/mensualidades/${p.id}/acreditar`, { mensaje: msg });
      } else {
        const mesNum = MESES.indexOf(p.mes) + 1;
        await api.post('/mensualidades/acreditar-directo', {
          alumno_id: al.id, anio, mes_num: mesNum, mensaje: msg,
        });
      }
      setRegalando(null);
      const { data } = await api.get(`/reporte/alumno/${al.id}?anio=${anio}`);
      setReporte(data);
    } catch (err) {
      setRegalandoErr(err.response?.data?.message || 'Error al regalar el mes.');
    }
  };

  const quitarRegalo = async (p) => {
    if (!p.id) return;
    if (!window.confirm(`¿Quitar el acreditamiento de ${p.mes}?`)) return;
    try {
      await api.delete(`/mensualidades/${p.id}/acreditar`);
      const { data } = await api.get(`/reporte/alumno/${al.id}?anio=${anio}`);
      setReporte(data);
    } catch (err) {
      console.error(err);
    }
  };

  const notaCls = (v) => {
    if (v == null) return 'nota-sin';
    return v >= NOTA_MINIMA ? 'nota-aprobada' : 'nota-reprobada';
  };

  const montoReal = (p) => {
    const tipo = clasificarPago(p);
    if (tipo === 'cancelado') return parseFloat(p.monto) || parseFloat(al?.cuota_mensual || 0);
    if (tipo === 'abono')     return parseFloat(p.monto_abonado) || 0;
    if (tipo === 'pendiente') return parseFloat(p.monto) || parseFloat(al?.cuota_mensual || 0);
    return parseFloat(p.monto || 0) || parseFloat(al?.cuota_mensual || 0);
  };

  const toggleSeccion = (k) => setSeccionAbierta(s => ({ ...s, [k]: !s[k] }));
  const toggleDip = (id) => setDipAbiertos(s => ({ ...s, [id]: !s[id] }));

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="admin-layout">
      <Sidebar />
      <main className="admin-content">
        <h1>📊 Reporte de Alumno</h1>
        <p className="subtitle">Busca un alumno y genera su reporte completo de información académica y financiera</p>

        {/* ── Buscador ── */}
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
                    <div
                      key={a.id}
                      className="rpt-suggestion-item"
                      onMouseDown={() => seleccionarAlumno(a)}
                    >
                      <span className="rpt-sug-nombre">{a.nombre} {a.apellido}</span>
                      <span className="rpt-sug-codigo">{a.clave}{a.codigo_estudiante ? ` · ${a.codigo_estudiante}` : ''}</span>
                      <span className={`badge ${a.estado === 'activo' ? 'badge-activo' : 'badge-retirado'}`}>
                        {a.estado}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 600, whiteSpace: 'nowrap' }}>Año de pagos:</label>
              <select
                value={anio}
                onChange={e => setAnio(parseInt(e.target.value))}
                style={{ padding: '0.5rem 0.75rem', borderRadius: 8, border: '1.5px solid #e0e0e0', fontFamily: 'inherit', fontSize: '0.88rem' }}
              >
                {ANIOS_FILTRO.map(y => <option key={y}>{y}</option>)}
              </select>
            </div>

            <button
              className="btn-primary"
              onClick={generarReporte}
              disabled={!alumnoSel || cargando}
            >
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

        {/* ── Reporte ── */}
        {reporte && al && (
          <div className="rpt-reporte">

            {/* Cabecera */}
            <div className="rpt-header">
              <div>
                <h2>{al.nombre} {al.apellido}</h2>
                <p>Clave: <strong>{al.clave}</strong>{al.codigo_estudiante ? <> · Código: <strong>{al.codigo_estudiante}</strong></> : null} · {al.diplomado} · {al.tac}</p>
              </div>
              <span className={`badge ${al.estado === 'activo' ? 'badge-activo' : 'badge-retirado'}`}>
                {al.estado}
              </span>
            </div>

            {/* ── Datos personales + Académico (siempre visibles) ── */}
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
                    <div className="rpt-info-item rpt-info-full">
                      <span className="rpt-info-label">Establecimiento</span>
                      <span className="rpt-info-value">{al.establecimiento || '—'}</span>
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
                <h3 className="rpt-card-title">🎓 Información Académica</h3>
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
                      <span className="rpt-info-label">Fecha de inicio</span>
                      <span className="rpt-info-value">{fmtFecha(al.fecha_inicio)}</span>
                    </div>
                    <div className="rpt-info-item">
                      <span className="rpt-info-label">Diplomado</span>
                      <span className="rpt-info-value">{al.diplomado || '—'}</span>
                    </div>
                    <div className="rpt-info-item">
                      <span className="rpt-info-label">TAC</span>
                      <span className="rpt-info-value">{al.tac || '—'}</span>
                    </div>
                    <div className="rpt-info-item">
                      <span className="rpt-info-label">Horario</span>
                      <span className="rpt-info-value">{al.horario || '—'}</span>
                    </div>
                    <div className="rpt-info-item">
                      <span className="rpt-info-label">Laboratorio</span>
                      <span className="rpt-info-value">{al.laboratorio || '—'}</span>
                    </div>
                    <div className="rpt-info-item">
                      <span className="rpt-info-label">Días de clase</span>
                      <span className="rpt-info-value">
                        {[al.dia_clases1, al.dia_clases2].filter(Boolean).join(', ') || '—'}
                      </span>
                    </div>
                    <div className="rpt-info-item">
                      <span className="rpt-info-label">Cuota mensual</span>
                      <span className="rpt-info-value">Q {parseFloat(al.cuota_mensual || 0).toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Acceso al sistema (colapsable) ── */}
            <SeccionColapsable
              titulo="🔐 Acceso al Sistema"
              abierta={seccionAbierta.acceso}
              onToggle={() => toggleSeccion('acceso')}
            >
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
            </SeccionColapsable>

            {/* ── Mecanografía (colapsable) ── */}
            <SeccionColapsable
              titulo="⌨️ Notas de Mecanografía"
              badge={
                <span className="rpt-section-badge">
                  {mec.length === 0 ? 'sin registros' : `${mec.length} año(s)`}
                </span>
              }
              abierta={seccionAbierta.mec}
              onToggle={() => toggleSeccion('mec')}
            >
              {mec.length === 0 ? (
                <div style={{ color: '#999', fontSize: '0.88rem', padding: '0.5rem 0' }}>Sin registros de mecanografía.</div>
              ) : (
                mec.map(m => {
                  const lecs     = Array.from({ length: 20 }, (_, i) => ({ num: i + 1, nota: m[`l${i + 1}`] }));
                  const aprobadas = lecs.filter(l => l.nota != null && parseFloat(l.nota) >= NOTA_MINIMA).length;
                  const conNota   = lecs.filter(l => l.nota != null).length;
                  return (
                    <div key={m.anio}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.25rem 0' }}>
                        <span className="mec-anio-tag">Año {m.anio}</span>
                        <span style={{ fontSize: '0.78rem', color: '#666' }}>
                          {aprobadas} aprobadas de {conNota} lecciones registradas
                        </span>
                      </div>
                      <div className="mec-lecciones-grid" style={{ padding: '0.5rem 0' }}>
                        {lecs.map(l => {
                          const n   = l.nota != null ? parseFloat(l.nota) : null;
                          const cls = n == null ? 'vacia' : n >= NOTA_MINIMA ? 'aprobada' : 'reprobada';
                          return (
                            <div key={l.num} className={`mec-leccion ${cls}`}>
                              <div className="mec-lec-num">L{l.num}</div>
                              <div className={`mec-lec-nota ${cls}`}>
                                {n != null ? n.toFixed(0) : '—'}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      {m.examen != null && (
                        <div className="mec-examen-row">
                          <span>📝 Examen Final</span>
                          <span className="mec-examen-nota">{parseFloat(m.examen).toFixed(2)}</span>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </SeccionColapsable>

            {/* ── Notas TAC (colapsable) ── */}
            <SeccionColapsable
              titulo="📝 Notas TAC"
              badge={(() => {
                const filas = [1, 2, 3].reduce((s, n) => s + (tacPorNivel[n]?.length || 0), 0);
                return (
                  <span className="rpt-section-badge">
                    {filas === 0 ? 'sin registros' : `${filas} registro(s)`}
                  </span>
                );
              })()}
              abierta={seccionAbierta.tac}
              onToggle={() => toggleSeccion('tac')}
            >
              <ScrollableTable>
                <table className="tac-tabla">
                  <thead>
                    <tr>
                      <th>Nivel</th>
                      <th>Año</th>
                      <th>Unidad 1</th>
                      <th>Unidad 2</th>
                      <th>Unidad 3</th>
                      <th>Unidad 4</th>
                      <th>Promedio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[1, 2, 3].flatMap(nivel => {
                      const filas = tacPorNivel[nivel] || [];
                      if (!filas.length) {
                        return [(
                          <tr key={`tac-${nivel}-vacio`}>
                            <td><span className="dip-anio-badge">TAC {nivel}</span></td>
                            <td colSpan={6} style={{ color: '#999', fontStyle: 'italic' }}>
                              Sin notas registradas
                            </td>
                          </tr>
                        )];
                      }
                      return filas.map(t => {
                        const vals = [t.nota1, t.nota2, t.nota3, t.nota4]
                          .map(v => v != null ? parseFloat(v) : null);
                        const conNota = vals.filter(v => v != null);
                        const prom = conNota.length
                          ? (conNota.reduce((s, v) => s + v, 0) / conNota.length).toFixed(2)
                          : null;
                        return (
                          <tr key={`tac-${nivel}-${t.anio}-${t.id || ''}`}>
                            <td><span className="dip-anio-badge">TAC {nivel}</span></td>
                            <td style={{ textAlign: 'center', color: '#666' }}>{t.anio}</td>
                            {vals.map((v, vi) => (
                              <td key={vi} className={notaCls(v)}>
                                {v != null ? v.toFixed(2) : '—'}
                              </td>
                            ))}
                            <td className={`tac-prom-cell ${notaCls(prom ? parseFloat(prom) : null)}`}>
                              {prom ?? '—'}
                            </td>
                          </tr>
                        );
                      });
                    })}
                  </tbody>
                </table>
              </ScrollableTable>
            </SeccionColapsable>

            {/* ── Notas Diplomados — una sección colapsable por diplomado ── */}
            {dipPorTipo.length === 0 ? (
              <div className="rpt-card">
                <h3 className="rpt-card-title">🎓 Notas de Diplomados</h3>
                <div className="rpt-card-body" style={{ color: '#999', fontSize: '0.88rem' }}>
                  No hay diplomados configurados.
                </div>
              </div>
            ) : (
              dipPorTipo.map(({ dip: d, cols, anios: aniosTipo, byAnio: byAnioTipo, esActual }) => {
                const abierta = !!dipAbiertos[d.id];
                const mostrarG = !!mostrarGrafs[d.id];
                return (
                  <div key={d.id} className="rpt-card">
                    <button
                      type="button"
                      className="rpt-section-toggle"
                      onClick={() => toggleDip(d.id)}
                      aria-expanded={abierta}
                    >
                      <span className="rpt-section-toggle-title">
                        🎓 Diplomado: {d.nombre}
                        {esActual && <span className="dip-tipo-badge">Actual</span>}
                        <span className="rpt-section-badge">
                          {aniosTipo.length === 0 ? 'sin registros' : `${aniosTipo.length} año(s)`}
                        </span>
                      </span>
                      <span className="rpt-section-toggle-action">
                        <span className="rpt-section-toggle-text">{abierta ? 'Ocultar' : 'Ver notas'}</span>
                        <span className={`rpt-section-toggle-icon ${abierta ? 'open' : ''}`}>▼</span>
                      </span>
                    </button>
                    {abierta && (
                      <>
                        <ScrollableTable>
                          <table className="dip-tabla dip-tabla-cols">
                            <thead>
                              <tr>
                                <th style={{ minWidth: 64 }}>Año</th>
                                {cols.map(c => (
                                  <th key={c.key} style={{ textAlign: 'center' }}>{c.label}</th>
                                ))}
                                <th style={{ textAlign: 'center' }}>Promedio</th>
                              </tr>
                            </thead>
                            <tbody>
                              {cols.length === 0 ? (
                                <tr>
                                  <td colSpan={2} style={{ textAlign: 'center', color: '#bbb', fontStyle: 'italic', padding: '0.75rem' }}>
                                    Este diplomado no tiene exámenes configurados.
                                  </td>
                                </tr>
                              ) : aniosTipo.length === 0 ? (
                                <tr>
                                  <td colSpan={cols.length + 2} style={{ textAlign: 'center', color: '#bbb', fontStyle: 'italic', padding: '0.75rem' }}>
                                    Sin registros
                                  </td>
                                </tr>
                              ) : aniosTipo.map(anioRow => {
                                const notas   = byAnioTipo[anioRow] || {};
                                const vals    = cols.map(c => notas[c.key] != null ? parseFloat(notas[c.key]) : null);
                                const conVals = vals.filter(v => v != null);
                                const prom    = conVals.length ? conVals.reduce((s, v) => s + v, 0) / conVals.length : null;
                                return (
                                  <tr key={anioRow}>
                                    <td><span className="dip-anio-badge">{anioRow}</span></td>
                                    {vals.map((v, i) => (
                                      <td key={i} className={notaCls(v)} style={{ textAlign: 'center', fontWeight: 700 }}>
                                        {v != null ? v.toFixed(2) : '—'}
                                      </td>
                                    ))}
                                    <td className={`tac-prom-cell ${notaCls(prom)}`} style={{ textAlign: 'center' }}>
                                      {prom != null ? prom.toFixed(2) : '—'}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </ScrollableTable>
                        {cols.length > 0 && aniosTipo.length > 0 && (
                          <>
                            <button
                              className="rpt-grafico-toggle"
                              onClick={() => setMostrarGrafs(prev => ({ ...prev, [d.id]: !prev[d.id] }))}
                              style={{ borderTop: '1px solid #f0f0f0', background: '#f8f9ff', borderBottom: mostrarG ? '2px solid #e8eaf6' : 'none' }}
                            >
                              <span className="rpt-grafico-toggle-label">📈 Gráfico de Desempeño</span>
                              <span className={`rpt-grafico-toggle-icon ${mostrarG ? 'open' : ''}`}>▼</span>
                            </button>
                            {mostrarG && (
                              <div className="grafico-body">
                                <GraficoLineal cols={cols} anios={aniosTipo} byAnio={byAnioTipo} />
                              </div>
                            )}
                          </>
                        )}
                      </>
                    )}
                  </div>
                );
              })
            )}

            {/* ── Pagos ── */}
            <div className="rpt-card">
              <h3 className="rpt-card-title">💰 Pagos — Año {anio}</h3>

              {pagVisibles.length === 0 ? (
                <div className="rpt-card-body" style={{ color: '#999', fontSize: '0.88rem' }}>
                  Sin registros de pago para {anio}.
                </div>
              ) : (
                <>
                  {proximoPago && (
                    <div style={{
                      margin: '0.75rem 1.25rem 0',
                      padding: '0.6rem 1rem',
                      background: '#e3f2fd',
                      border: '1.5px solid #90caf9',
                      borderRadius: 8,
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      color: '#0d47a1'
                    }}>
                      📅 Próximo mes a pagar: <strong style={{ textTransform: 'capitalize' }}>{proximoPago.mes}</strong>
                      {' '}— Q {montoReal(proximoPago).toFixed(2)}
                    </div>
                  )}

                  <div className="pagos-grid">
                    {pagVisibles.map(p => {
                      const tipoPago  = clasificarPago(p);
                      const nr        = (p.no_recibo || '').trim();
                      const esProximo = proximoPago && p.id === proximoPago.id;

                      let cardCls = 'pago-card';
                      let badgeCls = '', badgeTxt = '';

                      if (tipoPago === 'acreditado')     { cardCls += ' descuento'; badgeCls = 'descuento-b'; badgeTxt = p.acreditado_msg || 'Gratis'; }
                      else if (tipoPago === 'anulado')   { cardCls += ' anulado';   badgeCls = 'anulado-b';   badgeTxt = 'Anulado'; }
                      else if (tipoPago === 'descuento') { cardCls += ' descuento'; badgeCls = 'descuento-b'; badgeTxt = '100% desc.'; }
                      else if (tipoPago === 'cancelado') { cardCls += ' pagado';    badgeCls = 'pagado-b';    badgeTxt = 'Cancelado'; }
                      else if (tipoPago === 'abono')     { cardCls += ' abono';     badgeCls = 'abono-b';     badgeTxt = 'Abono'; }
                      else if (esProximo)                { cardCls += ' proximo';   badgeCls = 'proximo-b';   badgeTxt = 'Pendiente'; }
                      else                              { cardCls += ' pendiente'; badgeCls = 'pendiente-b'; badgeTxt = 'Pendiente'; }

                      const puedeRegalar = tipoPago === 'pendiente' || tipoPago === 'abono';
                      const puedeQuitarRegalo = tipoPago === 'acreditado';

                      return (
                        <div key={p.id || p.mes} className={cardCls} style={{ position: 'relative' }}>
                          <div className="pago-mes">
                            {p.mes}
                            {esProximo && tipoPago === 'pendiente' && (
                              <span className="pago-mes-proximo">Próximo</span>
                            )}
                          </div>
                          <span className={`pago-estado-badge ${badgeCls}`}>{badgeTxt}</span>
                          <div className="pago-monto">
                            {tipoPago === 'acreditado' ? '—' : `Q ${montoReal(p).toFixed(2)}`}
                          </div>
                          <div className="pago-detalle">
                            {tipoPago === 'acreditado' && <span style={{ color: '#0d47a1' }}>Mes acreditado / no se cobra</span>}
                            {tipoPago === 'cancelado' && <>
                              <span>Recibo: <strong>{nr}</strong></span>
                              {p.fecha_pago && <span>Fecha: {fmtFecha(p.fecha_pago)}</span>}
                            </>}
                            {tipoPago === 'abono' && <>
                              <span>Abonado: <strong>Q {parseFloat(p.monto_abonado).toFixed(2)}</strong></span>
                              <span style={{ color: '#c62828' }}>
                                Pendiente: <strong>Q {(parseFloat(p.monto) - parseFloat(p.monto_abonado)).toFixed(2)}</strong>
                              </span>
                              {nr && <span>Recibo: <strong>{nr}</strong></span>}
                            </>}
                            {tipoPago === 'pendiente' && <span style={{ color: '#f57f17' }}>Sin pagar</span>}
                            {tipoPago === 'anulado'   && <span style={{ color: '#9e9e9e' }}>Anulado</span>}
                          </div>
                          {puedeRegalar && (
                            <button
                              onClick={() => setRegalando({ p, mensaje: 'Gratis' })}
                              title="Regalar este mes (acreditarlo como gratis)"
                              style={{
                                position: 'absolute', top: 6, right: 6,
                                background: '#e8eaf6', color: '#1a237e',
                                border: 'none', borderRadius: 4,
                                padding: '2px 6px', fontSize: '0.7rem',
                                cursor: 'pointer', fontWeight: 600,
                              }}
                            >
                              🎁 Regalar
                            </button>
                          )}
                          {puedeQuitarRegalo && (
                            <button
                              onClick={() => quitarRegalo(p)}
                              title="Quitar el acreditamiento"
                              style={{
                                position: 'absolute', top: 6, right: 6,
                                background: '#fff', color: '#c62828',
                                border: '1px solid #ffcdd2', borderRadius: 4,
                                padding: '2px 6px', fontSize: '0.7rem',
                                cursor: 'pointer', fontWeight: 600,
                              }}
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div className="pagos-resumen">
                    <div className="pagos-resumen-item">Cancelados: <span>{pagosResumen.cancelados}</span></div>
                    {pagosResumen.abonos > 0 && (
                      <div className="pagos-resumen-item" style={{ color: '#e65100' }}>Con abono: <span>{pagosResumen.abonos}</span></div>
                    )}
                    {pagosResumen.acreditados > 0 && (
                      <div className="pagos-resumen-item" style={{ color: '#0d47a1' }}>Acreditados: <span>{pagosResumen.acreditados}</span></div>
                    )}
                    <div className="pagos-resumen-item">Pendientes: <span>{pagosResumen.pendientes}</span></div>
                    <div className="pagos-resumen-item">Anulados: <span>{pagosResumen.anulados}</span></div>
                    <div className="pagos-resumen-item">Total cobrado: <span>Q {pagosResumen.total.toFixed(2)}</span></div>
                  </div>
                </>
              )}
            </div>

            {/* ── Asistencia del año del reporte ── */}
            <div className="rpt-card">
              <h3 className="rpt-card-title">📅 Asistencia — {anio}</h3>
              {asistRaw.length === 0 ? (
                <div className="rpt-card-body" style={{ color: '#999', fontSize: '0.88rem' }}>
                  Sin registros de asistencia para {anio}.
                </div>
              ) : (
                <>
                  <div style={{ padding: '0.5rem 1.25rem 0', fontSize: '0.82rem', color: '#555', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <span>Total asistencias: <strong style={{ color: '#1b5e20' }}>{totalAsistidas}</strong></span>
                    <span>Total registros: <strong>{totalRegistros}</strong></span>
                    <span style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      {Object.entries(ASIST_COLORES).map(([k, v]) => (
                        <span key={k} style={{ background: v.bg, color: v.color,marginBottom: 5 ,borderRadius: 4, padding: '1px 7px', fontWeight: 700, fontSize: '0.78rem' }}>
                          {v.label} = {ASIST_LABELS[k]}
                        </span>
                      ))}
                    </span>
                  </div>
                  <ScrollableTable>
                    <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.82rem', margin: '0.75rem 1.25rem 1rem' }}>
                      <thead>
                        <tr>
                          <th style={{ textAlign: 'left', padding: '5px 10px', background: '#f5f5f5', fontWeight: 700, borderBottom: '2px solid #e0e0e0', minWidth: 100 }}>Mes</th>
                          {[1,2,3,4,5].map(s => (
                            <th key={s} style={{ textAlign: 'center', padding: '5px 8px', background: '#f5f5f5', fontWeight: 700, borderBottom: '2px solid #e0e0e0', minWidth: 50 }}>Sem {s}</th>
                          ))}
                          <th style={{ textAlign: 'center', padding: '5px 8px', background: '#e8eaf6', fontWeight: 700, borderBottom: '2px solid #c5cae9', color: '#1a237e', minWidth: 60 }}>Asist.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {MESES_ASIST.map(({ num, label }) => {
                          const celdas = [1,2,3,4,5].map(s => asistMap[`${num}_${s}`] || '');
                          const asistMes = celdas.filter(c => c === 'x' || c === 'r').length;
                          const tieneDatos = celdas.some(c => c !== '');
                          return (
                            <tr key={num} style={{ borderBottom: '1px solid #f0f0f0' }}>
                              <td style={{ padding: '4px 10px', fontWeight: 600, color: tieneDatos ? '#333' : '#bbb' }}>{label}</td>
                              {celdas.map((c, i) => {
                                const col = c ? ASIST_COLORES[c] : null;
                                return (
                                  <td key={i} style={{
                                    textAlign: 'center', padding: '4px 6px',
                                    background: col ? col.bg : 'transparent',
                                    color: col ? col.color : '#ccc',
                                    fontWeight: col ? 700 : 400,
                                    borderRadius: 4,
                                  }}>
                                    {col ? col.label : '—'}
                                  </td>
                                );
                              })}
                              <td style={{ textAlign: 'center', padding: '4px 8px', fontWeight: 700, color: asistMes > 0 ? '#1b5e20' : '#bbb', background: '#f8f9ff' }}>
                                {tieneDatos ? asistMes : '—'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </ScrollableTable>
                </>
              )}
            </div>

          </div>
        )}

        {regalando && (
          <div
            onClick={() => setRegalando(null)}
            style={{
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
              zIndex: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <div
              onClick={e => e.stopPropagation()}
              style={{
                background: '#fff', borderRadius: 12, padding: '1.5rem',
                width: '92%', maxWidth: 420,
                boxShadow: '0 6px 20px rgba(0,0,0,0.2)',
              }}
            >
              <h2 style={{ marginTop: 0, color: '#1a237e' }}>🎁 Regalar mes</h2>
              <p style={{ color: '#444', fontSize: '0.92rem' }}>
                Vas a acreditar <strong style={{ textTransform: 'capitalize' }}>{regalando.p.mes}</strong> de {anio} para
                <strong> {al.nombre} {al.apellido}</strong>. El mes no se cobrará y aparecerá con el mensaje en su estado de pagos.
              </p>
              <label style={{ fontSize: '0.78rem', color: '#555' }}>Mensaje a mostrar</label>
              <input
                type="text"
                value={regalando.mensaje}
                onChange={e => setRegalando({ ...regalando, mensaje: e.target.value })}
                placeholder="Gratis"
                autoFocus
                style={{
                  width: '100%', boxSizing: 'border-box',
                  padding: '0.5rem 0.7rem', fontSize: '0.9rem',
                  border: '1.5px solid #c5cae9', borderRadius: 6, marginTop: 4,
                }}
              />
              {regalandoErr && (
                <div style={{ color: '#c62828', fontSize: '0.85rem', marginTop: 8 }}>{regalandoErr}</div>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
                <button className="btn-cancel" onClick={() => setRegalando(null)}>Cancelar</button>
                <button className="btn-primary" onClick={confirmarRegalar}>Regalar mes</button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default ReporteAlumno;
