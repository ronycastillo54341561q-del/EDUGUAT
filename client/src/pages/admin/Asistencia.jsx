import { useState, useEffect, useCallback, useMemo } from 'react';
import Sidebar from '../../components/Sidebar';
import ScrollableTable from '../../components/ScrollableTable';
import API from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import { useAniosFiltros } from '../../lib/anios';
import AsistenciaInstitucion from './AsistenciaInstitucion';
import './admin.css';

const MESES = [
  { num: 1,  label: 'ENE' }, { num: 2,  label: 'FEB' }, { num: 3,  label: 'MAR' },
  { num: 4,  label: 'ABR' }, { num: 5,  label: 'MAY' }, { num: 6,  label: 'JUN' },
  { num: 7,  label: 'JUL' }, { num: 8,  label: 'AGO' }, { num: 9,  label: 'SEP' },
  { num: 10, label: 'OCT' }, { num: 11, label: 'NOV' }, { num: 12, label: 'DIC' },
];
const SEMANAS = [1, 2, 3, 4, 5];

const COLORES = {
  x: { bg: '#c8e6c9', color: '#1b5e20', bord: '#81c784' },
  e: { bg: '#fff9c4', color: '#e65100', bord: '#ffe082' },
  p: { bg: '#bbdefb', color: '#0d47a1', bord: '#64b5f6' },
  f: { bg: '#ffcdd2', color: '#b71c1c', bord: '#ef9a9a' },
  r: { bg: '#d1c4e9', color: '#4527a0', bord: '#9575cd' },
};

// Paleta de colores para los bloques de programa
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

// Mapeo de nombre de día en español a getDay() (0=Dom)
const DIA_SEMANA = {
  'Domingo': 0, 'Lunes': 1, 'Martes': 2,
  'Miércoles': 3, 'Miercoles': 3,
  'Jueves': 4, 'Viernes': 5,
  'Sábado': 6, 'Sabado': 6,
};

const anioActual = new Date().getFullYear();
const mesActualNum = new Date().getMonth() + 1;

const cid = (alumnoId, mes, semana) => `c-${alumnoId}-${mes}-${semana}`;

// Index de columna en el grid de 60 celdas (12 × 5)
const colIdxOf = (mes, sem) => (mes - 1) * 5 + (sem - 1);

/**
 * Para una secuencia de programas, asigna cada semana a la ocurrencia real del
 * día de clase en el calendario, comenzando en `mesInicio` del año `anio`.
 * Se detiene al terminar el año (las semanas que excedan se omiten).
 *
 * Retorna array de: { key, progIdx, programaId, programaNombre, duracion,
 * semanaNum, mesNum, semanaEnMes, isExamen }
 */
function calcSlots(anio, mesInicio, diaNombre, programas) {
  const dayNum = DIA_SEMANA[diaNombre];
  if (dayNum === undefined || !programas.length) return [];

  const totalSemanas = programas.reduce((s, p) => s + p.duracion_semanas, 0);
  if (totalSemanas === 0) return [];

  const ocurrencias = [];
  for (let mes = mesInicio; mes <= 12; mes++) {
    const d = new Date(anio, mes - 1, 1);
    while (d.getMonth() === mes - 1) {
      if (d.getDay() === dayNum) {
        ocurrencias.push({ mesNum: mes, semanaEnMes: Math.ceil(d.getDate() / 7) });
      }
      d.setDate(d.getDate() + 1);
    }
  }

  const slots = [];
  let idx = 0;
  programas.forEach((prog, progIdx) => {
    for (let s = 1; s <= prog.duracion_semanas; s++) {
      if (idx >= ocurrencias.length) return;
      const occ = ocurrencias[idx++];
      slots.push({
        key:            `${prog.id}_${s}`,
        progIdx,
        programaId:     prog.id,
        programaNombre: prog.nombre,
        duracion:       prog.duracion_semanas,
        semanaNum:      s,
        mesNum:         occ.mesNum,
        semanaEnMes:    occ.semanaEnMes,
        isExamen:       s === prog.duracion_semanas,
      });
    }
  });
  return slots;
}

