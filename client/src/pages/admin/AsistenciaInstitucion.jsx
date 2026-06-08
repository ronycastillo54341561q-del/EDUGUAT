import { useState, useEffect, useCallback, useMemo } from 'react';
import Sidebar from '../../components/Sidebar';
import ScrollableTable from '../../components/ScrollableTable';
import API from '../../api/axios';
import { useAniosFiltros } from '../../lib/anios';
import './admin.css';

const MESES = [
  { num: 1,  label: 'Enero' },     { num: 2,  label: 'Febrero' },
  { num: 3,  label: 'Marzo' },     { num: 4,  label: 'Abril' },
  { num: 5,  label: 'Mayo' },      { num: 6,  label: 'Junio' },
  { num: 7,  label: 'Julio' },     { num: 8,  label: 'Agosto' },
  { num: 9,  label: 'Septiembre' },{ num: 10, label: 'Octubre' },
  { num: 11, label: 'Noviembre' }, { num: 12, label: 'Diciembre' },
];

const COLORES = {
  x: { bg: '#c8e6c9', color: '#1b5e20', bord: '#81c784' },
  e: { bg: '#fff9c4', color: '#e65100', bord: '#ffe082' },
  p: { bg: '#bbdefb', color: '#0d47a1', bord: '#64b5f6' },
  f: { bg: '#ffcdd2', color: '#b71c1c', bord: '#ef9a9a' },
  r: { bg: '#d1c4e9', color: '#4527a0', bord: '#9575cd' },
};
const LABELS = { x: 'Asistió', e: 'Enfermo', p: 'Permiso', f: 'Falta', r: 'Recuperó' };

// Día (texto, minúscula sin tildes — como se guarda en alumnos.dias_clase) → getDay()
const DOW_NOMBRE = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
const DIA_NUM = { domingo: 0, lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6 };
const ABREV = ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa'];

const anioActual = new Date().getFullYear();
const mesActualNum = new Date().getMonth() + 1;

const uniq = (arr, k) => [...new Set(arr.map(a => a[k]).filter(Boolean))].sort();
const cid = (alumnoId, fecha) => `cd-${alumnoId}-${fecha}`;
const planDias = (a) => (a.dias_clase || '').split(',').filter(Boolean);
const tieneClase = (a, dow) => planDias(a).includes(DOW_NOMBRE[dow]);

