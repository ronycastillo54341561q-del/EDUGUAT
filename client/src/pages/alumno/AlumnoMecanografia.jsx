import { useState, useEffect } from 'react';
import AlumnoSidebar from '../../components/AlumnoSidebar';
import API from '../../api/axios';
import '../admin/admin.css';

const anioActual = new Date().getFullYear();
const ANIOS = Array.from({ length: 5 }, (_, i) => anioActual - i);
const LECCIONES = Array.from({ length: 20 }, (_, i) => i + 1);

const AlumnoMecanografia = () => {
  const [anio,     setAnio]     = useState(anioActual);
  const [data,     setData]     = useState(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    setCargando(true);
    API.get(`/alumno/mecanografia?anio=${anio}`)
      .then(({ data }) => setData(data))
      .catch(console.error)
      .finally(() => setCargando(false));
  }, [anio]);

  const notas = data?.notas;
  const lecciones = LECCIONES.map(n => ({
    leccion: n,
    valor: notas?.[`l${n}`] != null ? Number(notas[`l${n}`]) : null,
  }));
  const examen = notas?.examen != null ? Number(notas.examen) : null;

  const completadas = lecciones.filter(l => l.valor != null).length;
  const valores = lecciones.filter(l => l.valor != null).map(l => l.valor);
  const promedio = valores.length
    ? +(valores.reduce((s, v) => s + v, 0) / valores.length).toFixed(2)
    : null;

  return (
    <div className="admin-layout">
      <AlumnoSidebar />
      <div className="admin-content">
        <h1>⌨️ Mecanografía</h1>
        <p className="subtitle">Lecciones del año {anio}</p>

        <div className="asist-filtros" style={{ marginBottom: '1.5rem' }}>
          <select value={anio} onChange={e => setAnio(Number(e.target.value))}>
            {ANIOS.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>

        {/* Resumen */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
          {[
            { label: 'Total lecciones', value: 20,                       color: '#1a237e', icon: '📚' },
            { label: 'Completadas',     value: completadas,              color: '#2e7d32', icon: '✅' },
            { label: 'Pendientes',      value: 20 - completadas,         color: '#e65100', icon: '📖' },
            { label: 'Promedio',        value: promedio ?? '—',          color: '#6a1b9a', icon: '⭐' },
            { label: 'Examen',          value: examen != null ? examen : '—', color: examen != null && examen >= 60 ? '#2e7d32' : '#c62828', icon: '🏁' },
          ].map(({ label, value, color, icon }) => (
            <div key={label} className="card" style={{ textAlign: 'center', padding: '1rem 0.5rem' }}>
              <div style={{ fontSize: '1.4rem' }}>{icon}</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color, lineHeight: 1.2 }}>{value}</div>
              <div style={{ fontSize: '0.72rem', color: '#888', marginTop: '2px' }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Barra de progreso */}
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
            <span style={{ fontSize: '0.83rem', color: '#555', fontWeight: 600 }}>Progreso general</span>
            <span style={{ fontSize: '0.83rem', fontWeight: 700, color: '#1a237e' }}>
              {completadas}/20 ({Math.round((completadas / 20) * 100)}%)
            </span>
          </div>
          <div style={{ background: '#eee', borderRadius: '6px', height: '12px', overflow: 'hidden' }}>
            <div style={{
              width: `${(completadas / 20) * 100}%`,
              height: '100%',
              background: 'linear-gradient(90deg, #1a237e, #42a5f5)',
              borderRadius: '6px', transition: 'width 0.5s'
            }} />
          </div>
        </div>

        {cargando ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#999' }}>Cargando...</div>
        ) : (
          <div className="table-container">
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Lección</th>
                    <th style={{ textAlign: 'center' }}>Punteo</th>
                    <th style={{ textAlign: 'center' }}>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {lecciones.map(l => (
                    <tr key={l.leccion}>
                      <td style={{ fontWeight: 600 }}>Lección {l.leccion}</td>
                      <td style={{ textAlign: 'center' }}>
                        <span style={{
                          fontWeight: 700,
                          color: l.valor != null && l.valor >= 60 ? '#2e7d32' :
                                 l.valor != null ? '#c62828' : '#bbb'
                        }}>
                          {l.valor != null ? l.valor : '—'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {l.valor != null ? (
                          <span className="badge" style={{ background: '#e8f5e9', color: '#2e7d32' }}>Completada</span>
                        ) : (
                          <span className="badge" style={{ background: '#fff3e0', color: '#e65100' }}>Pendiente</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  <tr>
                    <td style={{ fontWeight: 700, color: '#1a237e' }}>🏁 Examen final</td>
                    <td style={{ textAlign: 'center' }}>
                      <span style={{
                        fontWeight: 700,
                        color: examen != null && examen >= 60 ? '#2e7d32' :
                               examen != null ? '#c62828' : '#bbb'
                      }}>
                        {examen != null ? examen : '—'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {examen != null ? (
                        <span className="badge" style={{ background: '#e8f5e9', color: '#2e7d32' }}>Realizado</span>
                      ) : (
                        <span className="badge" style={{ background: '#fff3e0', color: '#e65100' }}>Pendiente</span>
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AlumnoMecanografia;
