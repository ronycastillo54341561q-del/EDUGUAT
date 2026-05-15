import { useState, useEffect, useRef } from 'react';
import Sidebar from '../../components/Sidebar';
import API from '../../api/axios';
import { loadMembrete } from '../../lib/membrete';
import { generarReciboPDF } from '../../lib/reciboPDF';
import { useAniosFiltros } from '../../lib/anios';
import './admin.css';
import './NuevoPago.css';

// ─── Helpers generales ────────────────────────────────────────────────────────
const hoy = () => new Date().toISOString().slice(0, 10);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const fmtQ = (n) => `Q ${Number(n).toFixed(2)}`;
const fmtFecha = (iso) => {
  if (!iso) return '';
  const [y, m, d] = String(iso).split('-');
  return `${d}/${m}/${y}`;
};

// ─── Distribución de pago (cálculo local para preview) ──────────────────────
// montoEfectivo = lo que paga el alumno + descuento aplicado
function distribuirPago(meses, montoEfectivo) {
  const montoTotal = montoEfectivo;
  const pendientes = meses.filter(m => m.estado === 'pendiente' || m.estado === 'abono');
  let restante = montoTotal;
  const detalles = [];

  for (const m of pendientes) {
    if (restante <= 0) break;
    const deuda = m.pendiente;
    if (deuda <= 0) continue;

    if (restante >= deuda) {
      detalles.push({ mes: m.mes, tipo: 'completo', monto: deuda, cuota: m.monto, abonoPrevio: m.monto_abonado });
      restante -= deuda;
    } else {
      detalles.push({ mes: m.mes, tipo: 'abono', monto: restante, cuota: m.monto, abonoPrevio: m.monto_abonado });
      restante = 0;
    }
  }

  return { detalles, totalAplicado: montoTotal - restante, sobrante: restante };
}


