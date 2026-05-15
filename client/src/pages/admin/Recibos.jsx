import { useState, useEffect, useCallback, useRef } from 'react';
import Sidebar from '../../components/Sidebar';
import ScrollableTable from '../../components/ScrollableTable';
import CierreDiarioModal from '../../components/CierreDiarioModal';
import API from '../../api/axios';
import useUnsavedGuard from '../../hooks/useUnsavedGuard';
import './admin.css';

const PAGE_SIZE = 100;
const ls = (k, d) => localStorage.getItem(k) ?? d;
const fmtDate = (d) => (d ? String(d).slice(0, 10) : '');
// Fecha local YYYY-MM-DD (no UTC). `toISOString` está en UTC y en GT
// (UTC-6) ya devuelve el día siguiente después de las 6pm local.
const hoyStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};

const nuevoDraft = () => ({
  _key: Math.random().toString(36).slice(2) + Date.now().toString(36),
  no_recibo: '', alumno_id: null, alumno_txt: '',
  meses: '', fecha: '', total: '', observaciones: '', no_deposito: '',
});

const tieneDatos = (d) =>
  !!(d.no_recibo || d.alumno_id || d.meses || d.fecha || d.total || d.observaciones || d.no_deposito);

// Borde inferior que separa grupos de fecha
const BORDER_SEP = '2.5px solid #5c6bc0';

