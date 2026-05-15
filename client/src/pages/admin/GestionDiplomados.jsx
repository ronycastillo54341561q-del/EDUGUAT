import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../../components/Sidebar';
import API from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import { can } from '../../lib/permissions';
import './admin.css';
import './Configuracion.css';
import './GestionDiplomados.css';

const EMPTY_DIPLOMADO = {
  nombre: '',
  objetivo_general: '',
  objetivos: [''],
  programas: [{ id: null, nombre: '', duracion_semanas: 1 }],
};

function diplomadoToForm(d) {
  return {
    nombre: d.nombre || '',
    objetivo_general: d.objetivo_general || '',
    objetivos: d.objetivos?.length ? d.objetivos.map(o => o.descripcion) : [''],
    programas: d.programas?.length
      ? [...d.programas]
          .sort((a, b) => a.orden - b.orden)
          .map(p => ({
            id: p.id,
            nombre: p.nombre,
            duracion_semanas: p.duracion_semanas || 1,
          }))
      : [{ id: null, nombre: '', duracion_semanas: 1 }],
  };
}

function buildContenido(duracion, prev = []) {
  return Array.from({ length: duracion }, (_, i) => {
    const slot = i + 1;
    const found = prev.find(c => c.semana_num === slot);
    return { semana_num: slot, contenido: found?.contenido || '' };
  });
}

function programaToForm(p) {
  return {
    nombre: p.nombre || '',
    objetivo_general: p.objetivo_general || '',
    duracion_semanas: p.duracion_semanas || 1,
    objetivos: p.objetivos?.length ? p.objetivos.map(o => o.descripcion) : [''],
    contenido: buildContenido(p.duracion_semanas || 1, p.contenido || []),
  };
}

