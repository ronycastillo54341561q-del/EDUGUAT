import { useState, useEffect } from 'react';
import AlumnoSidebar from '../../components/AlumnoSidebar';
import API from '../../api/axios';
import '../admin/admin.css';

const anioActual = new Date().getFullYear();
const ANIOS      = Array.from({ length: 5 }, (_, i) => anioActual - i);

const ESTADO_MES = {
  pagado:    { label: 'Pagado',    color: '#2e7d32', bg: '#e8f5e9' },
  pendiente: { label: 'Pendiente', color: '#e65100', bg: '#fff3e0' },
  anulado:   { label: 'Anulado',   color: '#757575', bg: '#f5f5f5' },
  descuento: { label: 'Descuento', color: '#1565c0', bg: '#e3f2fd' },
};

const AlumnoPagos = () => {
  const [anio,          setAnio]          = useState(anioActual);
  const [mensualidades, setMensualidades] = useState([]);
  const [cargando,      setCargando]      = useState(false);

  useEffect(() => {
    setCargando(true);
    API.get(`/alumno/mensualidades?anio=${anio}`)
      .then(({ data }) => setMensualidades(data))
      .catch(console.error)
      .finally(() => setCargando(false));
  }, [anio]);

  const pagadas   = mensualidades.filter(m => m.pagado && !m.anulado).length;
  const pendientes = mensualidades.filter(m => !m.pagado && !m.anulado && !m.descuento_100).length;
  const totalPagado = mensualidades.reduce((s, m) => s + (m.pagado && !m.anulado ? Number(m.monto) : 0), 0);

  const estadoMes = m => {
    if (m.anulado)        return ESTADO_MES.anulado;
    if (m.descuento_100)  return ESTADO_MES.descuento;
    if (m.pagado)         return ESTADO_MES.pagado;
    return ESTADO_MES.pendiente;
  };

  const formatFecha = s => s ? new Date(s + 'T12:00:00').toLocaleDateString('es-GT', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

  return (
    <div className="admin-layout">
      <AlumnoSidebar />
      <div className="admin-content">
        <h1>💰 Mis Pagos</h1>
        <p className="subtitle">Estado de mensualidades</p>

        <div className="asist-filtros" style={{ marginBottom: '1.5rem' }}>
          <select value={anio} onChange={e => setAnio(Number(e.target.value))}>
            {ANIOS.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>

        {/* Resumen */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
          {[
            { label: 'Pagadas',   value: pagadas,           color: '#2e7d32', icon: '✅' },
            { label: 'Pendientes', value: pendientes,        color: '#e65100', icon: '⏳' },
            { label: 'Total pagado', value: `Q ${totalPagado.toFixed(2)}`, color: '#1a237e', icon: '💵' },
          ].map(({ label, value, color, icon }) => (
            <div key={label} className="card" style={{ textAlign: 'center', padding: '1rem 0.5rem' }}>
              <div style={{ fontSize: '1.4rem' }}>{icon}</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color, lineHeight: 1.2 }}>{value}</div>
              <div style={{ fontSize: '0.72rem', color: '#888', marginTop: '2px' }}>{label}</div>
            </div>
          ))}
        </div>

        {cargando ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#999' }}>Cargando...</div>
        ) : (
          <div className="table-container">
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Mes</th>
                    <th>Monto</th>
                    <th>Estado</th>
                    <th>Recibo</th>
                    <th>Fecha pago</th>
                  </tr>
                </thead>
                <tbody>
                  {mensualidades.map(m => {
                    const est = estadoMes(m);
                    return (
                      <tr key={m.id}>
                        <td style={{ textTransform: 'capitalize', fontWeight: 600 }}>{m.mes}</td>
                        <td>Q {Number(m.monto).toFixed(2)}</td>
                        <td>
                          <span className="badge" style={{ background: est.bg, color: est.color }}>
                            {est.label}
                          </span>
                        </td>
                        <td style={{ color: '#555', fontSize: '0.85rem' }}>{m.no_recibo || '—'}</td>
                        <td style={{ fontSize: '0.85rem' }}>{formatFecha(m.fecha_pago)}</td>
                      </tr>
                    );
                  })}
                  {mensualidades.length === 0 && (
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: '#bbb' }}>
                        Sin mensualidades para {anio}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AlumnoPagos;
