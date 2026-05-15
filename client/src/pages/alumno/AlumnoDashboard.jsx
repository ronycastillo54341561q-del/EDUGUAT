import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import AlumnoSidebar from '../../components/AlumnoSidebar';
import API from '../../api/axios';
import '../admin/admin.css';

const fmtFecha = (s) => {
  if (!s) return '—';
  const d = typeof s === 'string' ? new Date(s.replace(' ', 'T')) : new Date(s);
  if (isNaN(d)) return '—';
  return d.toLocaleDateString('es-GT', { day: '2-digit', month: 'short', year: 'numeric' });
};

const Card = ({ titulo, valor, sub, color = '#1a237e', icon }) => (
  <div
    style={{
      position: 'relative',
      background: '#fff',
      borderRadius: 14,
      padding: '1.1rem 1rem 1rem',
      boxShadow: '0 1px 2px rgba(16,24,40,0.04), 0 4px 12px rgba(16,24,40,0.06)',
      border: '1px solid #eef0f6',
      overflow: 'hidden',
      transition: 'transform .18s ease, box-shadow .18s ease',
    }}
    onMouseEnter={e => {
      e.currentTarget.style.transform = 'translateY(-2px)';
      e.currentTarget.style.boxShadow = '0 2px 4px rgba(16,24,40,0.05), 0 10px 20px rgba(16,24,40,0.10)';
    }}
    onMouseLeave={e => {
      e.currentTarget.style.transform = 'translateY(0)';
      e.currentTarget.style.boxShadow = '0 1px 2px rgba(16,24,40,0.04), 0 4px 12px rgba(16,24,40,0.06)';
    }}
  >
    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${color}, ${color}55)` }} />
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
      <div style={{ fontSize: '0.7rem', color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em' }}>
        {titulo}
      </div>
      {icon && (
        <div style={{
          fontSize: '0.95rem',
          width: 30, height: 30,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: `${color}15`, color, borderRadius: 8, fontWeight: 700,
        }}>
          {icon}
        </div>
      )}
    </div>
    <div style={{ fontSize: '1.7rem', fontWeight: 800, color, lineHeight: 1.15 }}>
      {valor ?? '—'}
    </div>
    {sub && <div style={{ fontSize: '0.72rem', color: '#9ca3af', marginTop: 4 }}>{sub}</div>}
  </div>
);

const ROL_LABEL = { admin: 'Administrador', oficina: 'Oficina', maestro: 'Maestro' };
const SCOPE_LABEL = {
  global: 'General',
  horario: 'Horario',
  laboratorio: 'Laboratorio',
  diplomado: 'Diplomado',
  dia: 'Día',
  alumno: 'Personal',
};

const AlumnoDashboard = () => {
  const [data,     setData]     = useState(null);
  const [avisos,   setAvisos]   = useState([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    Promise.all([
      API.get('/alumno/dashboard'),
      API.get('/alumno/avisos'),
    ])
      .then(([d, a]) => { setData(d.data); setAvisos(a.data); })
      .catch(console.error)
      .finally(() => setCargando(false));
  }, []);

  if (cargando) {
    return (
      <div className="admin-layout">
        <AlumnoSidebar />
        <div className="admin-content">
          <div style={{ textAlign: 'center', padding: '3rem', color: '#999' }}>Cargando...</div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="admin-layout">
        <AlumnoSidebar />
        <div className="admin-content">
          <div style={{ textAlign: 'center', padding: '3rem', color: '#c62828' }}>
            No se pudo cargar tu información.
          </div>
        </div>
      </div>
    );
  }

  const { perfil, asistencia, pagos, notas, mecanografia, anio } = data;
  const recientes = avisos.slice(0, 3);

  return (
    <div className="admin-layout">
      <AlumnoSidebar />
      <div className="admin-content">
        <h1>📊 Mi Dashboard</h1>
        <p className="subtitle">Resumen de tus estadísticas hasta hoy · Año {anio}</p>

        {/* Banner perfil */}
        <div style={{
          background: 'linear-gradient(135deg, #1a237e 0%, #283593 100%)',
          color: '#fff', borderRadius: '14px', padding: '1.25rem 1.75rem',
          marginBottom: '1.25rem', display: 'flex', alignItems: 'center',
          gap: '1.5rem', flexWrap: 'wrap'
        }}>
          <div style={{
            width: 56, height: 56, borderRadius: '50%',
            background: 'rgba(255,255,255,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1.6rem', flexShrink: 0
          }}>👤</div>
          <div style={{ flex: 1, minWidth: 240 }}>
            <h2 style={{ color: '#fff', fontSize: '1.2rem', margin: 0 }}>
              {perfil.nombre} {perfil.apellido}
            </h2>
            <p style={{ color: '#c5cae9', fontSize: '0.85rem', marginTop: '2px' }}>
              {perfil.clave}{perfil.codigo_estudiante ? ` · ${perfil.codigo_estudiante}` : ''} · {perfil.diplomado || 'Sin diplomado'}
              {perfil.tac && ` · ${perfil.tac}`}
            </p>
            <p style={{ color: '#c5cae9', fontSize: '0.78rem', marginTop: '2px' }}>
              {perfil.dia_clases1}{perfil.dia_clases2 ? ` / ${perfil.dia_clases2}` : ''}
              {perfil.horario && ` · ${perfil.horario}`}
              {perfil.laboratorio && ` · ${perfil.laboratorio}`}
            </p>
          </div>
        </div>

        {/* Avisos recientes */}
        <div className="card" style={{ marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '.75rem' }}>
            <h3 style={{ color: '#1a237e', fontSize: '0.95rem', margin: 0 }}>📣 Avisos recientes</h3>
            <Link to="/alumno/avisos" style={{ fontSize: '.78rem', color: '#3949ab', textDecoration: 'none' }}>
              Ver todos →
            </Link>
          </div>
          {recientes.length === 0 ? (
            <p style={{ color: '#bbb', fontSize: '.85rem', textAlign: 'center', padding: '.75rem 0' }}>
              No hay avisos para ti
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
              {recientes.map(a => (
                <div key={a.id} style={{
                  padding: '.6rem .8rem', borderLeft: '4px solid #3949ab',
                  background: '#f5f7ff', borderRadius: '6px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '.4rem' }}>
                    <strong style={{ fontSize: '.9rem', color: '#1a237e' }}>{a.titulo}</strong>
                    <span style={{ fontSize: '.7rem', color: '#999' }}>
                      {ROL_LABEL[a.autor_rol] || a.autor_rol} · {a.autor_nombre} · {fmtFecha(a.created_at)}
                    </span>
                  </div>
                  <p style={{ fontSize: '.85rem', color: '#444', margin: '.25rem 0 0', whiteSpace: 'pre-wrap' }}>
                    {a.mensaje}
                  </p>
                  <span style={{
                    display: 'inline-block', marginTop: '.35rem',
                    fontSize: '.68rem', fontWeight: 700,
                    background: '#e8eaf6', color: '#3949ab',
                    padding: '1px 8px', borderRadius: '10px',
                  }}>
                    {SCOPE_LABEL[a.scope] || a.scope}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Asistencia */}
        <h3 style={{ color: '#1a237e', fontSize: '0.95rem', marginBottom: '.5rem' }}>📋 Asistencia</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '.75rem', marginBottom: '1.25rem' }}>
          <Card titulo="% Asistencia" valor={asistencia.pct != null ? `${asistencia.pct}%` : '—'} color="#2e7d32" icon="✅" />
          <Card titulo="Asistencias" valor={asistencia.x} color="#2e7d32" icon="X" />
          <Card titulo="Enfermo" valor={asistencia.e} color="#e65100" icon="E" />
          <Card titulo="Permisos" valor={asistencia.p} color="#1565c0" icon="P" />
          <Card titulo="Faltas" valor={asistencia.f} color="#c62828" icon="F" />
        </div>

        {/* Notas */}
        <h3 style={{ color: '#1a237e', fontSize: '0.95rem', marginBottom: '.5rem' }}>📝 Notas {anio}</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '.75rem', marginBottom: '1.25rem' }}>
          <Card
            titulo="Promedio TAC"
            valor={notas.tac.promedio != null ? notas.tac.promedio : '—'}
            color={(notas.tac.promedio || 0) >= 60 ? '#2e7d32' : '#c62828'}
            icon="🎯"
          />
          <Card
            titulo="Promedio Diplomado"
            valor={notas.diplomado.promedio != null ? notas.diplomado.promedio : '—'}
            sub={`${notas.diplomado.total_materias} materias con nota`}
            color={(notas.diplomado.promedio || 0) >= 60 ? '#2e7d32' : '#c62828'}
            icon="🎓"
          />
        </div>

        {/* Pagos */}
        <h3 style={{ color: '#1a237e', fontSize: '0.95rem', marginBottom: '.5rem' }}>💰 Pagos {anio}</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '.75rem', marginBottom: '1.25rem' }}>
          <Card titulo="Pagadas" valor={pagos.pagadas} color="#2e7d32" icon="✅" />
          <Card titulo="Pendientes" valor={pagos.pendientes} color="#e65100" icon="⏳" />
          <Card titulo="Con abono" valor={pagos.con_abono} color="#1565c0" icon="💸" />
          <Card titulo="Total pagado" valor={`Q ${pagos.total_pagado.toFixed(2)}`} color="#1a237e" icon="💵" />
          <Card titulo="Total abonado" valor={`Q ${pagos.total_abonado.toFixed(2)}`} color="#1565c0" icon="🪙" />
          <Card titulo="Pendiente Q" valor={`Q ${pagos.total_pendiente.toFixed(2)}`} color="#c62828" icon="📌" />
        </div>

        {/* Mecanografía */}
        <h3 style={{ color: '#1a237e', fontSize: '0.95rem', marginBottom: '.5rem' }}>⌨️ Mecanografía {anio}</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '.75rem', marginBottom: '1rem' }}>
          <Card titulo="Lecciones completadas" valor={`${mecanografia.completadas}/${mecanografia.total}`} color="#1a237e" icon="📚" />
          <Card
            titulo="Promedio"
            valor={mecanografia.promedio != null ? mecanografia.promedio : '—'}
            color={(mecanografia.promedio || 0) >= 60 ? '#2e7d32' : '#c62828'}
            icon="⭐"
          />
          <Card
            titulo="Examen"
            valor={mecanografia.examen != null ? mecanografia.examen : '—'}
            color={(mecanografia.examen || 0) >= 60 ? '#2e7d32' : '#c62828'}
            icon="🏁"
          />
        </div>
      </div>
    </div>
  );
};

export default AlumnoDashboard;
