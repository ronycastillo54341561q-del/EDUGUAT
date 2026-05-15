import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import API from '../api/axios';
import './SedeSelector.css';

const SedeSelector = () => {
  const [sedes, setSedes]       = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError]       = useState('');
  const { setSedeActiva } = useAuth();
  const navigate = useNavigate();

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

  const elegir = (sede) => {
    // Actualiza state + localStorage de un solo lado (evita que Login
    // vea sede=null por React y rebote al selector).
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
          <div className="sede-grid">
            {sedes.map(s => (
              <button
                key={s.id}
                className="sede-card"
                onClick={() => elegir(s)}
                type="button"
              >
                <span className="sede-icono">🏫</span>
                <span className="sede-nombre">{s.nombre}</span>
                <span className="sede-id">{s.id}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default SedeSelector;
