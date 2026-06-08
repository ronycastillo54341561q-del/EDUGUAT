import { useState, useEffect, useCallback } from 'react';
import Sidebar from '../../components/Sidebar';
import ScrollableTable from '../../components/ScrollableTable';
import API from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import { can } from '../../lib/permissions';
import './admin.css';

const MESES = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
];
const anioActual = new Date().getFullYear();
const mesActual  = new Date().getMonth() + 1;

const Q = (n) => `Q ${parseFloat(n || 0).toFixed(2)}`;
const fmtFecha = (f) => f ? String(f).slice(0, 10) : '—';
const periodoLabel = (n) =>
  n.periodo_tipo === 'quincenal'
    ? `${MESES[n.mes - 1]} ${n.anio} · Q${n.quincena}`
    : `${MESES[n.mes - 1]} ${n.anio}`;

/* ══════════════ Modal Colaborador ══════════════ */
const colabVacio = {
  nombre: '', apellido: '', dpi: '', nit: '', puesto: '', telefono: '', email: '',
  fecha_ingreso: '', salario_base: '', banco: '', cuenta: '', estado: 'activo', observaciones: '',
};

function ModalColaborador({ inicial, onGuardar, onCerrar }) {
  const [form, setForm] = useState(inicial || colabVacio);
  const [err, setErr]   = useState('');
  const ch = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    if (!form.nombre.trim() || !form.apellido.trim()) { setErr('Nombre y apellido son requeridos'); return; }
    try { await onGuardar(form); }
    catch (ex) { setErr(ex.response?.data?.message || 'Error al guardar'); }
  };

  return (
    <div className="modal-overlay" onClick={onCerrar}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 620 }}>
        <div className="modal-header">
          <h2>{inicial?.id ? 'Editar colaborador' : 'Nuevo colaborador'}</h2>
          <button className="modal-close" onClick={onCerrar}>✕</button>
        </div>
        <form onSubmit={submit} className="modal-form">
          <div className="form-grid">
            <div className="form-group"><label>Nombre *</label><input name="nombre" value={form.nombre} onChange={ch} required /></div>
            <div className="form-group"><label>Apellido *</label><input name="apellido" value={form.apellido} onChange={ch} required /></div>
            <div className="form-group"><label>Puesto</label><input name="puesto" value={form.puesto} onChange={ch} placeholder="Ej: Maestro de grado" /></div>
            <div className="form-group"><label>Salario base (Q)</label><input type="number" step="0.01" min="0" name="salario_base" value={form.salario_base} onChange={ch} /></div>
            <div className="form-group"><label>DPI</label><input name="dpi" value={form.dpi} onChange={ch} /></div>
            <div className="form-group"><label>NIT</label><input name="nit" value={form.nit} onChange={ch} /></div>
            <div className="form-group"><label>Teléfono</label><input name="telefono" value={form.telefono} onChange={ch} /></div>
            <div className="form-group"><label>Email</label><input name="email" value={form.email} onChange={ch} /></div>
            <div className="form-group"><label>Fecha de ingreso</label><input type="date" name="fecha_ingreso" value={form.fecha_ingreso || ''} onChange={ch} /></div>
            <div className="form-group"><label>Estado</label>
              <select name="estado" value={form.estado} onChange={ch}>
                <option value="activo">Activo</option>
                <option value="inactivo">Inactivo</option>
              </select>
            </div>
            <div className="form-group"><label>Banco</label><input name="banco" value={form.banco} onChange={ch} /></div>
            <div className="form-group"><label>No. de cuenta</label><input name="cuenta" value={form.cuenta} onChange={ch} /></div>
            <div className="form-group full-width"><label>Observaciones</label><textarea name="observaciones" value={form.observaciones} onChange={ch} rows={2} /></div>
          </div>
          {err && <p style={{ color: '#e53935', fontSize: '0.85rem' }}>{err}</p>}
          <div className="modal-actions">
            <button type="button" className="btn-cancel" onClick={onCerrar}>Cancelar</button>
            <button type="submit" className="btn-primary">{inicial?.id ? 'Actualizar' : 'Crear'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ══════════════ Modal Crear Nómina ══════════════ */
function ModalNuevaNomina({ onCrear, onCerrar }) {
  const [form, setForm] = useState({
    periodo_tipo: 'mensual', anio: anioActual, mes: mesActual, quincena: 1, fecha_pago: '',
  });
  const [err, setErr] = useState('');
  const esQuincenal = form.periodo_tipo === 'quincenal';
  const nombreAuto = esQuincenal
    ? `Nómina ${MESES[form.mes - 1]} ${form.anio} (Q${form.quincena})`
    : `Nómina ${MESES[form.mes - 1]} ${form.anio}`;

  const submit = async (e) => {
    e.preventDefault();
    try { await onCrear({ ...form, nombre: nombreAuto }); }
    catch (ex) { setErr(ex.response?.data?.message || 'Error al crear nómina'); }
  };

  return (
    <div className="modal-overlay" onClick={onCerrar}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <div className="modal-header">
          <h2>Nueva nómina</h2>
          <button className="modal-close" onClick={onCerrar}>✕</button>
        </div>
        <form onSubmit={submit} className="modal-form">
          <div className="form-grid">
            <div className="form-group">
              <label>Tipo de período</label>
              <select value={form.periodo_tipo} onChange={e => setForm({ ...form, periodo_tipo: e.target.value })}>
                <option value="mensual">Mensual</option>
                <option value="quincenal">Quincenal</option>
              </select>
            </div>
            <div className="form-group">
              <label>Mes</label>
              <select value={form.mes} onChange={e => setForm({ ...form, mes: Number(e.target.value) })}>
                {MESES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Año</label>
              <input type="number" value={form.anio} onChange={e => setForm({ ...form, anio: Number(e.target.value) })} />
            </div>
            {esQuincenal && (
              <div className="form-group">
                <label>Quincena</label>
                <select value={form.quincena} onChange={e => setForm({ ...form, quincena: Number(e.target.value) })}>
                  <option value={1}>1ª (1–15)</option>
                  <option value={2}>2ª (16–fin)</option>
                </select>
              </div>
            )}
            <div className="form-group">
              <label>Fecha de pago (opcional)</label>
              <input type="date" value={form.fecha_pago} onChange={e => setForm({ ...form, fecha_pago: e.target.value })} />
            </div>
            <div className="form-group full-width">
              <label>Nombre</label>
              <input value={nombreAuto} readOnly style={{ background: '#f5f5f5', color: '#555' }} />
            </div>
          </div>
          <p style={{ fontSize: '0.78rem', color: '#888' }}>
            Se generará un renglón por cada colaborador <strong>activo</strong>, con su salario base como percepción inicial.
          </p>
          {err && <p style={{ color: '#e53935', fontSize: '0.85rem' }}>{err}</p>}
          <div className="modal-actions">
            <button type="button" className="btn-cancel" onClick={onCerrar}>Cancelar</button>
            <button type="submit" className="btn-primary">Crear nómina</button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ══════════════ Modal Editar Renglón ══════════════ */
function ModalRenglon({ renglon, puedeEditar, onGuardar, onCerrar }) {
  const [perc, setPerc]   = useState(renglon.percepciones?.length ? renglon.percepciones : [{ concepto: '', monto: '' }]);
  const [ded, setDed]     = useState(renglon.deducciones || []);
  const [pagado, setPagado]       = useState(!!renglon.pagado);
  const [metodo, setMetodo]       = useState(renglon.metodo_pago || '');
  const [fecha, setFecha]         = useState(renglon.fecha_pago ? String(renglon.fecha_pago).slice(0, 10) : '');
  const [obs, setObs]             = useState(renglon.observacion || '');

  const totalP = perc.reduce((s, x) => s + (Number(x.monto) || 0), 0);
  const totalD = ded.reduce((s, x) => s + (Number(x.monto) || 0), 0);
  const liquido = totalP - totalD;

  const setItem = (lista, setLista, i, patch) => {
    const copia = [...lista]; copia[i] = { ...copia[i], ...patch }; setLista(copia);
  };
  const addItem = (lista, setLista) => setLista([...lista, { concepto: '', monto: '' }]);
  const delItem = (lista, setLista, i) => setLista(lista.filter((_, idx) => idx !== i));

  const guardar = () => {
    onGuardar({
      percepciones: perc.filter(x => x.concepto || x.monto),
      deducciones:  ded.filter(x => x.concepto || x.monto),
      pagado, metodo_pago: metodo, fecha_pago: fecha || null, observacion: obs,
    });
  };

  // Función de render (no componente) para no perder el foco de los inputs al teclear.
  const renderLista = (titulo, lista, setLista, color) => (
    <div style={{ flex: 1, minWidth: 240 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <strong style={{ color }}>{titulo}</strong>
        {puedeEditar && <button type="button" className="btn-edit" style={{ padding: '2px 8px', fontSize: '0.74rem' }} onClick={() => addItem(lista, setLista)}>+ Agregar</button>}
      </div>
      {lista.length === 0 && <p style={{ color: '#aaa', fontSize: '0.8rem' }}>Ninguno</p>}
      {lista.map((it, i) => (
        <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 5 }}>
          <input placeholder="Concepto" value={it.concepto || ''} disabled={!puedeEditar}
                 onChange={e => setItem(lista, setLista, i, { concepto: e.target.value })} style={{ flex: 1 }} />
          <input type="number" step="0.01" placeholder="0.00" value={it.monto ?? ''} disabled={!puedeEditar}
                 onChange={e => setItem(lista, setLista, i, { monto: e.target.value })} style={{ width: 100 }} />
          {puedeEditar && <button type="button" className="btn-danger-sm" onClick={() => delItem(lista, setLista, i)}>✕</button>}
        </div>
      ))}
    </div>
  );

  return (
    <div className="modal-overlay" onClick={onCerrar}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 720 }}>
        <div className="modal-header">
          <h2>{renglon.nombre}{renglon.puesto ? ` — ${renglon.puesto}` : ''}</h2>
          <button className="modal-close" onClick={onCerrar}>✕</button>
        </div>
        <div className="modal-form">
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            {renderLista('Percepciones (+)', perc, setPerc, '#1b5e20')}
            {renderLista('Deducciones (−)', ded, setDed, '#b71c1c')}
          </div>

          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', margin: '0.75rem 0', padding: '0.6rem 0.9rem', background: '#f8f9ff', borderRadius: 8 }}>
            <span>Total percepciones: <strong style={{ color: '#1b5e20' }}>{Q(totalP)}</strong></span>
            <span>Total deducciones: <strong style={{ color: '#b71c1c' }}>{Q(totalD)}</strong></span>
            <span>Líquido a recibir: <strong style={{ color: '#1a237e' }}>{Q(liquido)}</strong></span>
          </div>

          <div className="form-grid">
            <div className="form-group">
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" checked={pagado} disabled={!puedeEditar} onChange={e => setPagado(e.target.checked)} />
                Pagado
              </label>
            </div>
            <div className="form-group"><label>Método de pago</label>
              <input value={metodo} disabled={!puedeEditar} onChange={e => setMetodo(e.target.value)} placeholder="Ej: Transferencia, Cheque, Efectivo" />
            </div>
            <div className="form-group"><label>Fecha de pago</label>
              <input type="date" value={fecha} disabled={!puedeEditar} onChange={e => setFecha(e.target.value)} />
            </div>
            <div className="form-group full-width"><label>Observación</label>
              <input value={obs} disabled={!puedeEditar} onChange={e => setObs(e.target.value)} />
            </div>
          </div>

          <div className="modal-actions">
            <button type="button" className="btn-cancel" onClick={onCerrar}>Cerrar</button>
            {puedeEditar && <button type="button" className="btn-primary" onClick={guardar}>Guardar</button>}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ══════════════ Detalle de Nómina ══════════════ */
function NominaDetalle({ id, instInfo, puedeEditar, esAdmin, onVolver }) {
  const [nomina, setNomina]   = useState(null);
  const [cargando, setCargando] = useState(true);
  const [editRenglon, setEditRenglon] = useState(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    try { const { data } = await API.get(`/nominas/${id}`); setNomina(data); }
    catch (e) { console.error(e); }
    finally { setCargando(false); }
  }, [id]);
  useEffect(() => { cargar(); }, [cargar]);

  const guardarRenglon = async (cambios) => {
    await API.put(`/nominas/${id}/renglon/${editRenglon.id}`, cambios);
    setEditRenglon(null);
    cargar();
  };

  const marcarPagada = async () => {
    if (!confirm('¿Marcar toda la nómina como pagada? Todos los renglones quedarán como pagados.')) return;
    const fecha = new Date().toISOString().slice(0, 10);
    await API.post(`/nominas/${id}/pagar`, { fecha_pago: fecha });
    cargar();
  };

  if (cargando || !nomina) return (
    <div className="admin-layout"><Sidebar /><div className="admin-content"><p>Cargando...</p></div></div>
  );

  const totales = nomina.renglones.reduce((acc, r) => {
    acc.p += r.total_percepciones; acc.d += r.total_deducciones; acc.l += r.liquido;
    if (r.pagado) acc.pagados++;
    return acc;
  }, { p: 0, d: 0, l: 0, pagados: 0 });

  const exportarExcel = () => {
    const headers = ['Colaborador', 'Puesto', 'Percepciones', 'Deducciones', 'Líquido', 'Pagado', 'Método', 'Fecha pago'];
    const rows = nomina.renglones.map(r => [
      r.nombre, r.puesto || '', r.total_percepciones.toFixed(2), r.total_deducciones.toFixed(2),
      r.liquido.toFixed(2), r.pagado ? 'Sí' : 'No', r.metodo_pago || '', fmtFecha(r.fecha_pago),
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${nomina.nombre.replace(/[\s/]+/g, '_')}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const boleta = (r) => {
    const filaP = r.percepciones.map(p => `<tr><td>${p.concepto}</td><td style="text-align:right">Q ${Number(p.monto).toFixed(2)}</td></tr>`).join('') || '<tr><td colspan="2" style="color:#999">—</td></tr>';
    const filaD = r.deducciones.map(p => `<tr><td>${p.concepto}</td><td style="text-align:right">Q ${Number(p.monto).toFixed(2)}</td></tr>`).join('') || '<tr><td colspan="2" style="color:#999">—</td></tr>';
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>Boleta de pago</title>
<style>
  body{font-family:Arial,sans-serif;color:#222;margin:28px;font-size:13px}
  .head{text-align:center;border-bottom:2px solid #1a237e;padding-bottom:8px;margin-bottom:14px}
  .head h1{color:#1a237e;margin:0;font-size:18px}
  .head p{margin:2px 0;color:#555;font-size:12px}
  h2{font-size:14px;color:#1a237e;margin:14px 0 4px}
  table{width:100%;border-collapse:collapse;margin-bottom:8px}
  td{padding:4px 8px;border-bottom:1px solid #eee}
  .tot{font-weight:700}
  .liquido{margin-top:10px;padding:8px 12px;background:#e8eaf6;border-radius:6px;font-size:15px;font-weight:700;color:#1a237e;text-align:right}
  .meta{display:flex;justify-content:space-between;font-size:12px;color:#444;margin-bottom:10px}
</style></head><body>
  <div class="head">
    <h1>${instInfo.nombre || 'Boleta de Pago'}</h1>
    ${instInfo.direccion ? `<p>${instInfo.direccion}</p>` : ''}
    ${instInfo.telefono ? `<p>${instInfo.telefono}</p>` : ''}
  </div>
  <h2>Boleta de pago — ${nomina.nombre}</h2>
  <div class="meta">
    <span><strong>Colaborador:</strong> ${r.nombre}</span>
    <span><strong>Puesto:</strong> ${r.puesto || '—'}</span>
  </div>
  <div class="meta">
    <span><strong>Período:</strong> ${periodoLabel(nomina)}</span>
    <span><strong>Fecha de pago:</strong> ${fmtFecha(r.fecha_pago)}</span>
  </div>
  <h2>Percepciones</h2>
  <table>${filaP}<tr class="tot"><td>Total percepciones</td><td style="text-align:right">Q ${r.total_percepciones.toFixed(2)}</td></tr></table>
  <h2>Deducciones</h2>
  <table>${filaD}<tr class="tot"><td>Total deducciones</td><td style="text-align:right">Q ${r.total_deducciones.toFixed(2)}</td></tr></table>
  <div class="liquido">Líquido a recibir: Q ${r.liquido.toFixed(2)}</div>
  <p style="margin-top:48px;font-size:12px">_______________________________<br/>Recibí conforme</p>
  <script>window.onload=()=>window.print()</script>
</body></html>`;
    const win = window.open('', '_blank', 'width=820,height=700');
    win.document.write(html); win.document.close();
  };

  return (
    <div className="admin-layout">
      <Sidebar />
      <div className="admin-content">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <button className="btn-cancel" onClick={onVolver}>← Volver</button>
            <h1 style={{ display: 'inline-block', marginLeft: 12 }}>{nomina.nombre}</h1>
            <span className={`badge badge-${nomina.estado === 'pagada' ? 'activo' : 'retirado'}`} style={{ marginLeft: 10 }}>
              {nomina.estado === 'pagada' ? 'Pagada' : 'Borrador'}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn-edit" onClick={exportarExcel}>📊 Excel</button>
            {esAdmin && nomina.estado !== 'pagada' && (
              <button className="btn-primary" onClick={marcarPagada}>✓ Marcar nómina pagada</button>
            )}
          </div>
        </div>
        <p className="subtitle">{periodoLabel(nomina)} · {nomina.renglones.length} colaborador(es)</p>

        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', margin: '0 0 1rem', padding: '0.75rem 1rem', background: '#f8f9ff', borderRadius: 8 }}>
          <span>Percepciones: <strong style={{ color: '#1b5e20' }}>{Q(totales.p)}</strong></span>
          <span>Deducciones: <strong style={{ color: '#b71c1c' }}>{Q(totales.d)}</strong></span>
          <span>Total líquido: <strong style={{ color: '#1a237e' }}>{Q(totales.l)}</strong></span>
          <span>Pagados: <strong>{totales.pagados}/{nomina.renglones.length}</strong></span>
        </div>

        <div className="table-container">
          <ScrollableTable>
            <table className="recibo-grid" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Colaborador</th>
                  <th style={{ textAlign: 'left' }}>Puesto</th>
                  <th style={{ textAlign: 'right' }}>Percepciones</th>
                  <th style={{ textAlign: 'right' }}>Deducciones</th>
                  <th style={{ textAlign: 'right' }}>Líquido</th>
                  <th style={{ textAlign: 'center' }}>Pagado</th>
                  <th style={{ textAlign: 'center' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {nomina.renglones.length === 0 ? (
                  <tr><td colSpan={7} style={{ textAlign: 'center', padding: '2rem', color: '#999' }}>
                    No hay colaboradores en esta nómina. Agrega colaboradores activos y crea una nueva nómina.
                  </td></tr>
                ) : nomina.renglones.map(r => (
                  <tr key={r.id}>
                    <td style={{ padding: '6px 10px' }}><strong>{r.nombre}</strong></td>
                    <td style={{ padding: '6px 10px' }}>{r.puesto || '—'}</td>
                    <td style={{ textAlign: 'right', padding: '6px 10px' }}>{Q(r.total_percepciones)}</td>
                    <td style={{ textAlign: 'right', padding: '6px 10px' }}>{Q(r.total_deducciones)}</td>
                    <td style={{ textAlign: 'right', padding: '6px 10px', fontWeight: 700, color: '#1a237e' }}>{Q(r.liquido)}</td>
                    <td style={{ textAlign: 'center', padding: '6px 10px' }}>
                      <span className={`badge badge-${r.pagado ? 'activo' : 'retirado'}`}>{r.pagado ? 'Sí' : 'No'}</span>
                    </td>
                    <td style={{ textAlign: 'center', padding: '6px 10px' }}>
                      <div className="td-acciones">
                        <button className="btn-edit" onClick={() => setEditRenglon(r)}>{puedeEditar ? 'Editar' : 'Ver'}</button>
                        <button className="btn-edit" style={{ background: '#e3f2fd', color: '#1565c0' }} onClick={() => boleta(r)}>🖨️ Boleta</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollableTable>
        </div>
      </div>

      {editRenglon && (
        <ModalRenglon
          renglon={editRenglon}
          puedeEditar={puedeEditar}
          onGuardar={guardarRenglon}
          onCerrar={() => setEditRenglon(null)}
        />
      )}
    </div>
  );
}

/* ══════════════ Página principal ══════════════ */
export default function Nominas() {
  const { usuario } = useAuth();
  const esAdmin = usuario?.rol === 'admin';
  const puedeEditar = can(usuario?.rol, 'nominas', 'edit');

  const [vista, setVista]       = useState('nominas'); // 'nominas' | 'colaboradores'
  const [nominas, setNominas]   = useState([]);
  const [colabs, setColabs]     = useState([]);
  const [abierta, setAbierta]   = useState(null); // id de nómina abierta
  const [modalColab, setModalColab]   = useState(null); // colaborador en edición o {} para nuevo
  const [modalNomina, setModalNomina] = useState(false);
  const [instInfo, setInstInfo] = useState({ nombre: '', direccion: '', telefono: '' });

  const cargarNominas = useCallback(() => {
    API.get('/nominas').then(({ data }) => setNominas(data)).catch(console.error);
  }, []);
  const cargarColabs = useCallback(() => {
    API.get('/nominas/colaboradores').then(({ data }) => setColabs(data)).catch(console.error);
  }, []);

  useEffect(() => { cargarNominas(); cargarColabs(); }, [cargarNominas, cargarColabs]);
  useEffect(() => {
    API.get('/config').then(({ data }) => setInstInfo({
      nombre: data?.inst_nombre || '', direccion: data?.inst_direccion || '', telefono: data?.inst_telefono || '',
    })).catch(() => {});
  }, []);

  const guardarColab = async (form) => {
    const payload = { ...form, salario_base: Number(form.salario_base) || 0 };
    if (form.id) await API.put(`/nominas/colaboradores/${form.id}`, payload);
    else         await API.post('/nominas/colaboradores', payload);
    setModalColab(null);
    cargarColabs();
  };
  const eliminarColab = async (c) => {
    if (!confirm(`¿Eliminar al colaborador "${c.nombre} ${c.apellido}"?`)) return;
    try { await API.delete(`/nominas/colaboradores/${c.id}`); cargarColabs(); }
    catch { alert('Error al eliminar'); }
  };
  const crearNomina = async (form) => {
    const { data } = await API.post('/nominas', form);
    setModalNomina(false);
    cargarNominas();
    setAbierta(data.id);
  };
  const eliminarNomina = async (n) => {
    if (!confirm(`¿Eliminar la nómina "${n.nombre}"? Se borrarán sus renglones.`)) return;
    try { await API.delete(`/nominas/${n.id}`); cargarNominas(); }
    catch { alert('Error al eliminar'); }
  };

  if (abierta) {
    return (
      <NominaDetalle
        id={abierta}
        instInfo={instInfo}
        puedeEditar={puedeEditar}
        esAdmin={esAdmin}
        onVolver={() => { setAbierta(null); cargarNominas(); }}
      />
    );
  }

  return (
    <div className="admin-layout">
      <Sidebar />
      <div className="admin-content">
        <h1>💼 Nóminas</h1>
        <p className="subtitle">Gestión de colaboradores y pago de nóminas de la institución.</p>

        <div className="cfg-tabs" style={{ marginBottom: 16 }}>
          <button className={`cfg-tab${vista === 'nominas' ? ' active' : ''}`} onClick={() => setVista('nominas')}>Nóminas</button>
          <button className={`cfg-tab${vista === 'colaboradores' ? ' active' : ''}`} onClick={() => setVista('colaboradores')}>Colaboradores</button>
        </div>

        {vista === 'nominas' ? (
          <>
            <div className="table-header" style={{ marginBottom: 12 }}>
              {esAdmin && <button className="btn-primary" onClick={() => setModalNomina(true)}>+ Nueva nómina</button>}
            </div>
            {nominas.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2.5rem', color: '#999' }}>
                No hay nóminas. {esAdmin ? 'Crea la primera con "+ Nueva nómina".' : ''}
              </div>
            ) : (
              <div className="table-container">
                <ScrollableTable>
                  <table className="recibo-grid" style={{ width: '100%' }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left' }}>Nómina</th>
                        <th style={{ textAlign: 'left' }}>Período</th>
                        <th style={{ textAlign: 'center' }}>Colaboradores</th>
                        <th style={{ textAlign: 'right' }}>Total líquido</th>
                        <th style={{ textAlign: 'center' }}>Estado</th>
                        <th style={{ textAlign: 'center' }}>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {nominas.map(n => (
                        <tr key={n.id}>
                          <td style={{ padding: '6px 10px' }}><strong>{n.nombre}</strong></td>
                          <td style={{ padding: '6px 10px' }}>{periodoLabel(n)} · <span style={{ color: '#888', textTransform: 'capitalize' }}>{n.periodo_tipo}</span></td>
                          <td style={{ textAlign: 'center', padding: '6px 10px' }}>{n.total_pagados}/{n.total_renglones}</td>
                          <td style={{ textAlign: 'right', padding: '6px 10px', fontWeight: 700, color: '#1a237e' }}>{Q(n.total_liquido)}</td>
                          <td style={{ textAlign: 'center', padding: '6px 10px' }}>
                            <span className={`badge badge-${n.estado === 'pagada' ? 'activo' : 'retirado'}`}>{n.estado === 'pagada' ? 'Pagada' : 'Borrador'}</span>
                          </td>
                          <td style={{ textAlign: 'center', padding: '6px 10px' }}>
                            <div className="td-acciones">
                              <button className="btn-primary" onClick={() => setAbierta(n.id)}>Abrir</button>
                              {esAdmin && <button className="btn-danger" onClick={() => eliminarNomina(n)}>Eliminar</button>}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </ScrollableTable>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="table-header" style={{ marginBottom: 12 }}>
              {esAdmin && <button className="btn-primary" onClick={() => setModalColab(colabVacio)}>+ Nuevo colaborador</button>}
            </div>
            {colabs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2.5rem', color: '#999' }}>
                No hay colaboradores. {esAdmin ? 'Agrega el primero con "+ Nuevo colaborador".' : ''}
              </div>
            ) : (
              <div className="table-container">
                <ScrollableTable>
                  <table className="recibo-grid" style={{ width: '100%' }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left' }}>Colaborador</th>
                        <th style={{ textAlign: 'left' }}>Puesto</th>
                        <th style={{ textAlign: 'left' }}>Teléfono</th>
                        <th style={{ textAlign: 'right' }}>Salario base</th>
                        <th style={{ textAlign: 'center' }}>Estado</th>
                        <th style={{ textAlign: 'center' }}>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {colabs.map(c => (
                        <tr key={c.id}>
                          <td style={{ padding: '6px 10px' }}><strong>{c.nombre} {c.apellido}</strong></td>
                          <td style={{ padding: '6px 10px' }}>{c.puesto || '—'}</td>
                          <td style={{ padding: '6px 10px' }}>{c.telefono || '—'}</td>
                          <td style={{ textAlign: 'right', padding: '6px 10px' }}>{Q(c.salario_base)}</td>
                          <td style={{ textAlign: 'center', padding: '6px 10px' }}>
                            <span className={`badge badge-${c.estado === 'activo' ? 'activo' : 'retirado'}`}>{c.estado}</span>
                          </td>
                          <td style={{ textAlign: 'center', padding: '6px 10px' }}>
                            <div className="td-acciones">
                              {esAdmin ? (
                                <>
                                  <button className="btn-edit" onClick={() => setModalColab({ ...c, fecha_ingreso: c.fecha_ingreso ? String(c.fecha_ingreso).slice(0, 10) : '' })}>Editar</button>
                                  <button className="btn-danger" onClick={() => eliminarColab(c)}>Eliminar</button>
                                </>
                              ) : <span style={{ color: '#999', fontSize: '0.78rem' }}>Solo lectura</span>}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </ScrollableTable>
              </div>
            )}
          </>
        )}
      </div>

      {modalColab && (
        <ModalColaborador inicial={modalColab} onGuardar={guardarColab} onCerrar={() => setModalColab(null)} />
      )}
      {modalNomina && (
        <ModalNuevaNomina onCrear={crearNomina} onCerrar={() => setModalNomina(false)} />
      )}
    </div>
  );
}