// ─── Componente principal ─────────────────────────────────────────────────────
export default function NuevoPago() {
  const { anios } = useAniosFiltros();
  const [busqueda, setBusqueda]         = useState('');
  const [listaAlumnos, setListaAlumnos] = useState([]);
  const [showDrop, setShowDrop]         = useState(false);
  const [alumnoSel, setAlumnoSel]       = useState(null);
  const [estadoAlumno, setEstadoAlumno] = useState(null);
  const [anio, setAnio]                 = useState(new Date().getFullYear());
  const [monto, setMonto]               = useState('');
  const [descuento, setDescuento]       = useState('');
  const [fechaPago, setFechaPago]       = useState(hoy());
  const [preview, setPreview]           = useState(null);
  const [showModal, setShowModal]       = useState(false);
  const [procesando, setProcesando]     = useState(false);
  const [recibo, setRecibo]             = useState(null);
  const [error, setError]               = useState('');
  const [cargandoEst, setCargandoEst]   = useState(false);
  const dropRef = useRef(null);

  // Cargar alumnos para búsqueda
  useEffect(() => {
    API.get('/alumnos').then(r => setListaAlumnos(r.data)).catch(() => {});
  }, []);

  // Cerrar dropdown al hacer clic fuera
  useEffect(() => {
    const h = (e) => { if (dropRef.current && !dropRef.current.contains(e.target)) setShowDrop(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  // Cargar estado cuando cambia alumno o año
  useEffect(() => {
    if (!alumnoSel) return;
    setCargandoEst(true);
    setEstadoAlumno(null);
    setError('');
    API.get(`/nuevo-pago/estado/${alumnoSel.id}?anio=${anio}`)
      .then(r => setEstadoAlumno(r.data))
      .catch(() => setError('No se pudo cargar el estado del alumno.'))
      .finally(() => setCargandoEst(false));
  }, [alumnoSel, anio]);

  const alumnosFiltrados = busqueda.trim()
    ? listaAlumnos.filter(a => {
        const q = busqueda.toLowerCase();
        return (
          `${a.nombre} ${a.apellido}`.toLowerCase().includes(q) ||
          (a.clave || '').toLowerCase().includes(q) ||
          (a.codigo_estudiante || '').toLowerCase().includes(q)
        );
      }).slice(0, 10)
    : [];

  const seleccionarAlumno = (a) => {
    setAlumnoSel(a);
    setBusqueda(`${a.clave} - ${a.nombre} ${a.apellido}`);
    setShowDrop(false);
    setMonto(''); setPreview(null); setRecibo(null); setError('');
  };

  const handleBusquedaChange = (e) => {
    setBusqueda(e.target.value);
    setShowDrop(true);
    if (alumnoSel) { setAlumnoSel(null); setEstadoAlumno(null); }
  };

  const handlePreview = () => {
    setError('');
    const montoNum = parseFloat(monto);
    if (!montoNum || montoNum <= 0) { setError('Ingresa un monto válido mayor a cero.'); return; }
    if (!estadoAlumno) return;
    const descNum = Math.max(0, parseFloat(descuento) || 0);
    const efectivo = montoNum + descNum;
    const { detalles, totalAplicado, sobrante } = distribuirPago(estadoAlumno.meses, efectivo);
    if (!detalles.length) { setError('No hay meses pendientes de pago para este alumno.'); return; }
    // totalAplicado = efectivo usado; cobrado = lo que paga el alumno
    const cobrado = Math.max(0, totalAplicado - descNum);
    setPreview({ detalles, totalAplicado, sobrante, montoIngresado: montoNum, descuento: descNum, cobrado });
    setShowModal(true);
  };

  const handleConfirmar = async () => {
    if (!preview || !alumnoSel) return;
    setProcesando(true);
    setError('');
    try {
      const [{ data: reciboResp }, mctx] = await Promise.all([
        API.post('/nuevo-pago/procesar', {
          alumno_id:   alumnoSel.id,
          monto_total: preview.cobrado,       // lo que el alumno paga físicamente
          descuento:   preview.descuento,     // descuento aplicado
          anio,
          fecha_pago:  fechaPago,
        }),
        loadMembrete('recibos'),
      ]);
      setRecibo(reciboResp);
      setShowModal(false);
      const pdfRes = await generarReciboPDF(reciboResp, mctx, { skipQR: true, returnBase64: true });
      // Subida a Drive en segundo plano: si Drive no está configurado o falla
      // la red, no bloqueamos el flujo del cobro (el recibo ya está guardado
      // en BD y el PDF descargado localmente).
      if (pdfRes?.base64) {
        API.post('/recibos/upload-drive', {
          pdf_base64: pdfRes.base64,
          filename:   pdfRes.filename,
          no_recibo:  reciboResp.no_recibo,
        }).catch(err => {
          console.warn('No se pudo subir el recibo a Drive:', err.response?.data?.message || err.message);
        });
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Error al procesar el pago.');
      setShowModal(false);
    } finally {
      setProcesando(false);
    }
  };

  const handleNuevoCobro = () => {
    setAlumnoSel(null); setBusqueda(''); setEstadoAlumno(null);
    setMonto(''); setDescuento(''); setFechaPago(hoy()); setPreview(null);
    setRecibo(null); setError(''); setAnio(new Date().getFullYear());
  };

  const handleDescargaPDF = async () => {
    if (!recibo) return;
    try {
      const mctx = await loadMembrete('recibos');
      await generarReciboPDF(recibo, mctx, { skipQR: true });
    } catch { await generarReciboPDF(recibo, null, { skipQR: true }); }
  };

  const estadoBadge = (est, msg) => {
    if (est === 'acreditado') return (
      <span className="badge badge-pagado" style={{ background: '#bbdefb', color: '#0d47a1' }}>
        {msg || 'Acreditado'}
      </span>
    );
    if (est === 'pagado')  return <span className="badge badge-pagado">Pagado</span>;
    if (est === 'abono')   return <span className="badge badge-abono">Abono</span>;
    if (est === 'anulado') return <span className="badge badge-anulado">Anulado</span>;
    return <span className="badge badge-pend">Pendiente</span>;
  };

  return (
    <div className="admin-layout">
      <Sidebar />
      <main className="admin-content">
        <h1>Nuevo Pago</h1>
        <p className="subtitle">Registra un cobro de colegiatura y genera el recibo automáticamente.</p>

        {/* ── Búsqueda ── */}
        <div className="np-search-wrap">
          <div className="np-search-row">
            <div className="np-search-box" ref={dropRef}>
              <input
                type="text"
                placeholder="Buscar alumno por clave/código/nombre..."
                value={busqueda}
                onChange={handleBusquedaChange}
                onFocus={() => setShowDrop(true)}
              />
              {showDrop && alumnosFiltrados.length > 0 && (
                <div className="np-dropdown">
                  {alumnosFiltrados.map(a => (
                    <div key={a.id} className="np-dropdown-item" onMouseDown={() => seleccionarAlumno(a)}>
                      <strong>{a.clave}</strong>{a.codigo_estudiante ? <span style={{ color: '#888', marginLeft: 6, fontSize: '0.78rem' }}>({a.codigo_estudiante})</span> : null} — {a.nombre} {a.apellido}
                      <span style={{ float: 'right', color: '#888' }}>Q {Number(a.cuota_mensual).toFixed(2)}/mes</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="np-anio-row">
              <label>Año:</label>
              <select value={anio} onChange={e => setAnio(parseInt(e.target.value))}>
                {anios.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>
        </div>

        {error && <div className="np-error">{error}</div>}

        {/* ── Info del alumno + estado ── */}
        {alumnoSel && (
          <>
            <div className="np-alumno-card">
              <div>
                <div className="np-ac-name">{alumnoSel.nombre} {alumnoSel.apellido}</div>
                <div className="np-ac-sub">{alumnoSel.clave}{alumnoSel.codigo_estudiante ? ` · ${alumnoSel.codigo_estudiante}` : ''} · {alumnoSel.diplomado || 'Sin diplomado'}</div>
              </div>
              <div className="np-ac-cuota">Q {Number(alumnoSel.cuota_mensual).toFixed(2)} / mes</div>
            </div>

            {cargandoEst && <p style={{ color: '#888', fontSize: '0.9rem' }}>Cargando estado de pagos...</p>}

            {estadoAlumno && !recibo && (
              <>
                <div className="np-status-card">
                  <h2>Estado de pagos — {anio}</h2>
                  <table className="np-table">
                    <thead>
                      <tr>
                        <th>Mes</th>
                        <th>Estado</th>
                        <th>Cuota</th>
                        <th>Abonado</th>
                        <th>Pendiente</th>
                        <th>No. Recibo</th>
                        <th>Fecha Pago</th>
                      </tr>
                    </thead>
                    <tbody>
                      {estadoAlumno.meses.filter(m => m.esperado !== false || m.acreditado || m.pagado || m.monto_abonado > 0).map(m => (
                        <tr key={m.id || m.mes}
                          style={{
                            background:
                              m.estado === 'acreditado' ? '#e3f2fd' :
                              m.estado === 'abono'      ? '#fffde7' :
                              m.estado === 'pendiente'  ? '#fff8f8' :
                              'white'
                          }}>
                          <td style={{ fontWeight: 600 }}>
                            {cap(m.mes)}
                            {m.multiplicador && m.multiplicador !== 1 && (
                              <span style={{ fontSize: '0.7rem', color: '#5c6bc0', marginLeft: 4 }}>
                                (×{m.multiplicador})
                              </span>
                            )}
                          </td>
                          <td>{estadoBadge(m.estado, m.acreditado_msg)}</td>
                          <td>{m.acreditado ? '—' : fmtQ(m.monto)}</td>
                          <td style={{ color: m.monto_abonado > 0 ? '#e65100' : '#999' }}>
                            {m.monto_abonado > 0 ? fmtQ(m.monto_abonado) : '—'}
                          </td>
                          <td style={{ color: m.pendiente > 0 ? '#c62828' : '#2e7d32', fontWeight: m.pendiente > 0 ? 600 : 400 }}>
                            {m.pendiente > 0 ? fmtQ(m.pendiente) : '—'}
                          </td>
                          <td style={{ color: '#555' }}>{m.no_recibo || '—'}</td>
                          <td style={{ color: '#555' }}>{m.fecha_pago ? fmtFecha(m.fecha_pago) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* ── Formulario de cobro ── */}
                <div className="np-pago-card">
                  <h2>Registrar cobro</h2>
                  <div className="np-form-row">
                    <div className="np-field">
                      <label>Fecha de pago</label>
                      <input type="date" value={fechaPago} onChange={e => setFechaPago(e.target.value)} />
                    </div>
                    <div className="np-field">
                      <label>Total a cancelar (Q)</label>
                      <input
                        className="big"
                        type="number" min="0" step="0.01" placeholder="0.00"
                        value={monto}
                        onChange={e => { setMonto(e.target.value); setPreview(null); }}
                      />
                    </div>
                    <div className="np-field">
                      <label>Descuento (Q) <span style={{ fontWeight: 400, color: '#888' }}>opcional</span></label>
                      <input
                        type="number" min="0" step="0.01" placeholder="0.00"
                        value={descuento}
                        onChange={e => { setDescuento(e.target.value); setPreview(null); }}
                        style={{ width: 120 }}
                      />
                    </div>
                    <button className="btn-preview" onClick={handlePreview} disabled={!monto || !estadoAlumno}>
                      Previsualizar cobro
                    </button>
                  </div>
                </div>
              </>
            )}
          </>
        )}

        {/* ── Éxito ── */}
        {recibo && (
          <div className="np-success-card">
            <div className="np-success-icon">✅</div>
            <h2>Pago registrado exitosamente</h2>
            <p>Recibo generado:</p>
            <div className="recibo-num">#{recibo.no_recibo}</div>
            <p><strong>{recibo.alumno.nombre} {recibo.alumno.apellido}</strong> · {recibo.alumno.clave}{recibo.alumno.codigo_estudiante ? ` (${recibo.alumno.codigo_estudiante})` : ''}</p>
            <p>Detalle: <strong>{recibo.meses_str}</strong></p>
            <p>Total cobrado: <strong>{fmtQ(recibo.total)}</strong></p>
            {parseFloat(recibo.descuento) > 0 && (
              <p style={{ color: '#2e7d32' }}>Descuento aplicado: <strong>{fmtQ(recibo.descuento)}</strong></p>
            )}
            <p style={{ color: '#888', fontSize: '0.82rem' }}>El PDF fue descargado automáticamente.</p>
            <div className="np-success-btns">
              <button className="btn-pdf" onClick={handleDescargaPDF}>
                Descargar PDF nuevamente
              </button>
              <button className="btn-nuevo" onClick={handleNuevoCobro}>
                Nuevo cobro
              </button>
            </div>
          </div>
        )}

        {/* ── Modal de previsualización ── */}
        {showModal && preview && (
          <div className="np-modal-overlay" onClick={() => !procesando && setShowModal(false)}>
            <div className="np-modal" onClick={e => e.stopPropagation()}>
              <h2>Previsualización del cobro</h2>
              <ul className="np-preview-list">
                {preview.detalles.map((d, i) => (
                  <li key={i}>
                    <span>
                      {d.tipo === 'completo'
                        ? <>✅ <strong>{cap(d.mes)}</strong>
                            {d.abonoPrevio > 0
                              ? <> — completa pago (tenía abono de {fmtQ(d.abonoPrevio)})</>
                              : <> — pago completo</>
                            }
                          </>
                        : <>🔶 <strong>{cap(d.mes)}</strong> — abono ({fmtQ(d.monto)} de {fmtQ(d.cuota)})</>
                      }
                    </span>
                    <span style={{ fontWeight: 600 }}>{fmtQ(d.monto)}</span>
                  </li>
                ))}
              </ul>

              {preview.descuento > 0 && (
                <div style={{
                  background: '#e8f5e9', border: '1px solid #a5d6a7',
                  borderRadius: 8, padding: '0.6rem 0.9rem', marginBottom: '0.75rem', fontSize: '0.85rem'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Monto cobrado al alumno:</span>
                    <strong>{fmtQ(preview.cobrado)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#2e7d32' }}>
                    <span>+ Descuento aplicado:</span>
                    <strong>{fmtQ(preview.descuento)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #c8e6c9', marginTop: 4, paddingTop: 4 }}>
                    <span>= Total efectivo distribuido:</span>
                    <strong>{fmtQ(preview.totalAplicado)}</strong>
                  </div>
                </div>
              )}

              {preview.sobrante > 0 && (
                <p style={{ color: '#e65100', fontSize: '0.85rem', marginBottom: '0.75rem' }}>
                  Nota: el monto efectivo excede la deuda pendiente.
                  Se aplicarán {fmtQ(preview.totalAplicado)}.
                </p>
              )}

              <div className="np-preview-total">
                <span>{preview.descuento > 0 ? 'Total cobrado al alumno:' : 'Total a cobrar:'}</span>
                <span>{fmtQ(preview.cobrado ?? preview.totalAplicado)}</span>
              </div>

              <div className="np-modal-btns">
                <button className="btn-cancel" onClick={() => setShowModal(false)} disabled={procesando}>
                  Cancelar
                </button>
                <button className="btn-confirm" onClick={handleConfirmar} disabled={procesando}>
                  {procesando ? 'Procesando...' : 'Confirmar cobro'}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
