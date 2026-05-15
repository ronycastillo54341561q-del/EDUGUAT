import { useEffect, useMemo, useState, useCallback } from 'react';
import Sidebar from '../../components/Sidebar';
import API from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import { can } from '../../lib/permissions';
import { cargarRangoAnios, aniosDeRango } from '../../lib/anios';
import './admin.css';
import './InscritosTac.css';

const ESTADOS = [
  { v: 'no_inscrito', label: 'No Inscrito' },
  { v: 'pendiente',   label: 'Pendiente' },
  { v: 'inscrito',    label: 'Inscrito' },
];

const fmtFecha = (d) => {
  if (!d) return '—';
  const s = String(d).replace('T', ' ').replace(/\.\d+Z?$/, '');
  return s.slice(0, 16);
};

const labelHorario = (a) => {
  const dias = a.dia_clases2 ? `${a.dia_clases1}-${a.dia_clases2}` : (a.dia_clases1 || '');
  return [dias, a.horario].filter(Boolean).join(' ') || '—';
};

const InscritosTac = () => {
  const { usuario } = useAuth();
  const puedeEditar = can(usuario?.rol, 'inscritosTac', 'edit');

  const anioActual = new Date().getFullYear();
  const [anio, setAnio]   = useState(anioActual);
  const [tac, setTac]     = useState(1);
  const [rows, setRows]   = useState([]);
  const [loading, setLoading] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  // Filtro por estado del alumno (no de la inscripción). Persistido.
  const [fEstadoAlumno, setFEstadoAlumno] = useState(
    () => localStorage.getItem('itac_estado_alumno') ?? 'activo'
  );
  useEffect(() => {
    localStorage.setItem('itac_estado_alumno', fEstadoAlumno);
  }, [fEstadoAlumno]);
  const [aniosDisponibles, setAniosDisponibles] = useState([]);
  const [savingId, setSavingId] = useState(null);
  const [savedFlash, setSavedFlash] = useState({}); // { alumnoId: 'ok' | 'err' }

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await API.get('/inscritos-tac', { params: { anio, tac } });
      setRows(data);
    } catch (err) {
      console.error(err);
      setRows([]);
    } finally { setLoading(false); }
  }, [anio, tac]);

  useEffect(() => { cargar(); }, [cargar]);

  useEffect(() => {
    // Une el rango configurado en Configuración con los años que ya tienen datos en BD,
    // de modo que registros históricos siempre queden accesibles aunque el admin acote el rango.
    Promise.all([
      API.get('/inscritos-tac/anios').then(({ data }) => data).catch(() => []),
      cargarRangoAnios(),
    ]).then(([conDatos, rango]) => {
      const set = new Set([
        anioActual, anioActual - 1,
        ...aniosDeRango(rango),
        ...conDatos,
      ]);
      setAniosDisponibles([...set].sort((a, b) => b - a));
    }).catch(() => setAniosDisponibles([anioActual, anioActual - 1]));
  }, [anioActual]);

  // Aplica primero el filtro por estado del alumno y luego la búsqueda.
  // Las tarjetas de stats también se calculan sobre este subconjunto para
  // reflejar lo que el usuario está viendo en la tabla.
  const filasPorEstado = useMemo(
    () => fEstadoAlumno
      ? rows.filter(r => r.alumno_estado === fEstadoAlumno)
      : rows,
    [rows, fEstadoAlumno]
  );

  const filas = useMemo(() => {
    if (!busqueda) return filasPorEstado;
    const q = busqueda.toLowerCase();
    return filasPorEstado.filter(r => (
      `${r.nombre} ${r.apellido} ${r.clave} ${r.codigo_estudiante || ''}`
        .toLowerCase().includes(q)
    ));
  }, [filasPorEstado, busqueda]);

  const stats = useMemo(() => {
    const out = { inscrito: 0, pendiente: 0, no_inscrito: 0 };
    for (const r of filasPorEstado) {
      if (r.estado in out) out[r.estado]++;
      else out.no_inscrito++;
    }
    return out;
  }, [filasPorEstado]);

  const guardar = async (alumno_id, patch) => {
    const original = rows.find(r => r.id === alumno_id);
    if (!original) return;
    const payload = {
      anio, tac,
      estado: patch.estado ?? original.estado,
      observaciones: patch.observaciones ?? original.observaciones ?? '',
    };
    setSavingId(alumno_id);
    try {
      const { data } = await API.put(`/inscritos-tac/${alumno_id}`, payload);
      setRows(prev => prev.map(r => r.id === alumno_id
        ? { ...r, estado: data.estado, fecha_actualizacion: data.fecha_actualizacion, observaciones: data.observaciones }
        : r));
      setSavedFlash(s => ({ ...s, [alumno_id]: 'ok' }));
      setTimeout(() => setSavedFlash(s => { const c = { ...s }; delete c[alumno_id]; return c; }), 1200);
    } catch (err) {
      console.error(err);
      setSavedFlash(s => ({ ...s, [alumno_id]: 'err' }));
      alert(err.response?.data?.message || 'No se pudo guardar');
    } finally { setSavingId(null); }
  };

  const onCambioEstado = (alumno_id, estado) => guardar(alumno_id, { estado });

  // Para no machacar el server con cada tecla, observaciones se guardan al perder foco.
  const onBlurObs = (alumno_id, valor, original) => {
    if ((valor || '') === (original || '')) return;
    guardar(alumno_id, { observaciones: valor });
  };

  return (
    <div className="admin-layout">
      <Sidebar />
      <div className="admin-content">
        <h1>📋 Inscritos TAC</h1>
        <p className="subtitle">
          Marca quién está inscrito por año y nivel.  Los cambios entre niveles
          se conservan en el historial: si un alumno estuvo en TAC1 en 2025 y ahora
          en TAC2, ambos años quedan accesibles cambiando el selector de año.
        </p>

        <div className="itac-toolbar">
          <label>Año:</label>
          <select value={anio} onChange={e => setAnio(parseInt(e.target.value, 10))}>
            {aniosDisponibles.map(a => <option key={a} value={a}>{a}</option>)}
          </select>

          <label>Estado:</label>
          <select value={fEstadoAlumno} onChange={e => setFEstadoAlumno(e.target.value)}>
            <option value="activo">Activos</option>
            <option value="retirado">Retirados</option>
            <option value="">Todos</option>
          </select>

          <input
            className="search-input"
            type="text"
            placeholder="🔍 Buscar por nombre, clave o código..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            style={{ flex: 1, minWidth: 220 }}
          />
        </div>

        <div className="itac-tabs">
          {[1, 2, 3].map(n => (
            <button
              key={n}
              className={`itac-tab${tac === n ? ' active' : ''}`}
              onClick={() => setTac(n)}
            >
              TAC {n}
            </button>
          ))}
        </div>

        <div className="itac-cards">
          <div className="itac-card total">
            <h4>Total</h4>
            <p>{filasPorEstado.length}</p>
          </div>
          <div className="itac-card inscrito">
            <h4>Inscritos</h4>
            <p>{stats.inscrito}</p>
          </div>
          <div className="itac-card pendiente">
            <h4>Pendientes</h4>
            <p>{stats.pendiente}</p>
          </div>
          <div className="itac-card no_inscrito">
            <h4>No Inscritos</h4>
            <p>{stats.no_inscrito}</p>
          </div>
        </div>

        <div className="itac-table-wrap">
          <table className="itac-table">
            <thead>
              <tr>
                <th style={{ width: 90 }}>Clave</th>
                <th>Alumno</th>
                <th style={{ width: 110 }}>Código</th>
                <th>Día y horario</th>
                <th style={{ width: 160 }}>Estado</th>
                <th style={{ width: 150 }}>Última actualización</th>
                <th style={{ minWidth: 200 }}>Observaciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="7" className="itac-empty">Cargando…</td></tr>
              ) : filas.length === 0 ? (
                <tr><td colSpan="7" className="itac-empty">
                  No hay alumnos en TAC {tac} para {anio}.
                </td></tr>
              ) : (
                filas.map(r => (
                  <tr key={r.id}>
                    <td className="clave">{r.clave}</td>
                    <td>{r.nombre} {r.apellido}</td>
                    <td className="codigo">{r.codigo_estudiante || '—'}</td>
                    <td>{labelHorario(r)}</td>
                    <td>
                      <select
                        className={`itac-state-select ${r.estado}`}
                        value={r.estado}
                        disabled={!puedeEditar || savingId === r.id}
                        onChange={e => onCambioEstado(r.id, e.target.value)}
                      >
                        {ESTADOS.map(o => (
                          <option key={o.v} value={o.v}>{o.label}</option>
                        ))}
                      </select>
                      {savedFlash[r.id] && (
                        <span className={`itac-saving ${savedFlash[r.id]}`}>
                          {savedFlash[r.id] === 'ok' ? '✓' : '✗'}
                        </span>
                      )}
                    </td>
                    <td className="itac-fecha">{fmtFecha(r.fecha_actualizacion)}</td>
                    <td>
                      <textarea
                        className="itac-obs"
                        rows={1}
                        defaultValue={r.observaciones || ''}
                        disabled={!puedeEditar}
                        onBlur={e => onBlurObs(r.id, e.target.value, r.observaciones)}
                        placeholder="—"
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default InscritosTac;
