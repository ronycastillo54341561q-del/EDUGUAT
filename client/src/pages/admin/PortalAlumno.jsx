import { useState, useEffect } from 'react';
import Sidebar from '../../components/Sidebar';
import API from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import './admin.css';

// Configuración del portal del alumno (por sede): qué módulos ve el alumno,
// qué notas están publicadas, si las notas requieren estar solvente y si sólo
// los alumnos activos pueden iniciar sesión.

const MODULOS = [
  { k: 'asistencia',   label: 'Mi Asistencia',  desc: 'Asistencia registrada por la academia.' },
  { k: 'notas',        label: 'Mis Notas',      desc: 'Notas TAC y de diplomado.', soloAcademia: true },
  { k: 'mecanografia', label: 'Mecanografía',   desc: 'Lecciones y examen de mecanografía.', soloAcademia: true },
  { k: 'pagos',        label: 'Mis Pagos',      desc: 'Mensualidades pagadas y pendientes.' },
  { k: 'avisos',       label: 'Avisos',         desc: 'Avisos publicados desde el módulo Avisos.' },
];

const Interruptor = ({ checked, onChange, label, desc, disabled }) => (
  <label style={{
    display: 'flex', alignItems: 'flex-start', gap: '0.75rem', padding: '0.65rem 0',
    borderBottom: '1px solid #f0f0f0', cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
  }}>
    <input
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={e => onChange(e.target.checked)}
      style={{ width: 18, height: 18, marginTop: 2, flexShrink: 0 }}
    />
    <span>
      <span style={{ fontWeight: 600, color: '#1a237e', fontSize: '0.9rem' }}>{label}</span>
      {desc && <span style={{ display: 'block', fontSize: '0.78rem', color: '#777' }}>{desc}</span>}
    </span>
  </label>
);

const Opcion = ({ checked, onChange, label, desc }) => (
  <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', padding: '0.5rem 0', cursor: 'pointer' }}>
    <input type="radio" checked={checked} onChange={onChange} style={{ width: 18, height: 18, marginTop: 2, flexShrink: 0 }} />
    <span>
      <span style={{ fontWeight: 600, color: '#1a237e', fontSize: '0.9rem' }}>{label}</span>
      {desc && <span style={{ display: 'block', fontSize: '0.78rem', color: '#777' }}>{desc}</span>}
    </span>
  </label>
);

const tituloCard = { color: '#1a237e', fontSize: '0.95rem', margin: '0 0 0.25rem' };
const subCard = { fontSize: '0.8rem', color: '#777', margin: '0 0 0.75rem' };

