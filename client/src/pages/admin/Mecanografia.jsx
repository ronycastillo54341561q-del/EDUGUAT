import { useState, useEffect, useCallback, useMemo } from 'react';
import Sidebar from '../../components/Sidebar';
import ScrollableTable from '../../components/ScrollableTable';
import API from '../../api/axios';
import { useAniosFiltros } from '../../lib/anios';
import './admin.css';

const anioActual = new Date().getFullYear();
const COLS   = [
  ...Array.from({ length: 20 }, (_, i) => ({ key: `l${i + 1}`, label: `${i + 1}` })),
  { key: 'examen', label: 'Examen' },
];
const uniq = (arr, k) => [...new Set(arr.map(a => a[k]).filter(Boolean))].sort();
const ls   = (k, d)   => localStorage.getItem(k) ?? d;
const gradeColor = v => {
  if (v === '' || v == null) return '';
  const n = parseFloat(v);
  return isNaN(n) ? '' : n >= 60 ? '#c8e6c9' : '#ffcdd2';
};
const ncid = (id, col) => `nc-${id}-${col}`;
const toInt = val => {
  if (val === '' || val == null) return '';
  const n = parseInt(val, 10);
  if (isNaN(n)) return '';
  return String(Math.min(100, Math.max(0, n)));
};

