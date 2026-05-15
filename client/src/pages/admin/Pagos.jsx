import { useState, useEffect, useCallback } from 'react';
import Sidebar from '../../components/Sidebar';
import ScrollableTable from '../../components/ScrollableTable';
import ConfigPagosModal from '../../components/ConfigPagosModal';
import API from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import { can } from '../../lib/permissions';
import { useAniosFiltros } from '../../lib/anios';
import './admin.css';

const anioActual = new Date().getFullYear();
const MESES  = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const ls     = (k, d) => localStorage.getItem(k) ?? d;
const pcid   = (id, m) => `pc-${id}-${m}`;

// ── Componente principal ─────────────────────────────────────────────────────
export default function Pagos() {
  const { usuario } = useAuth();
  const puedeEditar = can(usuario?.rol, 'pagos', 'edit');
  const verInstitucion = can(usuario?.rol, 'pagosInstitucion', 'view');
  const { anios: ANIOS } = useAniosFiltros();
  const [anio,         setAnio]         = useState(() => parseInt(ls('pag_anio', anioActual)) || anioActual);
  const [fEstado,      setFEstado]      = useState(() => ls('pag_estado',  'activo'));
  const [fHorario,     setFHorario]     = useState(() => ls('pag_horario', ''));
  const [fLaboratorio, setFLaboratorio] = useState(() => ls('pag_lab',     ''));
  const [fDia,         setFDia]         = useState(() => ls('pag_dia',     ''));
  const [filtros,      setFiltros]      = useState({ horarios: [], laboratorios: [], dias: [] });
  const [alumnos,      setAlumnos]      = useState([]);
  const [cargando,     setCargando]     = useState(false);
  const [pending,      setPending]      = useState({});
  const [guardando,    setGuardando]    = useState(false);
  const [msg,          setMsg]          = useState('');
  const [busqueda,     setBusqueda]     = useState(() => ls('pag_busq', ''));
  const [showConfig,   setShowConfig]   = useState(false);
  const [acreditarCtx, setAcreditarCtx] = useState(null); // { alumnoId, mesNum, anchorX, anchorY }

  useEffect(() => { localStorage.setItem('pag_anio',    anio);         }, [anio]);
  useEffect(() => { localStorage.setItem('pag_estado',  fEstado);      }, [fEstado]);
  useEffect(() => { localStorage.setItem('pag_horario', fHorario);     }, [fHorario]);
  useEffect(() => { localStorage.setItem('pag_lab',     fLaboratorio); }, [fLaboratorio]);
  useEffect(() => { localStorage.setItem('pag_dia',     fDia);         }, [fDia]);
  useEffect(() => { localStorage.setItem('pag_busq',    busqueda);     }, [busqueda]);

  useEffect(() => {
    API.get('/asistencia/filtros').then(({ data }) => setFiltros(data)).catch(console.error);
  }, []);

  const cargar = useCallback(async () => {
    setCargando(true); setPending({});
    try {
      const p = new URLSearchParams({ anio });
      if (fEstado)      p.append('estado',      fEstado);
      if (fHorario)     p.append('horario',      fHorario);
      if (fLaboratorio) p.append('laboratorio',  fLaboratorio);
      if (fDia)         p.append('dia',          fDia);
      const { data } = await API.get(`/mensualidades/grid?${p}`);
      setAlumnos(data);
    } catch (err) { console.error(err); }
    finally { setCargando(false); }
  }, [anio, fEstado, fHorario, fLaboratorio, fDia]);

  useEffect(() => { cargar(); }, [cargar]);

  const alumnosFiltrados = busqueda
    ? alumnos.filter(a => `${a.nombre} ${a.apellido} ${a.clave || ''} ${a.codigo_estudiante || ''}`.toLowerCase().includes(busqueda.toLowerCase()))
    : alumnos;

  const getVal = (alumnoId, mesNum) => {
    const k = `${alumnoId}_${mesNum}`;
    if (k in pending) return pending[k];
    const a = alumnos.find(x => x.id === alumnoId);
    return a?.meses?.[mesNum]?.no_recibo ?? '';
  };

  const getMesData = (alumnoId, mesNum) => {
    const a = alumnos.find(x => x.id === alumnoId);
    return a?.meses?.[mesNum] ?? null;
  };

  const setVal = (alumnoId, mesNum, val) =>
    setPending(prev => ({ ...prev, [`${alumnoId}_${mesNum}`]: val }));

  const navigate = (alumnoId, mesNum, dir) => {
    const ai = alumnosFiltrados.findIndex(a => a.id === alumnoId);
    let na = ai, nm = mesNum;
    if (dir === 'right') { nm < 12 ? nm++ : (na < alumnosFiltrados.length - 1 && (na++, nm = 1)); }
    else if (dir === 'left')  { nm > 1 ? nm-- : (na > 0 && (na--, nm = 12)); }
    else if (dir === 'down')  { na < alumnosFiltrados.length - 1 && na++; }
    else if (dir === 'up')    { na > 0 && na--; }
    document.getElementById(pcid(alumnosFiltrados[na]?.id, nm))?.focus();
  };

  const handleKey = (e, alumnoId, mesNum) => {
    const dirs = { ArrowRight:'right', ArrowLeft:'left', ArrowDown:'down', ArrowUp:'up' };
    if (dirs[e.key]) { e.preventDefault(); navigate(alumnoId, mesNum, dirs[e.key]); }
    else if (e.key === 'Enter') { e.preventDefault(); navigate(alumnoId, mesNum, 'down'); }
    else if (e.key === 'Tab')   { e.preventDefault(); navigate(alumnoId, mesNum, e.shiftKey ? 'left' : 'right'); }
  };

  const hasChanges = Object.keys(pending).length > 0;

  const guardar = async () => {
    setGuardando(true);
    try {
      const cambios = Object.entries(pending).map(([k, no_recibo]) => {
        const [alumno_id, mes_num] = k.split('_');
        return { alumno_id: Number(alumno_id), mes_num: Number(mes_num), no_recibo: no_recibo || null };
      });
      await API.post('/mensualidades/grid', { anio, cambios });
      setAlumnos(prev => prev.map(a => {
        const meses = { ...a.meses };
        Object.entries(pending).forEach(([k, v]) => {
          const [aid, mn] = k.split('_');
          if (Number(aid) === a.id) {
            const m = Number(mn);
            meses[m] = {
              ...(meses[m] || {}),
              no_recibo: v || '',
              pagado: v ? 1 : 0,
              monto_abonado: v ? (meses[m]?.monto_abonado || 0) : 0,
            };
          }
        });
        return { ...a, meses };
      }));
      setPending({});
      setMsg('ok'); setTimeout(() => setMsg(''), 3000);
    } catch { setMsg('err'); setTimeout(() => setMsg(''), 3000); }
    finally { setGuardando(false); }
  };

  // Verde = pagado | Azul = acreditado | Naranja = abono | Amarillo = editando
  // Gris = mes fuera del rango configurado | Sin color = pendiente
  const mesStyle = (alumnoId, mesNum) => {
    const k = `${alumnoId}_${mesNum}`;
    if (k in pending) return { background: '#fff9c4' };
    const d = getMesData(alumnoId, mesNum);
    if (!d) return {};
    if (d.acreditado)                 return { background: '#bbdefb' }; // azul claro
    if (d.esperado === false)         return { background: '#90a4ae', color: '#37474f' }; // fuera de rango (gris oscuro)
    if (d.pagado)                     return { background: '#c8e6c9' };
    if ((d.monto_abonado || 0) > 0)  return { background: '#ffe0b2' };
    return {};
  };

  const mesTitle = (alumnoId, mesNum) => {
    const d = getMesData(alumnoId, mesNum);
    if (!d) return undefined;
    if (d.acreditado) return `Acreditado: ${d.acreditado_msg || 'Gratis'}`;
    if (d.esperado === false) return 'Mes fuera del rango configurado para este alumno';
    if (d.multiplicador && d.multiplicador !== 1)
      return `Cuota ajustada × ${d.multiplicador} (Q${(parseFloat(d.monto)).toFixed(2)})`;
    if (!d.pagado && (d.monto_abonado || 0) > 0) {
      const pendiente = (parseFloat(d.monto) - d.monto_abonado).toFixed(2);
      return `Abono: Q${d.monto_abonado.toFixed(2)} | Pendiente: Q${pendiente}`;
    }
    return undefined;
  };

  const handleContextMenu = (e, alumnoId, mesNum) => {
    if (!puedeEditar) return;
    e.preventDefault();
    setAcreditarCtx({ alumnoId, mesNum, anchorX: e.clientX, anchorY: e.clientY });
  };

  const acreditarMes = async (alumnoId, mesNum, mensaje) => {
    try {
      const a = alumnos.find(x => x.id === alumnoId);
      const cell = a?.meses?.[mesNum];
      if (cell?.id) {
        await API.post(`/mensualidades/${cell.id}/acreditar`, { mensaje });
      } else {
        await API.post('/mensualidades/acreditar-directo', {
          alumno_id: alumnoId, anio, mes_num: mesNum, mensaje,
        });
      }
      setAcreditarCtx(null);
      await cargar();
    } catch (err) {
      console.error(err);
      setMsg('err'); setTimeout(() => setMsg(''), 3000);
      setAcreditarCtx(null);
    }
  };

  const desacreditarMes = async (alumnoId, mesNum) => {
    try {
      const a = alumnos.find(x => x.id === alumnoId);
      const cell = a?.meses?.[mesNum];
      if (!cell?.id) return;
      await API.delete(`/mensualidades/${cell.id}/acreditar`);
      setAcreditarCtx(null);
      await cargar();
    } catch (err) {
      console.error(err);
      setAcreditarCtx(null);
    }
  };

  return (
    <div className="admin-layout">
      <Sidebar />
      <div className="admin-content">
        <h1>💰 Pagos y Mensualidades</h1>
        <p className="subtitle">
          Verde = pagado · Naranja = abono parcial · Ingresa número de recibo por mes.
        </p>

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
          <input
            type="text"
            className="search-input"
            placeholder="Buscar alumno..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            style={{ minWidth: 180 }}
          />
          {puedeEditar && (
            <button
              title="Configurar rango de meses y multiplicadores por año"
              onClick={() => setShowConfig(true)}
              style={{
                padding: '0.4rem 0.9rem', background: '#e8eaf6',
                border: '1px solid #c5cae9', borderRadius: 8,
                cursor: 'pointer', fontSize: '0.88rem', fontWeight: 600, color: '#3949ab'
              }}
            >
              ⚙ Configuración de pagos
            </button>
          )}
          {verInstitucion && (
            <button
              title="Configurar el membrete de los recibos (logo, institución, datos extra)"
              onClick={() => {
                // El membrete se administra desde el módulo de Configuración:
                // pestaña "Membretes" → seleccionar "Recibos (Nuevo Pago)".
                localStorage.setItem('cfg_tab', 'membretes');
                window.location.assign('/admin/configuracion');
              }}
              style={{
                padding: '0.4rem 0.9rem', background: '#e8eaf6',
                border: '1px solid #c5cae9', borderRadius: 8,
                cursor: 'pointer', fontSize: '0.88rem', fontWeight: 600, color: '#3949ab'
              }}
            >
              🪪 Membrete de recibos
            </button>
          )}
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
                    <th className="ng-th-fijo" style={{ textAlign: 'center', minWidth: 60 }}>Cuota</th>
                    {MESES.map((m, i) => (
                      <th key={i + 1} className={`ng-th-col${i === 0 ? ' ng-sep' : ''}`}>{m}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {alumnosFiltrados.length === 0 ? (
                    <tr><td colSpan={3 + 12} style={{ textAlign: 'center', padding: '2rem', color: '#999' }}>No hay alumnos con los filtros seleccionados</td></tr>
                  ) : alumnosFiltrados.map(a => (
                    <tr key={a.id}>
                      <td className="ng-td-fijo ng-codigo" title={a.codigo_estudiante || 'sin código'}>{a.clave}</td>
                      <td className="ng-td-fijo ng-nombre">{a.nombre} {a.apellido}</td>
                      <td className="ng-td-fijo" style={{ textAlign: 'center', color: '#555', fontSize: '0.8rem' }}>
                        Q{parseFloat(a.cuota_mensual || 0).toFixed(2)}
                      </td>
                      {MESES.map((_, i) => {
                        const m = i + 1;
                        const val = getVal(a.id, m);
                        const d = getMesData(a.id, m);
                        const fueraRango = d?.esperado === false && !d?.acreditado;
                        return (
                          <td key={m} className={`ng-cell${m === 1 ? ' ng-sep' : ''}`}
                            style={mesStyle(a.id, m)}
                            title={mesTitle(a.id, m)}
                            onContextMenu={e => handleContextMenu(e, a.id, m)}>
                            {d?.acreditado ? (
                              <span style={{
                                display: 'inline-block', fontSize: '0.72rem',
                                fontWeight: 700, color: '#0d47a1', padding: '2px 4px',
                              }}>
                                {d.acreditado_msg || 'Gratis'}
                              </span>
                            ) : (
                              <input
                                id={pcid(a.id, m)}
                                type="text"
                                value={val}
                                onChange={e => puedeEditar && !fueraRango && setVal(a.id, m, e.target.value)}
                                onKeyDown={e => handleKey(e, a.id, m)}
                                readOnly={!puedeEditar || fueraRango}
                                className="ng-recibo"
                                style={{
                                  background: 'transparent', minWidth: 54,
                                  cursor: (puedeEditar && !fueraRango) ? 'text' : 'not-allowed',
                                  color: fueraRango ? '#37474f' : 'inherit',
                                }}
                                placeholder={fueraRango ? '–' : '—'}
                              />
                            )}
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

      {showConfig && (
        <ConfigPagosModal
          anio={anio}
          filtros={filtros}
          alumnos={alumnos}
          onClose={() => { setShowConfig(false); cargar(); }}
        />
      )}

      {acreditarCtx && (
        <div
          onClick={() => setAcreditarCtx(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 600 }}
        >
          <AcreditarMenu
            ctx={acreditarCtx}
            mesData={getMesData(acreditarCtx.alumnoId, acreditarCtx.mesNum)}
            onAcreditar={(msg) => acreditarMes(acreditarCtx.alumnoId, acreditarCtx.mesNum, msg)}
            onDesacreditar={() => desacreditarMes(acreditarCtx.alumnoId, acreditarCtx.mesNum)}
          />
        </div>
      )}
    </div>
  );
}

// Menú flotante para acreditar/desacreditar un mes (anclado al click derecho).
function AcreditarMenu({ ctx, mesData, onAcreditar, onDesacreditar }) {
  const [msg, setMsg] = useState(mesData?.acreditado_msg || 'Gratis');
  const yaAcred = !!mesData?.acreditado;

  return (
    <div
      onClick={e => e.stopPropagation()}
      style={{
        position: 'fixed', top: ctx.anchorY, left: ctx.anchorX,
        background: '#fff', border: '1px solid #c5cae9', borderRadius: 8,
        boxShadow: '0 4px 14px rgba(0,0,0,0.18)', padding: '0.7rem',
        minWidth: 220, zIndex: 700,
      }}
    >
      <div style={{ fontSize: '0.75rem', color: '#666', marginBottom: 6 }}>
        Acreditar mes (no se cobrará)
      </div>
      <input
        type="text"
        value={msg}
        onChange={e => setMsg(e.target.value)}
        placeholder="Gratis"
        autoFocus
        style={{
          width: '100%', boxSizing: 'border-box',
          padding: '0.4rem 0.5rem', fontSize: '0.85rem',
          border: '1.5px solid #c5cae9', borderRadius: 6, marginBottom: 6,
        }}
      />
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        {yaAcred && (
          <button
            onClick={onDesacreditar}
            style={{
              background: '#fff', color: '#c62828',
              border: '1px solid #ffcdd2', borderRadius: 6,
              padding: '4px 8px', fontSize: '0.8rem', cursor: 'pointer',
            }}
          >
            Quitar
          </button>
        )}
        <button
          onClick={() => onAcreditar(msg.trim() || 'Gratis')}
          style={{
            background: '#1a237e', color: '#fff',
            border: 'none', borderRadius: 6,
            padding: '4px 10px', fontSize: '0.8rem', cursor: 'pointer', fontWeight: 600,
          }}
        >
          {yaAcred ? 'Actualizar' : 'Acreditar'}
        </button>
      </div>
    </div>
  );
}