export default function Recibos() {
  const [registros,  setRegistros]  = useState([]);
  const [alumnos,    setAlumnos]    = useState([]);
  const [cargando,   setCargando]   = useState(false);
  const [busqueda,   setBusqueda]   = useState(() => ls('rec_busq', ''));
  // Página arranca en 1 — el listado ya viene ordenado con los numéricos
  // (1, 2, 3, …) primero, así que la primera página muestra los recibos
  // en orden ascendente desde el inicio del correlativo.
  const [pagina,     setPagina]     = useState(1);
  const [pending,    setPending]    = useState({});
  const [drafts,     setDrafts]     = useState([]);
  const [guardando,  setGuardando]  = useState(false);
  const [msg,        setMsg]        = useState('');
  const [cierreModal, setCierreModal] = useState(null); // null | { fecha }
  const [cierreHoy,   setCierreHoy]   = useState(null);
  const [cierres,     setCierres]     = useState([]);
  const [anulando,    setAnulando]    = useState(null); // recibo a confirmar
  const [anulandoMsg, setAnulandoMsg] = useState('');
  const firstRender = useRef(true);

  useEffect(() => { localStorage.setItem('rec_busq', busqueda); }, [busqueda]);

  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    setPagina(1);
  }, [busqueda]);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const [{ data: recs }, { data: alus }, { data: cierre }, { data: lista }] = await Promise.all([
        API.get('/recibos'),
        API.get('/alumnos'),
        API.get('/cierres/hoy?modulo=recibos').catch(() => ({ data: null })),
        API.get('/cierres?modulo=recibos').catch(() => ({ data: [] })),
      ]);
      setRegistros(recs);
      setAlumnos(alus);
      setCierreHoy(cierre);
      setCierres(lista);
    } catch (err) { console.error(err); }
    finally { setCargando(false); }
  }, []);

  const recargarCierre = useCallback(async () => {
    try {
      const [{ data }, { data: lista }] = await Promise.all([
        API.get('/cierres/hoy?modulo=recibos'),
        API.get('/cierres?modulo=recibos').catch(() => ({ data: [] })),
      ]);
      setCierreHoy(data);
      setCierres(lista);
    } catch (err) { console.error(err); }
  }, []);

  const cierrePorFecha = (() => {
    const m = {};
    cierres.forEach(c => { m[c.fecha] = c; });
    return m;
  })();

  useEffect(() => { cargar(); }, [cargar]);

  const q = busqueda.toLowerCase().trim();
  const filtrados = q
    ? registros.filter(r =>
        (r.no_recibo         || '').toLowerCase().includes(q) ||
        (r.alumno_nombre     || '').toLowerCase().includes(q) ||
        (r.clave             || '').toLowerCase().includes(q) ||
        (r.codigo_estudiante || '').toLowerCase().includes(q)
      )
    : registros;

  const totalPag     = Math.max(1, Math.ceil(filtrados.length / PAGE_SIZE));
  const paginaActual = Math.min(Math.max(1, pagina || 1), totalPag);
  const inicio       = (paginaActual - 1) * PAGE_SIZE;
  const visibles     = filtrados.slice(inicio, inicio + PAGE_SIZE);
  const esUltimaPag  = paginaActual === totalPag;

  const findAlumno = (txt) => {
    const code = txt.split(' - ')[0]?.trim();
    if (!code) return null;
    return alumnos.find(a => a.clave === code || a.codigo_estudiante === code) ?? null;
  };

  const alumnoDisplay = (r) => {
    // Si el recibo está vinculado a un alumno mostramos "clave - nombre".
    // Si no (caso importación con texto libre o "anulado"), mostramos
    // directamente alumno_nombre que el backend trae con COALESCE
    // (alumno_texto incluido).
    if (r.alumno_id) {
      return [r.clave || r.codigo_estudiante, r.alumno_nombre].filter(Boolean).join(' - ');
    }
    return r.alumno_nombre || '';
  };

  const getVal = (r, campo) => {
    if (campo === 'alumno_txt') {
      if (pending[r.id]?.alumno_txt !== undefined) return pending[r.id].alumno_txt;
      return alumnoDisplay(r);
    }
    if (pending[r.id]?.[campo] !== undefined) return pending[r.id][campo];
    if (campo === 'fecha') return fmtDate(r.fecha);
    return r[campo] ?? '';
  };

  const setEdit = (id, campo, valor) =>
    setPending(prev => ({ ...prev, [id]: { ...(prev[id] || {}), [campo]: valor } }));

  const handleAlumnoEdit = (id, txt) => {
    const found = findAlumno(txt);
    setPending(prev => ({
      ...prev,
      [id]: { ...(prev[id] || {}), alumno_txt: txt, alumno_id: found?.id ?? null },
    }));
  };

  const updateDraft = (key, patch) => {
    setDrafts(prev => prev.map(d => d._key === key ? { ...d, ...patch } : d));
  };

  const handleDraftAlumno = (key, txt) => {
    const found = findAlumno(txt);
    updateDraft(key, { alumno_txt: txt, alumno_id: found?.id ?? null });
  };

  const agregarFila = () => {
    setDrafts(prev => [...prev, nuevoDraft()]);
    setPagina(totalPag);
  };

  const hasChanges  = Object.keys(pending).length > 0;
  const draftsConDatos = drafts.filter(tieneDatos);
  const hayDrafts = draftsConDatos.length > 0;

  useUnsavedGuard(hasChanges || hayDrafts);

  const guardar = async () => {
    if (!hasChanges && !hayDrafts) return;
    setGuardando(true);
    try {
      if (hasChanges) {
        await Promise.all(
          Object.entries(pending).map(([id, ch]) => {
            const orig = registros.find(r => r.id === Number(id)) || {};
            return API.put(`/recibos/${id}`, {
              no_recibo:    ch.no_recibo    !== undefined ? ch.no_recibo    : orig.no_recibo,
              alumno_id:    ch.alumno_id    !== undefined ? ch.alumno_id    : orig.alumno_id,
              meses:        ch.meses        !== undefined ? ch.meses        : orig.meses,
              fecha:        ch.fecha        !== undefined ? ch.fecha        : fmtDate(orig.fecha),
              total:        ch.total        !== undefined ? ch.total        : orig.total,
              observaciones:ch.observaciones!== undefined ? ch.observaciones: orig.observaciones,
              no_deposito:  ch.no_deposito  !== undefined ? ch.no_deposito  : orig.no_deposito,
            });
          })
        );
        setRegistros(prev => prev.map(r => {
          const ch = pending[r.id];
          if (!ch) return r;
          const alumnoData = ch.alumno_id != null ? alumnos.find(a => a.id === ch.alumno_id) : null;
          return {
            ...r,
            no_recibo:        ch.no_recibo    !== undefined ? ch.no_recibo    : r.no_recibo,
            alumno_id:        ch.alumno_id    !== undefined ? ch.alumno_id    : r.alumno_id,
            alumno_nombre:    alumnoData ? `${alumnoData.nombre} ${alumnoData.apellido}` : r.alumno_nombre,
            clave:            alumnoData ? alumnoData.clave : r.clave,
            codigo_estudiante:alumnoData ? alumnoData.codigo_estudiante : r.codigo_estudiante,
            meses:            ch.meses        !== undefined ? ch.meses        : r.meses,
            fecha:            ch.fecha        !== undefined ? ch.fecha        : r.fecha,
            total:            ch.total        !== undefined ? ch.total        : r.total,
            observaciones:    ch.observaciones!== undefined ? ch.observaciones: r.observaciones,
            no_deposito:      ch.no_deposito  !== undefined ? ch.no_deposito  : r.no_deposito,
          };
        }));
        setPending({});
      }

      if (hayDrafts) {
        const nuevos = [];
        for (const d of draftsConDatos) {
          const { data: newRec } = await API.post('/recibos', {
            no_recibo:    d.no_recibo    || null,
            alumno_id:    d.alumno_id    || null,
            meses:        d.meses        || null,
            fecha:        d.fecha        || null,
            total:        d.total        || null,
            observaciones:d.observaciones|| null,
            no_deposito:  d.no_deposito  || null,
          });
          nuevos.push(newRec);
        }
        const keysGuardados = new Set(draftsConDatos.map(d => d._key));
        setRegistros(prev => {
          const next = [...prev, ...nuevos];
          const newLast = Math.max(1, Math.ceil(next.length / PAGE_SIZE));
          setTimeout(() => setPagina(newLast), 0);
          return next;
        });
        setDrafts(prev => prev.filter(d => !keysGuardados.has(d._key)));
      }

      setMsg('ok'); setTimeout(() => setMsg(''), 3000);
    } catch (err) {
      console.error(err);
      setMsg('err'); setTimeout(() => setMsg(''), 3000);
    } finally { setGuardando(false); }
  };

  // ── Subtotales por fecha (se recalcula en cada render con valores actuales) ──
  // No suma recibos anulados — se conservan visibles pero no cuentan al total.
  const rowMeta = (() => {
    const groups = {};
    visibles.forEach((r, idx) => {
      const f = getVal(r, 'fecha') || '_';
      const t = r.anulado ? 0 : (parseFloat(getVal(r, 'total') || 0) || 0);
      if (!groups[f]) groups[f] = { sum: 0, lastIdx: idx };
      groups[f].sum += t;
      groups[f].lastIdx = idx;
    });
    return visibles.map((r, idx) => {
      const f = getVal(r, 'fecha') || '_';
      const g = groups[f];
      const isLast = idx === g?.lastIdx;
      return { isLast, subtotal: isLast ? g.sum : null };
    });
  })();

  const buildPages = () => {
    const pages = [];
    for (let i = 1; i <= totalPag; i++) {
      if (i === 1 || i === totalPag || Math.abs(i - paginaActual) <= 2) pages.push(i);
    }
    const items = [];
    let prev = 0;
    for (const p of pages) {
      if (p - prev > 1) items.push('…');
      items.push(p);
      prev = p;
    }
    return items;
  };

  const limpiarDuplicados = async () => {
    if (!confirm(
      'Esto borrará los recibos duplicados (mismo no_recibo).  Por cada grupo se ' +
      'conserva el de menor id, y si ese no tiene alumno_id se le copia el de un ' +
      'duplicado antes de borrar el resto.  Acción irreversible. ¿Continuar?'
    )) return;
    try {
      const { data } = await API.post('/recibos/limpiar-duplicados');
      alert(
        `Limpieza completa:\n` +
        `  - Grupos duplicados procesados: ${data.grupos}\n` +
        `  - Recibos borrados: ${data.borrados}\n` +
        `  - Recibos re-vinculados a alumno: ${data.vinculados_alumno}`
      );
      await cargar();
    } catch (err) {
      alert(err.response?.data?.message || 'Error al limpiar duplicados');
    }
  };

  const confirmarAnular = async () => {
    if (!anulando) return;
    setAnulandoMsg('');
    try {
      const { data } = await API.post(`/recibos/${anulando.id}/anular`);
      // Actualizamos el registro en memoria con prefijo ANULADO.
      setRegistros(prev => prev.map(r => r.id === anulando.id ? {
        ...r,
        anulado: 1,
        meses: (r.meses || '').toString().toUpperCase().startsWith('ANULADO')
          ? r.meses
          : `ANULADO${r.meses ? ' — ' + r.meses : ''}`,
        observaciones: (r.observaciones || '').toString().toUpperCase().startsWith('ANULADO')
          ? r.observaciones
          : `ANULADO${r.observaciones ? ' — ' + r.observaciones : ''}`,
      } : r));
      setAnulando(null);
      setMsg('ok');
      setTimeout(() => setMsg(''), 3000);
      if (data?.mensualidades_restauradas > 0) {
        setAnulandoMsg(`${data.mensualidades_restauradas} mensualidad(es) liberadas.`);
        setTimeout(() => setAnulandoMsg(''), 5000);
      }
    } catch (err) {
      setAnulandoMsg(err.response?.data?.message || 'Error al anular el recibo.');
    }
  };

  const descriptionCambios = (() => {
    const partes = [];
    if (hasChanges) partes.push(`${Object.keys(pending).length} edición(es)`);
    if (hayDrafts) partes.push(`${draftsConDatos.length} nuevo(s) recibo(s)`);
    return partes.join(' + ');
  })();

  return (
    <div className="admin-layout">
      <Sidebar />
      <div className="admin-content">
        <h1>🧾 Recibos</h1>
        <p className="subtitle">
          Registra los recibos de pago de mensualidades. Agrega tantas filas como necesites; las filas vacías no se guardarán.
        </p>

        <div className="asist-filtros">
          <input
            type="text"
            className="search-input"
            placeholder="Buscar por alumno o no. de recibo..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            style={{ minWidth: 280 }}
          />
          <span style={{ fontSize: '0.82rem', color: '#666', whiteSpace: 'nowrap' }}>
            {filtrados.length} registro(s)
          </span>
          <button className="btn-primary" onClick={agregarFila} style={{ marginLeft: 'auto' }}>
            + Agregar fila
          </button>
          <button
            className="btn-cancel"
            onClick={limpiarDuplicados}
            title="Borra recibos con el mismo no_recibo, conservando el de menor id"
          >
            🧹 Limpiar duplicados
          </button>
          <button
            className="btn-primary"
            onClick={() => setCierreModal({ fecha: new Date().toISOString().slice(0,10) })}
            style={{
              background: cierreHoy?.cierre?.estado === 'revisado' ? '#2e7d32'
                        : cierreHoy?.cierre ? '#e65100' : '#1a237e',
            }}
            title={
              cierreHoy?.cierre?.estado === 'revisado' ? 'Cierre de hoy revisado' :
              cierreHoy?.cierre ? 'Cierre de hoy pendiente de revisión' :
              'Crear cierre del día'
            }
          >
            📊 Cierre del día
            {cierreHoy?.cierre?.estado === 'revisado' && ' ✓'}
            {cierreHoy?.cierre?.estado === 'pendiente' && ' ⏳'}
          </button>
          {paginaActual < totalPag && (
            <button className="rec-pag-btn" onClick={() => setPagina(totalPag)}>
              Ir al final ↓
            </button>
          )}
        </div>

        {(hasChanges || hayDrafts) && (
          <div className="asist-save-bar">
            <span style={{ fontSize: '0.88rem', color: '#7b5800' }}>
              {descriptionCambios}
            </span>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="btn-cancel" disabled={guardando}
                onClick={() => { setPending({}); setDrafts([]); }}>
                Descartar
              </button>
              <button className="btn-primary" disabled={guardando} onClick={guardar}>
                {guardando ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        )}
        {msg === 'ok'  && <div className="msg-ok"  style={{ marginBottom: '0.75rem' }}>Guardado correctamente</div>}
        {msg === 'err' && <div className="msg-err" style={{ marginBottom: '0.75rem' }}>Error al guardar</div>}

        <datalist id="rec-alumnos">
          {alumnos.map(a => (
            <option key={a.id} value={`${a.clave} - ${a.nombre} ${a.apellido}`} />
          ))}
        </datalist>

        <div className="table-container">
          {cargando ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: '#999' }}>Cargando...</div>
          ) : (
            <>
              <ScrollableTable>
                <table className="recibo-grid">
                  <thead>
                    <tr>
                      <th style={{ width: 44, textAlign: 'center' }}>No.</th>
                      <th style={{ minWidth: 110 }}>No. Recibo</th>
                      <th style={{ minWidth: 210 }}>Alumno</th>
                      <th style={{ minWidth: 150 }}>Meses</th>
                      <th style={{ minWidth: 120 }}>Fecha</th>
                      <th style={{ minWidth: 90, textAlign: 'right' }}>Total</th>
                      <th style={{ minWidth: 90, textAlign: 'right', color: '#1a237e' }}>Subtotal</th>
                      <th style={{ minWidth: 110, textAlign: 'center', color: '#1a237e' }}>Cierre</th>
                      <th style={{ minWidth: 130 }}>No. Depósito</th>
                      <th style={{ minWidth: 190 }}>Observaciones</th>
                      <th style={{ minWidth: 90, textAlign: 'center' }}>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibles.map((r, idx) => {
                      const meta = rowMeta[idx];
                      const esAnulado = !!r.anulado;
                      const fechaRow = getVal(r, 'fecha');
                      const puedeAnular = !esAnulado && fechaRow === hoyStr();
                      const rowStyle = {
                        ...(pending[r.id] ? { background: '#fffde7' } : {}),
                        ...(esAnulado ? { background: '#fbebeb', color: '#9e9e9e' } : {}),
                        ...(meta.isLast ? { borderBottom: BORDER_SEP } : {}),
                      };
                      return (
                        <tr key={r.id} style={rowStyle} className={esAnulado ? 'rec-anulado' : ''}>
                          <td className="rc-no">{inicio + idx + 1}</td>
                          <td>
                            <input className="recibo-input" type="text"
                              value={getVal(r, 'no_recibo')}
                              onChange={e => setEdit(r.id, 'no_recibo', e.target.value)}
                              placeholder="—" />
                          </td>
                          <td>
                            <input className="recibo-input" type="text"
                              list="rec-alumnos"
                              value={getVal(r, 'alumno_txt')}
                              onChange={e => handleAlumnoEdit(r.id, e.target.value)}
                              placeholder="Buscar alumno..." />
                          </td>
                          <td>
                            <input className="recibo-input" type="text"
                              value={getVal(r, 'meses')}
                              onChange={e => setEdit(r.id, 'meses', e.target.value)}
                              placeholder="Ene, Feb..." />
                          </td>
                          <td>
                            <input className="recibo-input" type="date"
                              value={getVal(r, 'fecha')}
                              onChange={e => setEdit(r.id, 'fecha', e.target.value)} />
                          </td>
                          <td>
                            <input className="recibo-input" type="number" step="0.01" min="0"
                              value={getVal(r, 'total')}
                              onChange={e => setEdit(r.id, 'total', e.target.value)}
                              placeholder="0.00" style={{ textAlign: 'right' }} />
                          </td>
                          <td style={{ textAlign: 'right', paddingRight: 10, whiteSpace: 'nowrap' }}>
                            {meta.isLast && meta.subtotal != null ? (
                              <span style={{
                                fontWeight: 700, fontSize: '0.82rem', color: '#1a237e',
                                background: '#e8eaf6', borderRadius: 5, padding: '2px 7px',
                              }}>
                                Q {meta.subtotal.toFixed(2)}
                              </span>
                            ) : null}
                          </td>
                          <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                            {meta.isLast ? (() => {
                              const f = getVal(r, 'fecha');
                              const cz = f ? cierrePorFecha[f] : null;
                              const bg = cz?.estado === 'revisado' ? '#2e7d32'
                                       : cz ? '#e65100' : '#1a237e';
                              const lbl = cz?.estado === 'revisado' ? '✓ Revisado'
                                        : cz ? '⏳ Pendiente' : '+ Cierre';
                              return (
                                <button
                                  type="button"
                                  onClick={() => f && setCierreModal({ fecha: f })}
                                  disabled={!f}
                                  style={{
                                    background: bg, color: '#fff', border: 'none',
                                    padding: '3px 9px', borderRadius: 5, fontSize: '0.72rem',
                                    fontWeight: 700, cursor: f ? 'pointer' : 'not-allowed',
                                    opacity: f ? 1 : 0.5,
                                  }}
                                  title={cz ? `Cierre del ${f}` : `Crear cierre del ${f}`}
                                >
                                  {lbl}
                                </button>
                              );
                            })() : null}
                          </td>
                          <td>
                            <input className="recibo-input" type="text"
                              value={getVal(r, 'no_deposito')}
                              onChange={e => setEdit(r.id, 'no_deposito', e.target.value)}
                              placeholder="—" />
                          </td>
                          <td>
                            <input className="recibo-input" type="text"
                              value={getVal(r, 'observaciones')}
                              onChange={e => setEdit(r.id, 'observaciones', e.target.value)}
                              placeholder="—" />
                          </td>
                          <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                            {esAnulado ? (
                              <span style={{
                                background: '#c62828', color: '#fff',
                                padding: '3px 9px', borderRadius: 5,
                                fontSize: '0.72rem', fontWeight: 700,
                              }}>
                                ✕ Anulado
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setAnulando(r)}
                                disabled={!puedeAnular}
                                title={puedeAnular
                                  ? 'Anular recibo (solo el mismo día)'
                                  : 'Solo se puede anular el día de emisión'}
                                style={{
                                  background: puedeAnular ? '#e53935' : '#bdbdbd',
                                  color: '#fff', border: 'none',
                                  padding: '3px 9px', borderRadius: 5,
                                  fontSize: '0.72rem', fontWeight: 700,
                                  cursor: puedeAnular ? 'pointer' : 'not-allowed',
                                }}
                              >
                                Anular
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}

                    {esUltimaPag && drafts.map((d) => (
                      <tr key={d._key} style={{ background: '#f3f8ff', borderTop: '2px solid #c5cae9' }}>
                        <td className="rc-no" style={{ color: '#1a237e' }}>+</td>
                        <td>
                          <input className="recibo-input" type="text"
                            value={d.no_recibo}
                            onChange={e => updateDraft(d._key, { no_recibo: e.target.value })}
                            placeholder="Nuevo recibo..." />
                        </td>
                        <td>
                          <input className="recibo-input" type="text"
                            list="rec-alumnos"
                            value={d.alumno_txt}
                            onChange={e => handleDraftAlumno(d._key, e.target.value)}
                            placeholder="Buscar alumno..." />
                        </td>
                        <td>
                          <input className="recibo-input" type="text"
                            value={d.meses}
                            onChange={e => updateDraft(d._key, { meses: e.target.value })}
                            placeholder="Ene, Feb..." />
                        </td>
                        <td>
                          <input className="recibo-input" type="date"
                            value={d.fecha}
                            onChange={e => updateDraft(d._key, { fecha: e.target.value })} />
                        </td>
                        <td>
                          <input className="recibo-input" type="number" step="0.01" min="0"
                            value={d.total}
                            onChange={e => updateDraft(d._key, { total: e.target.value })}
                            placeholder="0.00" style={{ textAlign: 'right' }} />
                        </td>
                        <td />
                        <td />
                        <td>
                          <input className="recibo-input" type="text"
                            value={d.no_deposito}
                            onChange={e => updateDraft(d._key, { no_deposito: e.target.value })}
                            placeholder="—" />
                        </td>
                        <td>
                          <input className="recibo-input" type="text"
                            value={d.observaciones}
                            onChange={e => updateDraft(d._key, { observaciones: e.target.value })}
                            placeholder="—" />
                        </td>
                        <td />
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollableTable>

              {totalPag > 1 && (
                <div className="rec-pagination">
                  <button className="rec-pag-btn" disabled={paginaActual === 1}
                    onClick={() => setPagina(1)}>«</button>
                  <button className="rec-pag-btn" disabled={paginaActual === 1}
                    onClick={() => setPagina(p => p - 1)}>‹</button>
                  {buildPages().map((item, i) =>
                    item === '…'
                      ? <span key={`e${i}`} style={{ color: '#999', padding: '0 4px' }}>…</span>
                      : <button key={item}
                          className={`rec-pag-btn${item === paginaActual ? ' active' : ''}`}
                          onClick={() => setPagina(item)}>{item}</button>
                  )}
                  <button className="rec-pag-btn" disabled={paginaActual === totalPag}
                    onClick={() => setPagina(p => p + 1)}>›</button>
                  <button className="rec-pag-btn" disabled={paginaActual === totalPag}
                    onClick={() => setPagina(totalPag)}>»</button>
                  <span className="rec-pag-info">
                    Pág. {paginaActual}/{totalPag} · {filtrados.length} registros
                  </span>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {cierreModal && (
        <CierreDiarioModal
          modulo="recibos"
          fecha={cierreModal.fecha}
          onClose={() => setCierreModal(null)}
          onSaved={recargarCierre}
        />
      )}

      {anulando && (
        <div
          onClick={() => setAnulando(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
            zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#fff', borderRadius: 12, padding: '1.5rem',
              maxWidth: 460, width: '92%',
              boxShadow: '0 6px 20px rgba(0,0,0,0.2)',
            }}
          >
            <h2 style={{ marginTop: 0, color: '#c62828' }}>Anular recibo</h2>
            <p style={{ color: '#444', fontSize: '0.92rem' }}>
              ¿Seguro que deseas anular el recibo <strong>#{anulando.no_recibo || '—'}</strong>?
            </p>
            <ul style={{ fontSize: '0.85rem', color: '#555', paddingLeft: '1.2rem' }}>
              <li>Se marcará como <strong>ANULADO</strong> y la descripción se actualizará.</li>
              <li>El recibo se conservará en el listado.</li>
              <li>Si está vinculado a meses de colegiatura, esos meses se liberarán y volverán a quedar pendientes.</li>
            </ul>
            {anulandoMsg && (
              <div style={{
                background: '#fff3e0', color: '#e65100',
                padding: '0.5rem 0.8rem', borderRadius: 6,
                fontSize: '0.85rem', marginTop: 8,
              }}>
                {anulandoMsg}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
              <button className="btn-cancel" onClick={() => setAnulando(null)}>Cancelar</button>
              <button
                className="btn-primary"
                onClick={confirmarAnular}
                style={{ background: '#c62828' }}
              >
                Sí, anular
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
