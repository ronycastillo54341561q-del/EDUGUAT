import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { jsPDF } from 'jspdf';
import Sidebar from '../../components/Sidebar';
import API from '../../api/axios';
import { loadMembrete, drawMembrete, membreteHTML } from '../../lib/membrete';
import './admin.css';
import './Configuracion.css';
import './Constancias.css';

/* ─── VARIABLES INSERTABLES EN PLANTILLAS ───────────────────── */
const VARIABLES = [
  { tag: 'nombre',           label: 'Nombre',            ej: 'Juan' },
  { tag: 'apellido',         label: 'Apellido',          ej: 'Pérez' },
  { tag: 'nombre_completo',  label: 'Nombre completo',   ej: 'Juan Pérez' },
  { tag: 'clave',            label: 'Clave',             ej: '250001' },
  { tag: 'codigo',           label: 'Código estudiante', ej: 'A123ABC' },
  { tag: 'establecimiento',  label: 'Establecimiento',   ej: 'Liceo Javier' },
  { tag: 'tac',              label: 'TAC',               ej: 'TAC-A' },
  { tag: 'diplomado',        label: 'Diplomado',         ej: 'Operador Windows' },
  { tag: 'horario',          label: 'Horario',           ej: '14:00 a 16:00' },
  { tag: 'laboratorio',      label: 'Laboratorio',       ej: 'Lab-1' },
  { tag: 'dia1',             label: 'Día 1',             ej: 'lunes' },
  { tag: 'dia2',             label: 'Día 2',             ej: 'miércoles' },
  { tag: 'dias',             label: 'Días (combinados)', ej: 'lunes y miércoles' },
  { tag: 'fecha_inicio',     label: 'Fecha de inicio',   ej: '2025-02-01' },
  { tag: 'encargado',        label: 'Encargado',         ej: 'María Pérez' },
  { tag: 'telefono',         label: 'Teléfono',          ej: '5555-5555' },
];

/* ─── HELPERS ───────────────────────────────────────────────── */
const MESES = [
  'enero','febrero','marzo','abril','mayo','junio',
  'julio','agosto','septiembre','octubre','noviembre','diciembre',
];

const fechaLarga = (ubicacion) => {
  const d = new Date();
  return `${ubicacion}, ${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}.`;
};

const buildCtx = (a) => {
  const dias = a.dia_clases1 && a.dia_clases2
    ? `${a.dia_clases1} y ${a.dia_clases2}`
    : (a.dia_clases1 || a.dia_clases2 || '');
  return {
    nombre:           a.nombre || '',
    apellido:         a.apellido || '',
    nombre_completo:  `${a.nombre || ''} ${a.apellido || ''}`.trim(),
    clave:            a.clave || '',
    codigo:           a.codigo_estudiante || '',
    establecimiento:  a.establecimiento || '',
    tac:              a.tac || '',
    diplomado:        a.diplomado || '',
    horario:          a.horario || '',
    laboratorio:      a.laboratorio || '',
    dia1:             a.dia_clases1 || '',
    dia2:             a.dia_clases2 || '',
    dias,
    fecha_inicio:     a.fecha_inicio || '',
    encargado:         a.encargado || '',
    telefono:         a.telefono || '',
  };
};

const renderTpl = (tpl, ctx) =>
  String(tpl || '').replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, k) =>
    (k in ctx) ? ctx[k] : `{{${k}}}`
  );

// Devuelve la plantilla como una lista de segmentos: el texto literal
// queda con bold=false; los valores que vienen de una variable {{x}} se
// marcan bold=true para que se rendericen en negrita.
const renderTplSegments = (tpl, ctx) => {
  const out = [];
  const re = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;
  const src = String(tpl || '');
  let last = 0, m;
  while ((m = re.exec(src)) !== null) {
    if (m.index > last) out.push({ text: src.slice(last, m.index), bold: false });
    const v = (m[1] in ctx) ? ctx[m[1]] : `{{${m[1]}}}`;
    if (v) out.push({ text: String(v), bold: true });
    last = m.index + m[0].length;
  }
  if (last < src.length) out.push({ text: src.slice(last), bold: false });
  return out;
};

