import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import API from '../api/axios';
import usePageTitle from '../hooks/usePageTitle';
import logo from '../assets/eduguat-logo.png';
import './auth.css';

const normaliza = (s) =>
  (s || '')
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

const SedeSelector = () => {
  const [sedes, setSedes]       = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError]       = useState('');
  const [busqueda, setBusqueda] = useState('');
  const { setSedeActiva } = useAuth();
  const navigate = useNavigate();

  usePageTitle('Selecciona tu sede');

  useEffect(() => {
    (async () => {
      try {
        const { data } = await API.get('/sedes');
        setSedes(data);
      } catch {
        setError('No se pudieron cargar las sedes. Revisa el servidor.');
      } finally {
        setCargando(false);
      }
    })();
  }, []);

  const filtradas = useMemo(() => {
    const q = normaliza(busqueda.trim());
    if (!q) return sedes;
    return sedes.filter(
      (s) =>
        normaliza(s.nombre).includes(q) ||
        normaliza(s.id).includes(q) ||
        normaliza(s.info).includes(q)
    );
  }, [sedes, busqueda]);

  const elegir = (sede) => {
    setSedeActiva(sede);
    navigate('/login', { replace: true });
  };

  return (
    <div className="auth-screen">
      <div className="auth-card auth-card--wide">
        <img src={logo} alt="EduGuat" className="auth-logo" />

        <div className="auth-head">
          <h1>Selecciona tu sede</h1>
          <p>Elige la academia a la que quieres ingresar</p>
        </div>

        {cargando && <p className="auth-empty">Cargando sedes…</p>}
        {error    && <p className="auth-msg auth-msg--error">{error}</p>}

        {!cargando && !error && (
          <>
            <div className="auth-buscador">
              <span className="auth-buscador__icono" aria-hidden="true">🔎</span>
              <input
                type="text"
                placeholder="Busca tu academia o sede…"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                autoFocus
              />
              {busqueda && (
                <button
                  type="button"
                  className="auth-buscador__limpiar"
                  onClick={() => setBusqueda('')}
                  aria-label="Limpiar búsqueda"
                >
                  ✕
                </button>
              )}
            </div>

            <div className="auth-conteo">
              {filtradas.length === sedes.length
                ? `${sedes.length} sede${sedes.length === 1 ? '' : 's'} disponible${sedes.length === 1 ? '' : 's'}`
                : `${filtradas.length} de ${sedes.length} sedes`}
            </div>

            {filtradas.length === 0 ? (
              <p className="auth-empty">No se encontró ninguna sede para “{busqueda}”.</p>
            ) : (
              <div className="auth-sedes">
                {filtradas.map((s) => (
                  <button
                    key={s.id}
                    className="auth-sede"
                    onClick={() => elegir(s)}
                    type="button"
                  >
                    <span className="auth-sede__icono" aria-hidden="true">🏫</span>
                    <span className="auth-sede__nombre">{s.nombre}</span>
                    {s.info && <span className="auth-sede__info">{s.info}</span>}
                    <span className="auth-sede__id">{s.id}</span>
                  </button>
                ))}
              </div>
            )}

            <div className="auth-actions">
              <button
                type="button"
                className="auth-btn auth-btn--ghost"
                onClick={() => navigate('/', { replace: true })}
              >
                ← Regresar al inicio
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default SedeSelector;
