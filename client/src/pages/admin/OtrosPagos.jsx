import { useState, useEffect, useRef } from 'react';
import Sidebar from '../../components/Sidebar';
import API from '../../api/axios';
import { loadMembrete } from '../../lib/membrete';
import { generarReciboPDF } from '../../lib/reciboPDF';
import './admin.css';
import './NuevoPago.css';

const hoy = () => new Date().toISOString().slice(0, 10);
const fmtQ = (n) => `Q ${Number(n).toFixed(2)}`;

export default function OtrosPagos() {
  const [busqueda, setBusqueda]         = useState('');
  const [listaAlumnos, setListaAlumnos] = useState([]);
  const [showDrop, setShowDrop]         = useState(false);
  const [alumnoSel, setAlumnoSel]       = useState(null);
  const [descripcion, setDescripcion]   = useState('');
  const [total, setTotal]               = useState('');
  const [fechaPago, setFechaPago]       = useState(hoy());
  const [showModal, setShowModal]       = useState(false);
  const [procesando, setProcesando]     = useState(false);
  const [recibo, setRecibo]             = useState(null);
  const [error, setError]               = useState('');
  const dropRef = useRef(null);

  useEffect(() => {
    API.get('/alumnos').then(r => setListaAlumnos(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    const h = (e) => { if (dropRef.current && !dropRef.current.contains(e.target)) setShowDrop(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

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
    setError('');
  };

  const handleBusquedaChange = (e) => {
    setBusqueda(e.target.value);
    setShowDrop(true);
    if (alumnoSel) setAlumnoSel(null);
  };

  const handlePreview = () => {
    setError('');
    if (!alumnoSel) { setError('Selecciona un alumno.'); return; }
    if (!descripcion.trim()) { setError('Ingresa una descripción.'); return; }
    const montoNum = parseFloat(total);
    if (!montoNum || montoNum <= 0) { setError('Ingresa un total válido mayor a cero.'); return; }
    setShowModal(true);
  };

  const handleConfirmar = async () => {
    if (!alumnoSel) return;
    setProcesando(true);
    setError('');
    try {
      const [{ data: reciboResp }, mctx] = await Promise.all([
        API.post('/nuevo-pago/otros', {
          alumno_id:   alumnoSel.id,
          descripcion: descripcion.trim(),
          total:       parseFloat(total),
          fecha_pago:  fechaPago,
        }),
        loadMembrete('recibos'),
      ]);
      setRecibo(reciboResp);
      setShowModal(false);
      await generarReciboPDF(reciboResp, mctx);
    } catch (err) {
      setError(err.response?.data?.message || 'Error al registrar el otro pago.');
      setShowModal(false);
    } finally {
      setProcesando(false);
    }
  };

  const handleNuevoCobro = () => {
    setAlumnoSel(null); setBusqueda(''); setDescripcion('');
    setTotal(''); setFechaPago(hoy()); setRecibo(null); setError('');
  };

  const handleDescargaPDF = async () => {
    if (!recibo) return;
    try {
      const mctx = await loadMembrete('recibos');
      await generarReciboPDF(recibo, mctx);
    } catch { await generarReciboPDF(recibo, null); }
  };

  return (
    <div className="admin-layout">
      <Sidebar />
      <main className="admin-content">
        <h1>Otros Pagos</h1>
        <p className="subtitle">
          Registra cobros sueltos (no asociados a colegiatura) y emite el recibo.
          El recibo aparece junto con los demás en el módulo de Recibos.
        </p>

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
                      <strong>{a.clave}</strong>
                      {a.codigo_estudiante ? <span style={{ color: '#888', marginLeft: 6, fontSize: '0.78rem' }}>({a.codigo_estudiante})</span> : null}
                      {' — '}{a.nombre} {a.apellido}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {error && <div className="np-error">{error}</div>}

        {alumnoSel && !recibo && (
          <>
            <div className="np-alumno-card">
              <div>
                <div className="np-ac-name">{alumnoSel.nombre} {alumnoSel.apellido}</div>
                <div className="np-ac-sub">
                  {alumnoSel.clave}
                  {alumnoSel.codigo_estudiante ? ` · ${alumnoSel.codigo_estudiante}` : ''}
                  {alumnoSel.diplomado ? ` · ${alumnoSel.diplomado}` : ''}
                </div>
              </div>
            </div>

            <div className="np-pago-card">
              <h2>Datos del cobro</h2>

              <div className="np-form-row" style={{ marginBottom: '0.75rem' }}>
                <div className="np-field" style={{ flex: 1 }}>
                  <label>Descripción del cobro</label>
                  <input
                    type="text"
                    placeholder="Ej. Cuota de inscripción, material didáctico..."
                    value={descripcion}
                    onChange={e => setDescripcion(e.target.value)}
                    style={{ width: '100%' }}
                  />
                </div>
              </div>

              <div className="np-form-row">
                <div className="np-field">
                  <label>Fecha</label>
                  <input type="date" value={fechaPago} onChange={e => setFechaPago(e.target.value)} />
                </div>
                <div className="np-field">
                  <label>Total a cobrar (Q)</label>
                  <input
                    className="big"
                    type="number" min="0" step="0.01" placeholder="0.00"
                    value={total}
                    onChange={e => setTotal(e.target.value)}
                  />
                </div>
                <button className="btn-preview" onClick={handlePreview} disabled={!total || !descripcion.trim()}>
                  Previsualizar cobro
                </button>
              </div>
            </div>
          </>
        )}

        {recibo && (
          <div className="np-success-card">
            <div className="np-success-icon">✅</div>
            <h2>Cobro registrado exitosamente</h2>
            <p>Recibo generado:</p>
            <div className="recibo-num">#{recibo.no_recibo}</div>
            <p>
              <strong>{recibo.alumno.nombre} {recibo.alumno.apellido}</strong> · {recibo.alumno.clave}
              {recibo.alumno.codigo_estudiante ? ` (${recibo.alumno.codigo_estudiante})` : ''}
            </p>
            <p>Concepto: <strong>{recibo.meses_str}</strong></p>
            <p>Total cobrado: <strong>{fmtQ(recibo.total)}</strong></p>
            <p style={{ color: '#888', fontSize: '0.82rem' }}>El PDF se descargó automáticamente.</p>
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

        {showModal && alumnoSel && (
          <div className="np-modal-overlay" onClick={() => !procesando && setShowModal(false)}>
            <div className="np-modal" onClick={e => e.stopPropagation()}>
              <h2>Previsualización del cobro</h2>
              <ul className="np-preview-list">
                <li>
                  <span><strong>{alumnoSel.nombre} {alumnoSel.apellido}</strong> ({alumnoSel.clave})</span>
                </li>
                <li>
                  <span>Concepto: <strong>{descripcion.trim()}</strong></span>
                </li>
                <li>
                  <span>Fecha:</span>
                  <span>{fechaPago}</span>
                </li>
              </ul>

              <div className="np-preview-total">
                <span>Total a cobrar:</span>
                <span>{fmtQ(parseFloat(total) || 0)}</span>
              </div>

              <div className="np-modal-btns">
                <button className="btn-cancel" onClick={() => setShowModal(false)} disabled={procesando}>
                  Cancelar
                </button>
                <button className="btn-confirm" onClick={handleConfirmar} disabled={procesando}>
                  {procesando ? 'Procesando...' : 'Confirmar y emitir recibo'}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
