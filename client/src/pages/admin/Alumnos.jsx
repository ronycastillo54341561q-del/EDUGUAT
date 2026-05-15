import { useState, useEffect, useCallback } from 'react';
import Sidebar from '../../components/Sidebar';
import ScrollableTable from '../../components/ScrollableTable';
import API from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import { can } from '../../lib/permissions';
import './admin.css';

const uniq = (arr, k) => [...new Set(arr.map(a => a[k]).filter(Boolean))].sort();

const normalizar = s =>
  (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

const CODIGO_REGEX = /^[A-Z][0-9]{3}[A-Z]{3}$/;

// La clave real se autogenera en el backend; aquí sólo mostramos un placeholder
// visual (el correlativo definitivo lo asigna la BD bajo bloqueo transaccional).
const previewCredenciales = (form) => {
  const primerNombre = normalizar(form.nombre.trim().split(/\s+/)[0]);
  const anio = form.fecha_inicio ? new Date(form.fecha_inicio + 'T00:00:00').getFullYear() : new Date().getFullYear();
  return {
    usuario: primerNombre ? `${primerNombre}<clave>` : '',
    password: primerNombre ? `${primerNombre}<clave>${anio}` : '',
  };
};

const camposIniciales = {
  codigo_estudiante: '', nombre: '', apellido: '', fecha_inicio: '',
  fecha_nacimiento: '', encargado: '', telefono: '', diplomado: '',
  tac: '', asesor: '', direccion: '', establecimiento: '', observaciones: '',
  dia_clases1: 'lunes', dia_clases2: '', horario: '', laboratorio: '',
  estado: 'activo', cuota_mensual: ''
};

// Etiqueta combinada para los días/horario del alumno (ej. "lunes-martes 10:00 a 11:30")
const labelHorarioAlumno = (a) => {
  const dias = a.dia_clases2 ? `${a.dia_clases1}-${a.dia_clases2}` : (a.dia_clases1 || '');
  const horario = a.horario || '';
  if (!dias && !horario) return '';
  return [dias, horario].filter(Boolean).join(' ');
};

// Identificador único del horario del alumno (para usar como value de select y para filtros)
const horarioKey = (a) =>
  `${a.dia_clases1 || ''}|${a.dia_clases2 || ''}|${a.horario || ''}`;

// Texto que se persiste como "horario" del alumno (parte de horas, sin el día)
const fmtHorario = (h) => `${h.hora_inicio} a ${h.hora_fin}`;

const fmtFecha = d => d ? String(d).slice(0,10) : '—';

const COL_DEFAULTS = {
  no:44, clave:90, alumno:200, cod:95, encargado:150, tel:110, email:175,
  finicio:105, fnac:105, dip:150, tac:80, asesor:140, hor:90, lab:80, dias:110,
  est:80, cuota:75, dir:170, estab:150, obs:160, acc:145
};

const Alumnos = () => {
  const { usuario } = useAuth();
  const puedeEditar = can(usuario?.rol, 'alumnos', 'edit');
  const esAdmin     = usuario?.rol === 'admin';
  const [alumnos, setAlumnos]             = useState([]);
  const [busqueda, setBusqueda]           = useState('');
  const [modal, setModal]                 = useState(false);
  const [editando, setEditando]           = useState(null);
  const [form, setForm]                   = useState(camposIniciales);
  const [cargando, setCargando]           = useState(false);
  const [error, setError]                 = useState('');
  const [credCreadas, setCredCreadas]     = useState(null);
  const [modalPass, setModalPass]         = useState(null);
  const [nuevaPass, setNuevaPass]         = useState('');
  const [guardandoPass, setGuardandoPass] = useState(false);
  const [msgPass, setMsgPass]             = useState('');

  const [colWidths, setColWidths] = useState(() => {
    try { return { ...COL_DEFAULTS, ...JSON.parse(localStorage.getItem('alum_cols') || '{}') }; }
    catch { return COL_DEFAULTS; }
  });

  useEffect(() => { localStorage.setItem('alum_cols', JSON.stringify(colWidths)); }, [colWidths]);

  const startResize = useCallback((col, e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = colWidths[col];
    const onMove = mv => setColWidths(prev => ({ ...prev, [col]: Math.max(40, startW + mv.clientX - startX) }));
    const onUp   = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
  }, [colWidths]);

  const [filtros,          setFiltros]          = useState({ horarios: [], laboratorios: [], dias: [], horarios_combinados: [] });
  const [catalogos,        setCatalogos]        = useState({ horarios: [], laboratorios: [], establecimientos: [], cuotas: [], diplomados: [] });
  const [fEstado,          setFEstado]          = useState(() => localStorage.getItem('alum_estado')  ?? 'activo');
  const [fHorarioCombo,    setFHorarioCombo]    = useState(() => localStorage.getItem('alum_horario_combo') ?? '');
  const [fLaboratorio,     setFLaboratorio]     = useState(() => localStorage.getItem('alum_lab')     ?? '');
  const [fTac,             setFTac]             = useState(() => localStorage.getItem('alum_tac')     ?? '');
  const [fDiplomado,       setFDiplomado]       = useState(() => localStorage.getItem('alum_dip')     ?? '');
  const [fEstablecimiento, setFEstablecimiento] = useState(() => localStorage.getItem('alum_estab')   ?? '');
  const [fCodigoEstado,    setFCodigoEstado]    = useState(() => localStorage.getItem('alum_codest')  ?? '');

  useEffect(() => { localStorage.setItem('alum_estado',        fEstado);          }, [fEstado]);
  useEffect(() => { localStorage.setItem('alum_horario_combo', fHorarioCombo);    }, [fHorarioCombo]);
  useEffect(() => { localStorage.setItem('alum_lab',           fLaboratorio);     }, [fLaboratorio]);
  useEffect(() => { localStorage.setItem('alum_tac',           fTac);             }, [fTac]);
  useEffect(() => { localStorage.setItem('alum_dip',           fDiplomado);       }, [fDiplomado]);
  useEffect(() => { localStorage.setItem('alum_estab',         fEstablecimiento); }, [fEstablecimiento]);
  useEffect(() => { localStorage.setItem('alum_codest',        fCodigoEstado);    }, [fCodigoEstado]);

  useEffect(() => {
    API.get('/asistencia/filtros').then(({ data }) => setFiltros(data)).catch(console.error);
    API.get('/catalogos/todos').then(({ data }) => setCatalogos(data)).catch(console.error);
  }, []);

  useEffect(() => { cargarAlumnos(); }, []);

  const cargarAlumnos = async () => {
    try {
      const { data } = await API.get('/alumnos');
      setAlumnos(data);
    } catch (err) { console.error(err); }
  };

  // Sólo derivamos las opciones de los dropdowns desde los alumnos que
  // coinciden con el estado seleccionado. Antes mostrábamos también valores
  // pertenecientes a alumnos retirados aunque el usuario tuviera el filtro
  // "Activos", lo que llevaba a elegir un horario que terminaba devolviendo
  // 0 resultados.
  const alumnosParaFiltros = fEstado
    ? alumnos.filter(a => a.estado === fEstado)
    : alumnos;

  const tacs             = uniq(alumnosParaFiltros, 'tac');
  const diplomados       = uniq(alumnosParaFiltros, 'diplomado');
  const establecimientos = uniq(alumnosParaFiltros, 'establecimiento');
  const laboratoriosDelEstado = new Set(uniq(alumnosParaFiltros, 'laboratorio'));

  // Lista única de horarios combinados (a partir de los alumnos existentes)
  const horariosCombinados = (() => {
    const seen = new Map();
    for (const a of alumnosParaFiltros) {
      const key = horarioKey(a);
      const lbl = labelHorarioAlumno(a);
      if (lbl && !seen.has(key)) seen.set(key, lbl);
    }
    return [...seen.entries()]
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  })();

  const alumnosFiltrados = alumnos.filter(a => {
    if (fEstado          && a.estado          !== fEstado)                          return false;
    if (fHorarioCombo    && horarioKey(a)     !== fHorarioCombo)                    return false;
    if (fLaboratorio     && a.laboratorio     !== fLaboratorio)                     return false;
    if (fTac             && a.tac             !== fTac)                             return false;
    if (fDiplomado       && a.diplomado       !== fDiplomado)                       return false;
    if (fEstablecimiento && a.establecimiento !== fEstablecimiento)                 return false;
    if (fCodigoEstado === 'ingresado' && !a.codigo_estudiante)                      return false;
    if (fCodigoEstado === 'sin'        && a.codigo_estudiante)                      return false;
    if (busqueda && !`${a.nombre} ${a.apellido} ${a.clave||''} ${a.codigo_estudiante||''} ${a.direccion||''} ${a.establecimiento||''}`.toLowerCase().includes(busqueda.toLowerCase())) return false;
    return true;
  });

  const abrirModal = (alumno = null) => {
    setError('');
    setCredCreadas(null);
    if (alumno) {
      setEditando(alumno.id);
      setForm({
        ...alumno,
        fecha_inicio: alumno.fecha_inicio?.split('T')[0] || '',
        fecha_nacimiento: alumno.fecha_nacimiento?.split('T')[0] || '',
        dia_clases2: alumno.dia_clases2 || '',
      });
    } else {
      setEditando(null);
      setForm(camposIniciales);
    }
    setModal(true);
  };

  const cerrarModal = () => {
    setModal(false);
    setEditando(null);
    setForm(camposIniciales);
    setCredCreadas(null);
  };

  const handleChange = e => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async e => {
    e.preventDefault();
    setCargando(true);
    setError('');
    try {
      if (editando) {
        await API.put(`/alumnos/${editando}`, form);
        await cargarAlumnos();
        cerrarModal();
      } else {
        const { data } = await API.post('/alumnos', form);
        await cargarAlumnos();
        setEditando('done');
        setCredCreadas({ usuario: data.usuario, password: data.password, clave: data.clave, codigo_estudiante: data.codigo_estudiante });
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Error al guardar');
    } finally {
      setCargando(false);
    }
  };

  const cambiarPassword = async () => {
    if (!nuevaPass) return;
    setGuardandoPass(true);
    setMsgPass('');
    try {
      await API.put(`/alumnos/${modalPass.id}/password`, { password: nuevaPass });
      setMsgPass('ok');
      setNuevaPass('');
      setTimeout(() => { setModalPass(null); setMsgPass(''); }, 1500);
    } catch (err) {
      setMsgPass(err.response?.data?.message || 'Error al cambiar contraseña');
    } finally {
      setGuardandoPass(false);
    }
  };

  const toggleEstado = async (alumno) => {
    const nuevoEstado = alumno.estado === 'activo' ? 'retirado' : 'activo';
    const msg = nuevoEstado === 'retirado'
      ? `¿Desactivar a ${alumno.nombre} ${alumno.apellido}?`
      : `¿Reactivar a ${alumno.nombre} ${alumno.apellido}?`;
    if (!confirm(msg)) return;
    try {
      await API.put(`/alumnos/${alumno.id}`, { ...alumno, estado: nuevoEstado });
      cargarAlumnos();
    } catch {
      alert('Error al cambiar estado del alumno');
    }
  };

  return (
    <div className="admin-layout">
      <Sidebar />
      <div className="admin-content">
        <h1>👨‍🎓 Gestión de Alumnos</h1>
        <p className="subtitle">Administra el listado completo de estudiantes</p>

        <div className="asist-filtros">
          <select value={fEstado} onChange={e => setFEstado(e.target.value)}>
            <option value="activo">Activos</option>
            <option value="retirado">Retirados</option>
            <option value="">Todos</option>
          </select>
          {horariosCombinados.length > 0 && (
            <select value={fHorarioCombo} onChange={e => setFHorarioCombo(e.target.value)}>
              <option value="">Todos los horarios</option>
              {horariosCombinados.map(h => <option key={h.key} value={h.key}>{h.label}</option>)}
            </select>
          )}
          <select value={fLaboratorio} onChange={e => setFLaboratorio(e.target.value)}>
            <option value="">Todos los laboratorios</option>
            {filtros.laboratorios
              .filter(l => laboratoriosDelEstado.has(l))
              .map(l => <option key={l} value={l}>{l}</option>)}
          </select>
          {tacs.length > 0 && (
            <select value={fTac} onChange={e => setFTac(e.target.value)}>
              <option value="">Todos los TAC</option>
              {tacs.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          )}
          {diplomados.length > 0 && (
            <select value={fDiplomado} onChange={e => setFDiplomado(e.target.value)}>
              <option value="">Todos los diplomados</option>
              {diplomados.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          )}
          {establecimientos.length > 0 && (
            <select value={fEstablecimiento} onChange={e => setFEstablecimiento(e.target.value)}>
              <option value="">Todos los establecimientos</option>
              {establecimientos.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
          )}
          <select value={fCodigoEstado} onChange={e => setFCodigoEstado(e.target.value)}>
            <option value="">Código (todos)</option>
            <option value="ingresado">Con código</option>
            <option value="sin">Sin código</option>
          </select>
        </div>

        <div className="table-container">
          <div className="table-header">
            <input
              className="search-input"
              type="text"
              placeholder="🔍 Buscar por clave/código/nombre..."
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
            />
            {puedeEditar && (
              <button className="btn-primary" onClick={() => abrirModal()}>
                + Nuevo Alumno
              </button>
            )}
            <button
              title="Restablecer ancho de columnas"
              style={{ padding: '0.45rem 0.75rem', fontSize: '0.78rem', background: '#f5f5f5', border: '1.5px solid #e0e0e0', borderRadius: 7, cursor: 'pointer', color: '#666' }}
              onClick={() => setColWidths(COL_DEFAULTS)}>
              ↔ Resetear columnas
            </button>
          </div>

          <ScrollableTable>
            <table className="recibo-grid alumnos-grid" style={{ tableLayout: 'fixed', width: 'max-content', minWidth: '100%' }}>
              <colgroup>
                {Object.entries(colWidths).map(([k, w]) => <col key={k} style={{ width: w }} />)}
              </colgroup>
              <thead>
                <tr>
                  {(() => {
                    const frozenLeft = {
                      no: 0,
                      clave: colWidths.no,
                      alumno: colWidths.no + colWidths.clave,
                    };
                    return [
                      ['no',       'No.',             'center'],
                      ['clave',    'Clave',           'left'],
                      ['alumno',   'Alumno',          'left'],
                      ['cod',      'Código',          'left'],
                      ['encargado','Encargado',       'left'],
                      ['tel',      'Teléfono',        'left'],
                      ['email',    'Email',           'left'],
                      ['finicio',  'Fecha Inicio',    'left'],
                      ['fnac',     'Fecha Nac.',      'left'],
                      ['dip',      'Diplomado',       'left'],
                      ['tac',      'TAC',             'left'],
                      ['asesor',   'Asesor',          'left'],
                      ['hor',      'Horario',         'left'],
                      ['lab',      'Laboratorio',     'left'],
                      ['dias',     'Días de Clase',   'left'],
                      ['est',      'Estado',          'center'],
                      ['cuota',    'Cuota',           'right'],
                      ['dir',      'Dirección',       'left'],
                      ['estab',    'Establecimiento', 'left'],
                      ['obs',      'Observaciones',   'left'],
                      ['acc',      'Acciones',        'center'],
                    ].map(([col, label, align]) => (
                      <th key={col} style={{ textAlign: align, ...(col in frozenLeft ? { left: frozenLeft[col] } : {}) }}>
                        {label}
                        <div className="col-resizer" onMouseDown={e => startResize(col, e)} />
                      </th>
                    ));
                  })()}
                </tr>
              </thead>
              <tbody>
                {alumnosFiltrados.length === 0 ? (
                  <tr>
                    <td colSpan="21" style={{ textAlign: 'center', padding: '2rem', color: '#999' }}>
                      No hay alumnos registrados
                    </td>
                  </tr>
                ) : (
                  alumnosFiltrados.map((a, idx) => (
                    <tr key={a.id}>
                      <td className="rc-no" style={{ left: 0 }}>{idx + 1}</td>
                      <td style={{ left: colWidths.no }}><strong style={{ color: '#1a237e' }}>{a.clave}</strong></td>
                      <td style={{ left: colWidths.no + colWidths.clave }}>{a.nombre} {a.apellido}</td>
                      <td>
                        {a.codigo_estudiante ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <strong style={{ fontFamily: 'monospace', color: '#1a237e' }}>{a.codigo_estudiante}</strong>
                          </span>
                        ) : (
                          <span style={{ display: 'inline-block', padding: '1px 8px', borderRadius: 10, fontSize: '0.7rem', fontWeight: 600, background: '#fff3e0', color: '#e65100' }}>sin código</span>
                        )}
                      </td>
                      <td>{a.encargado || '—'}</td>
                      <td>{a.telefono || '—'}</td>
                      <td>{a.email || '—'}</td>
                      <td>{fmtFecha(a.fecha_inicio)}</td>
                      <td>{fmtFecha(a.fecha_nacimiento)}</td>
                      <td>{a.diplomado || '—'}</td>
                      <td>{a.tac || '—'}</td>
                      <td>{a.asesor || '—'}</td>
                      <td>{a.horario || '—'}</td>
                      <td>{a.laboratorio || '—'}</td>
                      <td>{a.dia_clases2 ? `${a.dia_clases1}-${a.dia_clases2}` : (a.dia_clases1 || '—')}</td>
                      <td style={{ textAlign: 'center' }}>
                        <span className={`badge badge-${a.estado}`}>{a.estado}</span>
                      </td>
                      <td style={{ textAlign: 'right', paddingRight: 10, whiteSpace: 'nowrap' }}>
                        Q{parseFloat(a.cuota_mensual || 0).toFixed(2)}
                      </td>
                      <td>{a.direccion || '—'}</td>
                      <td>{a.establecimiento || '—'}</td>
                      <td>{a.observaciones || '—'}</td>
                      <td style={{ textAlign: 'center' }}>
                        <div className="td-acciones">
                          {puedeEditar && (
                            <button className="btn-edit" onClick={() => abrirModal(a)}>Editar</button>
                          )}
                          {esAdmin && (
                            <button className="btn-edit" style={{ background: '#e3f2fd', color: '#1565c0' }} onClick={() => { setModalPass(a); setNuevaPass(''); setMsgPass(''); }}>Contraseña</button>
                          )}
                          {esAdmin && (
                            <button
                              className={a.estado === 'activo' ? 'btn-danger' : 'btn-edit'}
                              onClick={() => toggleEstado(a)}
                            >
                              {a.estado === 'activo' ? 'Desactivar' : 'Activar'}
                            </button>
                          )}
                          {!puedeEditar && !esAdmin && (
                            <span style={{ color: '#999', fontSize: '0.78rem' }}>Solo lectura</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </ScrollableTable>
        </div>
      </div>

      {modalPass && (
        <div className="modal-overlay" onClick={() => setModalPass(null)}>
          <div className="modal" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Cambiar Contraseña</h2>
              <button className="modal-close" onClick={() => setModalPass(null)}>✕</button>
            </div>
            <div style={{ padding: '1.25rem' }}>
              <p style={{ fontSize: '0.88rem', color: '#555', marginBottom: '1rem' }}>
                Alumno: <strong>{modalPass.nombre} {modalPass.apellido}</strong>
              </p>
              <div className="form-group">
                <label>Nueva contraseña</label>
                <input
                  type="text"
                  value={nuevaPass}
                  onChange={e => setNuevaPass(e.target.value)}
                  placeholder="Nueva contraseña"
                  autoFocus
                />
              </div>
              {msgPass === 'ok' && <p style={{ color: '#2e7d32', fontSize: '0.85rem' }}>Contraseña actualizada</p>}
              {msgPass && msgPass !== 'ok' && <p style={{ color: '#e53935', fontSize: '0.85rem' }}>{msgPass}</p>}
              <div className="modal-actions" style={{ marginTop: '1rem' }}>
                <button className="btn-cancel" onClick={() => setModalPass(null)}>Cancelar</button>
                <button className="btn-primary" onClick={cambiarPassword} disabled={guardandoPass || !nuevaPass}>
                  {guardandoPass ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {modal && (
        <div className="modal-overlay" onClick={cerrarModal}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editando && editando !== 'done' ? 'Editar Alumno' : credCreadas ? 'Alumno Creado' : 'Nuevo Alumno'}</h2>
              <button className="modal-close" onClick={cerrarModal}>✕</button>
            </div>
            <form onSubmit={handleSubmit} className="modal-form">
              {credCreadas ? (
                <div style={{ background: '#e8f5e9', border: '1.5px solid #a5d6a7', borderRadius: 8, padding: '1.25rem', margin: '0.5rem 0' }}>
                  <p style={{ fontWeight: 700, color: '#2e7d32', marginBottom: 8 }}>Alumno creado correctamente</p>
                  <p style={{ fontSize: '0.9rem', color: '#333', marginBottom: 4 }}>Clave: <strong style={{ fontFamily: 'monospace' }}>{credCreadas.clave}</strong></p>
                  {credCreadas.codigo_estudiante && (
                    <p style={{ fontSize: '0.9rem', color: '#333', marginBottom: 4 }}>Código: <strong style={{ fontFamily: 'monospace' }}>{credCreadas.codigo_estudiante}</strong></p>
                  )}
                  <p style={{ fontSize: '0.9rem', color: '#333', marginBottom: 4 }}>Usuario: <strong>{credCreadas.usuario}</strong></p>
                  <p style={{ fontSize: '0.9rem', color: '#333', marginBottom: 4 }}>Contraseña: <strong>{credCreadas.password}</strong></p>
                  <p style={{ fontSize: '0.78rem', color: '#777', marginTop: 6 }}>Anota estas credenciales antes de cerrar.</p>
                </div>
              ) : (
                <div className="form-grid">
                  <div className="form-group">
                    <label>Clave (auto)</label>
                    <input
                      readOnly
                      value={editando && editando !== 'done' ? (form.clave || '—') : '(se generará al guardar)'}
                      style={{ background: '#f5f5f5', color: '#555', fontFamily: 'monospace' }}
                    />
                  </div>
                  <div className="form-group">
                    <label>Código de estudiante (A000AAA, opcional)</label>
                    <input
                      name="codigo_estudiante"
                      value={form.codigo_estudiante || ''}
                      onChange={e => setForm({ ...form, codigo_estudiante: e.target.value.toUpperCase() })}
                      maxLength={7}
                      placeholder="A000AAA"
                      pattern="[A-Z][0-9]{3}[A-Z]{3}"
                      title="Formato: una letra, tres dígitos, tres letras (ej. A123XYZ)"
                      style={{ fontFamily: 'monospace', textTransform: 'uppercase' }}
                    />
                    {form.codigo_estudiante && !CODIGO_REGEX.test(form.codigo_estudiante) && (
                      <p style={{ fontSize: '0.72rem', color: '#e53935', margin: '4px 0 0' }}>
                        Formato inválido. Esperado: letra + 3 dígitos + 3 letras (A000AAA).
                      </p>
                    )}
                  </div>
                  <div className="form-group">
                    <label>Nombre *</label>
                    <input name="nombre" value={form.nombre} onChange={handleChange} required />
                  </div>
                  <div className="form-group">
                    <label>Apellido *</label>
                    <input name="apellido" value={form.apellido} onChange={handleChange} required />
                  </div>
                  <div className="form-group">
                    <label>Encargado</label>
                    <input name="encargado" value={form.encargado} onChange={handleChange} />
                  </div>
                  <div className="form-group">
                    <label>Teléfono</label>
                    <input name="telefono" value={form.telefono} onChange={handleChange} />
                  </div>
                  <div className="form-group">
                    <label>Fecha de inicio</label>
                    <input type="date" name="fecha_inicio" value={form.fecha_inicio} onChange={handleChange} />
                  </div>
                  <div className="form-group">
                    <label>Fecha de nacimiento</label>
                    <input type="date" name="fecha_nacimiento" value={form.fecha_nacimiento} onChange={handleChange} />
                  </div>
                  <div className="form-group">
                    <label>Diplomado</label>
                    <select name="diplomado" value={form.diplomado} onChange={handleChange}>
                      <option value="">— Selecciona —</option>
                      {catalogos.diplomados?.map(d => <option key={d.id} value={d.nombre}>{d.nombre}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>TAC</label>
                    <input name="tac" value={form.tac} onChange={handleChange} />
                  </div>
                  <div className="form-group">
                    <label>Asesor</label>
                    <input name="asesor" value={form.asesor || ''} onChange={handleChange} placeholder="Nombre del asesor" />
                  </div>
                  <div className="form-group">
                    <label>Establecimiento</label>
                    <select name="establecimiento" value={form.establecimiento} onChange={handleChange}>
                      <option value="">— Selecciona —</option>
                      {catalogos.establecimientos?.map(e => <option key={e.id} value={e.nombre}>{e.nombre}</option>)}
                    </select>
                  </div>
                  <div className="form-group full-width">
                    <label>Horario de Clases *</label>
                    {(() => {
                      const matchCat = catalogos.horarios?.find(h =>
                        h.dia1 === form.dia_clases1 &&
                        (h.dia2 || '') === (form.dia_clases2 || '') &&
                        fmtHorario(h) === form.horario
                      );
                      const value = matchCat ? String(matchCat.id) : '';
                      return (
                        <select
                          value={value}
                          onChange={e => {
                            const id = e.target.value;
                            if (!id) { setForm({ ...form, dia_clases1: 'lunes', dia_clases2: '', horario: '' }); return; }
                            const h = catalogos.horarios.find(x => String(x.id) === id);
                            if (!h) return;
                            setForm({
                              ...form,
                              dia_clases1: h.dia1,
                              dia_clases2: h.dia2 || '',
                              horario:     fmtHorario(h),
                            });
                          }}
                          required
                        >
                          <option value="">— Selecciona un horario disponible —</option>
                          {catalogos.horarios?.map(h => (
                            <option key={h.id} value={h.id}>
                              {h.dia2 ? `${h.dia1}-${h.dia2}` : h.dia1} {h.hora_inicio} a {h.hora_fin}
                            </option>
                          ))}
                        </select>
                      );
                    })()}
                    <p style={{ fontSize: '0.72rem', color: '#888', margin: '4px 0 0' }}>
                      Los horarios se gestionan desde el panel de Configuración. Cambios futuros no afectarán al alumno actual.
                    </p>
                  </div>
                  <div className="form-group">
                    <label>Laboratorio</label>
                    <select name="laboratorio" value={form.laboratorio} onChange={handleChange}>
                      <option value="">— Selecciona —</option>
                      {catalogos.laboratorios?.map(l => <option key={l.id} value={l.nombre}>{l.nombre}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Estado</label>
                    <select name="estado" value={form.estado} onChange={handleChange}>
                      <option value="activo">Activo</option>
                      <option value="retirado">Retirado</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Cuota mensual (Q) *</label>
                    {catalogos.cuotas?.length > 0 ? (
                      <select name="cuota_mensual" value={form.cuota_mensual} onChange={handleChange} required>
                        <option value="">— Selecciona una cuota —</option>
                        {catalogos.cuotas.map(c => (
                          <option key={c.id} value={c.monto}>
                            Q{parseFloat(c.monto).toFixed(2)}{c.descripcion ? ` — ${c.descripcion}` : ''}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input type="number" name="cuota_mensual" value={form.cuota_mensual} onChange={handleChange} required />
                    )}
                  </div>
                  <div className="form-group full-width">
                    <label>Dirección</label>
                    <textarea name="direccion" value={form.direccion} onChange={handleChange} rows={2} />
                  </div>
                  <div className="form-group full-width">
                    <label>Observaciones</label>
                    <textarea name="observaciones" value={form.observaciones} onChange={handleChange} rows={2} />
                  </div>
                  {!editando && (() => {
                    const cred = previewCredenciales(form);
                    return (
                      <>
                        <div className="form-section-title">Acceso al sistema (auto-generado)</div>
                        <div className="form-group">
                          <label>Usuario (preview)</label>
                          <input readOnly value={cred.usuario || '—'} style={{ background: '#f5f5f5', color: '#555' }} />
                        </div>
                        <div className="form-group">
                          <label>Contraseña (preview)</label>
                          <input readOnly value={cred.password || '—'} style={{ background: '#f5f5f5', color: '#555' }} />
                        </div>
                      </>
                    );
                  })()}
                </div>
              )}

              {error && <p style={{ color: '#e53935', fontSize: '0.85rem', marginTop: '0.75rem' }}>{error}</p>}

              <div className="modal-actions">
                <button type="button" className="btn-cancel" onClick={cerrarModal}>
                  {credCreadas ? 'Cerrar' : 'Cancelar'}
                </button>
                {!credCreadas && (
                  <button type="submit" className="btn-primary" disabled={cargando}>
                    {cargando ? 'Guardando...' : editando ? 'Actualizar' : 'Crear Alumno'}
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Alumnos;
