import { useState, useEffect, useCallback, useMemo } from 'react';
import Sidebar from '../../components/Sidebar';
import API from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import { can } from '../../lib/permissions';
import './admin.css';

const DIAS_SEMANA = [
  { key: 'lunes',     lab: 'Lunes' },
  { key: 'martes',    lab: 'Martes' },
  { key: 'miercoles', lab: 'Miércoles' },
  { key: 'jueves',    lab: 'Jueves' },
  { key: 'viernes',   lab: 'Viernes' },
  { key: 'sabado',    lab: 'Sábado' },
];

const cellKey = (dia, horaInicio) => `${dia}|${horaInicio}`;

/* ══════════════ Modal editar celda ══════════════ */
function ModalCelda({ celda, cursos, maestrosSugeridos, onGuardar, onCerrar }) {
  const [curso, setCurso]     = useState(celda.actual?.curso || '');
  const [maestro, setMaestro] = useState(celda.actual?.maestro || '');
  const [aplicarTodos, setAplicarTodos] = useState(false);

  // Al elegir un curso, autocompleta el maestro definido para ese curso.
  const elegirCurso = (nombre) => {
    setCurso(nombre);
    const c = cursos.find(x => x.nombre === nombre);
    if (c && c.maestro) setMaestro(c.maestro);
  };

  return (
    <div className="modal-overlay" onClick={onCerrar}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
        <div className="modal-header">
          <h2>{celda.diaLab} · {celda.franja.hora_inicio}–{celda.franja.hora_fin}</h2>
          <button className="modal-close" onClick={onCerrar}>✕</button>
        </div>
        <div className="modal-form">
          <div className="form-grid">
            <div className="form-group full-width">
              <label>Curso</label>
              <select value={curso} onChange={e => elegirCurso(e.target.value)}>
                <option value="">— Sin clase / libre —</option>
                {curso && !cursos.some(c => c.nombre === curso) && <option value={curso}>{curso}</option>}
                {cursos.map(c => <option key={c.id} value={c.nombre}>{c.nombre}{c.maestro ? ` (${c.maestro})` : ''}</option>)}
              </select>
              <p style={{ fontSize: '0.72rem', color: '#888', margin: '4px 0 0' }}>
                Al elegir el curso, el maestro se completa solo (puedes cambiarlo).
              </p>
            </div>
            <div className="form-group full-width">
              <label>Maestro</label>
              <input list="maestros-lista" value={maestro} onChange={e => setMaestro(e.target.value)} placeholder="Nombre del maestro" />
              <datalist id="maestros-lista">
                {maestrosSugeridos.map(m => <option key={m} value={m} />)}
              </datalist>
            </div>
            <div className="form-group full-width">
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" checked={aplicarTodos} onChange={e => setAplicarTodos(e.target.checked)} />
                Aplicar a <strong>toda la semana</strong> en esta franja
              </label>
            </div>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn-cancel" onClick={onCerrar}>Cancelar</button>
            <button type="button" className="btn-primary" onClick={() => onGuardar({ curso, maestro, aplicarTodos })}>
              Guardar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ══════════════ Editor de franjas ══════════════ */
function PanelFranjas({ franjas, puedeEditar, onRecargar }) {
  const [abierto, setAbierto] = useState(franjas.length === 0);
  const [form, setForm] = useState({ hora_inicio: '', hora_fin: '', etiqueta: '' });
  const [editId, setEditId] = useState(null);
  const [err, setErr] = useState('');

  const guardar = async (e) => {
    e.preventDefault();
    if (!form.hora_inicio || !form.hora_fin) { setErr('Hora inicio y fin requeridas'); return; }
    try {
      const payload = { ...form, orden: editId ? undefined : franjas.length };
      if (editId) await API.put(`/horarios/franjas/${editId}`, payload);
      else        await API.post('/horarios/franjas', payload);
      setForm({ hora_inicio: '', hora_fin: '', etiqueta: '' }); setEditId(null); setErr('');
      onRecargar();
    } catch (ex) { setErr(ex.response?.data?.message || 'Error al guardar'); }
  };
  const editar = (f) => { setEditId(f.id); setForm({ hora_inicio: f.hora_inicio, hora_fin: f.hora_fin, etiqueta: f.etiqueta || '' }); setAbierto(true); };
  const eliminar = async (f) => {
    if (!confirm(`¿Eliminar la franja ${f.hora_inicio}-${f.hora_fin}?`)) return;
    try { await API.delete(`/horarios/franjas/${f.id}`); onRecargar(); } catch { alert('Error al eliminar'); }
  };

  return (
    <div className="cfg-panel" style={{ marginBottom: 16 }}>
      <button type="button" className="cfg-tab" style={{ width: '100%', textAlign: 'left' }} onClick={() => setAbierto(a => !a)}>
        {abierto ? '▾' : '▸'} Franjas horarias (el "timbre" — bloques de tiempo) · {franjas.length}
      </button>
      {abierto && (
        <div style={{ padding: '0.75rem' }}>
          <p className="cfg-hint">
            Define una sola vez los bloques de tiempo (ej. 7:00–7:30, 7:30–8:00, Receso…).
            Estos bloques son las <strong>filas</strong> de todas las parrillas.
          </p>
          {franjas.length > 0 && (
            <div className="cfg-list" style={{ marginBottom: 10 }}>
              {franjas.map(f => (
                <div key={f.id} className="cfg-card">
                  <div className="cfg-card-info"><strong>{f.hora_inicio} – {f.hora_fin}</strong>{f.etiqueta && <span style={{ color: '#666', marginLeft: 8 }}>{f.etiqueta}</span>}</div>
                  {puedeEditar && (
                    <div className="cfg-card-actions">
                      <button className="btn-edit" onClick={() => editar(f)}>Editar</button>
                      <button className="btn-danger-sm" onClick={() => eliminar(f)}>Eliminar</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          {puedeEditar && (
            <form onSubmit={guardar} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div className="form-group" style={{ margin: 0 }}><label>Hora inicio</label><input type="time" value={form.hora_inicio} onChange={e => setForm({ ...form, hora_inicio: e.target.value })} /></div>
              <div className="form-group" style={{ margin: 0 }}><label>Hora fin</label><input type="time" value={form.hora_fin} onChange={e => setForm({ ...form, hora_fin: e.target.value })} /></div>
              <div className="form-group" style={{ margin: 0 }}><label>Etiqueta (opcional)</label><input value={form.etiqueta} placeholder="Ej: Receso" onChange={e => setForm({ ...form, etiqueta: e.target.value })} /></div>
              <button type="submit" className="btn-primary">{editId ? 'Actualizar' : '+ Agregar franja'}</button>
              {editId && <button type="button" className="btn-cancel" onClick={() => { setEditId(null); setForm({ hora_inicio: '', hora_fin: '', etiqueta: '' }); }}>Cancelar</button>}
            </form>
          )}
          {err && <p style={{ color: '#e53935', fontSize: '0.85rem' }}>{err}</p>}
        </div>
      )}
    </div>
  );
}

/* ══════════════ Página ══════════════ */
export default function Horarios() {
  const { usuario } = useAuth();
  const puedeEditar = can(usuario?.rol, 'horarios', 'edit');

  const [franjas, setFranjas]     = useState([]);
  const [grados, setGrados]       = useState([]);
  const [secciones, setSecciones] = useState([]);
  const [maestrosSug, setMaestrosSug] = useState([]);
  const [ocupacion, setOcupacion] = useState([]);
  const [instNombre, setInstNombre] = useState('');

  const [gradoSel, setGradoSel]     = useState(() => localStorage.getItem('hor_grado') || '');
  const [seccionSel, setSeccionSel] = useState(() => localStorage.getItem('hor_seccion') || '');
  const [verSabado, setVerSabado]   = useState(() => localStorage.getItem('hor_sabado') === '1');

  const [cursos, setCursos]   = useState([]);
  const [clases, setClases]   = useState([]);
  const [editCelda, setEditCelda] = useState(null);

  useEffect(() => { localStorage.setItem('hor_grado', gradoSel); }, [gradoSel]);
  useEffect(() => { localStorage.setItem('hor_seccion', seccionSel); }, [seccionSel]);
  useEffect(() => { localStorage.setItem('hor_sabado', verSabado ? '1' : '0'); }, [verSabado]);

  const cargarFranjas = useCallback(() => {
    API.get('/horarios/franjas').then(({ data }) => setFranjas(data)).catch(console.error);
  }, []);
  const cargarOcupacion = useCallback(() => {
    API.get('/horarios/ocupacion').then(({ data }) => setOcupacion(data)).catch(console.error);
  }, []);

  useEffect(() => {
    cargarFranjas();
    cargarOcupacion();
    API.get('/catalogos/grados').then(({ data }) => setGrados(data.filter(g => g.activo))).catch(console.error);
    API.get('/catalogos/secciones').then(({ data }) => setSecciones(data.filter(s => s.activo))).catch(console.error);
    API.get('/horarios/maestros').then(({ data }) => setMaestrosSug(data)).catch(console.error);
    API.get('/config').then(({ data }) => setInstNombre(data?.inst_nombre || '')).catch(() => {});
  }, [cargarFranjas, cargarOcupacion]);

  // Cursos del grado seleccionado.
  useEffect(() => {
    if (!gradoSel) { setCursos([]); return; }
    API.get(`/catalogos/cursos?grado=${encodeURIComponent(gradoSel)}`)
      .then(({ data }) => setCursos(data.filter(c => c.activo)))
      .catch(console.error);
  }, [gradoSel]);

  // Parrilla del grado+sección seleccionado.
  const cargarClases = useCallback(() => {
    if (!gradoSel) { setClases([]); return; }
    API.get(`/horarios/clases?grado=${encodeURIComponent(gradoSel)}&seccion=${encodeURIComponent(seccionSel)}`)
      .then(({ data }) => setClases(data))
      .catch(console.error);
  }, [gradoSel, seccionSel]);
  useEffect(() => { cargarClases(); }, [cargarClases]);

  const clasesMap = useMemo(() => {
    const m = {};
    for (const c of clases) m[cellKey(c.dia, c.hora_inicio)] = c;
    return m;
  }, [clases]);

  // Mapa de ocupación de maestros: `${dia}|${hora_inicio}` -> [{maestro, grado, seccion}]
  const ocupMap = useMemo(() => {
    const m = {};
    for (const o of ocupacion) {
      const k = cellKey(o.dia, o.hora_inicio);
      (m[k] ||= []).push(o);
    }
    return m;
  }, [ocupacion]);

  // ¿El maestro de esta celda choca con otra clase a la misma hora?
  const tieneChoque = (dia, horaInicio, maestro) => {
    if (!maestro) return false;
    const lista = ocupMap[cellKey(dia, horaInicio)] || [];
    return lista.some(o =>
      o.maestro === maestro &&
      !(o.grado === gradoSel && (o.seccion || '') === (seccionSel || ''))
    );
  };

  const dias = verSabado ? DIAS_SEMANA : DIAS_SEMANA.slice(0, 5);

  const abrirCelda = (franja, dia) => {
    if (!puedeEditar) return;
    const actual = clasesMap[cellKey(dia.key, franja.hora_inicio)] || null;
    setEditCelda({ franja, dia: dia.key, diaLab: dia.lab, actual });
  };

  const guardarCelda = async ({ curso, maestro, aplicarTodos }) => {
    const { franja, dia } = editCelda;
    const payload = {
      grado: gradoSel, seccion: seccionSel,
      hora_inicio: franja.hora_inicio, hora_fin: franja.hora_fin,
      curso, maestro,
    };
    if (aplicarTodos) payload.dias = dias.map(d => d.key);
    else payload.dia = dia;
    try {
      await API.put('/horarios/clases', payload);
      setEditCelda(null);
      cargarClases();
      cargarOcupacion();
    } catch { alert('Error al guardar la clase'); }
  };

  const imprimir = () => {
    if (!gradoSel) return;
    const cab = dias.map(d => `<th>${d.lab}</th>`).join('');
    const filas = franjas.map(f => {
      const celdas = dias.map(d => {
        const c = clasesMap[cellKey(d.key, f.hora_inicio)];
        if (!c || (!c.curso && !c.maestro)) return '<td></td>';
        return `<td><strong>${c.curso || ''}</strong>${c.maestro ? `<br/><span class="m">${c.maestro}</span>` : ''}</td>`;
      }).join('');
      return `<tr><th class="hora">${f.hora_inicio}<br/>${f.hora_fin}${f.etiqueta ? `<br/><span class="m">${f.etiqueta}</span>` : ''}</th>${celdas}</tr>`;
    }).join('');
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>Horario</title>
<style>
  body{font-family:Arial,sans-serif;margin:24px;color:#222}
  h1{color:#1a237e;font-size:18px;margin:0}
  h2{font-size:14px;color:#333;margin:4px 0 14px;font-weight:600}
  table{width:100%;border-collapse:collapse}
  th,td{border:1px solid #bbb;padding:6px 8px;text-align:center;font-size:12px;vertical-align:middle}
  thead th{background:#1a237e;color:#fff}
  th.hora{background:#e8eaf6;color:#1a237e;white-space:nowrap;font-size:11px}
  td strong{color:#1a237e}
  .m{color:#666;font-size:10px}
  @page{size:landscape;margin:1cm}
</style></head><body>
  <h1>${instNombre || 'Horario de Clases'}</h1>
  <h2>Horario — ${gradoSel}${seccionSel ? ` · Sección ${seccionSel}` : ''}</h2>
  <table><thead><tr><th>Hora</th>${cab}</tr></thead><tbody>${filas}</tbody></table>
  <script>window.onload=()=>window.print()</script>
</body></html>`;
    const win = window.open('', '_blank', 'width=1100,height=700');
    win.document.write(html); win.document.close();
  };

  return (
    <div className="admin-layout">
      <Sidebar />
      <div className="admin-content">
        <h1>⏰ Horarios de Clase</h1>
        <p className="subtitle">
          Arma la parrilla por grado y sección: define las franjas, elige un grado y rellena cada
          casilla con el curso. El maestro se completa solo desde el curso.
        </p>

        <PanelFranjas franjas={franjas} puedeEditar={puedeEditar} onRecargar={cargarFranjas} />

        {/* Selectores */}
        <div className="asist-filtros" style={{ alignItems: 'flex-end' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: 2 }}>Grado</label>
            <select value={gradoSel} onChange={e => { setGradoSel(e.target.value); }}>
              <option value="">— Elige un grado —</option>
              {grados.map(g => <option key={g.id} value={g.nombre}>{g.nombre}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, marginBottom: 2 }}>Sección</label>
            <select value={seccionSel} onChange={e => setSeccionSel(e.target.value)}>
              <option value="">— Sin sección —</option>
              {secciones.map(s => <option key={s.id} value={s.nombre}>{s.nombre}</option>)}
            </select>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}>
            <input type="checkbox" checked={verSabado} onChange={e => setVerSabado(e.target.checked)} /> Incluir sábado
          </label>
          {gradoSel && franjas.length > 0 && (
            <button className="btn-edit" onClick={imprimir}>🖨️ Imprimir horario</button>
          )}
        </div>

        {/* Guías / Parrilla */}
        {grados.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: '#999' }}>
            No hay grados. Créalos en <strong>Configuración → Grados</strong> (y agrega cursos a cada grado).
          </div>
        ) : franjas.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: '#999' }}>
            Primero define las <strong>franjas horarias</strong> arriba (los bloques de tiempo).
          </div>
        ) : !gradoSel ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: '#999' }}>
            Elige un <strong>grado</strong> (y sección) para armar su horario.
          </div>
        ) : (
          <div className="table-container">
            {puedeEditar && (
              <p style={{ fontSize: '0.82rem', color: '#666', margin: '0 0 8px' }}>
                💡 Haz clic en cualquier casilla para asignar el curso y el maestro. Las casillas en
                <span style={{ color: '#b71c1c', fontWeight: 700 }}> rojo</span> indican que ese maestro ya está
                ocupado en otro grado/sección a esa misma hora.
              </p>
            )}
            <table className="recibo-grid" style={{ width: '100%', tableLayout: 'fixed' }}>
              <thead>
                <tr>
                  <th style={{ width: 110 }}>Hora</th>
                  {dias.map(d => <th key={d.key} style={{ textAlign: 'center' }}>{d.lab}</th>)}
                </tr>
              </thead>
              <tbody>
                {franjas.map(f => (
                  <tr key={f.id}>
                    <td style={{ background: '#f8f9ff', fontSize: '0.74rem', textAlign: 'center', fontWeight: 600, color: '#1a237e' }}>
                      {f.hora_inicio}<br/>{f.hora_fin}
                      {f.etiqueta && <div style={{ color: '#888', fontWeight: 400 }}>{f.etiqueta}</div>}
                    </td>
                    {dias.map(d => {
                      const c = clasesMap[cellKey(d.key, f.hora_inicio)];
                      const choque = c && tieneChoque(d.key, f.hora_inicio, c.maestro);
                      return (
                        <td
                          key={d.key}
                          onClick={() => abrirCelda(f, d)}
                          title={choque ? `⚠ ${c.maestro} ya tiene clase a esta hora en otro grupo` : (puedeEditar ? 'Clic para editar' : '')}
                          style={{
                            cursor: puedeEditar ? 'pointer' : 'default',
                            padding: '6px 8px', textAlign: 'center', verticalAlign: 'middle',
                            minHeight: 44,
                            background: choque ? '#ffebee' : (c?.curso ? '#f1f8e9' : '#fff'),
                            border: choque ? '2px solid #ef9a9a' : undefined,
                          }}
                        >
                          {c?.curso || c?.maestro ? (
                            <>
                              <div style={{ fontWeight: 700, color: '#1a237e', fontSize: '0.82rem' }}>{c.curso || '—'}</div>
                              {c.maestro && <div style={{ fontSize: '0.72rem', color: choque ? '#b71c1c' : '#666' }}>{c.maestro}</div>}
                            </>
                          ) : (
                            <span style={{ color: '#ccc', fontSize: '1.1rem' }}>＋</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editCelda && (
        <ModalCelda
          celda={editCelda}
          cursos={cursos}
          maestrosSugeridos={maestrosSug}
          onGuardar={guardarCelda}
          onCerrar={() => setEditCelda(null)}
        />
      )}
    </div>
  );
}
