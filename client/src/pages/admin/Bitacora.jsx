import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import Sidebar from '../../components/Sidebar';
import ScrollableTable from '../../components/ScrollableTable';
import './admin.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const API = `${API_URL}/api/bitacora`;

const ACCIONES = ['crear','editar','eliminar','guardar','pago','anular','descuento','revertir'];

const fmtFecha = (iso) => {
  if (!iso) return '-';
  const d = new Date(iso);
  return d.toLocaleString('es-GT', { dateStyle: 'short', timeStyle: 'short' });
};

export default function Bitacora() {
  const [rows, setRows]       = useState([]);
  const [total, setTotal]     = useState(0);
  const [modulos, setModulos] = useState([]);
  const [page, setPage]       = useState(1);
  const limit = 100;

  const [filtros, setFiltros] = useState({
    modulo: '', accion: '', desde: '', hasta: '', q: ''
  });
  const [applied, setApplied] = useState(filtros);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    axios.get(`${API}/modulos`, { headers: authHeader() })
      .then(r => setModulos(r.data))
      .catch(() => {});
  }, []);

  const cargar = useCallback((p = 1, fil = applied) => {
    setCargando(true);
    const params = { page: p, limit, ...Object.fromEntries(Object.entries(fil).filter(([,v]) => v)) };
    axios.get(API, { headers: authHeader(), params })
      .then(r => { setRows(r.data.rows); setTotal(r.data.total); setPage(p); })
      .catch(() => {})
      .finally(() => setCargando(false));
  }, [applied]);

  useEffect(() => { cargar(1, applied); }, [applied]);

  const aplicar = () => { setApplied({ ...filtros }); };
  const limpiar = () => {
    const vacio = { modulo: '', accion: '', desde: '', hasta: '', q: '' };
    setFiltros(vacio);
    setApplied(vacio);
  };

  const totalPaginas = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="admin-layout">
      <Sidebar />
      <div className="admin-content">
        <h1>Bitácora del sistema</h1>
        <p className="subtitle">Registro de todas las acciones realizadas en el sistema</p>

        {/* Filtros */}
        <div className="bit-filtros">
          <input
            className="bit-input"
            placeholder="Buscar usuario / descripción..."
            value={filtros.q}
            onChange={e => setFiltros(f => ({ ...f, q: e.target.value }))}
            onKeyDown={e => e.key === 'Enter' && aplicar()}
          />
          <select className="bit-select" value={filtros.modulo} onChange={e => setFiltros(f => ({ ...f, modulo: e.target.value }))}>
            <option value="">Todos los módulos</option>
            {modulos.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <select className="bit-select" value={filtros.accion} onChange={e => setFiltros(f => ({ ...f, accion: e.target.value }))}>
            <option value="">Todas las acciones</option>
            {ACCIONES.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <label className="bit-label">Desde
            <input type="date" className="bit-input-sm" value={filtros.desde} onChange={e => setFiltros(f => ({ ...f, desde: e.target.value }))} />
          </label>
          <label className="bit-label">Hasta
            <input type="date" className="bit-input-sm" value={filtros.hasta} onChange={e => setFiltros(f => ({ ...f, hasta: e.target.value }))} />
          </label>
          <button className="btn-primary" onClick={aplicar}>Buscar</button>
          <button className="btn-secondary" onClick={limpiar}>Limpiar</button>
        </div>

        <div className="bit-info">
          {cargando ? 'Cargando...' : `${total} registro(s)`}
          {totalPaginas > 1 && ` — Página ${page} / ${totalPaginas}`}
        </div>

        <ScrollableTable>
          <table className="recibo-grid alumnos-grid">
            <thead>
              <tr>
                <th>Fecha / Hora</th>
                <th>Usuario</th>
                <th>Acción</th>
                <th>Módulo</th>
                <th>Descripción</th>
                <th>IP</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && !cargando && (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: '#999' }}>Sin registros</td></tr>
              )}
              {rows.map(r => (
                <tr key={r.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{fmtFecha(r.created_at)}</td>
                  <td>{r.usuario_nombre}</td>
                  <td><span className={`bit-badge bit-badge-${r.accion}`}>{r.accion}</span></td>
                  <td>{r.modulo}</td>
                  <td style={{ maxWidth: 400 }}>{r.descripcion}</td>
                  <td style={{ color: '#999', fontSize: '0.8rem' }}>{r.ip}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollableTable>

        {/* Paginación */}
        {totalPaginas > 1 && (
          <div className="bit-pag">
            <button disabled={page <= 1} onClick={() => cargar(page - 1)}>‹ Anterior</button>
            <span>{page} / {totalPaginas}</span>
            <button disabled={page >= totalPaginas} onClick={() => cargar(page + 1)}>Siguiente ›</button>
          </div>
        )}
      </div>
    </div>
  );
}

function authHeader() {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}
