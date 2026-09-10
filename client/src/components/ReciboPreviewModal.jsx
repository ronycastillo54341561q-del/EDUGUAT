import { useState } from 'react';
import { Download, Printer } from 'lucide-react';
import API from '../api/axios';
import { loadMembrete } from '../lib/membrete';
import { generarReciboPDF, totalEnLetras } from '../lib/reciboPDF';

// Reimpresión de un recibo ya emitido.
//
// El original se genera una sola vez (Nuevo Pago / Otros Pagos) y se descarga
// + sube a Drive en ese momento. Aquí NO se re-sube nada a Drive: solo se
// reconstruye el mismo documento a partir de la fila de `recibos`, que guarda
// todos los datos que el PDF necesita (no. de recibo, fecha, total, descuento,
// detalle y alumno).
//
// Permisos (todos evaluados por el llamador, ver Recibos.jsx):
//   - ver     → abre este modal y lee el recibo en pantalla
//   - export  → además puede descargar el PDF (marcado como COPIA)
//   - edit    → se maneja en la tabla, no aquí

const fmtQ = (n) => `Q ${(Number(n) || 0).toFixed(2)}`;
const fmtFecha = (iso) => {
  if (!iso) return '—';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
};

// Traduce la fila del listado al objeto que espera `generarReciboPDF`.
// `alumno_nombre` ya viene concatenado del backend (COALESCE con alumno_texto
// para los recibos importados sin ficha de alumno), así que va completo en
// `nombre` y `apellido` queda vacío.
const reciboDesdeFila = (r) => ({
  no_recibo: r.no_recibo || '',
  fecha:     r.fecha ? String(r.fecha).slice(0, 10) : '',
  total:     Number(r.total) || 0,
  descuento: Number(r.descuento) || 0,
  meses_str: r.meses || r.observaciones || '',
  alumno: {
    clave:             r.clave || r.codigo_estudiante || 'S/C',
    codigo_estudiante: r.codigo_estudiante || '',
    nombre:            r.alumno_nombre || '',
    apellido:          '',
  },
});

export default function ReciboPreviewModal({ recibo, puedeExportar, usuarioNombre, onClose }) {
  const [bajando, setBajando] = useState(false);
  const [err, setErr] = useState('');

  const data = reciboDesdeFila(recibo);
  const anulado = !!recibo.anulado;

  const descargar = async () => {
    setErr('');
    setBajando(true);
    try {
      let mctx = null;
      try { mctx = await loadMembrete('recibos'); } catch { /* sigue sin membrete */ }
      await generarReciboPDF(data, mctx, {
        skipQR: true,
        copia: { fecha: new Date(), usuario: usuarioNombre },
      });
      // Rastro en bitácora. Si falla no revertimos la descarga: el PDF ya está
      // en la máquina del usuario y bloquear aquí no aporta nada.
      API.post(`/recibos/${recibo.id}/reimpresion`).catch(() => {});
    } catch (ex) {
      console.error(ex);
      setErr('No se pudo generar el PDF de la copia.');
    } finally {
      setBajando(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
        <div className="modal-header">
          <h2>Reimprimir recibo</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-form">
          {anulado && (
            <div style={{
              background: '#ffebee', color: '#c62828', borderLeft: '3px solid #c62828',
              padding: '0.6rem 0.9rem', borderRadius: 7, marginBottom: '1rem',
              fontSize: '0.85rem', fontWeight: 600,
            }}>
              Este recibo está ANULADO. La copia se genera solo como respaldo.
            </div>
          )}

          {/* Vista del recibo — mismos datos y orden que el PDF */}
          <div style={{
            border: '1px solid #c5cae9', borderRadius: 9, padding: '1rem 1.1rem',
            background: '#fdfdff',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, color: '#1a237e' }}>
              <span>No. Recibo: {data.no_recibo || '—'}</span>
              <span>Fecha: {fmtFecha(data.fecha)}</span>
            </div>

            <div style={{ marginTop: '0.7rem', fontSize: '0.88rem', color: '#333' }}>
              <div>Clave: <strong>{data.alumno.clave}</strong>
                {data.alumno.codigo_estudiante ? <> · Cód: <strong>{data.alumno.codigo_estudiante}</strong></> : null}
              </div>
              <div>Alumno: <strong>{data.alumno.nombre || '—'}</strong></div>
            </div>

            <hr style={{ border: 0, borderTop: '1px solid #e0e0e0', margin: '0.8rem 0' }} />

            <div style={{ fontSize: '0.8rem', color: '#555' }}>SON:</div>
            <div style={{ fontWeight: 700, fontSize: '0.86rem', color: '#222' }}>
              {totalEnLetras(data.total)}
            </div>

            <div style={{
              textAlign: 'center', fontWeight: 700, fontSize: '1.6rem',
              color: '#1b5e20', margin: '0.7rem 0',
            }}>
              {fmtQ(data.total)}
            </div>

            {data.descuento > 0 && (
              <div style={{ textAlign: 'center', fontSize: '0.78rem', color: '#2e7d32' }}>
                Descuento aplicado: {fmtQ(data.descuento)} · Total efectivo distribuido: {fmtQ(data.total + data.descuento)}
              </div>
            )}

            <div style={{ marginTop: '0.8rem', fontSize: '0.8rem', color: '#555' }}>Detalle de pago:</div>
            <div style={{ fontSize: '0.9rem', color: '#222' }}>{data.meses_str || '—'}</div>

            {recibo.no_deposito && (
              <div style={{ marginTop: '0.6rem', fontSize: '0.8rem', color: '#555' }}>
                No. Depósito: <strong>{recibo.no_deposito}</strong>
              </div>
            )}

            <hr style={{ border: 0, borderTop: '1px solid #e0e0e0', margin: '0.8rem 0 0.5rem' }} />
            <div style={{ fontSize: '0.72rem', color: '#888' }}>
              Documento válido como comprobante oficial de pago.
            </div>
          </div>

          {puedeExportar ? (
            <p style={{ fontSize: '0.8rem', color: '#666', marginTop: '0.8rem' }}>
              El PDF sale idéntico al original, con una línea al pie que lo identifica
              como copia e indica quién la generó.
            </p>
          ) : (
            <p style={{ fontSize: '0.8rem', color: '#e65100', marginTop: '0.8rem' }}>
              Tu rol permite consultar el recibo pero no descargarlo. Pide a un
              administrador el permiso de exportación del módulo Recibos.
            </p>
          )}

          {err && <p style={{ color: '#e53935', fontSize: '0.85rem' }}>{err}</p>}

          <div className="modal-actions">
            <button type="button" className="btn-cancel" onClick={onClose}>Cerrar</button>
            {puedeExportar && (
              <button type="button" className="btn-primary" onClick={descargar} disabled={bajando}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                {bajando ? <Printer size={15} /> : <Download size={15} />}
                {bajando ? 'Generando...' : 'Descargar copia'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