export default function GestionDiplomados() {
  const navigate = useNavigate();
  const { usuario } = useAuth();
  const puedeEditar = can(usuario?.rol, 'diplomados', 'edit');
  const [diplomados, setDiplomados] = useState([]);
  const [cargando, setCargando] = useState(false);

  // Modal Diplomado (crear/editar diplomado completo)
  const [showDip, setShowDip] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(EMPTY_DIPLOMADO);
  const [guardandoDip, setGuardandoDip] = useState(false);
  const [msgDip, setMsgDip] = useState('');

  // Panel "operador" de programas (un diplomado abierto)
  const [openDipId, setOpenDipId] = useState(null);

  // Modal Programa (editar un programa del diplomado abierto)
  const [showProg, setShowProg] = useState(false);
  const [progEditId, setProgEditId] = useState(null);
  const [progForm, setProgForm] = useState(null);
  const [guardandoProg, setGuardandoProg] = useState(false);
  const [msgProg, setMsgProg] = useState('');

  // Modal Exámenes
  const [showExam, setShowExam] = useState(false);
  const [examDipId, setExamDipId] = useState(null);
  const [examenes, setExamenes] = useState([{ id: null, nombre: '' }]);
  const [guardandoExam, setGuardandoExam] = useState(false);
  const [msgExam, setMsgExam] = useState('');

  const [confirmDel, setConfirmDel] = useState(null);

  const cargar = async () => {
    setCargando(true);
    try {
      const { data } = await API.get('/diplomados');
      setDiplomados(data);
    } catch (e) { console.error(e); }
    finally { setCargando(false); }
  };

  useEffect(() => { cargar(); }, []);

  const dipAbierto = useMemo(
    () => diplomados.find(d => d.id === openDipId) || null,
    [diplomados, openDipId]
  );

  /* ── Diplomado: helpers de form ── */
  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const addObjetivo = () => setForm(f => ({ ...f, objetivos: [...f.objetivos, ''] }));
  const setObjetivo = (i, v) => setForm(f => {
    const arr = [...f.objetivos]; arr[i] = v;
    return { ...f, objetivos: arr };
  });
  const removeObjetivo = (i) => setForm(f => {
    const arr = f.objetivos.filter((_, idx) => idx !== i);
    return { ...f, objetivos: arr.length ? arr : [''] };
  });

  const addPrograma = () => setForm(f => ({
    ...f,
    programas: [...f.programas, { id: null, nombre: '', duracion_semanas: 1 }],
  }));
  const setProgField = (i, k, v) => setForm(f => {
    const arr = [...f.programas];
    arr[i] = { ...arr[i], [k]: k === 'duracion_semanas' ? Math.max(1, Math.min(52, parseInt(v) || 1)) : v };
    return { ...f, programas: arr };
  });
  const removePrograma = (i) => setForm(f => {
    const arr = f.programas.filter((_, idx) => idx !== i);
    return { ...f, programas: arr.length ? arr : [{ id: null, nombre: '', duracion_semanas: 1 }] };
  });
  const moveProgramaForm = (i, dir) => setForm(f => {
    const arr = [...f.programas];
    const j = i + dir;
    if (j < 0 || j >= arr.length) return f;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    return { ...f, programas: arr };
  });

  /* ── Diplomado: abrir / cerrar ── */
  const abrirNuevo = () => {
    setEditId(null);
    setForm(EMPTY_DIPLOMADO);
    setMsgDip('');
    setShowDip(true);
  };
  const abrirEditar = (d) => {
    setEditId(d.id);
    setForm(diplomadoToForm(d));
    setMsgDip('');
    setShowDip(true);
  };
  const cerrarDip = () => {
    setShowDip(false);
    setEditId(null);
    setMsgDip('');
  };

  const guardarDip = async () => {
    if (!form.nombre.trim()) { setMsgDip('err:El nombre del diplomado es requerido'); return; }
    setGuardandoDip(true); setMsgDip('');
    try {
      const payload = {
        nombre: form.nombre.trim(),
        objetivo_general: form.objetivo_general.trim(),
        objetivos: form.objetivos.map(o => o.trim()).filter(Boolean),
        programas: form.programas
          .map(p => ({ id: p.id, nombre: (p.nombre || '').trim(), duracion_semanas: p.duracion_semanas }))
          .filter(p => p.nombre),
      };
      if (editId) await API.put(`/diplomados/${editId}`, payload);
      else        await API.post('/diplomados', payload);
      await cargar();
      cerrarDip();
    } catch (e) {
      setMsgDip('err:' + (e.response?.data?.message || 'Error al guardar'));
    } finally {
      setGuardandoDip(false);
    }
  };

  const eliminarDip = async (id) => {
    try {
      await API.delete(`/diplomados/${id}`);
      setConfirmDel(null);
      if (openDipId === id) setOpenDipId(null);
      await cargar();
    } catch (e) { console.error(e); }
  };

  /* ── Reordenar programas dentro del diplomado abierto ── */
  const moverProgramaDip = async (idx, dir) => {
    if (!dipAbierto) return;
    const arr = [...dipAbierto.programas].sort((a, b) => a.orden - b.orden);
    const j = idx + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[idx], arr[j]] = [arr[j], arr[idx]];
    const ids = arr.map(p => p.id);
    try {
      await API.put(`/diplomados/${dipAbierto.id}/programas/orden`, { ids });
      await cargar();
    } catch (e) { console.error(e); }
  };

  /* ── Editar programa (panel operador) ── */
  const abrirEditarPrograma = (p) => {
    setProgEditId(p.id);
    setProgForm(programaToForm(p));
    setMsgProg('');
    setShowProg(true);
  };
  const cerrarProg = () => {
    setShowProg(false);
    setProgEditId(null);
    setProgForm(null);
    setMsgProg('');
  };

  const setProgFormField = (k, v) => setProgForm(f => ({ ...f, [k]: v }));
  const setProgDuracion = (val) => {
    const n = Math.max(1, Math.min(52, parseInt(val) || 1));
    setProgForm(f => ({ ...f, duracion_semanas: n, contenido: buildContenido(n, f.contenido) }));
  };
  const addObjProg = () => setProgForm(f => ({ ...f, objetivos: [...f.objetivos, ''] }));
  const setObjProg = (i, v) => setProgForm(f => {
    const arr = [...f.objetivos]; arr[i] = v;
    return { ...f, objetivos: arr };
  });
  const removeObjProg = (i) => setProgForm(f => {
    const arr = f.objetivos.filter((_, idx) => idx !== i);
    return { ...f, objetivos: arr.length ? arr : [''] };
  });
  const setContenidoProg = (semana_num, val) => setProgForm(f => ({
    ...f,
    contenido: f.contenido.map(c => c.semana_num === semana_num ? { ...c, contenido: val } : c),
  }));

  const guardarPrograma = async () => {
    if (!progForm.nombre.trim()) { setMsgProg('err:El nombre del programa es requerido'); return; }
    setGuardandoProg(true); setMsgProg('');
    try {
      const payload = {
        nombre: progForm.nombre.trim(),
        objetivo_general: progForm.objetivo_general.trim(),
        duracion_semanas: progForm.duracion_semanas,
        objetivos: progForm.objetivos.map(o => o.trim()).filter(Boolean),
        contenido: progForm.contenido,
      };
      await API.put(`/diplomados/programas/${progEditId}`, payload);
      await cargar();
      cerrarProg();
    } catch (e) {
      setMsgProg('err:' + (e.response?.data?.message || 'Error al guardar'));
    } finally {
      setGuardandoProg(false);
    }
  };

  /* ── Exámenes del diplomado ── */
  const abrirExamenes = (d) => {
    setExamDipId(d.id);
    const lista = [...(d.examenes || [])].sort((a, b) => a.orden - b.orden);
    setExamenes(lista.length ? lista.map(e => ({ id: e.id, nombre: e.nombre })) : [{ id: null, nombre: '' }]);
    setMsgExam('');
    setShowExam(true);
  };
  const cerrarExam = () => {
    setShowExam(false);
    setExamDipId(null);
    setMsgExam('');
  };
  const addExamen     = () => setExamenes(arr => [...arr, { id: null, nombre: '' }]);
  const setExamNombre = (i, v) => setExamenes(arr => {
    const nx = [...arr]; nx[i] = { ...nx[i], nombre: v };
    return nx;
  });
  const removeExamen  = (i) => setExamenes(arr => {
    const nx = arr.filter((_, idx) => idx !== i);
    return nx.length ? nx : [{ id: null, nombre: '' }];
  });
  const moveExamen    = (i, dir) => setExamenes(arr => {
    const nx = [...arr];
    const j = i + dir;
    if (j < 0 || j >= nx.length) return arr;
    [nx[i], nx[j]] = [nx[j], nx[i]];
    return nx;
  });
  const guardarExamenes = async () => {
    setGuardandoExam(true); setMsgExam('');
    try {
      const payload = {
        examenes: examenes
          .map(e => ({ id: e.id, nombre: (e.nombre || '').trim() }))
          .filter(e => e.nombre),
      };
      await API.put(`/diplomados/${examDipId}/examenes`, payload);
      await cargar();
      cerrarExam();
    } catch (e) {
      setMsgExam('err:' + (e.response?.data?.message || 'Error al guardar exámenes'));
    } finally {
      setGuardandoExam(false);
    }
  };

  return (
    <div className="admin-layout">
      <Sidebar />
      <div className="admin-content">
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1rem' }}>
          <h1>Gestión de Diplomados</h1>
          {puedeEditar && (
            <button className="btn-primary" onClick={abrirNuevo}>+ Nuevo Diplomado</button>
          )}
        </div>
        <p className="subtitle">
          Crea diplomados con sus programas (Windows, Word, etc.). Cada programa se edita por separado
          (objetivos, semanas, contenido). El orden de los programas se aplica en{' '}
          <strong>Notas Diplomados</strong> y <strong>Planificaciones</strong>.
        </p>

        {cargando ? (
          <div style={{ textAlign:'center', padding:'3rem', color:'#999' }}>Cargando...</div>
        ) : diplomados.length === 0 ? (
          <div className="dip-empty">
            <p>No hay diplomados registrados.</p>
            {puedeEditar && (
              <button className="btn-primary" onClick={abrirNuevo}>Agregar primer diplomado</button>
            )}
          </div>
        ) : (
          <div className="dip-grid">
            {diplomados.map(d => {
              const isOpen = openDipId === d.id;
              const programasOrden = [...(d.programas || [])].sort((a,b) => a.orden - b.orden);
              return (
                <div key={d.id} className={`dip-card${isOpen ? ' dip-card-open' : ''}`}>
                  <div className="dip-card-header">
                    <div>
                      <h3>{d.nombre}</h3>
                      <span className="dip-badge">
                        {programasOrden.length} programa{programasOrden.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <div className="dip-card-actions">
                      <button
                        className="btn-edit"
                        style={{ background:'#e3f2fd', color:'#1565c0' }}
                        onClick={() => navigate(`/admin/planificaciones?diplomado=${d.id}`)}
                        title="Ver planificaciones"
                      >
                        Planificaciones
                      </button>
                      {puedeEditar && (
                        <button
                          className="btn-edit"
                          style={{ background:'#fff8e1', color:'#e65100', borderColor:'#ffcc80' }}
                          onClick={() => abrirExamenes(d)}
                          title="Definir exámenes que aparecerán en Notas Diplomados"
                        >
                          Exámenes
                        </button>
                      )}
                      {puedeEditar && (
                        <button className="btn-edit" onClick={() => abrirEditar(d)}>Editar</button>
                      )}
                      {puedeEditar && (
                        <button className="btn-danger-sm" onClick={() => setConfirmDel(d)}>Eliminar</button>
                      )}
                    </div>
                  </div>

                  {d.objetivo_general && (
                    <div className="dip-section">
                      <strong>Objetivo General:</strong>
                      <p>{d.objetivo_general}</p>
                    </div>
                  )}

                  {d.objetivos?.length > 0 && (
                    <div className="dip-section">
                      <strong>Objetivos Específicos ({d.objetivos.length}):</strong>
                      <ul className="dip-comp-list">
                        {d.objetivos.map(o => <li key={o.id}>{o.descripcion}</li>)}
                      </ul>
                    </div>
                  )}

                  <div className="dip-section">
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                      <strong>Programas a impartir ({programasOrden.length}):</strong>
                      <button
                        className="dip-add-btn"
                        onClick={() => setOpenDipId(isOpen ? null : d.id)}
                        style={{ background: isOpen ? '#c5cae9' : '#e8eaf6' }}
                      >
                        {isOpen ? 'Cerrar panel' : 'Abrir panel'}
                      </button>
                    </div>

                    {!isOpen && programasOrden.length > 0 && (
                      <div className="dip-prog-chips">
                        {programasOrden.map((p, i) => (
                          <div key={p.id} className="dip-prog-chip">
                            <span className="dip-semana-num">{i + 1}</span>
                            <span>{p.nombre}</span>
                            <span className="dip-prog-chip-sem">{p.duracion_semanas}s</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {isOpen && (
                      <div className="dip-prog-panel">
                        {programasOrden.length === 0 ? (
                          <div style={{ color:'#888', fontSize:'0.85rem', padding:'0.5rem 0' }}>
                            Este diplomado todavía no tiene programas. Edítalo y agrégalos.
                          </div>
                        ) : programasOrden.map((p, i) => (
                          <div key={p.id} className="dip-prog-row">
                            <span className="dip-prog-orden">{i + 1}</span>
                            <div className="dip-prog-info">
                              <div className="dip-prog-name">{p.nombre}</div>
                              <div className="dip-prog-meta">
                                {p.duracion_semanas} semana{p.duracion_semanas !== 1 ? 's' : ''}
                                {p.objetivos?.length > 0 && ` · ${p.objetivos.length} objetivo${p.objetivos.length !== 1 ? 's' : ''}`}
                                {p.contenido?.length > 0 && ` · ${p.contenido.length} semana${p.contenido.length !== 1 ? 's' : ''} con contenido`}
                              </div>
                            </div>
                            <div className="dip-prog-acts">
                              {puedeEditar && (
                                <>
                                  <button className="dip-mat-btn" disabled={i === 0}
                                    onClick={() => moverProgramaDip(i, -1)} title="Subir">▲</button>
                                  <button className="dip-mat-btn" disabled={i === programasOrden.length - 1}
                                    onClick={() => moverProgramaDip(i, 1)} title="Bajar">▼</button>
                                  <button className="btn-edit" onClick={() => abrirEditarPrograma(p)}>Editar</button>
                                </>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* ── Exámenes del diplomado (lo que ven en Notas Diplomados) ── */}
                  <div className="dip-section">
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                      <strong>Exámenes ({d.examenes?.length || 0}):</strong>
                      {puedeEditar && (
                        <button
                          className="dip-add-btn"
                          style={{ background:'#fff3e0', color:'#e65100' }}
                          onClick={() => abrirExamenes(d)}
                          title="Editar y reordenar los exámenes que se evalúan en Notas Diplomados"
                        >
                          Editar exámenes
                        </button>
                      )}
                    </div>
                    {(d.examenes?.length || 0) === 0 ? (
                      <div style={{ color:'#999', fontSize:'0.78rem', fontStyle:'italic', marginTop:'0.25rem' }}>
                        Sin exámenes definidos. Pulsa <em>Editar exámenes</em> para agregarlos.
                      </div>
                    ) : (
                      <div className="dip-prog-chips" style={{ marginTop:'0.35rem' }}>
                        {[...d.examenes].sort((a,b) => a.orden - b.orden).map((e, i) => (
                          <div key={e.id} className="dip-prog-chip" style={{ background:'#fff3e0', borderColor:'#ffcc80' }}>
                            <span className="dip-semana-num" style={{ background:'#e65100' }}>{i + 1}</span>
                            <span>{e.nombre}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ─── Modal crear/editar diplomado ─── */}
        {showDip && (
          <div className="modal-overlay" onClick={e => e.target === e.currentTarget && cerrarDip()}>
            <div className="dip-modal">
              <div className="dip-modal-header">
                <h2>{editId ? 'Editar Diplomado' : 'Nuevo Diplomado'}</h2>
                <button className="modal-close" onClick={cerrarDip}>✕</button>
              </div>
              <div className="dip-modal-body">
                <div className="form-group">
                  <label>Nombre del Diplomado *</label>
                  <input
                    type="text"
                    value={form.nombre}
                    onChange={e => setField('nombre', e.target.value)}
                    placeholder="Ej: Técnico Operador"
                  />
                </div>

                <div className="form-group">
                  <label>Objetivo General</label>
                  <textarea
                    rows={3}
                    value={form.objetivo_general}
                    onChange={e => setField('objetivo_general', e.target.value)}
                    placeholder="Describe el objetivo general del diplomado..."
                  />
                </div>

                <div className="form-group">
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'0.4rem' }}>
                    <label style={{ margin: 0 }}>Objetivos Específicos</label>
                    <button type="button" className="dip-add-btn" onClick={addObjetivo}>+ Agregar</button>
                  </div>
                  <div className="dip-comp-inputs">
                    {form.objetivos.map((o, i) => (
                      <div key={i} className="dip-comp-row">
                        <span className="dip-comp-num">{i + 1}.</span>
                        <input
                          type="text"
                          value={o}
                          onChange={e => setObjetivo(i, e.target.value)}
                          placeholder={`Objetivo específico ${i + 1}`}
                        />
                        {form.objetivos.length > 1 && (
                          <button type="button" className="dip-remove-btn" onClick={() => removeObjetivo(i)}>✕</button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="form-group">
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'0.4rem' }}>
                    <label style={{ margin: 0 }}>Programas a impartir (en orden)</label>
                    <button type="button" className="dip-add-btn" onClick={addPrograma}>+ Agregar programa</button>
                  </div>
                  <p style={{ fontSize:'0.75rem', color:'#777', margin:'0 0 0.5rem' }}>
                    Define los programas (ej. Windows, Word, Publisher...) y su duración.
                    Para editar el contenido detallado de cada uno usa <em>Abrir panel → Editar</em> después de guardar.
                  </p>
                  <div className="dip-comp-inputs">
                    {form.programas.map((p, i) => (
                      <div key={i} className="dip-prog-form-row">
                        <span className="dip-mat-num">{i + 1}.</span>
                        <input
                          type="text"
                          value={p.nombre}
                          onChange={e => setProgField(i, 'nombre', e.target.value)}
                          placeholder={`Programa ${i + 1}`}
                          style={{ flex: 2 }}
                        />
                        <input
                          type="number" min={1} max={52}
                          value={p.duracion_semanas}
                          onChange={e => setProgField(i, 'duracion_semanas', e.target.value)}
                          style={{ width: 70 }}
                          title="Semanas"
                        />
                        <span style={{ fontSize:'0.72rem', color:'#888' }}>sem</span>
                        <button type="button" className="dip-mat-btn" disabled={i === 0}
                          onClick={() => moveProgramaForm(i, -1)} title="Subir">▲</button>
                        <button type="button" className="dip-mat-btn" disabled={i === form.programas.length - 1}
                          onClick={() => moveProgramaForm(i, 1)} title="Bajar">▼</button>
                        {form.programas.length > 1 && (
                          <button type="button" className="dip-mat-btn del" onClick={() => removePrograma(i)} title="Quitar">✕</button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {msgDip.startsWith('err:') && <div className="msg-err">{msgDip.slice(4)}</div>}
              </div>
              <div className="dip-modal-footer">
                <button className="btn-cancel" onClick={cerrarDip} disabled={guardandoDip}>Cancelar</button>
                <button className="btn-primary" onClick={guardarDip} disabled={guardandoDip}>
                  {guardandoDip ? 'Guardando...' : editId ? 'Actualizar' : 'Guardar Diplomado'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ─── Modal editar programa (panel operador) ─── */}
        {showProg && progForm && (
          <div className="modal-overlay" onClick={e => e.target === e.currentTarget && cerrarProg()}>
            <div className="dip-modal">
              <div className="dip-modal-header">
                <h2>Editar Programa</h2>
                <button className="modal-close" onClick={cerrarProg}>✕</button>
              </div>
              <div className="dip-modal-body">
                <div className="dip-row2">
                  <div className="form-group" style={{ flex: 2 }}>
                    <label>Nombre del Programa *</label>
                    <input
                      type="text"
                      value={progForm.nombre}
                      onChange={e => setProgFormField('nombre', e.target.value)}
                      placeholder="Ej: Windows 10"
                    />
                  </div>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label>Duración (semanas) *</label>
                    <input
                      type="number" min={1} max={52}
                      value={progForm.duracion_semanas}
                      onChange={e => setProgDuracion(e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>Objetivo General del Programa</label>
                  <textarea
                    rows={3}
                    value={progForm.objetivo_general}
                    onChange={e => setProgFormField('objetivo_general', e.target.value)}
                    placeholder="Objetivo general que persigue este programa..."
                  />
                </div>

                <div className="form-group">
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'0.4rem' }}>
                    <label style={{ margin: 0 }}>Objetivos Específicos del Programa</label>
                    <button type="button" className="dip-add-btn" onClick={addObjProg}>+ Agregar</button>
                  </div>
                  <div className="dip-comp-inputs">
                    {progForm.objetivos.map((o, i) => (
                      <div key={i} className="dip-comp-row">
                        <span className="dip-comp-num">{i + 1}.</span>
                        <input
                          type="text"
                          value={o}
                          onChange={e => setObjProg(i, e.target.value)}
                          placeholder={`Objetivo ${i + 1}`}
                        />
                        {progForm.objetivos.length > 1 && (
                          <button type="button" className="dip-remove-btn" onClick={() => removeObjProg(i)}>✕</button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="form-group">
                  <label>Contenido por Semana ({progForm.duracion_semanas} semana{progForm.duracion_semanas !== 1 ? 's' : ''})</label>
                  <div className="dip-contenido-grid">
                    {progForm.contenido.map(c => (
                      <div key={c.semana_num} className="dip-contenido-item">
                        <label className="dip-semana-label">
                          Semana {c.semana_num}
                          {c.semana_num === progForm.duracion_semanas && (
                            <span className="dip-examen-badge">EXAMEN</span>
                          )}
                        </label>
                        <textarea
                          rows={2}
                          value={c.contenido}
                          onChange={e => setContenidoProg(c.semana_num, e.target.value)}
                          placeholder={c.semana_num === progForm.duracion_semanas ? 'Examen final' : `Tema de la semana ${c.semana_num}`}
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {msgProg.startsWith('err:') && <div className="msg-err">{msgProg.slice(4)}</div>}
              </div>
              <div className="dip-modal-footer">
                <button className="btn-cancel" onClick={cerrarProg} disabled={guardandoProg}>Cancelar</button>
                <button className="btn-primary" onClick={guardarPrograma} disabled={guardandoProg}>
                  {guardandoProg ? 'Guardando...' : 'Guardar Programa'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ─── Modal Exámenes del Diplomado ─── */}
        {showExam && (
          <div className="modal-overlay" onClick={e => e.target === e.currentTarget && cerrarExam()}>
            <div className="dip-modal" style={{ width: 540 }}>
              <div className="dip-modal-header">
                <h2>Exámenes del Diplomado</h2>
                <button className="modal-close" onClick={cerrarExam}>✕</button>
              </div>
              <div className="dip-modal-body">
                <p style={{ fontSize:'0.82rem', color:'#666', margin:'0 0 0.5rem' }}>
                  Estos son los exámenes que aparecerán como <strong>columnas en Notas Diplomados</strong>.
                  El orden definido aquí es el orden en que se mostrarán las columnas.
                </p>
                <div className="form-group">
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'0.4rem' }}>
                    <label style={{ margin: 0 }}>Lista de exámenes</label>
                    <button type="button" className="dip-add-btn" onClick={addExamen}>+ Agregar examen</button>
                  </div>
                  <div className="dip-comp-inputs">
                    {examenes.map((e, i) => (
                      <div key={i} className="dip-prog-form-row">
                        <span className="dip-mat-num">{i + 1}.</span>
                        <input
                          type="text"
                          value={e.nombre}
                          onChange={ev => setExamNombre(i, ev.target.value)}
                          placeholder={`Examen ${i + 1} (ej. Windows, Word, Parcial, Examen Final...)`}
                          style={{ flex: 1 }}
                        />
                        <button type="button" className="dip-mat-btn" disabled={i === 0}
                          onClick={() => moveExamen(i, -1)} title="Subir">▲</button>
                        <button type="button" className="dip-mat-btn" disabled={i === examenes.length - 1}
                          onClick={() => moveExamen(i, 1)} title="Bajar">▼</button>
                        {examenes.length > 1 && (
                          <button type="button" className="dip-mat-btn del" onClick={() => removeExamen(i)} title="Quitar">✕</button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
                {msgExam.startsWith('err:') && <div className="msg-err">{msgExam.slice(4)}</div>}
              </div>
              <div className="dip-modal-footer">
                <button className="btn-cancel" onClick={cerrarExam} disabled={guardandoExam}>Cancelar</button>
                <button className="btn-primary" onClick={guardarExamenes} disabled={guardandoExam}>
                  {guardandoExam ? 'Guardando...' : 'Guardar exámenes'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ─── Confirmar eliminación ─── */}
        {confirmDel && (
          <div className="modal-overlay">
            <div className="modal-confirm">
              <h3>Eliminar Diplomado</h3>
              <p>¿Deseas eliminar <strong>{confirmDel.nombre}</strong>?</p>
              <p style={{ fontSize:'0.85rem', color:'#666' }}>
                El diplomado y sus programas dejarán de mostrarse. Los alumnos
                ya inscritos conservan su asignación.
              </p>
              <div style={{ display:'flex', gap:'0.75rem', justifyContent:'flex-end', marginTop:'1rem' }}>
                <button className="btn-cancel" onClick={() => setConfirmDel(null)}>Cancelar</button>
                <button className="btn-danger" onClick={() => eliminarDip(confirmDel.id)}>Eliminar</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
