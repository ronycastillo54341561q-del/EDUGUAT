import { useState, useEffect } from 'react';
import AlumnoSidebar from '../../components/AlumnoSidebar';
import API from '../../api/axios';
import '../admin/admin.css';

const Campo = ({ label, value }) => (
  <div style={{ marginBottom: '0.75rem' }}>
    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
      {label}
    </span>
    <p style={{ fontSize: '0.95rem', color: '#1a1a2e', marginTop: '2px' }}>{value || '—'}</p>
  </div>
);

const AlumnoPerfil = () => {
  const [perfil, setPerfil]     = useState(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    API.get('/alumno/perfil')
      .then(({ data }) => setPerfil(data))
      .catch(console.error)
      .finally(() => setCargando(false));
  }, []);

  const formatFecha = (s) => {
    if (!s) return '—';
    return new Date(s + 'T12:00:00').toLocaleDateString('es-GT', { day: '2-digit', month: 'long', year: 'numeric' });
  };

  return (
    <div className="admin-layout">
      <AlumnoSidebar />
      <div className="admin-content">
        <h1>👤 Mi Perfil</h1>
        <p className="subtitle">Información personal y datos de matrícula</p>

        {cargando ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#999' }}>Cargando...</div>
        ) : !perfil ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#f44336' }}>No se encontró tu perfil de alumno.</div>
        ) : (
          <>
            <div style={{
              background: 'linear-gradient(135deg, #1a237e 0%, #283593 100%)',
              color: '#fff', borderRadius: '14px', padding: '1.5rem 2rem',
              marginBottom: '1.5rem', display: 'flex', alignItems: 'center',
              gap: '1.5rem', flexWrap: 'wrap'
            }}>
              <div style={{
                width: 64, height: 64, borderRadius: '50%',
                background: 'rgba(255,255,255,0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1.8rem', flexShrink: 0
              }}>👤</div>
              <div>
                <h2 style={{ color: '#fff', fontSize: '1.3rem' }}>{perfil.nombre} {perfil.apellido}</h2>
                <p style={{ color: '#c5cae9', fontSize: '0.88rem', marginTop: '2px' }}>
                  {perfil.clave}{perfil.codigo_estudiante ? ` · ${perfil.codigo_estudiante}` : ''} · {perfil.diplomado}
                </p>
                <span style={{
                  display: 'inline-block', marginTop: '6px',
                  background: perfil.estado === 'activo' ? '#43a047' : '#e53935',
                  color: '#fff', borderRadius: '20px', padding: '2px 12px',
                  fontSize: '0.75rem', fontWeight: 700
                }}>
                  {perfil.estado?.toUpperCase()}
                </span>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
              <div className="card">
                <h3 style={{ marginBottom: '1rem', color: '#1a237e', fontSize: '0.95rem' }}>Datos Personales</h3>
                <Campo label="Nombre completo"    value={`${perfil.nombre} ${perfil.apellido}`} />
                <Campo label="Fecha de nacimiento" value={formatFecha(perfil.fecha_nacimiento)} />
                <Campo label="Correo electrónico"  value={perfil.email} />
                <Campo label="Establecimiento"     value={perfil.establecimiento} />
                <Campo label="Dirección"           value={perfil.direccion} />
              </div>

              <div className="card">
                <h3 style={{ marginBottom: '1rem', color: '#1a237e', fontSize: '0.95rem' }}>Datos Académicos</h3>
                <Campo label="Clave"             value={perfil.clave} />
                <Campo label="Código estudiante" value={perfil.codigo_estudiante || '—'} />
                <Campo label="Diplomado"         value={perfil.diplomado} />
                <Campo label="TAC"               value={perfil.tac} />
                <Campo label="Fecha de inicio"   value={formatFecha(perfil.fecha_inicio)} />
                <Campo label="Cuota mensual"     value={perfil.cuota_mensual ? `Q ${perfil.cuota_mensual}.00` : null} />
              </div>

              <div className="card">
                <h3 style={{ marginBottom: '1rem', color: '#1a237e', fontSize: '0.95rem' }}>Horario y Clases</h3>
                <Campo label="Horario"        value={perfil.horario} />
                <Campo label="Laboratorio"    value={perfil.laboratorio} />
                <Campo label="Día de clases"  value={perfil.dia_clases1} />
                {perfil.dia_clases2 && <Campo label="Segundo día" value={perfil.dia_clases2} />}
                <Campo label="Encargado"      value={perfil.encargado} />
                <Campo label="Teléfono"       value={perfil.telefono} />
              </div>
            </div>

            {perfil.observaciones && (
              <div className="card" style={{ marginTop: '1rem' }}>
                <h3 style={{ marginBottom: '0.5rem', color: '#1a237e', fontSize: '0.95rem' }}>Observaciones</h3>
                <p style={{ color: '#555', fontSize: '0.9rem' }}>{perfil.observaciones}</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default AlumnoPerfil;
