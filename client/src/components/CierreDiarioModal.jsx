import { useState, useEffect, useCallback } from 'react';
import API from '../api/axios';
import { useAuth } from '../context/AuthContext';

const Q = (n) => `Q ${(parseFloat(n) || 0).toFixed(2)}`;
const hoyISO = () => new Date().toISOString().slice(0, 10);

// Modal de cierre diario reutilizable para los módulos de Recibos y Papelería.
// Pasa { modulo: 'recibos' | 'papeleria', fecha? } y onClose / onSaved callbacks.
// Si no se pasa fecha, opera sobre el día actual.
export default function CierreDiarioModal({ modulo, fecha: fechaProp, onClose, onSaved }) {
  const { usuario } = useAuth();
  const esAdmin = usuario?.rol === 'admin';
  const fechaObjetivo = fechaProp || hoyISO();

  const [loading, setLoading]   = useState(true);
  const [saving,  setSaving]    = useState(false);
  const [err,     setErr]       = useState('');

  const [datos,   setDatos]     = useState({ fecha: fechaObjetivo, total_dia: 0, ultimo_recibo: null, cierre: null });
  const [cuentas, setCuentas]   = useState([]);
  const [cuentaId, setCuentaId] = useState('');
  const [gastos,  setGastos]    = useState([]); // [{descripcion, monto}]
  const [obs,     setObs]       = useState('');
  const [verHistorial, setVerHistorial] = useState(false);
  const [historial, setHistorial] = useState([]);

  const cargar = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const [{ data: d }, { data: cs }, { data: hist }] = await Promise.all([
        API.get(`/cierres/hoy?modulo=${modulo}&fecha=${fechaObjetivo}`),
        API.get('/catalogos/cuentas'),
        API.get(`/cierres?modulo=${modulo}`).catch(() => ({ data: [] })),
      ]);
      setDatos(d);
      const activas = cs.filter(c => c.activo);
      setCuentas(activas);
      setHistorial(hist);

      if (d.cierre) {
        setCuentaId(d.cierre.cuenta_id || '');
        setGastos(d.cierre.gastos?.length
          ? d.cierre.gastos.map(g => ({ descripcion: g.descripcion, monto: String(g.monto) }))
          : []);
        setObs(d.cierre.observaciones || '');
      } else {
        setCuentaId('');
        setGastos([]);
        setObs('');
      }
    } catch (ex) {
      setErr(ex.response?.data?.message || 'Error al cargar el cierre');
    } finally {
      setLoading(false);
    }
  }, [modulo, fechaObjetivo]);

  useEffect(() => { cargar(); }, [cargar]);

  const cierre      = datos.cierre;
  const yaRevisado  = cierre?.estado === 'revisado';
  // Bloqueado solo si ya fue revisado por admin. Mientras esté pendiente,
  // oficina/admin pueden seguir editándolo en cualquier fecha.
  const soloLectura = yaRevisado;

  const totalGastos = gastos.reduce((s, g) => s + (parseFloat(g.monto) || 0), 0);
  const totalDia    = parseFloat(cierre?.total_dia ?? datos.total_dia) || 0;
  const totalDepositar = totalDia - totalGastos;

  const agregarGasto = () => setGastos(g => [...g, { descripcion: '', monto: '' }]);
  const editarGasto  = (i, campo, val) =>
    setGastos(g => g.map((x, idx) => idx === i ? { ...x, [campo]: val } : x));
  const eliminarGasto = (i) => setGastos(g => g.filter((_, idx) => idx !== i));

  const guardar = async () => {
    setErr('');
    if (!cuentaId) { setErr('Selecciona la cuenta de depósito'); return; }
    const gastosLimpios = gastos
      .map(g => ({ descripcion: (g.descripcion || '').trim(), monto: parseFloat(g.monto) || 0 }))
      .filter(g => g.descripcion && g.monto > 0);
    if (totalDepositar < 0) {
      setErr('Los gastos no pueden superar al total del día');
      return;
    }
    setSaving(true);
    try {
      const payload = { cuenta_id: Number(cuentaId), gastos: gastosLimpios, observaciones: obs };
      let nuevo;
      if (cierre) {
        const { data } = await API.put(`/cierres/${cierre.id}`, payload);
        nuevo = data;
      } else {
        const { data } = await API.post('/cierres', { ...payload, modulo, fecha: datos.fecha });
        nuevo = data;
      }
      setDatos(d => ({ ...d, cierre: nuevo }));
      onSaved?.(nuevo);
      onClose?.();
    } catch (ex) {
      setErr(ex.response?.data?.message || 'Error al guardar el cierre');
    } finally {
      setSaving(false);
    }
  };

  const marcarRevisado = async () => {
    if (!cierre) return;
    if (!confirm('¿Confirmar que el depósito fue realizado y marcar el cierre como revisado?')) return;
    setSaving(true);
    setErr('');
    try {
      const { data } = await API.post(`/cierres/${cierre.id}/revisar`);
      setDatos(d => ({ ...d, cierre: data }));
      setHistorial(h => h.map(x => x.id === data.id ? { ...x, ...data } : x));
      onSaved?.(data);
    } catch (ex) {
      setErr(ex.response?.data?.message || 'Error al marcar como revisado');
    } finally {
      setSaving(false);
    }
  };

  const marcarRevisadoHistorial = async (id) => {
    if (!confirm('¿Marcar este cierre como revisado?')) return;
    try {
      const { data } = await API.post(`/cierres/${id}/revisar`);
      setHistorial(h => h.map(x => x.id === id ? { ...x, ...data } : x));
      if (cierre?.id === id) setDatos(d => ({ ...d, cierre: data }));
      onSaved?.(data);
    } catch (ex) {
      setErr(ex.response?.data?.message || 'Error al marcar como revisado');
    }
  };

  const tituloModulo = modulo === 'recibos' ? 'Recibos' : 'Papelería';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 720 }}>
        <div className="modal-header">
          <h2>📊 Cierre Diario · {tituloModulo}</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-form">
          {loading ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#999' }}>Cargando...</div>
          ) : (
            <>
              {/* Cabecera con info del día y estado */}
              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem',
                background: '#f8f9fe', padding: '0.85rem 1rem', borderRadius: 8, marginBottom: '1rem',
                borderLeft: '3px solid #5c6bc0',
              }}>
                <div>
                  <div style={{ fontSize: '0.72rem', color: '#666', textTransform: 'uppercase', fontWeight: 600 }}>Fecha</div>
                  <div style={{ fontWeight: 700, color: '#1a237e' }}>{datos.fecha}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.72rem', color: '#666', textTransform: 'uppercase', fontWeight: 600 }}>Último recibo del día</div>
                  <div style={{ fontWeight: 700, color: '#1a237e' }}>
                    {(cierre?.ultimo_recibo || datos.ultimo_recibo) || '—'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.72rem', color: '#666', textTransform: 'uppercase', fontWeight: 600 }}>Total del día</div>
                  <div style={{ fontWeight: 700, fontSize: '1.15rem', color: '#1b5e20' }}>{Q(totalDia)}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.72rem', color: '#666', textTransform: 'uppercase', fontWeight: 600 }}>Estado</div>
                  <div style={{ fontWeight: 700 }}>
                    {!cierre && <span style={{ color: '#888' }}>Sin cierre</span>}
                    {cierre?.estado === 'pendiente' && <span style={{ color: '#e65100' }}>⏳ Pendiente de revisión</span>}
                    {cierre?.estado === 'revisado' && <span style={{ color: '#2e7d32' }}>✓ Revisado</span>}
                  </div>
                </div>
              </div>

              {soloLectura && cierre && (
                <div style={{
                  padding: '0.6rem 0.9rem', background: '#e8f5e9',
                  borderRadius: 7, marginBottom: '1rem', fontSize: '0.85rem',
                  borderLeft: '3px solid #2e7d32', color: '#444',
                }}>
                  Cierre revisado por <strong>{cierre.revisado_por_nombre}</strong> el {String(cierre.revisado_at).slice(0,10)}. Ya no puede modificarse.
                </div>
              )}

              {/* Panel de gastos */}
              <div className="form-group full-width" style={{ margin: 0, marginBottom: '1rem' }}>
                <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Gastos del día</span>
                  {!soloLectura && (
                    <button type="button" className="btn-primary" style={{ padding: '0.25rem 0.7rem', fontSize: '0.8rem' }}
                            onClick={agregarGasto}>
                      + Agregar gasto
                    </button>
                  )}
                </label>
                {gastos.length === 0 ? (
                  <div style={{ padding: '0.7rem', background: '#fafafa', borderRadius: 6, color: '#999', fontSize: '0.85rem', textAlign: 'center' }}>
                    Sin gastos registrados.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    {gastos.map((g, i) => (
                      <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 130px 36px', gap: '0.4rem' }}>
                        <input
                          type="text" placeholder="Descripción del gasto"
                          value={g.descripcion}
                          disabled={soloLectura}
                          onChange={e => editarGasto(i, 'descripcion', e.target.value)} />
                        <input
                          type="number" step="0.01" min="0" placeholder="0.00"
                          value={g.monto}
                          disabled={soloLectura}
                          onChange={e => editarGasto(i, 'monto', e.target.value)}
                          style={{ textAlign: 'right' }} />
                        {!soloLectura ? (
                          <button type="button" onClick={() => eliminarGasto(i)}
                                  style={{ background: '#ffebee', color: '#c62828', border: 'none',
                                           borderRadius: 5, cursor: 'pointer', fontSize: '0.95rem' }}>
                            ✕
                          </button>
                        ) : <span />}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Resumen de totales */}
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.6rem',
                marginBottom: '1rem',
              }}>
                <ResumenItem label="Total del día" valor={totalDia} color="#1b5e20" />
                <ResumenItem label="Total gastos"  valor={totalGastos} color="#c62828" />
                <ResumenItem label="A depositar"   valor={totalDepositar} color="#1a237e" big />
              </div>

              {/* Cuenta de depósito */}
              <div className="form-group full-width" style={{ margin: 0, marginBottom: '1rem' }}>
                <label>Cuenta de depósito *</label>
                {cuentas.length === 0 ? (
                  <div style={{ padding: '0.7rem', background: '#fff3e0', borderRadius: 6, color: '#7b3f00', fontSize: '0.85rem' }}>
                    No hay cuentas bancarias configuradas. {esAdmin
                      ? 'Crea una en Configuración → Cuentas Bancarias.'
                      : 'Pide al administrador que cree una en Configuración → Cuentas Bancarias.'}
                  </div>
                ) : (
                  <select
                    value={cuentaId}
                    disabled={soloLectura}
                    onChange={e => setCuentaId(e.target.value)}
                    required
                  >
                    <option value="">— Selecciona una cuenta —</option>
                    {cuentas.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.tipo_cuenta} · {c.numero_cuenta} · {c.nombre}
                      </option>
                    ))}
                  </select>
                )}
                {soloLectura && cierre?.cuenta_snapshot && (
                  <div style={{ fontSize: '0.78rem', color: '#666', marginTop: 4 }}>
                    Depositado en: <strong>{cierre.cuenta_snapshot}</strong>
                  </div>
                )}
              </div>

              {/* Observaciones */}
              <div className="form-group full-width" style={{ margin: 0, marginBottom: '1rem' }}>
                <label>Observaciones</label>
                <textarea
                  rows={2}
                  value={obs}
                  disabled={soloLectura}
                  onChange={e => setObs(e.target.value)}
                  placeholder="Notas sobre este cierre..."
                />
              </div>

              {cierre && (
                <div style={{ fontSize: '0.78rem', color: '#777', marginBottom: '0.5rem' }}>
                  Creado por: <strong>{cierre.creado_por_nombre || '—'}</strong>
                  {cierre.revisado_por_nombre &&
                    <> · Revisado por: <strong>{cierre.revisado_por_nombre}</strong></>}
                </div>
              )}

              {err && <p style={{ color: '#e53935', fontSize: '0.85rem' }}>{err}</p>}

              {/* Historial de cierres */}
              <div style={{ marginTop: '0.5rem', marginBottom: '0.75rem' }}>
                <button
                  type="button"
                  onClick={() => setVerHistorial(v => !v)}
                  style={{
                    background: 'none', border: 'none', color: '#1a237e',
                    fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', padding: 0,
                  }}
                >
                  {verHistorial ? '▼' : '▶'} Cierres anteriores ({historial.length})
                </button>
                {verHistorial && (
                  <div style={{
                    marginTop: '0.5rem', maxHeight: 220, overflowY: 'auto',
                    border: '1px solid #e0e0e0', borderRadius: 6,
                  }}>
                    {historial.length === 0 ? (
                      <div style={{ padding: '0.7rem', color: '#999', fontSize: '0.85rem', textAlign: 'center' }}>
                        Sin cierres registrados aún.
                      </div>
                    ) : (
                      <table style={{ width: '100%', fontSize: '0.78rem', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ background: '#f5f5f5', textAlign: 'left' }}>
                            <th style={{ padding: '6px 8px' }}>Fecha</th>
                            <th style={{ padding: '6px 8px', textAlign: 'right' }}>Total día</th>
                            <th style={{ padding: '6px 8px', textAlign: 'right' }}>Depositar</th>
                            <th style={{ padding: '6px 8px' }}>Cuenta</th>
                            <th style={{ padding: '6px 8px' }}>Estado</th>
                            {esAdmin && <th style={{ padding: '6px 8px' }}></th>}
                          </tr>
                        </thead>
                        <tbody>
                          {historial.map(h => (
                            <tr key={h.id} style={{ borderTop: '1px solid #eee' }}>
                              <td style={{ padding: '6px 8px' }}>{h.fecha}</td>
                              <td style={{ padding: '6px 8px', textAlign: 'right' }}>{Q(h.total_dia)}</td>
                              <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600 }}>{Q(h.total_depositar)}</td>
                              <td style={{ padding: '6px 8px', color: '#555' }}>{h.cuenta_snapshot || '—'}</td>
                              <td style={{ padding: '6px 8px' }}>
                                {h.estado === 'revisado'
                                  ? <span style={{ color: '#2e7d32', fontWeight: 600 }}>✓ Revisado</span>
                                  : <span style={{ color: '#e65100', fontWeight: 600 }}>⏳ Pendiente</span>}
                              </td>
                              {esAdmin && (
                                <td style={{ padding: '6px 8px' }}>
                                  {h.estado === 'pendiente' && (
                                    <button type="button"
                                      onClick={() => marcarRevisadoHistorial(h.id)}
                                      style={{
                                        background: '#2e7d32', color: '#fff', border: 'none',
                                        padding: '3px 8px', borderRadius: 4, cursor: 'pointer',
                                        fontSize: '0.75rem',
                                      }}>
                                      Revisar
                                    </button>
                                  )}
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>

              <div className="modal-actions">
                <button type="button" className="btn-cancel" onClick={onClose} disabled={saving}>
                  Cerrar
                </button>
                {!soloLectura && (
                  <button type="button" className="btn-primary" onClick={guardar} disabled={saving}>
                    {saving ? 'Guardando...' : (cierre ? 'Actualizar cierre' : 'Confirmar cierre')}
                  </button>
                )}
                {esAdmin && cierre && cierre.estado === 'pendiente' && (
                  <button type="button" className="btn-primary"
                          style={{ background: '#2e7d32' }}
                          onClick={marcarRevisado} disabled={saving}>
                    ✓ Marcar como revisado
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ResumenItem({ label, valor, color, big }) {
  return (
    <div style={{
      background: '#f8f9fe', padding: '0.7rem 0.85rem', borderRadius: 7,
      borderLeft: `3px solid ${color}`,
    }}>
      <div style={{ fontSize: '0.7rem', color: '#666', textTransform: 'uppercase', fontWeight: 600 }}>{label}</div>
      <div style={{ fontWeight: 700, fontSize: big ? '1.25rem' : '1rem', color }}>
        {Q(valor)}
      </div>
    </div>
  );
}