// Despachador por tipo de inquilino: las instituciones usan asistencia diaria
// (por mes/semana), las academias el grid anual semanal de siempre.
export default function Asistencia() {
  const { sede } = useAuth();
  if (sede?.tipo === 'institucion') return <AsistenciaInstitucion />;
  return <AsistenciaAcademia />;
}

function AsistenciaAcademia() {
  const ls = (k, d) => localStorage.getItem(k) ?? d;
  const { anios: ANIOS } = useAniosFiltros();

  const [anio,         setAnio]         = useState(() => parseInt(ls('asist_anio', anioActual)) || anioActual);
  const [laboratorio,  setLaboratorio]  = useState(() => ls('asist_lab',     ''));
  const [estadoFiltro, setEstadoFiltro] = useState(() => ls('asist_estado',  'activo'));
  // Filtro combinado: "dia1|dia2|horario" (dia2 puede ser vacío). Reemplaza
  // los selects separados de día y horario por una sola opción concatenada
  // (ej. "lunes 10:00 a 11:30" o "lunes-martes 10:00 a 11:30").
  const [comboHorario, setComboHorario] = useState(() => ls('asist_combo', ''));
  const [mesInicio,    setMesInicio]    = useState(() => parseInt(ls('asist_mes_ini', String(mesActualNum))) || mesActualNum);

  // Desestructura el combo en {dia, dia2, horario} para enviar al backend y
  // alimentar el cálculo de planificación.
  const [dia, dia2Combo, horarioCombo] = useMemo(() => {
    const parts = (comboHorario || '').split('|');
    return [parts[0] || '', parts[1] || '', parts[2] || ''];
  }, [comboHorario]);

  // Migración: el formato viejo guardaba un único programaId en `asist_prog`.
  const [dipSelIds, setDipSelIds] = useState(() => {
    try {
      const raw = ls('asist_dips', null);
      if (raw) return JSON.parse(raw);
    } catch { /* fallthrough */ }
    const legacy = ls('asist_prog', '');
    return legacy ? [String(legacy)] : [];
  });

  const [showPlan, setShowPlan] = useState(() => ls('asist_show_plan', 'false') === 'true');

  const [filtros, setFiltros] = useState({ horarios: [], laboratorios: [], dias: [] });
  // Padrón completo para derivar las opciones de los selects en función
  // del estado seleccionado: si filtras "Activos" sólo aparecen
  // horarios/labs/combos donde hay al menos un alumno activo.
  const [todosAlumnos, setTodosAlumnos] = useState([]);

  const [alumnos,   setAlumnos]   = useState([]);
  const [programas, setProgramas] = useState([]);
  const [cargando,  setCargando]  = useState(false);

  const [pending,   setPending]   = useState({});
  const [guardando, setGuardando] = useState(false);
  const [msg,       setMsg]       = useState('');
  const [mesWidths, setMesWidths] = useState(
    () => Object.fromEntries(MESES.map(m => [m.num, 28]))
  );

  const hasChanges = Object.keys(pending).length > 0;

  useEffect(() => { localStorage.setItem('asist_anio',    anio);                        }, [anio]);
  useEffect(() => { localStorage.setItem('asist_lab',     laboratorio);                 }, [laboratorio]);
  useEffect(() => { localStorage.setItem('asist_estado',  estadoFiltro);                }, [estadoFiltro]);
  useEffect(() => { localStorage.setItem('asist_combo',   comboHorario);                }, [comboHorario]);
  useEffect(() => { localStorage.setItem('asist_mes_ini', String(mesInicio));           }, [mesInicio]);
  useEffect(() => { localStorage.setItem('asist_dips',    JSON.stringify(dipSelIds));   }, [dipSelIds]);
  useEffect(() => { localStorage.setItem('asist_show_plan', String(showPlan));          }, [showPlan]);

  useEffect(() => {
    API.get('/asistencia/filtros').then(({ data }) => setFiltros(data)).catch(console.error);
    API.get('/diplomados').then(({ data }) => setProgramas(data)).catch(console.error);
    API.get('/alumnos').then(({ data }) => setTodosAlumnos(data)).catch(console.error);
  }, []);

  // Padrón restringido al estado activo/retirado seleccionado. Sirve sólo
  // para alimentar las opciones de los selects (no afecta la grid).
  const alumnosParaFiltros = useMemo(
    () => estadoFiltro
      ? todosAlumnos.filter(a => a.estado === estadoFiltro)
      : todosAlumnos,
    [todosAlumnos, estadoFiltro]
  );

  const labsActivosSet = useMemo(
    () => new Set(alumnosParaFiltros.map(a => a.laboratorio).filter(Boolean)),
    [alumnosParaFiltros]
  );
  const combosActivosSet = useMemo(
    () => new Set(alumnosParaFiltros.map(a =>
      `${a.dia_clases1 || ''}|${a.dia_clases2 || ''}|${a.horario || ''}`
    )),
    [alumnosParaFiltros]
  );

  // Programas seleccionados en el orden en que se marcaron
  const programasSel = useMemo(
    () => dipSelIds.map(id => programas.find(p => String(p.id) === String(id))).filter(Boolean),
    [dipSelIds, programas]
  );

  const canShowPlan = !!dia && programasSel.length > 0;
  const planActive  = showPlan && canShowPlan;

  const slots = useMemo(
    () => planActive ? calcSlots(anio, mesInicio, dia, programasSel) : [],
    [planActive, anio, mesInicio, dia, programasSel]
  );

  // Bloques por programa → colSpan (cubre celdas vacías intermedias dentro del rango)
  const progBlocks = useMemo(() => {
    if (!slots.length) return [];
    const blocks = [];
    for (const s of slots) {
      const idx = colIdxOf(s.mesNum, s.semanaEnMes);
      const last = blocks[blocks.length - 1];
      if (last && last.programaId === s.programaId) {
        last.endIdx = idx;
        if (s.isExamen) last.examIdx = idx;
      } else {
        blocks.push({
          programaId:     s.programaId,
          programaNombre: s.programaNombre,
          progIdx:        s.progIdx,
          duracion:       s.duracion,
          startIdx:       idx,
          endIdx:         idx,
          examIdx:        s.isExamen ? idx : -1,
        });
      }
    }
    return blocks;
  }, [slots]);

  // Map colIdx → { block, isReal, slot } para pintar celdas
  const cellPlanMap = useMemo(() => {
    const map = new Map();
    if (!slots.length) return map;
    // Rango visual de cada bloque (incluye huecos)
    for (const b of progBlocks) {
      for (let i = b.startIdx; i <= b.endIdx; i++) {
        map.set(i, { block: b, slot: null });
      }
    }
    // Marcar celdas con clase real (slot)
    for (const s of slots) {
      const idx = colIdxOf(s.mesNum, s.semanaEnMes);
      const prev = map.get(idx) || {};
      map.set(idx, { ...prev, slot: s });
    }
    return map;
  }, [slots, progBlocks]);

  // Fila de bloques de programa (th con colSpan para encabezado)
  const planHeaderCells = useMemo(() => {
    if (!progBlocks.length) return [];
    const cells = [];
    let cursor = 0;
    for (const b of progBlocks) {
      if (b.startIdx > cursor) cells.push({ kind: 'gap', colSpan: b.startIdx - cursor });
      cells.push({ kind: 'prog', colSpan: b.endIdx - b.startIdx + 1, block: b });
      cursor = b.endIdx + 1;
    }
    if (cursor < 60) cells.push({ kind: 'gap', colSpan: 60 - cursor });
    return cells;
  }, [progBlocks]);

  const cargarGrid = useCallback(async () => {
    setCargando(true);
    setPending({});
    try {
      const p = new URLSearchParams({ anio });
      if (horarioCombo) p.append('horario',      horarioCombo);
      if (laboratorio)  p.append('laboratorio',  laboratorio);
      if (estadoFiltro) p.append('estado',       estadoFiltro);
      if (dia)          p.append('dia',          dia);
      if (dia2Combo)    p.append('dia2',         dia2Combo);
      const { data } = await API.get(`/asistencia/grid?${p}`);
      setAlumnos(data);
    } catch (err) { console.error(err); }
    finally { setCargando(false); }
  }, [anio, horarioCombo, laboratorio, estadoFiltro, dia, dia2Combo]);

  useEffect(() => { cargarGrid(); }, [cargarGrid]);

  // Normaliza a minúscula porque la importación masiva guarda 'X','E','P','F','R'
  // mientras que la edición manual guarda 'x','e','p','f','r'.  El lookup de
  // colores y la lógica del grid asumen minúscula.
  const getVal = (alumnoId, mes, semana, asistencias) => {
    const key = `${alumnoId}_${mes}_${semana}`;
    const raw = key in pending ? pending[key] : (asistencias[`${mes}_${semana}`] || '');
    return raw ? String(raw).toLowerCase() : '';
  };

  const setVal = (alumnoId, mes, semana, val) => {
    setPending(prev => ({ ...prev, [`${alumnoId}_${mes}_${semana}`]: val }));
  };

  const navigate = (alumnoId, mes, semana, dir) => {
    const ai = alumnos.findIndex(a => a.id === alumnoId);
    if (ai < 0) return;
    let nm = mes, ns = semana, na = ai;

    if (dir === 'right') {
      if (ns < 5) ns++;
      else if (nm < 12) { nm++; ns = 1; }
      else if (na < alumnos.length - 1) { na++; nm = 1; ns = 1; }
    } else if (dir === 'left') {
      if (ns > 1) ns--;
      else if (nm > 1) { nm--; ns = 5; }
      else if (na > 0) { na--; nm = 12; ns = 5; }
    } else if (dir === 'down') {
      if (na < alumnos.length - 1) na++;
    } else if (dir === 'up') {
      if (na > 0) na--;
    }

    document.getElementById(cid(alumnos[na]?.id, nm, ns))?.focus();
  };

  const handleKey = (e, alumnoId, mes, semana) => {
    const k = e.key.toLowerCase();
    if (['x', 'e', 'p', 'f', 'r'].includes(k)) {
      e.preventDefault();
      setVal(alumnoId, mes, semana, k);
      return;
    }
    if (k === 'delete' || k === 'backspace') {
      e.preventDefault();
      setVal(alumnoId, mes, semana, '');
      return;
    }
    const dirs = { arrowleft:'left', arrowright:'right', arrowup:'up', arrowdown:'down' };
    if (dirs[k]) { e.preventDefault(); navigate(alumnoId, mes, semana, dirs[k]); }
  };

  const guardarCambios = async () => {
    if (!hasChanges) return;
    setGuardando(true);
    try {
      const cambios = Object.entries(pending).map(([key, estado]) => {
        const [alumno_id, mes, semana] = key.split('_').map(Number);
        return { alumno_id, mes, semana, estado: estado || null };
      });
      await API.post('/asistencia/lote', { anio, cambios });

      setAlumnos(prev => prev.map(a => {
        const base = { ...a.asistencias };
        Object.entries(pending).forEach(([key, val]) => {
          const [aid, mes, sem] = key.split('_').map(Number);
          if (aid !== a.id) return;
          const k = `${mes}_${sem}`;
          if (val) base[k] = val; else delete base[k];
        });
        return { ...a, asistencias: base };
      }));
      setPending({});
      setMsg('ok');
      setTimeout(() => setMsg(''), 3000);
    } catch {
      setMsg('err');
      setTimeout(() => setMsg(''), 3000);
    } finally {
      setGuardando(false);
    }
  };

  const startResize = (e, mesNum) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = mesWidths[mesNum];
    const onMove = ev => {
      const diff = ev.clientX - startX;
      setMesWidths(prev => ({ ...prev, [mesNum]: Math.max(16, Math.round(startW + diff / 5)) }));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const toggleDip = (id) => {
    const sid = String(id);
    setDipSelIds(prev => prev.includes(sid) ? prev.filter(x => x !== sid) : [...prev, sid]);
  };

  const moverDip = (sid, dir) => {
    setDipSelIds(prev => {
      const i = prev.indexOf(sid);
      if (i < 0) return prev;
      const to = i + dir;
      if (to < 0 || to >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[to]] = [next[to], next[i]];
      return next;
    });
  };

  const totalSemsPlan = programasSel.reduce((s, p) => s + p.duracion_semanas, 0);
  const slotsFaltantes = Math.max(0, totalSemsPlan - slots.length);

  return (
    <div className="admin-layout">
      <Sidebar />
      <div className="admin-content">
        <h1>Control de Asistencia</h1>
        <p className="subtitle">
          Escribe en cada celda: <strong>x</strong> asistió · <strong>e</strong> enfermo · <strong>p</strong> permiso · <strong>f</strong> falta · <strong>r</strong> recuperó · <kbd>Delete</kbd> borra · flechas navegan
        </p>

        {/* Filtros */}
        <div className="asist-filtros">
          <select value={anio} onChange={e => setAnio(Number(e.target.value))}>
            {ANIOS.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <select value={estadoFiltro} onChange={e => setEstadoFiltro(e.target.value)}>
            <option value="activo">Activos</option>
            <option value="retirado">Retirados</option>
            <option value="">Todos</option>
          </select>
          {filtros.horarios_combinados?.length > 0 && (
            <select
              value={comboHorario}
              onChange={e => setComboHorario(e.target.value)}
              title="Día(s) + horario de clase"
              style={{ minWidth: 200 }}
            >
              <option value="">Todos los días/horarios</option>
              {filtros.horarios_combinados
                .filter(c => combosActivosSet.has(`${c.dia1}|${c.dia2 || ''}|${c.horario}`))
                .map(c => (
                  <option
                    key={`${c.dia1}|${c.dia2 || ''}|${c.horario}`}
                    value={`${c.dia1}|${c.dia2 || ''}|${c.horario}`}
                  >
                    {c.label}
                  </option>
                ))}
            </select>
          )}
          <select value={laboratorio} onChange={e => setLaboratorio(e.target.value)}>
            <option value="">Todos los laboratorios</option>
            {filtros.laboratorios
              .filter(l => labsActivosSet.has(l))
              .map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>

        {/* Leyenda */}
        <div style={{ display:'flex', gap:'1rem', marginBottom:'0.75rem', flexWrap:'wrap', alignItems:'center' }}>
          {Object.entries(COLORES).map(([k, c]) => {
            const labels = { x:'Asistió', e:'Enfermo', p:'Permiso', f:'Falta', r:'Recuperó' };
            return (
              <span key={k} style={{ display:'inline-flex', alignItems:'center', gap:'5px', fontSize:'0.78rem', fontWeight:700, color:c.color }}>
                <span style={{ background:c.bg, border:`1px solid ${c.bord}`, borderRadius:'4px', padding:'1px 7px', fontWeight:800 }}>
                  {k.toUpperCase()}
                </span>
                {labels[k]}
              </span>
            );
          })}
        </div>

        {/* Barra de guardar */}
        {hasChanges && (
          <div className="asist-save-bar">
            <span style={{ fontSize:'0.88rem', color:'#7b5800' }}>
              {Object.keys(pending).length} cambio(s) pendiente(s)
            </span>
            <div style={{ display:'flex', gap:'0.5rem' }}>
              <button className="btn-cancel" onClick={() => setPending({})} disabled={guardando}>
                Descartar
              </button>
              <button className="btn-primary" onClick={guardarCambios} disabled={guardando}>
                {guardando ? 'Guardando...' : 'Guardar Cambios'}
              </button>
            </div>
          </div>
        )}

        {msg === 'ok'  && <div className="msg-ok"  style={{ marginBottom:'0.75rem' }}>Cambios guardados correctamente</div>}
        {msg === 'err' && <div className="msg-err" style={{ marginBottom:'0.75rem' }}>Error al guardar cambios</div>}

        {/* Tabla grid */}
        <div className="table-container">
          {cargando ? (
            <div style={{ textAlign:'center', padding:'3rem', color:'#999' }}>Cargando...</div>
          ) : (
            <ScrollableTable>
              <table className="asist-grid" style={{ tableLayout: 'fixed' }}>
                <colgroup>
                  <col style={{ width: '80px' }} />
                  <col style={{ width: '160px' }} />
                  {MESES.flatMap(m =>
                    SEMANAS.map(s => (
                      <col key={`${m.num}-${s}`} style={{ width: `${mesWidths[m.num]}px` }} />
                    ))
                  )}
                </colgroup>
                <thead>
                  {/* Fila de bloques de programa (planificación) */}
                  {planActive && planHeaderCells.length > 0 && (
                    <tr>
                      <th className="ag-th-fijo" colSpan={2} style={{
                        background: '#f8f9ff', color: '#1a237e', fontSize: '0.7rem',
                        fontWeight: 700, textAlign: 'left', paddingLeft: '8px',
                      }}>
                        Planificación
                      </th>
                      {planHeaderCells.map((c, i) => {
                        if (c.kind === 'gap') {
                          return (
                            <th key={`gap-${i}`} colSpan={c.colSpan} style={{
                              background: '#fafafa', border: '1px solid #eee', padding: 0,
                            }} />
                          );
                        }
                        const pc = PROG_COLORS[c.block.progIdx % PROG_COLORS.length];
                        return (
                          <th key={`prog-${c.block.programaId}-${i}`} colSpan={c.colSpan} style={{
                            background: pc.bg, color: pc.text,
                            fontSize: '0.72rem', fontWeight: 700,
                            textAlign: 'center', padding: '4px 6px',
                            border: `1px solid ${pc.bg}`,
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                          }}
                            title={`${c.block.programaNombre} — ${c.block.duracion} semanas`}
                          >
                            {c.block.programaNombre} ({c.block.duracion}s)
                          </th>
                        );
                      })}
                    </tr>
                  )}

                  {/* Fila de meses */}
                  <tr>
                    <th className="ag-th-fijo">Clave</th>
                    <th className="ag-th-fijo ag-th-nombre">Alumno</th>
                    {MESES.map(m => (
                      <th key={m.num} colSpan={5} className={`ag-th-mes${m.num > 1 ? ' ag-mes-inicio' : ''}`}
                          style={{ position: 'relative', overflow: 'visible' }}>
                        {m.label}
                        <span className="ag-resize-handle" onMouseDown={e => startResize(e, m.num)} />
                      </th>
                    ))}
                  </tr>

                  {/* Fila de semanas */}
                  <tr>
                    <th className="ag-th-fijo" />
                    <th className="ag-th-fijo ag-th-nombre" />
                    {MESES.flatMap(m =>
                      SEMANAS.map(s => {
                        const idx = colIdxOf(m.num, s);
                        const plan = cellPlanMap.get(idx);
                        const isExam = plan?.slot?.isExamen;
                        const pc = plan ? PROG_COLORS[plan.block.progIdx % PROG_COLORS.length] : null;
                        let bg, color;
                        if (isExam)      { bg = '#d32f2f'; color = '#fff'; }
                        else if (plan?.slot) { bg = pc.sub; color = pc.bg; }
                        else if (plan)   { bg = '#f0f0f0'; color = '#aaa'; }
                        return (
                          <th
                            key={`${m.num}-${s}`}
                            className={`ag-th-sem${s === 1 ? ' ag-mes-inicio' : ''}`}
                            style={bg ? { background: bg, color, fontWeight: 700 } : {}}
                            title={isExam ? `Examen — ${plan.block.programaNombre}` : (plan?.slot ? `${plan.block.programaNombre} S${plan.slot.semanaNum}` : undefined)}
                          >
                            {plan?.slot ? `S${plan.slot.semanaNum}` : `S${s}`}
                          </th>
                        );
                      })
                    )}
                  </tr>
                </thead>
                <tbody>
                  {alumnos.length === 0 ? (
                    <tr>
                      <td colSpan={62} style={{ textAlign:'center', padding:'2rem', color:'#999' }}>
                        No hay alumnos con los filtros seleccionados
                      </td>
                    </tr>
                  ) : (
                    alumnos.map(a => (
                      <tr key={a.id}>
                        <td className="ag-td-fijo ag-td-codigo" title={a.codigo_estudiante || 'sin código'}>{a.clave}</td>
                        <td className="ag-td-fijo ag-td-nombre">{a.nombre} {a.apellido}</td>
                        {MESES.flatMap(m =>
                          SEMANAS.map(s => {
                            const val       = getVal(a.id, m.num, s, a.asistencias);
                            const col       = COLORES[val] || {};
                            const isPending = `${a.id}_${m.num}_${s}` in pending;
                            const idx       = colIdxOf(m.num, s);
                            const plan      = cellPlanMap.get(idx);
                            const isExam    = plan?.slot?.isExamen;
                            const isRealClase = !!plan?.slot;
                            const inProgRange = !!plan && !plan.slot;
                            const bg = col.bg
                              || (isExam && !val ? '#fff3e0' : '')
                              || (inProgRange ? 'repeating-linear-gradient(45deg, #fafafa, #fafafa 3px, #f0f0f0 3px, #f0f0f0 6px)' : '');
                            return (
                              <td
                                key={`${m.num}-${s}`}
                                id={cid(a.id, m.num, s)}
                                tabIndex={0}
                                className={`ag-cell${s === 1 ? ' ag-mes-inicio' : ''}`}
                                style={{
                                  background: bg || undefined,
                                  outline: 'none',
                                  cursor: 'cell',
                                  borderTop: isExam ? '2px solid #ff6f00' : undefined,
                                  opacity: inProgRange && !val ? 0.55 : 1,
                                }}
                                title={
                                  isExam ? `Examen — ${plan.block.programaNombre}` :
                                  isRealClase ? `${plan.block.programaNombre} · Semana ${plan.slot.semanaNum}` :
                                  inProgRange ? `${plan.block.programaNombre} (sin clase este ${dia})` :
                                  undefined
                                }
                                onKeyDown={e => handleKey(e, a.id, m.num, s)}
                                onFocus={e => e.currentTarget.classList.add('ag-cell-focus')}
                                onBlur={e => e.currentTarget.classList.remove('ag-cell-focus')}
                              >
                                {val ? (
                                  <span style={{ color: col.color, fontWeight: isPending ? 900 : 700, fontSize:'0.72rem', userSelect:'none' }}>
                                    {val.toUpperCase()}
                                  </span>
                                ) : isExam ? (
                                  <span style={{ color: '#ff6f00', fontSize: '0.58rem', fontWeight: 800, userSelect: 'none', opacity: 0.6 }}>
                                    EX
                                  </span>
                                ) : null}
                              </td>
                            );
                          })
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </ScrollableTable>
          )}
        </div>
      </div>
    </div>
  );
}
