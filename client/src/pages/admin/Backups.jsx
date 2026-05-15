// ╔═══════════════════════════════════════════════════════════════════════╗
// ║  Backups.jsx                                                          ║
// ║                                                                       ║
// ║  Panel de gestión de respaldos del sistema.                           ║
// ║                                                                       ║
// ║  Fase 1 (esta versión): crear backup local manual, listar, descargar  ║
// ║  y eliminar.  Las columnas de Drive aparecen en la tabla pero todavía ║
// ║  no se llenan — eso lo conecta Fase 2.                                ║
// ╚═══════════════════════════════════════════════════════════════════════╝

import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import Sidebar from '../../components/Sidebar';
import ScrollableTable from '../../components/ScrollableTable';
import './admin.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const API = `${API_URL}/api/backups`;

// Cabecera Authorization estándar — el patrón que usa Bitacora.jsx y
// el resto del panel admin.
function authHeader() {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// Formatea bytes a algo legible: 0 B / 1.23 KB / 4.5 MB / etc.
const formatBytes = (b) => {
  if (!b || b <= 0) return '0 B';
  const u = ['B','KB','MB','GB','TB'];
  const i = Math.min(u.length - 1, Math.floor(Math.log(b) / Math.log(1024)));
  return (b / Math.pow(1024, i)).toFixed(2) + ' ' + u[i];
};

// Formatea fecha ISO a "5/may/2026, 14:32" (locale GT).
const fmtFecha = (iso) => {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('es-GT',
    { dateStyle: 'medium', timeStyle: 'short' });
};

export default function Backups() {
  const [rows, setRows]         = useState([]);
  const [cargando, setCargando] = useState(false);
  const [creando, setCreando]   = useState(false);
  const [mensaje, setMensaje]   = useState(null); // { tipo: 'ok'|'error', texto }

  // Carga la lista del historial desde el backend.  useCallback para que
  // la referencia sea estable entre renders (no estrictamente necesario
  // aquí, pero es buena práctica si lo pasamos a hijos).
  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const r = await axios.get(API, { headers: authHeader() });
      setRows(r.data);
    } catch (err) {
      setMensaje({ tipo: 'error',
        texto: err.response?.data?.message || 'Error al cargar el historial' });
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  // Botón "Crear Backup Ahora".  El backend hace el dump + gzip (puede
  // tardar varios segundos según el tamaño de la BD), por eso bloqueamos
  // el botón con `creando` y mostramos un mensaje al volver.
  const handleCrear = async () => {
    if (creando) return;
    setMensaje(null);
    setCreando(true);
    try {
      const r = await axios.post(API, {}, { headers: authHeader() });
      setMensaje({
        tipo: 'ok',
        texto: `Backup creado: ${r.data.backup.filename} ` +
               `(${formatBytes(r.data.backup.size)})`,
      });
      await cargar(); // Refresca la tabla para mostrar el nuevo registro.
    } catch (err) {
      setMensaje({ tipo: 'error',
        texto: err.response?.data?.detalle ||
               err.response?.data?.message ||
               'Error al crear el backup' });
    } finally {
      setCreando(false);
    }
  };

  // Descarga el .sql.gz directamente desde el endpoint del backend.
  // Usamos responseType: 'blob' + un anchor temporal porque axios con
  // headers de Authorization no permite redireccionar directo al URL.
  const handleDescargar = async (b) => {
    try {
      const r = await axios.get(`${API}/${b.id}/download`, {
        headers: authHeader(),
        responseType: 'blob',
      });
      const url  = window.URL.createObjectURL(new Blob([r.data]));
      const link = document.createElement('a');
      link.href = url;
      link.download = b.filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      // El endpoint devuelve 410 si el archivo local ya fue purgado.
      // En ese caso el blob viene como JSON; lo parseamos para mostrar
      // el mensaje real.
      let texto = 'Error al descargar';
      if (err.response?.data instanceof Blob) {
        try {
          const t = await err.response.data.text();
          const j = JSON.parse(t);
          texto = j.message || texto;
        } catch { /* deja el genérico */ }
      } else {
        texto = err.response?.data?.message || texto;
      }
      setMensaje({ tipo: 'error', texto });
    }
  };

  const handleEliminar = async (b) => {
    if (!confirm(`¿Eliminar el backup "${b.filename}"?\n\nEsto borra el archivo local y el registro. La copia en Google Drive (si existe) NO se toca.`)) return;
    try {
      await axios.delete(`${API}/${b.id}`, { headers: authHeader() });
      setMensaje({ tipo: 'ok', texto: 'Backup eliminado' });
      await cargar();
    } catch (err) {
      setMensaje({ tipo: 'error',
        texto: err.response?.data?.message || 'Error al eliminar' });
    }
  };

  return (
    <div className="admin-layout">
      <Sidebar />
      <div className="admin-content">
        <h1>Backups del sistema</h1>
        <p className="subtitle">
          Respaldo completo de todas las sedes y datos meta.
          Los archivos locales se conservan 30 días.
        </p>

        {/* Banner con resultado de la última acción */}
        {mensaje && (
          <div style={{
            margin: '0.5rem 0 1rem',
            padding: '0.6rem 0.9rem',
            borderRadius: 8,
            background: mensaje.tipo === 'ok' ? '#e8f5e9' : '#ffebee',
            color:      mensaje.tipo === 'ok' ? '#1b5e20' : '#b71c1c',
            border: `1px solid ${mensaje.tipo === 'ok' ? '#a5d6a7' : '#ef9a9a'}`,
            fontSize: '0.9rem',
          }}>
            {mensaje.texto}
          </div>
        )}

        {/* Botón principal */}
        <div style={{ marginBottom: '1rem', display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <button
            className="btn-primary"
            onClick={handleCrear}
            disabled={creando}
            style={{ fontSize: '1rem', padding: '0.6rem 1.2rem' }}
          >
            {creando ? '⏳ Creando backup...' : '💾 Crear Backup Ahora'}
          </button>
          <button
            className="btn-secondary"
            onClick={cargar}
            disabled={cargando}
          >
            🔄 Refrescar
          </button>
          <span style={{ color: '#666', fontSize: '0.85rem' }}>
            {cargando ? 'Cargando...' : `${rows.length} respaldo(s)`}
          </span>
        </div>

        {/* Tabla del historial */}
        <ScrollableTable>
          <table className="recibo-grid alumnos-grid">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Archivo</th>
                <th>Tamaño</th>
                <th>Tipo</th>
                <th>Estado</th>
                <th>Drive</th>
                <th>Usuario</th>
                <th style={{ minWidth: 180 }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && !cargando && (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '2rem', color: '#999' }}>
                    Sin backups registrados.  Apretá "Crear Backup Ahora" para empezar.
                  </td>
                </tr>
              )}
              {rows.map(b => (
                <tr key={b.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{fmtFecha(b.created_at)}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>
                    {b.filename}
                  </td>
                  <td>{formatBytes(b.size_bytes)}</td>
                  <td>
                    <span style={{
                      padding: '2px 8px', borderRadius: 12, fontSize: '0.75rem',
                      background: b.tipo === 'manual' ? '#e3f2fd' : '#fff3e0',
                      color:      b.tipo === 'manual' ? '#0d47a1' : '#e65100',
                    }}>
                      {b.tipo}
                    </span>
                  </td>
                  <td>
                    <span style={{
                      padding: '2px 8px', borderRadius: 12, fontSize: '0.75rem',
                      background: b.estado === 'ok' ? '#e8f5e9' : '#ffebee',
                      color:      b.estado === 'ok' ? '#1b5e20' : '#b71c1c',
                    }} title={b.error_msg || ''}>
                      {b.estado}
                    </span>
                  </td>
                  <td style={{ fontSize: '0.8rem' }}>
                    {/* Estado de la subida a Google Drive:
                          - ok        → link clickeable
                          - pendiente → guion (no se intentó subir)
                          - error     → badge rojo con tooltip */}
                    {b.drive_status === 'ok' && b.drive_link && (
                      <a href={b.drive_link} target="_blank" rel="noreferrer"
                         style={{ color: '#1976d2', textDecoration: 'none' }}>
                        ☁ Ver en Drive
                      </a>
                    )}
                    {b.drive_status === 'pendiente' && (
                      <span style={{ color: '#999' }}>—</span>
                    )}
                    {b.drive_status === 'error' && (
                      <span
                        style={{
                          padding: '2px 8px', borderRadius: 12,
                          background: '#ffebee', color: '#b71c1c',
                          fontSize: '0.75rem',
                        }}
                        title={b.error_msg || 'Error al subir a Drive'}
                      >
                        ⚠ Drive error
                      </span>
                    )}
                  </td>
                  <td style={{ fontSize: '0.85rem' }}>{b.usuario_nombre || '-'}</td>
                  <td>
                    <button
                      className="btn-secondary"
                      style={{ marginRight: 6, fontSize: '0.8rem' }}
                      onClick={() => handleDescargar(b)}
                      disabled={!b.filepath || b.estado !== 'ok'}
                      title={!b.filepath ? 'Archivo local ya purgado' : 'Descargar a tu PC'}
                    >
                      ⬇ Descargar
                    </button>
                    <button
                      className="btn-secondary"
                      style={{ fontSize: '0.8rem', color: '#b71c1c' }}
                      onClick={() => handleEliminar(b)}
                    >
                      🗑 Eliminar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollableTable>
      </div>
    </div>
  );
}