export default function PortalAlumno() {
  const { sede } = useAuth();
  const esInstitucion = sede?.tipo === 'institucion';

  const [cfg, setCfg]           = useState(null);
  const [original, setOriginal] = useState('');
  const [error, setError]       = useState('');
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg]           = useState('');

  useEffect(() => {
    API.get('/portal-alumno')
      .then(({ data }) => { setCfg(data); setOriginal(JSON.stringify(data)); })
      .catch(err => setError(err.response?.data?.message || 'No se pudo cargar la configuración'));
  }, []);

  const cambios = cfg && JSON.stringify(cfg) !== original;

  const setModulo  = (k, v) => setCfg(c => ({ ...c, modulos: { ...c.modulos, [k]: v } }));
  const setPublicar = (k, v) => setCfg(c => ({ ...c, publicar: { ...c.publicar, [k]: v } }));
  const setTac = (i, v) => setCfg(c => ({
    ...c, publicar: { ...c.publicar, tac: c.publicar.tac.map((x, j) => (j === i ? v : x)) },
  }));

  const guardar = async () => {
    setGuardando(true);
    try {
      const { data } = await API.put('/portal-alumno', cfg);
      setCfg(data);
      setOriginal(JSON.stringify(data));
      setMsg('ok');
    } catch {
      setMsg('err');
    } finally {
      setGuardando(false);
      setTimeout(() => setMsg(''), 3000);
    }
  };

  const modulos = MODULOS.filter(m => !(esInstitucion && m.soloAcademia));
  const notasVisibles = !esInstitucion && (cfg?.modulos.notas || cfg?.modulos.mecanografia);

  return (
    <div className="admin-layout">
      <Sidebar />
      <div className="admin-content">
        <h1>Portal del Alumno</h1>
        <p className="subtitle">Decide qué ven tus alumnos cuando inician sesión con su usuario.</p>

        {error ? (
          <div className="card" style={{ color: '#c62828' }}>{error}</div>
        ) : !cfg ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#999' }}>Cargando...</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem', alignItems: 'start' }}>

            <div className="card">
              <h3 style={tituloCard}>Acceso</h3>
              <p style={subCard}>Quién puede iniciar sesión en el portal.</p>
              <Interruptor
                checked={cfg.soloActivos}
                onChange={v => setCfg(c => ({ ...c, soloActivos: v }))}
                label="Solo alumnos activos"
                desc="Un alumno inactivo o retirado no puede entrar, y si tenía la sesión abierta se le cierra."
              />
            </div>

            <div className="card">
              <h3 style={tituloCard}>Módulos visibles</h3>
              <p style={subCard}>Dashboard y Mi Perfil siempre están visibles.</p>
              {modulos.map(m => (
                <Interruptor
                  key={m.k}
                  checked={cfg.modulos[m.k]}
                  onChange={v => setModulo(m.k, v)}
                  label={m.label}
                  desc={m.desc}
                />
              ))}
            </div>

            {notasVisibles && (
              <div className="card">
                <h3 style={tituloCard}>Publicación de notas</h3>
                <p style={subCard}>Las notas sin publicar no le llegan al alumno aunque ya estén ingresadas.</p>
                {cfg.modulos.notas && (<>
                  {[0, 1, 2, 3].map(i => (
                    <Interruptor
                      key={i}
                      checked={cfg.publicar.tac[i]}
                      onChange={v => setTac(i, v)}
                      label={`TAC — Nota ${i + 1}`}
                    />
                  ))}
                  <Interruptor
                    checked={cfg.publicar.diplomado}
                    onChange={v => setPublicar('diplomado', v)}
                    label="Notas de diplomado"
                  />
                </>)}
                {cfg.modulos.mecanografia && (
                  <Interruptor
                    checked={cfg.publicar.mecanografia}
                    onChange={v => setPublicar('mecanografia', v)}
                    label="Notas de mecanografía"
                  />
                )}
              </div>
            )}

            {notasVisibles && (
              <div className="card">
                <h3 style={tituloCard}>¿Quién puede ver las notas?</h3>
                <p style={subCard}>Aplica a las notas TAC, de diplomado y de mecanografía.</p>
                <Opcion
                  checked={!cfg.notasSoloSolventes}
                  onChange={() => setCfg(c => ({ ...c, notasSoloSolventes: false }))}
                  label="Todos los alumnos"
                  desc="Cualquier alumno ve sus notas publicadas, sin importar sus pagos."
                />
                <Opcion
                  checked={cfg.notasSoloSolventes}
                  onChange={() => setCfg(c => ({ ...c, notasSoloSolventes: true }))}
                  label="Solo alumnos solventes"
                  desc="Solo las ve quien no debe mensualidades del año hasta el mes actual. Los demás verán un aviso para ponerse al día."
                />
              </div>
            )}
          </div>
        )}

        {cfg && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '1.25rem' }}>
            <button className="btn-primary" onClick={guardar} disabled={!cambios || guardando}>
              {guardando ? 'Guardando...' : 'Guardar cambios'}
            </button>
            {msg === 'ok'  && <span style={{ color: '#2e7d32', fontSize: '0.85rem' }}>Configuración guardada</span>}
            {msg === 'err' && <span style={{ color: '#c62828', fontSize: '0.85rem' }}>No se pudo guardar</span>}
          </div>
        )}
      </div>
    </div>
  );
}
