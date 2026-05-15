import { useState, useEffect } from 'react';
import AlumnoSidebar from '../../components/AlumnoSidebar';
import API from '../../api/axios';
import '../admin/admin.css';

const ROL_LABEL = { admin: 'Administrador', oficina: 'Oficina', maestro: 'Maestro' };
const SCOPE_LABEL = {
  global: 'General',
  horario: 'Tu horario',
  laboratorio: 'Tu laboratorio',
  diplomado: 'Tu diplomado',
  dia: 'Tu día de clases',
  alumno: 'Personal',
};
const SCOPE_COLOR = {
  global:      { bg: '#e8eaf6', color: '#3949ab' },
  horario:     { bg: '#e3f2fd', color: '#1565c0' },
  laboratorio: { bg: '#fff3e0', color: '#ef6c00' },
  diplomado:   { bg: '#f3e5f5', color: '#6a1b9a' },
  dia:         { bg: '#e0f7fa', color: '#006064' },
  alumno:      { bg: '#fce4ec', color: '#c2185b' },
};

const fmtFecha = (s) => {
  if (!s) return '—';
  const d = typeof s === 'string' ? new Date(s.replace(' ', 'T')) : new Date(s);
  if (isNaN(d)) return '—';
  return d.toLocaleString('es-GT', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const AlumnoAvisos = () => {
  const [avisos,   setAvisos]   = useState([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    API.get('/alumno/avisos')
      .then(({ data }) => setAvisos(data))
      .catch(console.error)
      .finally(() => setCargando(false));
  }, []);

  return (
    <div className="admin-layout">
      <AlumnoSidebar />
      <div className="admin-content">
        <h1>📣 Avisos</h1>
        <p className="subtitle">Mensajes que aplican a ti, tu grupo, tu horario o tu diplomado</p>

        {cargando ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#999' }}>Cargando...</div>
        ) : avisos.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '2rem', color: '#bbb' }}>
            No tienes avisos por el momento
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.75rem' }}>
            {avisos.map(a => {
              const c = SCOPE_COLOR[a.scope] || SCOPE_COLOR.global;
              return (
                <div key={a.id} className="card" style={{ borderLeft: `5px solid ${c.color}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '.5rem', marginBottom: '.4rem' }}>
                    <h3 style={{ color: '#1a237e', fontSize: '1rem', margin: 0 }}>{a.titulo}</h3>
                    <span style={{
                      fontSize: '.7rem', fontWeight: 700,
                      background: c.bg, color: c.color,
                      padding: '2px 10px', borderRadius: '12px',
                    }}>
                      {SCOPE_LABEL[a.scope] || a.scope}
                    </span>
                  </div>
                  <p style={{ fontSize: '.95rem', color: '#333', whiteSpace: 'pre-wrap', margin: '0 0 .5rem' }}>
                    {a.mensaje}
                  </p>
                  <div style={{ fontSize: '.75rem', color: '#888', display: 'flex', gap: '.75rem', flexWrap: 'wrap' }}>
                    <span>👤 {ROL_LABEL[a.autor_rol] || a.autor_rol}: <strong>{a.autor_nombre}</strong></span>
                    <span>🕒 {fmtFecha(a.created_at)}</span>
                    {a.expira_at && <span>⏳ Vence: {fmtFecha(a.expira_at)}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default AlumnoAvisos;