export default function Mecanografia() {
  const { anios: ANIOS } = useAniosFiltros();
  const [anio,         setAnio]         = useState(() => parseInt(ls('mec_anio', anioActual)) || anioActual);
  const [fEstado,      setFEstado]      = useState(() => ls('mec_estado',  'activo'));
  const [fLaboratorio, setFLaboratorio] = useState(() => ls('mec_lab',     ''));
  // Combo unificado "dia1|dia2|horario" (mismo formato que en Asistencia/Alumnos).
  const [fCombo,       setFCombo]       = useState(() => ls('mec_combo',   ''));
  const [filtros,      setFiltros]      = useState({ horarios: [], laboratorios: [], dias: [], horarios_combinados: [] });
  const [alumnos,      setAlumnos]      = useState([]);
  // Padrón completo para alimentar las opciones de los selects según estado.
  const [todosAlumnos, setTodosAlumnos] = useState([]);
  const [cargando,     setCargando]     = useState(false);
  const [pending,      setPending]      = useState({});
  const [guardando,    setGuardando]    = useState(false);
  const [msg,          setMsg]          = useState('');

  // Desestructura el combo para enviar al backend.
  const [fDia, fDia2, fHorario] = useMemo(() => {
    const parts = (fCombo || '').split('|');
    return [parts[0] || '', parts[1] || '', parts[2] || ''];
  }, [fCombo]);

  useEffect(() => { localStorage.setItem('mec_anio',    anio);        }, [anio]);
  useEffect(() => { localStorage.setItem('mec_estado',  fEstado);     }, [fEstado]);
  useEffect(() => { localStorage.setItem('mec_combo',   fCombo);      }, [fCombo]);
  useEffect(() => { localStorage.setItem('mec_lab',     fLaboratorio);}, [fLaboratorio]);

  useEffect(() => {
    API.get('/asistencia/filtros').then(({ data }) => setFiltros(data)).catch(console.error);
    API.get('/alumnos').then(({ data }) => setTodosAlumnos(data)).catch(console.error);
  }, []);

  // Sólo alumnos del estado seleccionado, para alimentar los selects.
  const alumnosParaFiltros = useMemo(
    () => fEstado ? todosAlumnos.filter(a => a.estado === fEstado) : todosAlumnos,
    [todosAlumnos, fEstado]
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

  const cargar = useCallback(async () => {
    setCargando(true); setPending({});
    try {
      const p = new URLSearchParams({ anio });
      if (fEstado)      p.append('estado',      fEstado);
      if (fHorario)     p.append('horario',     fHorario);
      if (fLaboratorio) p.append('laboratorio', fLaboratorio);
      if (fDia)         p.append('dia',         fDia);
      if (fDia2)        p.append('dia2',        fDia2);
      const { data } = await API.get(`/mecanografia/notas?${p}`);
      setAlumnos(data);
    } catch (err) { console.error(err); }
    finally { setCargando(false); }
  }, [anio, fEstado, fHorario, fLaboratorio, fDia, fDia2]);

  useEffect(() => { cargar(); }, [cargar]);

  const getVal = (alumnoId, col) => {
    const k = `${alumnoId}_${col}`;
    if (k in pending) return pending[k];
    const a = alumnos.find(x => x.id === alumnoId);
    return a?.notas?.[col] ?? '';
  };

  const setVal = (alumnoId, col, raw) =>
    setPending(prev => ({ ...prev, [`${alumnoId}_${col}`]: toInt(raw) }));

  const navigate = (alumnoId, colKey, dir) => {
    const ai   = alumnos.findIndex(a => a.id === alumnoId);
    const ci   = COLS.findIndex(c => c.key === colKey);
    let na = ai, nc = ci;
    if (dir === 'right')  { nc < COLS.length - 1 ? nc++ : (na < alumnos.length - 1 && (na++, nc = 0)); }
    else if (dir === 'left')   { nc > 0 ? nc-- : (na > 0 && (na--, nc = COLS.length - 1)); }
    else if (dir === 'down')   { na < alumnos.length - 1 && na++; }
    else if (dir === 'up')     { na > 0 && na--; }
    document.getElementById(ncid(alumnos[na]?.id, COLS[nc]?.key))?.focus();
  };

  const handleKey = (e, alumnoId, colKey) => {
    const dirs = { ArrowRight:'right', ArrowLeft:'left', ArrowDown:'down', ArrowUp:'up' };
    if (dirs[e.key]) { e.preventDefault(); navigate(alumnoId, colKey, dirs[e.key]); }
    else if (e.key === 'Enter') { e.preventDefault(); navigate(alumnoId, colKey, 'down'); }
    else if (e.key === 'Tab')   { e.preventDefault(); navigate(alumnoId, colKey, e.shiftKey ? 'left' : 'right'); }
  };

  const hasChanges = Object.keys(pending).length > 0;

  const guardar = async () => {
    setGuardando(true);
    try {
      const cambios = Object.entries(pending).map(([k, valor]) => {
        const [alumno_id, ...rest] = k.split('_');
        return { alumno_id: Number(alumno_id), campo: rest.join('_'), valor: valor === '' ? null : valor };
      });
      await API.post('/mecanografia/notas', { anio, cambios });
      setAlumnos(prev => prev.map(a => {
        const notas = { ...a.notas };
        Object.entries(pending).forEach(([k, v]) => {
          const [aid, ...rest] = k.split('_');
          if (Number(aid) === a.id) notas[rest.join('_')] = v === '' ? null : v;
        });
        return { ...a, notas };
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
        <h1>⌨️ Mecanografía</h1>
        <p className="subtitle">Ingresa la nota de cada lección (0–100). Navega con flechas o Tab.</p>

        <div className="asist-filtros">
          <select value={anio} onChange={e => setAnio(Number(e.target.value))}>
            {ANIOS.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <select value={fEstado} onChange={e => setFEstado(e.target.value)}>
            <option value="activo">Activos</option>
            <option value="retirado">Retirados</option>
            <option value="">Todos</option>
          </select>
          {filtros.horarios_combinados?.length > 0 && (
            <select
              value={fCombo}
              onChange={e => setFCombo(e.target.value)}
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
          <select value={fLaboratorio} onChange={e => setFLaboratorio(e.target.value)}>
            <option value="">Todos los laboratorios</option>
            {filtros.laboratorios
              .filter(l => labsActivosSet.has(l))
              .map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>

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
                    {COLS.map((c, i) => (
                      <th key={c.key} className={`ng-th-col${i === 0 ? ' ng-sep' : ''}`}>{c.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {alumnos.length === 0 ? (
                    <tr><td colSpan={2 + COLS.length} style={{ textAlign: 'center', padding: '2rem', color: '#999' }}>No hay alumnos con los filtros seleccionados</td></tr>
                  ) : alumnos.map(a => (
                    <tr key={a.id}>
                      <td className="ng-td-fijo ng-codigo" title={a.codigo_estudiante || 'sin código'}>{a.clave}</td>
                      <td className="ng-td-fijo ng-nombre">{a.nombre} {a.apellido}</td>
                      {COLS.map((c, i) => {
                        const val = getVal(a.id, c.key);
                        return (
                          <td key={c.key} className={`ng-cell${i === 0 ? ' ng-sep' : ''}`} style={{ background: gradeColor(val) }}>
                            <input
                              id={ncid(a.id, c.key)}
                              type="number" min="0" max="100" step="1"
                              value={val}
                              onChange={e => setVal(a.id, c.key, e.target.value)}
                              onKeyDown={e => handleKey(e, a.id, c.key)}
                              className="ng-input"
                              style={{ background: 'transparent' }}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollableTable>
          )}
        </div>
      </div>
    </div>
  );
}
