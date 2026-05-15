import { useState, useEffect } from 'react';
import AlumnoSidebar from '../../components/AlumnoSidebar';
import API from '../../api/axios';
import '../admin/admin.css';

const MESES = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'
];
const SEMANAS = [1, 2, 3, 4, 5];

const ESTADOS = {
  x: { color: '#2e7d32', bg: '#e8f5e9', label: 'Asistió' },
  e: { color: '#e65100', bg: '#fff3e0', label: 'Enfermo' },
  p: { color: '#1565c0', bg: '#e3f2fd', label: 'Permiso' },
  f: { color: '#c62828', bg: '#ffebee', label: 'Falta'   },
};

const anioActual = new Date().getFullYear();
const ANIOS = Array.from({ length: 5 }, (_, i) => anioActual - i);

const AlumnoAsistencia = () => {
  const [anio,      setAnio]      = useState(anioActual);
  const [registros, setRegistros] = useState([]);
  const [cargando,  setCargando]  = useState(false);

  useEffect(() => {
    setCargando(true);
    API.get(`/alumno/asistencia?anio=${anio}`)
      .then(({ data }) => setRegistros(data))
      .catch(console.error)
      .finally(() => setCargando(false));
  }, [anio]);

  // Mapa { "mes_semana": "x" }
  const grid = {};
  for (const r of registros) {
    grid[`${r.mes}_${r.semana}`] = (r.estado || '').toLowerCase();
  }

  const totales = registros.reduce((acc, r) => {
    const k = (r.estado || '').toLowerCase();
    if (acc[k] !== undefined) acc[k]++;
    acc.total++;
    return acc;
  }, { x: 0, e: 0, p: 0, f: 0, total: 0 });

  const presentes = totales.x + totales.e + totales.p;
  const pct = totales.total > 0 ? Math.round((presentes / totales.total) * 100) : null;

  return (
    <div className="admin-layout">
      <AlumnoSidebar />
      <div className="admin-content">
        <h1>📋 Mi Asistencia</h1>
        <p className="subtitle">Asistencia semanal por mes</p>

        <div className="asist-filtros" style={{ marginBottom: '1.5rem' }}>
          <select value={anio} onChange={e => setAnio(Number(e.target.value))}>
            {ANIOS.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>

        {/* Resumen */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
          {[
            { key: 'pct', label: '% Asistencia', valor: pct != null ? `${pct}%` : '—', color: '#1a237e', icon: '📊' },
            { key: 'x',   label: 'Asistencias',  valor: totales.x, color: ESTADOS.x.color, icon: '✅' },
            { key: 'e',   label: 'Enfermo',      valor: totales.e, color: ESTADOS.e.color, icon: '🤒' },
            { key: 'p',   label: 'Permisos',     valor: totales.p, color: ESTADOS.p.color, icon: '📄' },
            { key: 'f',   label: 'Faltas',       valor: totales.f, color: ESTADOS.f.color, icon: '❌' },
          ].map(({ key, label, valor, color, icon }) => (
            <div key={key} className="card" style={{ textAlign: 'center', padding: '1rem 0.5rem' }}>
              <div style={{ fontSize: '1.4rem' }}>{icon}</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color, lineHeight: 1.2 }}>{valor}</div>
              <div style={{ fontSize: '0.72rem', color: '#888', marginTop: '2px' }}>{label}</div>
            </div>
          ))}
        </div>

        {cargando ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#999' }}>Cargando...</div>
        ) : registros.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '2rem', color: '#bbb' }}>
            No hay registros de asistencia para {anio}
          </div>
        ) : (
          <div className="table-container">
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th style={{ minWidth: 120 }}>Mes</th>
                    {SEMANAS.map(s => <th key={s} style={{ textAlign: 'center', minWidth: 50 }}>S{s}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {MESES.map((nombre, i) => {
                    const mes = i + 1;
                    return (
                      <tr key={mes}>
                        <td style={{ fontWeight: 600 }}>{nombre}</td>
                        {SEMANAS.map(s => {
                          const v = grid[`${mes}_${s}`];
                          const info = ESTADOS[v];
                          return (
                            <td key={s} style={{ textAlign: 'center', padding: 4 }}>
                              {info ? (
                                <span title={info.label} style={{
                                  display: 'inline-block', minWidth: 28,
                                  background: info.bg, color: info.color,
                                  borderRadius: 6, padding: '4px 8px',
                                  fontWeight: 700, fontSize: '.85rem'
                                }}>
                                  {v.toUpperCase()}
                                </span>
                              ) : (
                                <span style={{ color: '#ccc' }}>—</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AlumnoAsistencia;
