import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import API from '../api/axios';
import usePageTitle from '../hooks/usePageTitle';
import './SedeSelector.css';

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
    <div className="sede-selector-container">
      <div className="sede-selector-card">
        <div className="sede-selector-header">
          <h1>EduGuat</h1>
          <p>Selecciona tu sede para continuar</p>
        </div>

        {cargando && <p className="sede-msg">Cargando sedes…</p>}
        {error    && <p className="sede-msg error">{error}</p>}

        {!cargando && !error && (
          <>
            <div className="sede-buscador">
              <span className="sede-buscador__icono" aria-hidden="true">🔎</span>
              <input
                type="text"
                className="sede-buscador__input"
                placeholder="Busca tu academia o sede…"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                autoFocus
              />
              {busqueda && (
                <button
                  type="button"
                  className="sede-buscador__limpiar"
                  onClick={() => setBusqueda('')}
                  aria-label="Limpiar búsqueda"
                >
                  ✕
                </button>
              )}
            </div>

            <div className="sede-conteo">
              {filtradas.length === sedes.length
                ? `${sedes.length} sede${sedes.length === 1 ? '' : 's'} disponible${sedes.length === 1 ? '' : 's'}`
                : `${filtradas.length} de ${sedes.length} sedes`}
            </div>

            {filtradas.length === 0 ? (
              <p className="sede-msg">
                No se encontró ninguna sede para “{busqueda}”.
              </p>
            ) : (
              <div className="sede-grid">
                {filtradas.map((s) => (
                  <button
                    key={s.id}
                    className="sede-card"
                    onClick={() => elegir(s)}
                    type="button"
                  >
                    <span className="sede-icono">🏫</span>
                    <span className="sede-nombre">{s.nombre}</span>
                    {s.info && <span className="sede-info">{s.info}</span>}
                    <span className="sede-id">{s.id}</span>
                  </button>
                ))}
              </div>
            )}

            <button
              type="button"
              className="sede-volver"
              onClick={() => navigate('/', { replace: true })}
            >
              ← Regresar
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default SedeSelector;
