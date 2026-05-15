import { useEffect, useMemo, useState } from 'react';
import Sidebar from '../../components/Sidebar';
import ScrollableTable from '../../components/ScrollableTable';
import API from '../../api/axios';
import './admin.css';

const CARD_COLOR = {
  '1:1': { bg: '#e3f2fd', fg: '#0d47a1' },
  'N:1': { bg: '#e8f5e9', fg: '#1b5e20' },
  'N:M': { bg: '#fff3e0', fg: '#e65100' },
};

export default function Relaciones() {
  const [data,     setData]     = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error,    setError]    = useState('');
  const [vista,    setVista]    = useState('detalle'); // 'detalle' | 'resumen'
  const [filtro,   setFiltro]   = useState('');
  const [destinoSel, setDestinoSel] = useState('');

  useEffect(() => {
    setCargando(true);
    API.get('/relaciones')
      .then(({ data }) => setData(data))
      .catch(err => setError(err.response?.data?.message || 'Error al cargar relaciones'))
      .finally(() => setCargando(false));
  }, []);

  const destinosUnicos = useMemo(() => {
    if (!data) return [];
    return [...new Set(data.relaciones.map(r => r.tabla_destino))].sort();
  }, [data]);

  const relacionesFiltradas = useMemo(() => {
    if (!data) return [];
    const q = filtro.trim().toLowerCase();
    return data.relaciones.filter(r => {
      if (destinoSel && r.tabla_destino !== destinoSel) return false;
      if (!q) return true;
      return (
        r.tabla_origen.toLowerCase().includes(q)  ||
        r.tabla_destino.toLowerCase().includes(q) ||
        r.columna_fk.toLowerCase().includes(q)    ||
        (r.descripcion || '').toLowerCase().includes(q)
      );
    });
  }, [data, filtro, destinoSel]);

  const resumenFiltrado = useMemo(() => {
    if (!data) return [];
    const q = filtro.trim().toLowerCase();
    if (!q) return data.resumen;
    return data.resumen.filter(r =>
      r.tabla_destino.toLowerCase().includes(q) ||
      r.tablas_origen.some(t => t.toLowerCase().includes(q))
    );
  }, [data, filtro]);

  const exportarCSV = () => {
    if (!data) return;
    const headers = ['Tabla origen','Columna FK','Tipo','Nullable','Tabla destino','Columna destino','Cardinalidad','Descripción'];
    const filas = relacionesFiltradas.map(r => [
      r.tabla_origen, r.columna_fk, r.tipo_origen, r.origen_nullable ? 'Sí' : 'No',
      r.tabla_destino, r.columna_destino, r.cardinalidad, r.descripcion || '',
    ]);
    const csv = [headers, ...filas]
      .map(row => row.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `relaciones_${data.base_datos || 'db'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="admin-layout">
      <Sidebar />
      <main className="admin-content">
        <h1>🔗 Relaciones de la Base de Datos</h1>
        <p className="subtitle">
          Vista de todas las relaciones lógicas entre tablas
          {data?.base_datos && <> de <strong>{data.base_datos}</strong></>}.
        </p>

        {error && <div className="msg-err">{error}</div>}

        {cargando ? (
          <div style={{ textAlign:'center', padding:'3rem', color:'#888' }}>Cargando relaciones…</div>
        ) : data && (
          <>
            {/* ── Tarjetas de resumen ── */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(160px, 1fr))', gap:'0.75rem', marginBottom:'1rem' }}>
              <div style={{ background:'#e8eaf6', borderRadius:8, padding:'0.75rem 1rem' }}>
                <div style={{ fontSize:'0.75rem', color:'#3949ab', fontWeight:700 }}>BASE DE DATOS</div>
                <div style={{ fontSize:'1.05rem', fontWeight:700, color:'#1a237e', wordBreak:'break-all' }}>{data.base_datos}</div>
              </div>
              <div style={{ background:'#e8f5e9', borderRadius:8, padding:'0.75rem 1rem' }}>
                <div style={{ fontSize:'0.75rem', color:'#2e7d32', fontWeight:700 }}>TABLAS</div>
                <div style={{ fontSize:'1.4rem', fontWeight:800, color:'#1b5e20' }}>{data.total_tablas}</div>
              </div>
              <div style={{ background:'#fff3e0', borderRadius:8, padding:'0.75rem 1rem' }}>
                <div style={{ fontSize:'0.75rem', color:'#e65100', fontWeight:700 }}>RELACIONES</div>
                <div style={{ fontSize:'1.4rem', fontWeight:800, color:'#bf360c' }}>{data.total_relaciones}</div>
              </div>
              <div style={{ background:'#f3e5f5', borderRadius:8, padding:'0.75rem 1rem' }}>
                <div style={{ fontSize:'0.75rem', color:'#6a1b9a', fontWeight:700 }}>TABLA MÁS REFERENCIADA</div>
                <div style={{ fontSize:'1.05rem', fontWeight:700, color:'#4a148c' }}>
                  {data.resumen[0]?.tabla_destino || '—'}
                  <span style={{ fontSize:'0.75rem', marginLeft:6, color:'#888', fontWeight:600 }}>
                    ({data.resumen[0]?.num_dependientes || 0} tablas)
                  </span>
                </div>
              </div>
            </div>

            {/* ── Controles ── */}
            <div style={{ display:'flex', gap:'0.5rem', flexWrap:'wrap', alignItems:'center', marginBottom:'0.75rem' }}>
              <div style={{ display:'inline-flex', border:'1.5px solid #c5cae9', borderRadius:8, overflow:'hidden' }}>
                <button
                  onClick={() => setVista('detalle')}
                  style={{
                    padding:'0.4rem 0.9rem', border:'none', cursor:'pointer', fontWeight:600,
                    background: vista === 'detalle' ? '#3949ab' : '#fff',
                    color:      vista === 'detalle' ? '#fff'    : '#3949ab',
                  }}
                >📋 Detalle</button>
                <button
                  onClick={() => setVista('resumen')}
                  style={{
                    padding:'0.4rem 0.9rem', border:'none', cursor:'pointer', fontWeight:600,
                    background: vista === 'resumen' ? '#3949ab' : '#fff',
                    color:      vista === 'resumen' ? '#fff'    : '#3949ab',
                  }}
                >📊 Resumen por tabla</button>
              </div>

              <input
                type="text"
                placeholder="Buscar tabla, columna o descripción..."
                value={filtro}
                onChange={e => setFiltro(e.target.value)}
                style={{
                  flex:'1 1 220px', minWidth:200, padding:'0.5rem 0.75rem',
                  border:'1.5px solid #e0e0e0', borderRadius:8, fontSize:'0.88rem',
                }}
              />

              {vista === 'detalle' && (
                <select
                  value={destinoSel}
                  onChange={e => setDestinoSel(e.target.value)}
                  style={{ padding:'0.5rem 0.75rem', border:'1.5px solid #e0e0e0', borderRadius:8, fontSize:'0.88rem' }}
                >
                  <option value="">Todas las tablas destino</option>
                  {destinosUnicos.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              )}

              <button
                onClick={exportarCSV}
                style={{
                  padding:'0.5rem 0.9rem', border:'none', borderRadius:8,
                  background:'#1b5e20', color:'#fff', fontWeight:600, cursor:'pointer',
                }}
              >📊 Exportar CSV</button>
            </div>

            {/* ── Vista detalle ── */}
            {vista === 'detalle' && (
              <ScrollableTable>
                <table style={{ borderCollapse:'collapse', width:'100%', fontSize:'0.85rem' }}>
                  <thead>
                    <tr style={{ background:'#1a237e', color:'#fff' }}>
                      <th style={{ padding:'8px 10px', textAlign:'left' }}>Tabla origen</th>
                      <th style={{ padding:'8px 10px', textAlign:'left' }}>Columna FK</th>
                      <th style={{ padding:'8px 10px', textAlign:'center' }}>Tipo</th>
                      <th style={{ padding:'8px 10px', textAlign:'center' }}>Nullable</th>
                      <th style={{ padding:'8px 10px', textAlign:'center' }}>→</th>
                      <th style={{ padding:'8px 10px', textAlign:'left' }}>Tabla destino</th>
                      <th style={{ padding:'8px 10px', textAlign:'center' }}>Columna</th>
                      <th style={{ padding:'8px 10px', textAlign:'center' }}>Cardinalidad</th>
                      <th style={{ padding:'8px 10px', textAlign:'left' }}>Descripción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {relacionesFiltradas.length === 0 ? (
                      <tr>
                        <td colSpan={9} style={{ padding:'1.5rem', textAlign:'center', color:'#999' }}>
                          Sin relaciones que coincidan con el filtro.
                        </td>
                      </tr>
                    ) : relacionesFiltradas.map((r, i) => {
                      const cc = CARD_COLOR[r.cardinalidad] || CARD_COLOR['N:1'];
                      const filas = data.conteos[r.tabla_origen];
                      return (
                        <tr key={i} style={{ borderBottom:'1px solid #f0f0f0' }}>
                          <td style={{ padding:'6px 10px', fontWeight:600 }}>
                            {r.tabla_origen}
                            {filas != null && (
                              <span style={{ marginLeft:6, color:'#888', fontSize:'0.74rem' }}>({filas})</span>
                            )}
                          </td>
                          <td style={{ padding:'6px 10px', fontFamily:'monospace', color:'#3949ab' }}>{r.columna_fk}</td>
                          <td style={{ padding:'6px 10px', textAlign:'center', color:'#888', fontSize:'0.78rem' }}>{r.tipo_origen}</td>
                          <td style={{ padding:'6px 10px', textAlign:'center' }}>
                            <span style={{
                              padding:'2px 6px', borderRadius:4, fontSize:'0.72rem', fontWeight:700,
                              background: r.origen_nullable ? '#fff9c4' : '#ffcdd2',
                              color:      r.origen_nullable ? '#e65100' : '#b71c1c',
                            }}>
                              {r.origen_nullable ? 'NULL' : 'NOT NULL'}
                            </span>
                          </td>
                          <td style={{ padding:'6px 10px', textAlign:'center', color:'#1a237e', fontWeight:700 }}>→</td>
                          <td style={{ padding:'6px 10px', fontWeight:600, color:'#1b5e20' }}>{r.tabla_destino}</td>
                          <td style={{ padding:'6px 10px', textAlign:'center', fontFamily:'monospace', color:'#888' }}>{r.columna_destino}</td>
                          <td style={{ padding:'6px 10px', textAlign:'center' }}>
                            <span style={{
                              padding:'2px 8px', borderRadius:4, fontSize:'0.74rem', fontWeight:700,
                              background: cc.bg, color: cc.fg,
                            }}>
                              {r.cardinalidad}
                            </span>
                          </td>
                          <td style={{ padding:'6px 10px', color:'#555', fontSize:'0.82rem' }}>{r.descripcion}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </ScrollableTable>
            )}

            {/* ── Vista resumen ── */}
            {vista === 'resumen' && (
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(320px, 1fr))', gap:'0.75rem' }}>
                {resumenFiltrado.length === 0 ? (
                  <div style={{ padding:'1.5rem', textAlign:'center', color:'#999', gridColumn:'1/-1' }}>
                    Sin tablas que coincidan con el filtro.
                  </div>
                ) : resumenFiltrado.map(r => {
                  const filas = data.conteos[r.tabla_destino];
                  return (
                    <div key={r.tabla_destino} style={{
                      background:'#fff', borderRadius:10, padding:'0.9rem 1rem',
                      border:'1.5px solid #e8eaf6', boxShadow:'0 1px 3px rgba(0,0,0,0.04)',
                    }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:6 }}>
                        <h3 style={{ margin:0, color:'#1a237e', fontSize:'1rem' }}>
                          📦 {r.tabla_destino}
                        </h3>
                        <span style={{ fontSize:'0.74rem', color:'#888' }}>
                          {filas != null ? `${filas} fila(s)` : '—'}
                        </span>
                      </div>
                      <div style={{
                        display:'inline-block', background:'#e8eaf6', color:'#1a237e',
                        padding:'2px 8px', borderRadius:4, fontSize:'0.75rem',
                        fontWeight:700, marginBottom:8,
                      }}>
                        {r.num_dependientes} tabla(s) dependen de esta
                      </div>
                      <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
                        {r.tablas_origen.map(t => (
                          <span key={t} style={{
                            background:'#f5f5f5', color:'#333',
                            padding:'2px 8px', borderRadius:4, fontSize:'0.78rem',
                            fontFamily:'monospace',
                          }}>{t}</span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
