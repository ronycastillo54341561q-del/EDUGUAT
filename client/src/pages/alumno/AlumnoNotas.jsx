import { useState, useEffect } from 'react';
import AlumnoSidebar from '../../components/AlumnoSidebar';
import API from '../../api/axios';
import '../admin/admin.css';

const anioActual = new Date().getFullYear();
const ANIOS = Array.from({ length: 5 }, (_, i) => anioActual - i);

const Barra = ({ valor, max = 100 }) => {
  const pct = Math.min(100, ((valor || 0) / max) * 100);
  const color = pct >= 60 ? '#2e7d32' : pct >= 40 ? '#f57c00' : '#c62828';
  return (
    <div style={{ background: '#eee', borderRadius: '4px', height: '8px', overflow: 'hidden' }}>
      <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: '4px', transition: 'width 0.4s' }} />
    </div>
  );
};

const FilaNota = ({ label, valor }) => (
  <div style={{ marginBottom: '0.75rem' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
      <span style={{ fontSize: '0.83rem', color: '#555' }}>{label}</span>
      <span style={{ fontSize: '0.83rem', fontWeight: 700, color: (valor || 0) >= 60 ? '#2e7d32' : '#c62828' }}>
        {valor != null && valor !== '' ? Number(valor).toFixed(1) : '—'}
      </span>
    </div>
    <Barra valor={valor} />
  </div>
);

const AlumnoNotas = () => {
  const [anio,     setAnio]     = useState(anioActual);
  const [data,     setData]     = useState(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    setCargando(true);
    API.get(`/alumno/notas?anio=${anio}`)
      .then(({ data }) => setData(data))
      .catch(console.error)
      .finally(() => setCargando(false));
  }, [anio]);

  const tac = data?.tac;
  const dipl = data?.diplomado || [];

  const promedioTac = tac
    ? (() => {
        const v = ['nota1','nota2','nota3','nota4']
          .map(k => tac[k]).filter(n => n !== null && n !== undefined && n !== '');
        return v.length ? +(v.reduce((s, n) => s + Number(n), 0) / v.length).toFixed(2) : null;
      })()
    : null;

  const promedioDip = dipl.length
    ? (() => {
        const v = dipl.map(m => m.nota).filter(n => n !== null && n !== undefined);
        return v.length ? +(v.reduce((s, n) => s + Number(n), 0) / v.length).toFixed(2) : null;
      })()
    : null;

  return (
    <div className="admin-layout">
      <AlumnoSidebar />
      <div className="admin-content">
        <h1>📝 Mis Notas</h1>
        <p className="subtitle">Calificaciones de TAC y Diplomado</p>

        <div className="asist-filtros" style={{ marginBottom: '1.5rem' }}>
          <select value={anio} onChange={e => setAnio(Number(e.target.value))}>
            {ANIOS.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>

        {cargando ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#999' }}>Cargando...</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>

            {/* Notas TAC */}
            <div className="card">
              <h3 style={{ color: '#1a237e', marginBottom: '1rem', fontSize: '0.95rem' }}>Notas TAC {anio}</h3>
              {!tac ? (
                <p style={{ color: '#bbb', fontSize: '0.88rem', textAlign: 'center', padding: '1rem 0' }}>
                  Sin notas registradas
                </p>
              ) : (
                <>
                  <FilaNota label="Nota 1" valor={tac.nota1} />
                  <FilaNota label="Nota 2" valor={tac.nota2} />
                  <FilaNota label="Nota 3" valor={tac.nota3} />
                  <FilaNota label="Nota 4" valor={tac.nota4} />
                  <div style={{
                    marginTop: '1rem', padding: '0.75rem', borderRadius: '10px',
                    background: '#e8eaf6', textAlign: 'center'
                  }}>
                    <span style={{ fontSize: '0.75rem', color: '#888', fontWeight: 700 }}>PROMEDIO</span>
                    <div style={{
                      fontSize: '2rem', fontWeight: 800,
                      color: (promedioTac || 0) >= 60 ? '#2e7d32' : '#c62828'
                    }}>
                      {promedioTac != null ? promedioTac.toFixed(1) : '—'}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Notas Diplomado */}
            <div className="card">
              <h3 style={{ color: '#1a237e', marginBottom: '1rem', fontSize: '0.95rem' }}>Notas Diplomado {anio}</h3>
              {dipl.length === 0 ? (
                <p style={{ color: '#bbb', fontSize: '0.88rem', textAlign: 'center', padding: '1rem 0' }}>
                  Sin notas registradas
                </p>
              ) : (
                <>
                  {dipl.map((m, i) => (
                    <FilaNota key={i} label={m.materia} valor={m.nota} />
                  ))}
                  <div style={{
                    marginTop: '1rem', padding: '0.75rem', borderRadius: '10px',
                    background: '#e8eaf6', textAlign: 'center'
                  }}>
                    <span style={{ fontSize: '0.75rem', color: '#888', fontWeight: 700 }}>PROMEDIO</span>
                    <div style={{
                      fontSize: '2rem', fontWeight: 800,
                      color: (promedioDip || 0) >= 60 ? '#2e7d32' : '#c62828'
                    }}>
                      {promedioDip != null ? promedioDip.toFixed(1) : '—'}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AlumnoNotas;