const escapeHTML = (s) => String(s || '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Renderiza segmentos a HTML (para preview y export Word) con <strong>.
const segmentsToHTML = (segments) => segments.map(seg => {
  const t = escapeHTML(seg.text).replace(/\n/g, '<br/>');
  return seg.bold ? `<strong>${t}</strong>` : t;
}).join('');

/* ─── COMPONENTE ────────────────────────────────────────────── */
export default function Constancias() {
  const [tab, setTab] = useState(() => localStorage.getItem('constancias_tab') || 'generar');
  useEffect(() => { localStorage.setItem('constancias_tab', tab); }, [tab]);

  return (
    <div className="admin-layout">
      <Sidebar />
      <div className="admin-content">
        <h1>📜 Constancias de Inscripción</h1>
        <p className="subtitle">
          Genera constancias en PDF (tamaño carta) para uno o varios alumnos a partir
          de plantillas reutilizables.  Las plantillas usan variables como
          <code> {'{{nombre_completo}}'} </code>, <code>{'{{tac}}'}</code>, etc.
        </p>

        <div className="cfg-tabs">
          <button className={`cfg-tab${tab==='generar'?' active':''}`} onClick={()=>setTab('generar')}>
            Generar
          </button>
          <button className={`cfg-tab${tab==='plantillas'?' active':''}`} onClick={()=>setTab('plantillas')}>
            Plantillas
          </button>
        </div>

        <div className="cfg-panel">
          {tab === 'generar'    && <SeccionGenerar />}
          {tab === 'plantillas' && <SeccionPlantillas />}
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════
   PESTAÑA: PLANTILLAS
   ════════════════════════════════════════════ */
function SeccionPlantillas() {
  const empty = {
    nombre: '', ubicacion: 'Guatemala',
    saludo: 'Estimado(a) Director(a):',
    cuerpo: '', despedida: 'Atentamente,',
    firma_nombre: 'Secretaría', firma_cargo: '',
    mostrar_fecha: 1, mostrar_firma: 1, mostrar_telefono: 1,
    espacio_post_encabezado: 3,
    espacio_post_fecha: 2,
    espacio_post_saludo: 1,
    espacio_post_cuerpo: 2,
    espacio_post_despedida: 3,
    activa: 1,
  };
  const [items, setItems] = useState([]);
  const [config, setConfig] = useState(null);
  const [modal, setModal] = useState(false);
  const [form, setForm]   = useState(empty);
  const [editId, setEditId] = useState(null);
  const [err, setErr]     = useState('');
  const cuerpoRef = useRef(null);

  const cargar = useCallback(() => {
    API.get('/constancias/plantillas').then(({data})=>setItems(data)).catch(console.error);
  }, []);
  useEffect(()=>{ cargar(); }, [cargar]);
  useEffect(()=>{
    API.get('/config').then(({data})=>setConfig(data)).catch(()=>{});
  }, []);

  const abrir = (p=null) => {
    setErr('');
    if (p) {
      setEditId(p.id);
      setForm({
        ...empty,
        ...p,
      });
    } else { setEditId(null); setForm(empty); }
    setModal(true);
  };

  const insertarVar = (tag) => {
    const ta = cuerpoRef.current;
    if (!ta) return;
    const start = ta.selectionStart, end = ta.selectionEnd;
    const before = form.cuerpo.slice(0, start);
    const after  = form.cuerpo.slice(end);
    const inserted = `{{${tag}}}`;
    const next = before + inserted + after;
    setForm(f => ({ ...f, cuerpo: next }));
    setTimeout(() => {
      ta.focus();
      ta.selectionStart = ta.selectionEnd = start + inserted.length;
    }, 0);
  };

  const guardar = async (e) => {
    e.preventDefault();
    if (!form.nombre.trim() || !form.cuerpo.trim()) {
      setErr('Nombre y cuerpo son requeridos'); return;
    }
    try {
      if (editId) await API.put(`/constancias/plantillas/${editId}`, form);
      else        await API.post('/constancias/plantillas', form);
      setModal(false);
      cargar();
    } catch (ex) { setErr(ex.response?.data?.message || 'Error al guardar'); }
  };

  const eliminar = async (p) => {
    if (!confirm(`¿Eliminar la plantilla "${p.nombre}"?`)) return;
    try { await API.delete(`/constancias/plantillas/${p.id}`); cargar(); }
    catch { alert('Error al eliminar'); }
  };

  return (
    <>
      <div className="cfg-toolbar">
        <h2>Plantillas ({items.length})</h2>
        <button className="btn-primary" onClick={()=>abrir()}>+ Nueva plantilla</button>
      </div>

      {items.length === 0 ? (
        <div className="cfg-empty">No hay plantillas. <button className="btn-primary" onClick={()=>abrir()}>Crear la primera</button></div>
      ) : (
        <div className="cfg-list">
          {items.map(p => (
            <div key={p.id} className={`cfg-card${p.activa ? '' : ' inactivo'}`}>
              <div className="cfg-card-info">
                <strong>{p.nombre}</strong>
                <span style={{ color:'#666', marginLeft:10 }}>— {p.ubicacion}</span>
                {!p.activa && <span className="cfg-badge-off">Inactiva</span>}
              </div>
              <div className="cfg-card-actions">
                <button className="btn-edit" onClick={()=>abrir(p)}>Editar</button>
                <button className="btn-danger-sm" onClick={()=>eliminar(p)}>Eliminar</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <div className="modal-overlay" onClick={()=>setModal(false)}>
          <div className="modal modal-plantilla" onClick={e=>e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editId ? 'Editar plantilla' : 'Nueva plantilla'}</h2>
              <button className="modal-close" onClick={()=>setModal(false)}>✕</button>
            </div>
            <form onSubmit={guardar} className="modal-form plantilla-body">
              {/* Editor a la izquierda */}
              <div className="plantilla-editor">
                <div className="form-grid">
                  <div className="form-group">
                    <label>Nombre interno *</label>
                    <input value={form.nombre} onChange={e=>setForm({...form,nombre:e.target.value})} required />
                  </div>
                  <div className="form-group">
                    <label>Ubicación (en la fecha)</label>
                    <input value={form.ubicacion} placeholder="Guatemala"
                      onChange={e=>setForm({...form,ubicacion:e.target.value})} />
                  </div>
                  <div className="form-group full-width">
                    <label>Saludo</label>
                    <input value={form.saludo} placeholder="A quien corresponda:"
                      onChange={e=>setForm({...form,saludo:e.target.value})} />
                  </div>

                  <div className="form-group full-width">
                    <label>Cuerpo *</label>
                    <div className="vars-bar">
                      <span>Insertar variable:</span>
                      {VARIABLES.map(v => (
                        <button type="button" key={v.tag} className="var-chip" title={`Ej: ${v.ej}`}
                                onClick={()=>insertarVar(v.tag)}>
                          {v.label}
                        </button>
                      ))}
                    </div>
                    <textarea
                      ref={cuerpoRef}
                      rows={8}
                      value={form.cuerpo}
                      onChange={e=>setForm({...form,cuerpo:e.target.value})}
                      placeholder="Por medio de la presente hacemos constar que el alumno {{nombre_completo}} …"
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label>Despedida</label>
                    <input value={form.despedida} onChange={e=>setForm({...form,despedida:e.target.value})} />
                  </div>
                  <div className="form-group">
                    <label>Firma — Nombre</label>
                    <input value={form.firma_nombre} placeholder="Secretaría"
                      onChange={e=>setForm({...form,firma_nombre:e.target.value})} />
                  </div>
                  <div className="form-group full-width">
                    <label>Firma — Cargo (opcional)</label>
                    <input value={form.firma_cargo}
                      onChange={e=>setForm({...form,firma_cargo:e.target.value})} />
                  </div>
                </div>

                <fieldset className="esp-fieldset">
                  <legend>Espaciado (enters entre secciones)</legend>
                  <div className="esp-grid">
                    <EspInput label="Después del encabezado" value={form.espacio_post_encabezado}
                              onChange={v=>setForm({...form,espacio_post_encabezado:v})} />
                    <EspInput label="Después de la fecha" value={form.espacio_post_fecha}
                              onChange={v=>setForm({...form,espacio_post_fecha:v})} />
                    <EspInput label="Después del saludo" value={form.espacio_post_saludo}
                              onChange={v=>setForm({...form,espacio_post_saludo:v})} />
                    <EspInput label="Después del cuerpo" value={form.espacio_post_cuerpo}
                              onChange={v=>setForm({...form,espacio_post_cuerpo:v})} />
                    <EspInput label="Después de la despedida" value={form.espacio_post_despedida}
                              onChange={v=>setForm({...form,espacio_post_despedida:v})} />
                  </div>
                  <p className="esp-hint">
                    Cada "enter" equivale a una línea en blanco (≈ línea de texto). Usa 0 para no dejar espacio.
                  </p>
                </fieldset>

                <div className="form-group full-width" style={{ display:'flex', gap:18, flexWrap:'wrap' }}>
                  <label><input type="checkbox" checked={!!form.mostrar_fecha}
                    onChange={e=>setForm({...form,mostrar_fecha:e.target.checked?1:0})}/> Mostrar fecha</label>
                  <label><input type="checkbox" checked={!!form.mostrar_firma}
                    onChange={e=>setForm({...form,mostrar_firma:e.target.checked?1:0})}/> Mostrar firma</label>
                  <label><input type="checkbox" checked={!!form.mostrar_telefono}
                    onChange={e=>setForm({...form,mostrar_telefono:e.target.checked?1:0})}/> Mostrar teléfono institución</label>
                  <label><input type="checkbox" checked={!!form.activa}
                    onChange={e=>setForm({...form,activa:e.target.checked?1:0})}/> Plantilla activa</label>
                </div>
              </div>

              {/* Vista previa a la derecha */}
              <div className="plantilla-preview-col">
                <div className="plantilla-preview-head">
                  <span>Vista previa en vivo</span>
                  <em>(con datos de ejemplo)</em>
                </div>
                <PreviewLetra plantilla={form} alumno={ALUMNO_EJEMPLO} config={config} />
              </div>

              {err && <p style={{color:'#e53935',fontSize:'0.85rem',gridColumn:'1 / -1'}}>{err}</p>}
              <div className="modal-actions" style={{gridColumn:'1 / -1'}}>
                <button type="button" className="btn-cancel" onClick={()=>setModal(false)}>Cancelar</button>
                <button type="submit" className="btn-primary">{editId ? 'Actualizar' : 'Crear'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

/* ════════════════════════════════════════════
   PESTAÑA: GENERAR
   ════════════════════════════════════════════ */
function SeccionGenerar() {
  const [config, setConfig]         = useState(null);
  const [mctx, setMctx]             = useState(null);
  const [plantillas, setPlantillas] = useState([]);
  const [filtros, setFiltros]       = useState(null);
  const [seleccion, setSeleccion]   = useState({
    establecimiento: '', tac: '', horario: '',
    diplomado: '', laboratorio: '', dia: '',
  });
  const [alumnos, setAlumnos]       = useState([]);
  const [seleccionAlumnos, setSel]  = useState(new Set());
  const [plantillaId, setPlantillaId] = useState('');
  const [busqueda, setBusqueda]     = useState('');
  const [generando, setGenerando]   = useState(false);

  const cargar = useCallback(async () => {
    try {
      const [cfgRes, plRes, fRes, membCtx] = await Promise.all([
        API.get('/config'),
        API.get('/constancias/plantillas'),
        API.get('/constancias/filtros'),
        loadMembrete('constancias'),
      ]);
      setConfig(cfgRes.data);
      setMctx(membCtx);
      setPlantillas(plRes.data);
      setFiltros(fRes.data);
      const activa = plRes.data.find(p => p.activa);
      if (activa) setPlantillaId(String(activa.id));
    } catch (e) { console.error(e); }
  }, []);
  useEffect(()=>{ cargar(); }, [cargar]);

  const buscarAlumnos = useCallback(async () => {
    const params = {};
    for (const [k,v] of Object.entries(seleccion)) if (v) params[k] = v;
    try {
      const { data } = await API.get('/constancias/alumnos', { params });
      setAlumnos(data);
      setSel(new Set(data.map(a => a.id))); // por defecto todos seleccionados
    } catch (e) { console.error(e); alert('Error al buscar alumnos'); }
  }, [seleccion]);

  const alumnosFiltrados = useMemo(() => {
    if (!busqueda.trim()) return alumnos;
    const q = busqueda.toLowerCase();
    return alumnos.filter(a =>
      `${a.nombre} ${a.apellido} ${a.clave} ${a.codigo_estudiante || ''}`.toLowerCase().includes(q)
    );
  }, [alumnos, busqueda]);

  const togglar = (id) => {
    setSel(prev => {
      const nuevo = new Set(prev);
      nuevo.has(id) ? nuevo.delete(id) : nuevo.add(id);
      return nuevo;
    });
  };
  const togglarTodo = () => {
    if (seleccionAlumnos.size === alumnosFiltrados.length) setSel(new Set());
    else setSel(new Set(alumnosFiltrados.map(a => a.id)));
  };

  const plantilla = plantillas.find(p => String(p.id) === plantillaId);
  const seleccionados = alumnos.filter(a => seleccionAlumnos.has(a.id));

  const generarPDF = () => {
    if (!plantilla) { alert('Selecciona una plantilla'); return; }
    if (!seleccionados.length) { alert('Selecciona al menos un alumno'); return; }

    setGenerando(true);
    try {
      const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'letter' });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const margin = 25.4; // ~1 pulgada

      seleccionados.forEach((alumno, idx) => {
        if (idx > 0) pdf.addPage();
        renderConstancia(pdf, plantilla, alumno, config, { pageW, pageH, margin }, mctx);
      });

      const fileName = seleccionados.length === 1
        ? `constancia_${seleccionados[0].apellido}_${seleccionados[0].nombre}.pdf`
            .replace(/\s+/g,'_')
        : `constancias_${seleccionados.length}.pdf`;
      pdf.save(fileName);
    } catch (err) {
      console.error(err);
      alert('Error al generar PDF: ' + err.message);
    } finally { setGenerando(false); }
  };

  const generarWord = () => {
    if (!plantilla) { alert('Selecciona una plantilla'); return; }
    if (!seleccionados.length) { alert('Selecciona al menos un alumno'); return; }

    setGenerando(true);
    try {
      const html = buildWordHTML(plantilla, seleccionados, config, mctx);
      const blob = new Blob(['﻿' + html], {
        type: 'application/msword;charset=utf-8',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = seleccionados.length === 1
        ? `constancia_${seleccionados[0].apellido}_${seleccionados[0].nombre}.doc`
            .replace(/\s+/g,'_')
        : `constancias_${seleccionados.length}.doc`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (err) {
      console.error(err);
      alert('Error al generar Word: ' + err.message);
    } finally { setGenerando(false); }
  };

  return (
    <>
      <div className="gen-panel">
        <div className="gen-side">
          <h3>1. Plantilla</h3>
          {plantillas.length === 0 ? (
            <p style={{color:'#888'}}>No hay plantillas. Crea una en la pestaña "Plantillas".</p>
          ) : (
            <select value={plantillaId} onChange={e=>setPlantillaId(e.target.value)}>
              <option value="">— Seleccionar —</option>
              {plantillas.filter(p=>p.activa).map(p => (
                <option key={p.id} value={p.id}>{p.nombre}</option>
              ))}
            </select>
          )}

          <h3 style={{marginTop:18}}>2. Filtrar alumnos</h3>
          <div className="gen-filtros">
            <label>Establecimiento
              <select value={seleccion.establecimiento}
                onChange={e=>setSeleccion(s=>({...s,establecimiento:e.target.value}))}>
                <option value="">— Todos —</option>
                {filtros?.establecimientos.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </label>
            <label>TAC
              <select value={seleccion.tac} onChange={e=>setSeleccion(s=>({...s,tac:e.target.value}))}>
                <option value="">— Todos —</option>
                {filtros?.tacs.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </label>
            <label>Horario
              <select value={seleccion.horario} onChange={e=>setSeleccion(s=>({...s,horario:e.target.value}))}>
                <option value="">— Todos —</option>
                {filtros?.horarios.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </label>
            <label>Diplomado
              <select value={seleccion.diplomado} onChange={e=>setSeleccion(s=>({...s,diplomado:e.target.value}))}>
                <option value="">— Todos —</option>
                {filtros?.diplomados.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </label>
            <label>Laboratorio
              <select value={seleccion.laboratorio} onChange={e=>setSeleccion(s=>({...s,laboratorio:e.target.value}))}>
                <option value="">— Todos —</option>
                {filtros?.laboratorios.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </label>
            <label>Día
              <select value={seleccion.dia} onChange={e=>setSeleccion(s=>({...s,dia:e.target.value}))}>
                <option value="">— Cualquiera —</option>
                {['lunes','martes','miercoles','jueves','viernes','sabado','domingo'].map(d=>(
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </label>
          </div>
          <button className="btn-primary" style={{marginTop:8}} onClick={buscarAlumnos}>
            🔍 Buscar alumnos
          </button>
        </div>

        <div className="gen-main">
          <h3>3. Alumnos a incluir ({alumnos.length})</h3>
          {alumnos.length > 0 && (
            <>
              <div className="gen-toolbar">
                <input
                  placeholder="Buscar por nombre, clave o código…"
                  value={busqueda} onChange={e=>setBusqueda(e.target.value)}
                />
                <button className="btn-edit" onClick={togglarTodo}>
                  {seleccionAlumnos.size === alumnosFiltrados.length ? 'Deseleccionar todos' : 'Seleccionar todos'}
                </button>
                <span className="gen-count">
                  {seleccionAlumnos.size} de {alumnos.length} seleccionado(s)
                </span>
              </div>
              <div className="gen-lista">
                {alumnosFiltrados.map(a => (
                  <label key={a.id} className="gen-row">
                    <input type="checkbox" checked={seleccionAlumnos.has(a.id)} onChange={()=>togglar(a.id)} />
                    <span className="gen-cel-nombre">{a.apellido}, {a.nombre}</span>
                    <span className="gen-cel">{a.clave}</span>
                    <span className="gen-cel">{a.tac || '—'}</span>
                    <span className="gen-cel">{a.establecimiento || '—'}</span>
                  </label>
                ))}
              </div>
            </>
          )}

          {alumnos.length === 0 && (
            <div className="cfg-empty">
              Aplica los filtros y haz clic en <strong>Buscar alumnos</strong>.
            </div>
          )}

          <div className="gen-foot">
            <button className="btn-primary btn-pdf" disabled={generando || !seleccionados.length || !plantilla}
                    onClick={generarPDF}>
              {generando ? 'Generando…' : `📄 Generar PDF (${seleccionados.length})`}
            </button>
            <button className="btn-edit btn-pdf" disabled={generando || !seleccionados.length || !plantilla}
                    onClick={generarWord}>
              {generando ? 'Generando…' : `📝 Exportar Word (${seleccionados.length})`}
            </button>
            {seleccionados.length > 1 && (
              <span className="gen-hint">Un solo archivo con {seleccionados.length} páginas (una por alumno).</span>
            )}
          </div>
        </div>
      </div>

      {plantilla && seleccionados.length > 0 && (
        <Vista pdfPreviewAlumno={seleccionados[0]} plantilla={plantilla} config={config} mctx={mctx} />
      )}
    </>
  );
}

/* ─── PREVIEW HTML reutilizable (modal y panel "Generar") ──── */

const ALUMNO_EJEMPLO = {
  nombre: 'Juan', apellido: 'Pérez García',
  clave: '250042', codigo_estudiante: 'A123ABC',
  establecimiento: 'Liceo Javier',
  tac: 'TAC-A', diplomado: 'Operador Windows',
  horario: '14:00 a 16:00', laboratorio: 'Lab-1',
  dia_clases1: 'lunes', dia_clases2: 'miércoles',
  fecha_inicio: '2025-02-01',
  encargado: 'María García', telefono: '5555-5555',
};

// Convierte un número de "enters" a un espaciador visual.
const Espacio = ({ enters }) => {
  const n = Math.max(0, parseInt(enters ?? 0, 10) || 0);
  if (!n) return null;
  return <div style={{ height: `${n * 1.45}em` }} aria-hidden="true" />;
};

function EspInput({ label, value, onChange }) {
  return (
    <label className="esp-input">
      <span>{label}</span>
      <input
        type="number" min={0} max={20} step={1}
        value={value ?? 0}
        onChange={e => onChange(parseInt(e.target.value, 10) || 0)}
      />
    </label>
  );
}

function PreviewLetra({ plantilla, alumno, config, mctx }) {
  const ctx = buildCtx(alumno);
  const cuerpoHTML = segmentsToHTML(renderTplSegments(plantilla.cuerpo, ctx));
  const saludoHTML = segmentsToHTML(renderTplSegments(plantilla.saludo, ctx));
  return (
    <div className="prev-page">
      {mctx?.membrete?.usar
        ? <div dangerouslySetInnerHTML={{ __html: membreteHTML(mctx) }} />
        : (config?.inst_nombre && (
        <div className="prev-header">
          <strong>{config.inst_nombre}</strong>
          {config.inst_direccion && <div>{config.inst_direccion}</div>}
          {plantilla.mostrar_telefono && config.inst_telefono && <div>{config.inst_telefono}</div>}
          {config.inst_email && <div>{config.inst_email}</div>}
        </div>
      ))}
      <Espacio enters={plantilla.espacio_post_encabezado} />
      {plantilla.mostrar_fecha && (
        <div className="prev-fecha">{fechaLarga(plantilla.ubicacion || 'Guatemala')}</div>
      )}
      <Espacio enters={plantilla.espacio_post_fecha} />
      <div className="prev-saludo" dangerouslySetInnerHTML={{ __html: saludoHTML }} />
      <Espacio enters={plantilla.espacio_post_saludo} />
      <div className="prev-cuerpo" dangerouslySetInnerHTML={{ __html: cuerpoHTML }} />
      <Espacio enters={plantilla.espacio_post_cuerpo} />
      <div className="prev-despedida">{plantilla.despedida}</div>
      <Espacio enters={plantilla.espacio_post_despedida} />
      {plantilla.mostrar_firma && (
        <div className="prev-firma">
          <div>F. _______________________</div>
          <div>{plantilla.firma_nombre}</div>
          {plantilla.firma_cargo && <div>{plantilla.firma_cargo}</div>}
          {plantilla.mostrar_telefono && config?.inst_telefono && (
            <div style={{marginTop:6}}>{config.inst_telefono}</div>
          )}
        </div>
      )}
    </div>
  );
}

function Vista({ pdfPreviewAlumno, plantilla, config, mctx }) {
  if (!pdfPreviewAlumno) return null;
  return (
    <div className="gen-preview">
      <h3>Vista previa</h3>
      <PreviewLetra plantilla={plantilla} alumno={pdfPreviewAlumno} config={config} mctx={mctx} />
    </div>
  );
}

/* ─── RENDER PDF ────────────────────────────────────────────── */
function renderConstancia(pdf, plantilla, alumno, config, geo, mctx) {
  const { pageW, pageH, margin } = geo;
  const usableW = pageW - margin * 2;
  // Cada "enter" (espacio configurable) equivale a una altura de línea (~6mm).
  const ENTER = 6;
  const espPostEnc      = (plantilla.espacio_post_encabezado ?? 3) * ENTER;
  const espPostFecha    = (plantilla.espacio_post_fecha      ?? 2) * ENTER;
  const espPostSaludo   = (plantilla.espacio_post_saludo     ?? 1) * ENTER;
  const espPostCuerpo   = (plantilla.espacio_post_cuerpo     ?? 2) * ENTER;
  const espPostDespedida= (plantilla.espacio_post_despedida  ?? 3) * ENTER;
  let y = margin;

  // Encabezado: usamos el membrete configurado (dos secciones) si está
  // habilitado; si no, un encabezado centrado clásico.
  if (mctx?.membrete?.usar) {
    const headerH = Math.max(20, Math.min(mctx.membrete.altura_mm || 30, 38));
    drawMembrete(pdf, mctx, { x: margin, y, w: usableW, h: headerH, withBand: true });
    y += headerH + 4;
  } else {
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(14);
    if (config?.inst_nombre) {
      pdf.text(config.inst_nombre, pageW/2, y, { align: 'center' });
      y += 6;
    }
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(11);
    if (config?.inst_direccion) {
      pdf.text(config.inst_direccion, pageW/2, y, { align: 'center' });
      y += 5;
    }
    if (plantilla.mostrar_telefono && config?.inst_telefono) {
      pdf.text(config.inst_telefono, pageW/2, y, { align: 'center' });
      y += 5;
    }
    if (config?.inst_email) {
      pdf.text(config.inst_email, pageW/2, y, { align: 'center' });
      y += 5;
    }
  }

  // Espacio configurable después del encabezado.
  y += espPostEnc;

  // Fecha (alineada a la derecha)
  if (plantilla.mostrar_fecha) {
    pdf.setFontSize(11);
    const fecha = fechaLarga(plantilla.ubicacion || 'Guatemala');
    pdf.text(fecha, pageW - margin, y, { align: 'right' });
    y += 8;
  }

  // Espacio configurable después de fecha → saludo (izquierda).
  y += espPostFecha;
  const ctx = buildCtx(alumno);
  const saludoSegs = renderTplSegments(plantilla.saludo, ctx);
  if (saludoSegs.length) {
    y = drawSegmentsWrapped(pdf, saludoSegs, margin, y, usableW, 6.5, pageH, margin);
    y += espPostSaludo;
  }
  pdf.setFont('helvetica','normal');

  // Cuerpo: render con wrap mixto (negrita para variables) y respetando
  // los saltos de línea explícitos del usuario.
  pdf.setFontSize(12);
  const lineH = 6.2;
  const cuerpoSegs = renderTplSegments(plantilla.cuerpo, ctx);
  // Separamos por saltos de línea para preservar párrafos.
  const paragrafos = splitSegmentsByNewline(cuerpoSegs);
  for (const parrafo of paragrafos) {
    if (y > pageH - margin - 40) { pdf.addPage(); y = margin; }
    y = drawSegmentsWrapped(pdf, parrafo, margin, y, usableW, lineH, pageH, margin);
    y += 3; // separación entre párrafos
  }

  // Despedida + firma centrada al pie
  y += espPostCuerpo;
  if (y > pageH - 50) { pdf.addPage(); y = margin + 20; }
  if (plantilla.despedida) {
    pdf.setFont('helvetica','normal');
    pdf.text(plantilla.despedida, pageW/2, y, { align: 'center' });
    y += espPostDespedida;
  }

  if (plantilla.mostrar_firma) {
    pdf.setFont('helvetica','normal');
    pdf.text('F. _______________________', pageW/2, y, { align: 'center' });
    y += 6;
    pdf.text(plantilla.firma_nombre || '', pageW/2, y, { align: 'center' });
    y += 5;
    if (plantilla.firma_cargo) {
      pdf.text(plantilla.firma_cargo, pageW/2, y, { align: 'center' });
      y += 5;
    }
    if (plantilla.mostrar_telefono && config?.inst_telefono) {
      pdf.text(config.inst_telefono, pageW/2, y, { align: 'center' });
    }
  }
}

/* ─── HELPERS PDF MIXTO BOLD/NORMAL ─────────────────────────── */

// Divide una lista de segmentos por '\n' produciendo varios sub-párrafos.
function splitSegmentsByNewline(segs) {
  const out = [[]];
  for (const seg of segs) {
    const partes = String(seg.text).split('\n');
    partes.forEach((p, i) => {
      if (p) out[out.length - 1].push({ text: p, bold: seg.bold });
      if (i < partes.length - 1) out.push([]);
    });
  }
  return out.filter(p => p.length || true); // mantiene párrafos vacíos como saltos
}

// Tokeniza segmentos en "palabras" (texto + espacios) preservando el flag bold,
// para poder hacer word-wrap conservando los cambios de fuente.
function tokenizeSegments(segs) {
  const tokens = [];
  for (const seg of segs) {
    const re = /(\s+|[^\s]+)/g;
    let m;
    while ((m = re.exec(seg.text)) !== null) {
      tokens.push({ text: m[0], bold: seg.bold });
    }
  }
  return tokens;
}

// Dibuja segmentos con word-wrap dentro de maxWidth.  Los segmentos
// marcados bold:true se imprimen con helvetica bold; el resto, normal.
// Devuelve la nueva 'y' después del último renglón.
function drawSegmentsWrapped(pdf, segs, x, y, maxWidth, lineH, pageH, marginBottom) {
  if (!segs.length) return y;
  const tokens = tokenizeSegments(segs);
  if (!tokens.length) return y;

  const measure = (tk) => {
    pdf.setFont('helvetica', tk.bold ? 'bold' : 'normal');
    return pdf.getTextWidth(tk.text);
  };

  // Greedy line-fill
  let lineTokens = [];
  let lineWidth = 0;

  const flushLine = () => {
    let cx = x;
    for (const tk of lineTokens) {
      pdf.setFont('helvetica', tk.bold ? 'bold' : 'normal');
      pdf.text(tk.text, cx, y);
      cx += pdf.getTextWidth(tk.text);
    }
    y += lineH;
    if (y > pageH - marginBottom - 40) {
      pdf.addPage();
      y = marginBottom;
    }
    lineTokens = [];
    lineWidth = 0;
  };

  for (const tk of tokens) {
    const w = measure(tk);
    const isSpace = /^\s+$/.test(tk.text);
    if (lineWidth + w > maxWidth && lineTokens.length > 0) {
      // No quepan más palabras: cierra línea (descarta espacio inicial siguiente).
      // Si el token actual es espacio, lo descartamos para no abrir línea con un espacio.
      flushLine();
      if (isSpace) continue;
    }
    // No agregamos un espacio al inicio de línea.
    if (isSpace && lineTokens.length === 0) continue;
    lineTokens.push(tk);
    lineWidth += w;
  }
  if (lineTokens.length) flushLine();

  pdf.setFont('helvetica','normal');
  return y;
}

/* ─── EXPORT WORD (HTML compatible con MS Word) ─────────────── */

function buildWordHTML(plantilla, alumnos, config, mctx) {
  const head = `
<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8">
<title>Constancia</title>
<!--[if gte mso 9]>
<xml>
  <w:WordDocument>
    <w:View>Print</w:View>
    <w:Zoom>100</w:Zoom>
    <w:DoNotOptimizeForBrowser/>
  </w:WordDocument>
</xml>
<![endif]-->
<style>
@page { size: 8.5in 11in; margin: 1in; }
body  { font-family: 'Times New Roman', serif; font-size: 12pt; line-height: 1.45; }
.encabezado { text-align: center; margin-bottom: 36pt; }
.encabezado .nombre { font-weight: bold; font-size: 14pt; }
.fecha      { text-align: right;  margin-bottom: 18pt; }
.saludo     { font-weight: bold;  margin-bottom: 12pt; }
.cuerpo     { text-align: justify; margin-bottom: 28pt; white-space: pre-wrap; }
.despedida  { text-align: center; margin-bottom: 32pt; }
.firma      { text-align: center; }
.firma .linea { margin-bottom: 4pt; }
.salto      { page-break-before: always; }
strong      { font-weight: bold; }
</style>
</head>
<body>
`;
  const cards = alumnos.map((alumno, i) => {
    const ctx = buildCtx(alumno);
    const cuerpo = segmentsToHTML(renderTplSegments(plantilla.cuerpo, ctx));
    const saludo = segmentsToHTML(renderTplSegments(plantilla.saludo, ctx));
    const fecha  = plantilla.mostrar_fecha
      ? `<div class="fecha">${escapeHTML(fechaLarga(plantilla.ubicacion || 'Guatemala'))}</div>`
      : '';

    const enc = mctx?.membrete?.usar
      ? `<div class="encabezado">${membreteHTML(mctx)}</div>`
      : (config?.inst_nombre ? `
      <div class="encabezado">
        <div class="nombre">${escapeHTML(config.inst_nombre)}</div>
        ${config.inst_direccion ? `<div>${escapeHTML(config.inst_direccion)}</div>` : ''}
        ${plantilla.mostrar_telefono && config.inst_telefono ? `<div>${escapeHTML(config.inst_telefono)}</div>` : ''}
        ${config.inst_email ? `<div>${escapeHTML(config.inst_email)}</div>` : ''}
      </div>` : '');

    const firma = plantilla.mostrar_firma ? `
      <div class="firma">
        <div class="linea">F. _______________________</div>
        <div>${escapeHTML(plantilla.firma_nombre || '')}</div>
        ${plantilla.firma_cargo ? `<div>${escapeHTML(plantilla.firma_cargo)}</div>` : ''}
        ${plantilla.mostrar_telefono && config?.inst_telefono ? `<div>${escapeHTML(config.inst_telefono)}</div>` : ''}
      </div>` : '';

    return `
<div class="${i > 0 ? 'salto' : ''}">
  ${enc}
  <div style="height:${(plantilla.espacio_post_encabezado ?? 3) * 12}pt"></div>
  ${fecha}
  <div style="height:${(plantilla.espacio_post_fecha ?? 2) * 12}pt"></div>
  <div class="saludo">${saludo}</div>
  <div style="height:${(plantilla.espacio_post_saludo ?? 1) * 12}pt"></div>
  <div class="cuerpo">${cuerpo}</div>
  <div style="height:${(plantilla.espacio_post_cuerpo ?? 2) * 12}pt"></div>
  <div class="despedida">${escapeHTML(plantilla.despedida || '')}</div>
  <div style="height:${(plantilla.espacio_post_despedida ?? 3) * 12}pt"></div>
  ${firma}
</div>`;
  }).join('\n');

  return head + cards + '\n</body>\n</html>';
}