export default function AsistenciaInstitucion() {
  const ls = (k, d) => localStorage.getItem(k) ?? d;
  const { anios: ANIOS } = useAniosFiltros();

  const [anio, setAnio]     = useState(() => parseInt(ls('asistd_anio', anioActual)) || anioActual);
  const [mes, setMes]       = useState(() => parseInt(ls('asistd_mes', String(mesActualNum))) || mesActualNum);
  const [estadoFiltro, setEstadoFiltro] = useState(() => ls('asistd_estado', 'activo'));
  const [fGrado, setFGrado]     = useState(() => ls('asistd_grado', ''));
  const [fSeccion, setFSeccion] = useState(() => ls('asistd_seccion', ''));
  const [fPlan, setFPlan]       = useState(() => ls('asistd_plan', ''));

  const [todosAlumnos, setTodosAlumnos] = useState([]);
  const [alumnos, setAlumnos]   = useState([]);
  const [cargando, setCargando] = useState(false);

  const [pending, setPending]   = useState({});
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg]           = useState('');

  const hasChanges = Object.keys(pending).length > 0;

  useEffect(() => { localStorage.setItem('asistd_anio', anio); }, [anio]);
  useEffect(() => { localStorage.setItem('asistd_mes', String(mes)); }, [mes]);
  useEffect(() => { localStorage.setItem('asistd_estado', estadoFiltro); }, [estadoFiltro]);
  useEffect(() => { localStorage.setItem('asistd_grado', fGrado); }, [fGrado]);
  useEffect(() => { localStorage.setItem('asistd_seccion', fSeccion); }, [fSeccion]);
  useEffect(() => { localStorage.setItem('asistd_plan', fPlan); }, [fPlan]);

  useEffect(() => {
    API.get('/alumnos').then(({ data }) => setTodosAlumnos(data)).catch(console.error);
  }, []);

  // Opciones de los filtros, restringidas al estado seleccionado.
  const alumnosParaFiltros = useMemo(
    () => estadoFiltro ? todosAlumnos.filter(a => a.estado === estadoFiltro) : todosAlumnos,
    [todosAlumnos, estadoFiltro]
  );
  const gradosU    = useMemo(() => uniq(alumnosParaFiltros, 'grado'),       [alumnosParaFiltros]);
  const seccionesU = useMemo(() => uniq(alumnosParaFiltros, 'seccion'),     [alumnosParaFiltros]);
  const planesU    = useMemo(() => uniq(alumnosParaFiltros, 'plan_clases'), [alumnosParaFiltros]);

  const cargarGrid = useCallback(async () => {
    setCargando(true);
    setPending({});
    try {
      const p = new URLSearchParams({ anio, mes });
      if (estadoFiltro) p.append('estado', estadoFiltro);
      if (fGrado)       p.append('grado', fGrado);
      if (fSeccion)     p.append('seccion', fSeccion);
      if (fPlan)        p.append('plan', fPlan);
      const { data } = await API.get(`/asistencia/diaria?${p}`);
      setAlumnos(data);
    } catch (err) { console.error(err); }
    finally { setCargando(false); }
  }, [anio, mes, estadoFiltro, fGrado, fSeccion, fPlan]);

  useEffect(() => { cargarGrid(); }, [cargarGrid]);

  // Todas las fechas del mes seleccionado.
  const diasDelMes = useMemo(() => {
    const out = [];
    const last = new Date(anio, mes, 0).getDate();
    for (let d = 1; d <= last; d++) {
      const date = new Date(anio, mes - 1, d);
      out.push({
        dia: d,
        dow: date.getDay(),
        fecha: `${anio}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
        semana: Math.ceil(d / 7),
      });
    }
    return out;
  }, [anio, mes]);

  // Días de la semana que son de clase para AL MENOS un alumno mostrado.
  // Si nadie tiene plan asignado, se asume lunes a viernes.
  const classDows = useMemo(() => {
    const set = new Set();
    for (const a of alumnos) for (const dn of planDias(a)) {
      if (dn in DIA_NUM) set.add(DIA_NUM[dn]);
    }
    return set.size ? set : new Set([1, 2, 3, 4, 5]);
  }, [alumnos]);

  // Columnas visibles: fechas del mes cuyo día sea de clase.
  const columnas = useMemo(
    () => diasDelMes.filter(d => classDows.has(d.dow)),
    [diasDelMes, classDows]
  );

  // Agrupación por semana del mes (para el encabezado).
  const semanas = useMemo(() => {
    const groups = [];
    for (const col of columnas) {
      const last = groups[groups.length - 1];
      if (last && last.semana === col.semana) last.cols.push(col);
      else groups.push({ semana: col.semana, cols: [col] });
    }
    return groups;
  }, [columnas]);

  const getVal = (a, fecha) => {
    const key = `${a.id}|${fecha}`;
    const raw = key in pending ? pending[key] : (a.asistencias[fecha] || '');
    return raw ? String(raw).toLowerCase() : '';
  };
  const setVal = (alumnoId, fecha, val) =>
    setPending(prev => ({ ...prev, [`${alumnoId}|${fecha}`]: val }));

  // Click rápido: vacío → asistió → falta → vacío.
  const cicloClick = (cur) => (cur === '' ? 'x' : cur === 'x' ? 'f' : '');

  // Navegación con flechas entre celdas de clase.
  const focusCelda = (alumnoId, fecha) => document.getElementById(cid(alumnoId, fecha))?.focus();
  const navegar = (a, col, dir) => {
    const ai = alumnos.findIndex(x => x.id === a.id);
    const ci = columnas.findIndex(x => x.fecha === col.fecha);
    if (dir === 'left' || dir === 'right') {
      const step = dir === 'right' ? 1 : -1;
      for (let i = ci + step; i >= 0 && i < columnas.length; i += step) {
        if (tieneClase(a, columnas[i].dow)) return focusCelda(a.id, columnas[i].fecha);
      }
    } else {
      const step = dir === 'down' ? 1 : -1;
      for (let i = ai + step; i >= 0 && i < alumnos.length; i += step) {
        if (tieneClase(alumnos[i], col.dow)) return focusCelda(alumnos[i].id, col.fecha);
      }
    }
  };

  const handleKey = (e, a, col) => {
    const k = e.key.toLowerCase();
    if (['x', 'e', 'p', 'f', 'r'].includes(k)) {
      e.preventDefault();
      setVal(a.id, col.fecha, k);
      return;
    }
    if (k === 'delete' || k === 'backspace') {
      e.preventDefault();
      setVal(a.id, col.fecha, '');
      return;
    }
    const dirs = { arrowleft: 'left', arrowright: 'right', arrowup: 'up', arrowdown: 'down' };
    if (dirs[k]) { e.preventDefault(); navegar(a, col, dirs[k]); }
  };

  // Marca como "Asistió" todas las celdas vacías de clase de una fecha.
  const marcarColumna = (col) => {
    setPending(prev => {
      const next = { ...prev };
      for (const a of alumnos) {
        if (!tieneClase(a, col.dow)) continue;
        if (getVal(a, col.fecha) === '') next[`${a.id}|${col.fecha}`] = 'x';
      }
      return next;
    });
  };

  const guardarCambios = async () => {
    if (!hasChanges) return;
    setGuardando(true);
    try {
      const cambios = Object.entries(pending).map(([key, estado]) => {
        const [alumno_id, fecha] = key.split('|');
        return { alumno_id: Number(alumno_id), fecha, estado: estado || null };
      });
      await API.post('/asistencia/diaria/lote', { cambios });

      setAlumnos(prev => prev.map(a => {
        const base = { ...a.asistencias };
        Object.entries(pending).forEach(([key, val]) => {
          const [aid, fecha] = key.split('|');
          if (Number(aid) !== a.id) return;
          if (val) base[fecha] = val; else delete base[fecha];
        });
        return { ...a, asistencias: base };
      }));
      setPending({});
      setMsg('ok'); setTimeout(() => setMsg(''), 3000);
    } catch {
      setMsg('err'); setTimeout(() => setMsg(''), 3000);
    } finally { setGuardando(false); }
  };

  const totalCols = columnas.length;

  return (
    <div className="admin-layout">
      <Sidebar />
      <div className="admin-content">
        <h1>Asistencia Diaria</h1>
        <p className="subtitle">
          Marca por día de clase: <strong>clic</strong> alterna Asistió/Falta · teclas{' '}
          <strong>x e p f r</strong> · <kbd>Supr</kbd> borra · flechas navegan.
          Las celdas grises no son día de clase del alumno.
        </p>

        {/* Filtros */}
        <div className="asist-filtros">
          <select value={anio} onChange={e => setAnio(Number(e.target.value))}>
            {ANIOS.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <select value={mes} onChange={e => setMes(Number(e.target.value))}>
            {MESES.map(m => <option key={m.num} value={m.num}>{m.label}</option>)}
          </select>
          <select value={estadoFiltro} onChange={e => setEstadoFiltro(e.target.value)}>
            <option value="activo">Activos</option>
            <option value="retirado">Retirados</option>
            <option value="">Todos</option>
          </select>
          {gradosU.length > 0 && (
            <select value={fGrado} onChange={e => setFGrado(e.target.value)}>
              <option value="">Todos los grados</option>
              {gradosU.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          )}
          {seccionesU.length > 0 && (
            <select value={fSeccion} onChange={e => setFSeccion(e.target.value)}>
              <option value="">Todas las secciones</option>
              {seccionesU.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
          {planesU.length > 0 && (
            <select value={fPlan} onChange={e => setFPlan(e.target.value)}>
              <option value="">Todos los planes</option>
              {planesU.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          )}
        </div>

        {/* Leyenda */}
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
          {Object.entries(COLORES).map(([k, c]) => (
            <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '0.78rem', fontWeight: 700, color: c.color }}>
              <span style={{ background: c.bg, border: `1px solid ${c.bord}`, borderRadius: '4px', padding: '1px 7px', fontWeight: 800 }}>
                {k.toUpperCase()}
              </span>
              {LABELS[k]}
            </span>
          ))}
        </div>

        {/* Barra de guardar */}
        {hasChanges && (
          <div className="asist-save-bar">
            <span style={{ fontSize: '0.88rem', color: '#7b5800' }}>
              {Object.keys(pending).length} cambio(s) pendiente(s)
            </span>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="btn-cancel" onClick={() => setPending({})} disabled={guardando}>
                Descartar
              </button>
              <button className="btn-primary" onClick={guardarCambios} disabled={guardando}>
                {guardando ? 'Guardando...' : 'Guardar Cambios'}
              </button>
            </div>
          </div>
        )}

        {msg === 'ok'  && <div className="msg-ok"  style={{ marginBottom: '0.75rem' }}>Cambios guardados correctamente</div>}
        {msg === 'err' && <div className="msg-err" style={{ marginBottom: '0.75rem' }}>Error al guardar cambios</div>}

        <div className="table-container">
          {cargando ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: '#999' }}>Cargando...</div>
          ) : (
            <ScrollableTable>
              <table className="asist-grid" style={{ tableLayout: 'fixed' }}>
                <colgroup>
                  <col style={{ width: '80px' }} />
                  <col style={{ width: '180px' }} />
                  {columnas.map(c => <col key={c.fecha} style={{ width: '34px' }} />)}
                </colgroup>
                <thead>
                  {/* Fila de semanas del mes */}
                  <tr>
                    <th className="ag-th-fijo" />
                    <th className="ag-th-fijo ag-th-nombre" />
                    {semanas.map(g => (
                      <th key={g.semana} colSpan={g.cols.length} className="ag-th-mes ag-mes-inicio">
                        Semana {g.semana}
                      </th>
                    ))}
                  </tr>
                  {/* Fila de días (fecha + abreviatura) con botón "marcar todos" */}
                  <tr>
                    <th className="ag-th-fijo">Clave</th>
                    <th className="ag-th-fijo ag-th-nombre">Alumno</th>
                    {columnas.map((c, i) => {
                      const inicioSemana = i === 0 || columnas[i - 1].semana !== c.semana;
                      return (
                        <th
                          key={c.fecha}
                          className={`ag-th-sem${inicioSemana ? ' ag-mes-inicio' : ''}`}
                          title={`${c.dia} ${ABREV[c.dow]} — clic en ✓ marca a todos como Asistió`}
                        >
                          <div style={{ fontWeight: 700, color: '#444' }}>{c.dia}</div>
                          <div style={{ fontSize: '0.6rem', color: '#999' }}>{ABREV[c.dow]}</div>
                          <button
                            type="button"
                            onClick={() => marcarColumna(c)}
                            title="Marcar todos Asistió"
                            style={{
                              border: 'none', background: 'transparent', cursor: 'pointer',
                              color: '#2e7d32', fontSize: '0.7rem', padding: 0, lineHeight: 1,
                            }}
                          >✓</button>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {alumnos.length === 0 ? (
                    <tr>
                      <td colSpan={totalCols + 2} style={{ textAlign: 'center', padding: '2rem', color: '#999' }}>
                        No hay alumnos con los filtros seleccionados
                      </td>
                    </tr>
                  ) : columnas.length === 0 ? (
                    <tr>
                      <td colSpan={2} style={{ textAlign: 'center', padding: '2rem', color: '#999' }}>
                        No hay días de clase este mes
                      </td>
                    </tr>
                  ) : (
                    alumnos.map(a => (
                      <tr key={a.id}>
                        <td className="ag-td-fijo ag-td-codigo" title={a.codigo_estudiante || 'sin código'}>{a.clave}</td>
                        <td className="ag-td-fijo ag-td-nombre">{a.apellido} {a.nombre}</td>
                        {columnas.map((c, i) => {
                          const inicioSemana = i === 0 || columnas[i - 1].semana !== c.semana;
                          const esClase = tieneClase(a, c.dow);
                          if (!esClase) {
                            return (
                              <td
                                key={c.fecha}
                                className={`ag-cell${inicioSemana ? ' ag-mes-inicio' : ''}`}
                                style={{ background: '#f0f0f0', color: '#ccc', cursor: 'default' }}
                                title="No es día de clase de este alumno"
                              >·</td>
                            );
                          }
                          const val = getVal(a, c.fecha);
                          const col = COLORES[val] || {};
                          const isPending = `${a.id}|${c.fecha}` in pending;
                          return (
                            <td
                              key={c.fecha}
                              id={cid(a.id, c.fecha)}
                              tabIndex={0}
                              className={`ag-cell${inicioSemana ? ' ag-mes-inicio' : ''}`}
                              style={{ background: col.bg || undefined, cursor: 'cell', outline: 'none' }}
                              onClick={() => setVal(a.id, c.fecha, cicloClick(val))}
                              onKeyDown={e => handleKey(e, a, c)}
                              onFocus={e => e.currentTarget.classList.add('ag-cell-focus')}
                              onBlur={e => e.currentTarget.classList.remove('ag-cell-focus')}
                            >
                              {val ? (
                                <span style={{ color: col.color, fontWeight: isPending ? 900 : 700, fontSize: '0.72rem', userSelect: 'none' }}>
                                  {val.toUpperCase()}
                                </span>
                              ) : null}
                            </td>
                          );
                        })}
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
