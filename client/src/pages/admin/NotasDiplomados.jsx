import { useState, useEffect, useCallback, useMemo } from 'react';
import Sidebar from '../../components/Sidebar';
import ScrollableTable from '../../components/ScrollableTable';
import API from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import { can } from '../../lib/permissions';
import { useAniosFiltros } from '../../lib/anios';
import './admin.css';

const anioActual = new Date().getFullYear();
const ls    = (k, d) => localStorage.getItem(k) ?? d;

const gradeColor = v => {
  if (v === '' || v == null) return '';
  const n = parseFloat(v);
  return isNaN(n) ? '' : n >= 60 ? '#c8e6c9' : '#ffcdd2';
};
const toInt = val => {
  if (val === '' || val == null) return '';
  const n = parseInt(val, 10);
  if (isNaN(n)) return '';
  return String(Math.min(100, Math.max(0, n)));
};

const dcid = (id, col) => `dc-${id}-${col}`;

export default function NotasDiplomados() {
  const { usuario } = useAuth();
  const puedeEditar = can(usuario?.rol, 'notasDiplomados', 'edit');
  const { anios: ANIOS } = useAniosFiltros();
  const [diplomados,   setDiplomados]   = useState([]);
  const [anio,         setAnio]         = useState(() => parseInt(ls('dip_anio', anioActual)) || anioActual);
  const [fEstado,      setFEstado]      = useState(() => ls('dip_estado',  'activo'));
  const [fHorario,     setFHorario]     = useState(() => ls('dip_horario', ''));
  const [fLaboratorio, setFLaboratorio] = useState(() => ls('dip_lab',     ''));
  const [fDia,         setFDia]         = useState(() => ls('dip_dia',     ''));
  const [tipoActivo,   setTipoActivo]   = useState(() => ls('dip_tipo',    ''));
  const [filtros,      setFiltros]      = useState({ horarios: [], laboratorios: [], dias: [] });
  const [alumnos,      setAlumnos]      = useState([]);
  const [cargando,     setCargando]     = useState(false);
  const [pending,      setPending]      = useState({});
  const [guardando,    setGuardando]    = useState(false);
  const [msg,          setMsg]          = useState('');

  useEffect(() => { localStorage.setItem('dip_anio',    anio);         }, [anio]);
  useEffect(() => { localStorage.setItem('dip_estado',  fEstado);      }, [fEstado]);
  useEffect(() => { localStorage.setItem('dip_horario', fHorario);     }, [fHorario]);
  useEffect(() => { localStorage.setItem('dip_lab',     fLaboratorio); }, [fLaboratorio]);
  useEffect(() => { localStorage.setItem('dip_dia',     fDia);         }, [fDia]);
  useEffect(() => { localStorage.setItem('dip_tipo',    tipoActivo);   }, [tipoActivo]);

  useEffect(() => {
    API.get('/asistencia/filtros').then(({ data }) => setFiltros(data)).catch(console.error);
    API.get('/diplomados').then(({ data }) => {
      setDiplomados(data);
      // Si no hay tab activo o ya no existe ese diplomado, escoge el primero
      if (data.length && !data.some(d => String(d.id) === String(tipoActivo))) {
        setTipoActivo(String(data[0].id));
      }
    }).catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cargar = useCallback(async () => {
    setCargando(true); setPending({});
    try {
      const p = new URLSearchParams({ anio });
      if (fEstado)      p.append('estado',       fEstado);
      if (fHorario)     p.append('horario',      fHorario);
      if (fLaboratorio) p.append('laboratorio',  fLaboratorio);
      if (fDia)         p.append('dia',          fDia);
      const { data } = await API.get(`/notas-diplomados/anual?${p}`);
      setAlumnos(data);
    } catch (err) { console.error(err); }
    finally { setCargando(false); }
  }, [anio, fEstado, fHorario, fLaboratorio, fDia]);

  useEffect(() => { cargar(); }, [cargar]);

  const diplomadoActivo = useMemo(
    () => diplomados.find(d => String(d.id) === String(tipoActivo)) || diplomados[0] || null,
    [diplomados, tipoActivo]
  );

  const COLS = useMemo(() => {
    if (!diplomadoActivo) return [];
    return [...(diplomadoActivo.examenes || [])]
      .sort((a, b) => a.orden - b.orden)
      .map(e => ({ key: e.nombre, label: e.nombre }));
  }, [diplomadoActivo]);

  // El alumno aparece en la pestaña del diplomado activo si:
  //   1) Su diplomado actual (ficha) es ese diplomado — para inscripciones
  //      del año en curso.
  //   2) O tiene notas históricas en ese diplomado para el año seleccionado
  //      (preserva el registro aunque el alumno haya cambiado de diplomado).
  const alumnosFiltrados = useMemo(() => {
    if (!diplomadoActivo) return [];
    const norm = s => String(s || '').trim().toLowerCase();
    const target = norm(diplomadoActivo.nombre);
    const dipId  = String(diplomadoActivo.id);
    return alumnos.filter(a => {
      const esActual    = norm(a.diplomado) === target;
      const tieneHistor = !!(a.notasPorDiplomado && a.notasPorDiplomado[dipId]);
      return esActual || tieneHistor;
    });
  }, [alumnos, diplomadoActivo]);

  const getVal = (alumnoId, materia) => {
    const k = `${alumnoId}_${materia}`;
    if (k in pending) return pending[k];
    const a = alumnos.find(x => x.id === alumnoId);
    return a?.notas?.[materia] ?? '';
  };

  const setVal = (alumnoId, materia, raw) =>
    setPending(prev => ({ ...prev, [`${alumnoId}_${materia}`]: toInt(raw) }));

  const navigate = (alumnoId, materia, dir) => {
    const ai = alumnosFiltrados.findIndex(a => a.id === alumnoId);
    const ci = COLS.findIndex(c => c.key === materia);
    let na = ai, nc = ci;
    if (dir === 'right') { nc < COLS.length - 1 ? nc++ : (na < alumnosFiltrados.length - 1 && (na++, nc = 0)); }
    else if (dir === 'left')  { nc > 0 ? nc-- : (na > 0 && (na--, nc = COLS.length - 1)); }
    else if (dir === 'down')  { na < alumnosFiltrados.length - 1 && na++; }
    else if (dir === 'up')    { na > 0 && na--; }
    document.getElementById(dcid(alumnosFiltrados[na]?.id, COLS[nc]?.key))?.focus();
  };

  const handleKey = (e, alumnoId, materia) => {
    const dirs = { ArrowRight:'right', ArrowLeft:'left', ArrowDown:'down', ArrowUp:'up' };
    if (dirs[e.key]) { e.preventDefault(); navigate(alumnoId, materia, dirs[e.key]); }
    else if (e.key === 'Enter') { e.preventDefault(); navigate(alumnoId, materia, 'down'); }
    else if (e.key === 'Tab')   { e.preventDefault(); navigate(alumnoId, materia, e.shiftKey ? 'left' : 'right'); }
  };

  const hasChanges = Object.keys(pending).length > 0;

  const guardar = async () => {
    setGuardando(true);
    try {
      const cambios = Object.entries(pending).map(([k, nota]) => {
        const [alumno_id, ...rest] = k.split('_');
        return { alumno_id: Number(alumno_id), materia: rest.join('_'), nota: nota === '' ? null : nota };
      });
      await API.post('/notas-diplomados/anual', { anio, cambios });
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
        <h1>🎓 Notas Diplomados</h1>
        <p className="subtitle">Selecciona el diplomado y edita las notas. Los exámenes (columnas) y su orden se gestionan en <strong>Diplomados → Exámenes</strong>.</p>

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
        </div>

        {diplomados.length === 0 ? (
          <div className="cfg-empty" style={{ background: '#fff', borderRadius: 12, padding: '2rem' }}>
            No hay diplomados creados. Ve a <strong>Diplomados</strong> y crea al menos uno con sus exámenes.
          </div>
        ) : (
          <>
            <div className="dip-tabs">
              {diplomados.map(d => (
                <button
                  key={d.id}
                  className={`dip-tab${String(tipoActivo) === String(d.id) ? ' active' : ''}`}
                  onClick={() => { setTipoActivo(String(d.id)); setPending({}); }}
                >
                  {d.nombre}
                </button>
              ))}
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
              {cargando ? <div style={{ textAlign: 'center', padding: '3rem', color: '#999' }}>Cargando...</div> :
                COLS.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '2rem', color: '#999' }}>
                    Este diplomado no tiene exámenes configurados. Ve a <strong>Diplomados → Exámenes</strong> y agrégalos.
                  </div>
                ) : (
                <ScrollableTable>
                  <table className="nota-grid">
                    <thead>
                      <tr>
                        <th className="ng-th-fijo">Clave</th>
                        <th className="ng-th-fijo" style={{ minWidth: 150 }}>Alumno</th>
                        <th className="ng-th-fijo" style={{ minWidth: 120 }}>Diplomado</th>
                        {COLS.map((c, i) => (
                          <th key={c.key} className={`ng-th-col${i === 0 ? ' ng-sep' : ''}`}>{c.label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {alumnosFiltrados.length === 0 ? (
                        <tr>
                          <td colSpan={3 + COLS.length} style={{ textAlign: 'center', padding: '2rem', color: '#999' }}>
                            No hay alumnos con los filtros seleccionados
                          </td>
                        </tr>
                      ) : alumnosFiltrados.map(a => (
                        <tr key={a.id}>
                          <td className="ng-td-fijo ng-codigo" title={a.codigo_estudiante || 'sin código'}>{a.clave}</td>
                          <td className="ng-td-fijo ng-nombre">{a.nombre} {a.apellido}</td>
                          <td className="ng-td-fijo" style={{ fontSize: '0.78rem', color: '#555' }}>{a.diplomado || '—'}</td>
                          {COLS.map((c, i) => {
                            const val = getVal(a.id, c.key);
                            return (
                              <td key={c.key} className={`ng-cell${i === 0 ? ' ng-sep' : ''}`} style={{ background: gradeColor(val) }}>
                                <input
                                  id={dcid(a.id, c.key)}
                                  type="number" min="0" max="100" step="1"
                                  value={val}
                                  onChange={e => puedeEditar && setVal(a.id, c.key, e.target.value)}
                                  onKeyDown={e => handleKey(e, a.id, c.key)}
                                  readOnly={!puedeEditar}
                                  className="ng-input"
                                  style={{ background: 'transparent', cursor: puedeEditar ? 'text' : 'default' }}
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
          </>
        )}
      </div>
    </div>
  );
}
