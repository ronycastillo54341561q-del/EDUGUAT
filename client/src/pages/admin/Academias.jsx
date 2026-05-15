import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../../components/Sidebar';
import API from '../../api/axios';
import './admin.css';
import './Configuracion.css';
import './Academias.css';

const MESES_LABEL = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const SCOPE_LABEL = {
  global: 'Toda la academia',
  diplomado: 'Diplomado',
  horario: 'Horario',
  laboratorio: 'Laboratorio',
  dia: 'Día de clase',
  alumno: 'Alumno específico',
};

const slugify = (s) => String(s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '')
  .slice(0, 60);

const empty = {
  id: '', nombre: '', info: '',
  modulos: [], todos: true,
  email_admin: '', admin_password: '',
};

export default function Academias() {
  const [items, setItems]       = useState([]);
  const [modulos, setModulos]   = useState([]);
  const [loading, setLoading]   = useState(false);
  const [modal, setModal]       = useState(false);
  const [form, setForm]         = useState(empty);
  const [editId, setEditId]     = useState(null);
  const [err, setErr]           = useState('');
  const [saving, setSaving]     = useState(false);
  const [filtro, setFiltro]     = useState('activas'); // 'activas' | 'inactivas' | 'todas'
  // Paso 0 del modal de creación: 'select' (preguntar tipo) | 'form' (rellenar datos).
  // tipo: 'nueva' | 'existente' decide si tras crear se abre el wizard de importación.
  const [paso, setPaso]         = useState('select');
  const [tipo, setTipo]         = useState(null);
  // Wizard post-creación (sólo cuando tipo === 'existente').
  const [wizard, setWizard]     = useState(null);
  const navigate = useNavigate();

  const visibles = items.filter(s => {
    if (filtro === 'activas')   return s.activo;
    if (filtro === 'inactivas') return !s.activo;
    return true;
  });

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: sedes }, { data: mods }] = await Promise.all([
        API.get('/academias'),
        API.get('/academias/modulos'),
      ]);
      setItems(sedes);
      setModulos(mods);
    } catch (e) {
      console.error(e);
      setErr(e.response?.data?.message || 'Error al cargar academias');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const abrir = (s = null) => {
    setErr('');
    if (s) {
      setEditId(s.id);
      setForm({
        id: s.id,
        nombre: s.nombre || '',
        info: s.info || '',
        modulos: Array.isArray(s.modulos) ? s.modulos : [],
        todos: !s.modulos,
        email_admin: s.email_admin || '',
        admin_password: '',
      });
      setPaso('form');
      setTipo(null);
    } else {
      setEditId(null);
      setForm(empty);
      setPaso('select');
      setTipo(null);
    }
    setModal(true);
  };

  const cerrar = () => { setModal(false); setErr(''); setPaso('select'); setTipo(null); };

  const elegirTipo = (t) => {
    setTipo(t);
    setPaso('form');
    setErr('');
  };

  const toggleModulo = (id) => {
    setForm(f => {
      const has = f.modulos.includes(id);
      return { ...f, modulos: has ? f.modulos.filter(m => m !== id) : [...f.modulos, id] };
    });
  };

  const guardar = async (e) => {
    e.preventDefault();
    setErr('');
    if (!form.nombre.trim()) { setErr('Nombre requerido'); return; }
    const payload = {
      nombre: form.nombre.trim(),
      info: form.info.trim() || null,
      email_admin: form.email_admin.trim() || null,
      modulos: form.todos ? null : form.modulos,
    };
    setSaving(true);
    try {
      let academiaId = editId;
      if (editId) {
        await API.put(`/academias/${editId}`, payload);
      } else {
        academiaId = (form.id || slugify(form.nombre)).trim();
        await API.post('/academias', {
          ...payload, id: academiaId,
          admin_password: form.admin_password || undefined,
        });
      }
      const eraExistente = !editId && tipo === 'existente';
      cerrar();
      cargar();
      if (eraExistente) {
        setWizard({
          academiaId,
          academiaNombre: payload.nombre,
          paso: 1,
          anio: new Date().getFullYear(),
          reglas: [],
          abonos: [],
          ruleDraft: { scope_tipo: 'global', scope_valor: '', mes_inicio: 1, mes_fin: 12 },
          abonoDraft: { scope_tipo: 'global', scope_valor: '', mes: 1, monto: '' },
          guardandoRegla: false,
          guardandoAbono: false,
          msg: '',
        });
      }
    } catch (ex) {
      setErr(ex.response?.data?.message || 'Error al guardar');
    } finally { setSaving(false); }
  };

  const cambiarActivo = async (s, nuevo) => {
    if (!nuevo && !confirm(`¿Deshabilitar la academia "${s.nombre}"?\nNo aparecerá en el selector ni permitirá login hasta que la vuelvas a habilitar.`)) return;
    try {
      await API.patch(`/academias/${s.id}/activo`, { activo: !!nuevo });
      cargar();
    } catch (ex) {
      alert(ex.response?.data?.message || 'No se pudo actualizar');
    }
  };

  return (
    <div className="admin-layout">
      <Sidebar />
      <div className="admin-content">
        <h1>🏫 Academias / Sedes</h1>
        <p className="subtitle">
          Crea, edita y habilita academias.  Cada sede tiene su propia base de datos
          y módulos seleccionables.  Las sedes deshabilitadas no aparecen en el
          selector antes del login.
        </p>

        <div className="cfg-toolbar">
          <h2>
            Academias registradas ({visibles.length}
            {filtro !== 'todas' && <> de {items.length}</>})
          </h2>
          <div className="acad-toolbar-right">
            <div className="acad-filtro">
              <label>Mostrar:</label>
              <select value={filtro} onChange={e => setFiltro(e.target.value)}>
                <option value="activas">Solo activas</option>
                <option value="inactivas">Solo inactivas</option>
                <option value="todas">Activas e inactivas</option>
              </select>
            </div>
            <button className="btn-primary" onClick={() => abrir()}>+ Nueva academia</button>
          </div>
        </div>

        {loading ? (
          <div className="cfg-empty">Cargando…</div>
        ) : items.length === 0 ? (
          <div className="cfg-empty">
            No hay academias.
            <button className="btn-primary" onClick={() => abrir()} style={{ marginLeft: 12 }}>
              Crear la primera
            </button>
          </div>
        ) : visibles.length === 0 ? (
          <div className="cfg-empty">
            No hay academias {filtro === 'activas' ? 'activas' : 'inactivas'}.
          </div>
        ) : (
          <div className="acad-grid">
            {visibles.map(s => (
              <div key={s.id} className={`acad-card${s.activo ? '' : ' inactivo'}`}>
                <div className="acad-card-head">
                  <div>
                    <h3>{s.nombre}</h3>
                    <code className="acad-id">{s.id}</code>
                  </div>
                  <span className={`acad-badge ${s.activo ? 'on' : 'off'}`}>
                    {s.activo ? 'Activa' : 'Deshabilitada'}
                  </span>
                </div>

                {s.info && <p className="acad-info">{s.info}</p>}

                <div className="acad-meta">
                  <strong>Módulos:</strong>{' '}
                  {!s.modulos
                    ? <span className="acad-todos">Todos</span>
                    : s.modulos.length
                      ? <span>{s.modulos.length} módulo(s)</span>
                      : <span className="acad-todos">Todos</span>}
                </div>
                {s.email_admin && (
                  <div className="acad-meta">
                    <strong>Admin:</strong> {s.email_admin}
                  </div>
                )}

                <div className="acad-actions">
                  <button className="btn-edit" onClick={() => abrir(s)}>Editar</button>
                  {s.activo ? (
                    <button className="btn-danger-sm" onClick={() => cambiarActivo(s, 0)}>
                      Deshabilitar
                    </button>
                  ) : (
                    <button className="btn-primary" onClick={() => cambiarActivo(s, 1)}>
                      Habilitar
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {modal && paso === 'select' && (
        <div className="modal-overlay" onClick={cerrar}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 640 }}>
            <div className="modal-header">
              <h2>Nueva academia</h2>
              <button className="modal-close" onClick={cerrar}>✕</button>
            </div>
            <div className="modal-form">
              <p style={{ color: '#555', marginBottom: '1rem' }}>
                ¿Esta academia es nueva o estás trasladando una que ya operaba?
              </p>
              <div className="acad-tipo-grid">
                <button type="button" className="acad-tipo-card" onClick={() => elegirTipo('nueva')}>
                  <div className="acad-tipo-emoji">🆕</div>
                  <h3>Academia nueva</h3>
                  <p>
                    Empieza desde cero. Te recomendamos descargar el manual
                    para configurar membretes, módulos y catálogos paso a paso.
                  </p>
                </button>
                <button type="button" className="acad-tipo-card" onClick={() => elegirTipo('existente')}>
                  <div className="acad-tipo-emoji">📦</div>
                  <h3>Academia existente</h3>
                  <p>
                    Vas a importar datos de una academia que ya tiene alumnos.
                    Después de crearla podrás configurar el mes de inicio de
                    pagos y aplicar abonos iniciales.
                  </p>
                </button>
              </div>
              <div className="modal-actions" style={{ marginTop: '1rem' }}>
                <button type="button" className="btn-cancel" onClick={cerrar}>Cancelar</button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => { cerrar(); navigate('/admin/manual'); }}
                >
                  📖 Ver manual
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {modal && paso === 'form' && (
        <div className="modal-overlay" onClick={cerrar}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 720 }}>
            <div className="modal-header">
              <h2>
                {editId
                  ? 'Editar academia'
                  : tipo === 'existente' ? 'Nueva academia (existente)' : 'Nueva academia'}
              </h2>
              <button className="modal-close" onClick={cerrar}>✕</button>
            </div>
            <form onSubmit={guardar} className="modal-form">
              <div className="form-grid">
                <div className="form-group">
                  <label>Nombre de la sede *</label>
                  <input
                    value={form.nombre}
                    placeholder="Ej: Sistec Quetzaltenango"
                    onChange={e => setForm({ ...form, nombre: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>ID interno (DB) {editId && <em>(no editable)</em>}</label>
                  <input
                    value={editId ? form.id : (form.id || slugify(form.nombre))}
                    placeholder="sistec_quetzaltenango"
                    onChange={e => setForm({ ...form, id: e.target.value })}
                    disabled={!!editId}
                  />
                </div>
                <div className="form-group full-width">
                  <label>Información de la sede</label>
                  <textarea
                    rows={3}
                    value={form.info}
                    placeholder="Dirección, teléfono, contacto…"
                    onChange={e => setForm({ ...form, info: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Email del admin</label>
                  <input
                    type="email"
                    value={form.email_admin}
                    placeholder="admin@sede.gt"
                    onChange={e => setForm({ ...form, email_admin: e.target.value })}
                  />
                </div>
                {!editId && (
                  <div className="form-group">
                    <label>Contraseña inicial admin</label>
                    <input
                      value={form.admin_password}
                      placeholder="(por defecto: admin123)"
                      onChange={e => setForm({ ...form, admin_password: e.target.value })}
                    />
                  </div>
                )}
              </div>

              <fieldset className="acad-modulos">
                <legend>Módulos habilitados</legend>
                <label className="acad-todos-label">
                  <input
                    type="checkbox"
                    checked={form.todos}
                    onChange={e => setForm({ ...form, todos: e.target.checked })}
                  />
                  Habilitar TODOS los módulos
                </label>
                {!form.todos && (
                  <div className="acad-modulos-grid">
                    {modulos.map(m => (
                      <label key={m.id} className="acad-mod-item">
                        <input
                          type="checkbox"
                          checked={form.modulos.includes(m.id)}
                          onChange={() => toggleModulo(m.id)}
                        />
                        <span>{m.label}</span>
                      </label>
                    ))}
                  </div>
                )}
              </fieldset>

              {err && <p style={{ color: '#e53935', fontSize: '0.85rem' }}>{err}</p>}

              <div className="modal-actions">
                <button type="button" className="btn-cancel" onClick={cerrar}>Cancelar</button>
                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving ? 'Guardando…' : (editId ? 'Actualizar' : 'Crear academia')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {wizard && (
        <WizardImportar
          wizard={wizard}
          setWizard={setWizard}
          onCerrar={() => setWizard(null)}
          onIrAImportar={() => { setWizard(null); navigate('/admin/importar'); }}
        />
      )}
    </div>
  );
}

/* ─────────────────── Wizard de importación post-creación ───────────────────
   Sólo se abre cuando el admin elige "academia existente". Ofrece:
   1. Atajo al módulo Importar (parser real).
   2. Configurar reglas de mes inicio/fin por filtro (alimenta config_pagos
      → meses anteriores se ven gris oscuro en la rejilla de Pagos).
   3. Aplicar abono inicial bulk a un mes específico para los alumnos del
      filtro elegido.
*/
function WizardImportar({ wizard, setWizard, onCerrar, onIrAImportar }) {
  const set = (patch) => setWizard(w => ({ ...w, ...patch }));
  const setRD = (patch) => setWizard(w => ({ ...w, ruleDraft: { ...w.ruleDraft, ...patch } }));
  const setAD = (patch) => setWizard(w => ({ ...w, abonoDraft: { ...w.abonoDraft, ...patch } }));

  const agregarRegla = async () => {
    const { scope_tipo, scope_valor, mes_inicio, mes_fin } = wizard.ruleDraft;
    if (scope_tipo !== 'global' && !scope_valor.trim()) {
      set({ msg: 'Indica el valor del filtro (ej. nombre del diplomado)' });
      return;
    }
    if (mes_inicio < 1 || mes_inicio > 12 || mes_fin < 1 || mes_fin > 12 || mes_inicio > mes_fin) {
      set({ msg: 'Rango de meses inválido' });
      return;
    }
    set({ guardandoRegla: true, msg: '' });
    try {
      const { data } = await API.post('/config-pagos', {
        anio: wizard.anio,
        scope_tipo,
        scope_valor: scope_tipo === 'global' ? null : scope_valor.trim(),
        mes_inicio, mes_fin,
        multiplicador: 1,
        descripcion: 'Importación inicial — mes desde el cual paga',
      });
      setWizard(w => ({
        ...w,
        reglas: [...w.reglas, data],
        ruleDraft: { scope_tipo: 'global', scope_valor: '', mes_inicio: 1, mes_fin: 12 },
        guardandoRegla: false,
        msg: 'Regla guardada',
      }));
    } catch (err) {
      set({ guardandoRegla: false, msg: err.response?.data?.message || 'Error al guardar regla' });
    }
  };

  const aplicarAbono = async () => {
    const { scope_tipo, scope_valor, mes, monto } = wizard.abonoDraft;
    const m = parseFloat(monto);
    if (!(m > 0)) { set({ msg: 'Monto inválido' }); return; }
    if (scope_tipo !== 'global' && !scope_valor.trim()) {
      set({ msg: 'Indica el valor del filtro' });
      return;
    }
    set({ guardandoAbono: true, msg: '' });
    try {
      const { data } = await API.post('/mensualidades/abono-inicial', {
        anio: wizard.anio,
        mes,
        monto: m,
        scope_tipo,
        scope_valor: scope_tipo === 'global' ? null : scope_valor.trim(),
      });
      setWizard(w => ({
        ...w,
        abonos: [...w.abonos, { ...w.abonoDraft, aplicados: data.aplicados }],
        abonoDraft: { scope_tipo: 'global', scope_valor: '', mes: 1, monto: '' },
        guardandoAbono: false,
        msg: `Abono aplicado a ${data.aplicados} alumno(s)`,
      }));
    } catch (err) {
      set({ guardandoAbono: false, msg: err.response?.data?.message || 'Error al aplicar abono' });
    }
  };

  return (
    <div className="modal-overlay" onClick={onCerrar}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 820 }}>
        <div className="modal-header">
          <h2>Importar datos — {wizard.academiaNombre}</h2>
          <button className="modal-close" onClick={onCerrar}>✕</button>
        </div>

        <div className="modal-form">
          <div className="wiz-pasos">
            {[1, 2, 3].map(p => (
              <div key={p} className={`wiz-paso${wizard.paso === p ? ' activo' : ''}`}
                onClick={() => set({ paso: p })}>
                {p}. {p === 1 ? 'Subir alumnos' : p === 2 ? 'Mes inicio de pagos' : 'Abono inicial'}
              </div>
            ))}
          </div>

          {wizard.paso === 1 && (
            <div className="wiz-section">
              <h3>Subir alumnos al sistema</h3>
              <p>
                El parser de Excel/CSV vive en el módulo <strong>Importar Datos</strong>.
                Puedes elegir importar <em>todos</em> los alumnos históricos o
                solamente los <em>activos del año actual</em> (recomendado).
              </p>
              <ul style={{ marginLeft: '1.2rem', color: '#444' }}>
                <li>Recomendado: importar sólo alumnos activos.</li>
                <li>Si vas a importar todo: haz un backup antes.</li>
                <li>Cuando termines, vuelve aquí para configurar los pagos.</li>
              </ul>
              <div className="modal-actions">
                <button type="button" className="btn-cancel" onClick={onCerrar}>Saltar</button>
                <button type="button" className="btn-primary" onClick={onIrAImportar}>
                  📥 Ir al módulo Importar
                </button>
                <button type="button" className="btn-primary" onClick={() => set({ paso: 2 })}>
                  Continuar →
                </button>
              </div>
            </div>
          )}

          {wizard.paso === 2 && (
            <div className="wiz-section">
              <h3>Mes desde el cual paga cada alumno</h3>
              <p style={{ color: '#444' }}>
                Crea reglas para indicar a partir de qué mes empieza a pagar
                cada grupo. Los meses anteriores quedan bloqueados (gris
                oscuro) en la rejilla de Pagos para que no se cobren por
                error.
              </p>

              <div className="wiz-grid">
                <div className="form-group">
                  <label>Año</label>
                  <input type="number" value={wizard.anio}
                    onChange={e => set({ anio: parseInt(e.target.value) || wizard.anio })} />
                </div>
                <div className="form-group">
                  <label>Alcance</label>
                  <select value={wizard.ruleDraft.scope_tipo}
                    onChange={e => setRD({ scope_tipo: e.target.value, scope_valor: '' })}>
                    {Object.entries(SCOPE_LABEL).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
                {wizard.ruleDraft.scope_tipo !== 'global' && (
                  <div className="form-group">
                    <label>Valor</label>
                    <input value={wizard.ruleDraft.scope_valor}
                      onChange={e => setRD({ scope_valor: e.target.value })}
                      placeholder={
                        wizard.ruleDraft.scope_tipo === 'alumno' ? 'ID del alumno' :
                        wizard.ruleDraft.scope_tipo === 'dia'    ? 'lunes / martes / …' :
                        'Nombre del ' + wizard.ruleDraft.scope_tipo
                      } />
                  </div>
                )}
                <div className="form-group">
                  <label>Mes inicio</label>
                  <select value={wizard.ruleDraft.mes_inicio}
                    onChange={e => setRD({ mes_inicio: parseInt(e.target.value) })}>
                    {MESES_LABEL.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Mes fin</label>
                  <select value={wizard.ruleDraft.mes_fin}
                    onChange={e => setRD({ mes_fin: parseInt(e.target.value) })}>
                    {MESES_LABEL.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
                  </select>
                </div>
              </div>

              <button type="button" className="btn-primary" onClick={agregarRegla}
                disabled={wizard.guardandoRegla} style={{ marginTop: '0.5rem' }}>
                {wizard.guardandoRegla ? 'Guardando…' : '+ Agregar regla'}
              </button>

              {wizard.reglas.length > 0 && (
                <div className="wiz-list">
                  <strong>Reglas creadas ({wizard.reglas.length}):</strong>
                  <ul>
                    {wizard.reglas.map(r => (
                      <li key={r.id}>
                        {SCOPE_LABEL[r.scope_tipo]}{r.scope_valor ? ` = ${r.scope_valor}` : ''}
                        {' '} → {MESES_LABEL[r.mes_inicio - 1]}–{MESES_LABEL[r.mes_fin - 1]} {wizard.anio}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="modal-actions">
                <button type="button" className="btn-cancel" onClick={() => set({ paso: 1 })}>← Atrás</button>
                <button type="button" className="btn-primary" onClick={() => set({ paso: 3 })}>Siguiente →</button>
              </div>
            </div>
          )}

          {wizard.paso === 3 && (
            <div className="wiz-section">
              <h3>Abono inicial</h3>
              <p style={{ color: '#444' }}>
                Aplica un monto de abono a un mes específico para todos los
                alumnos activos del filtro. Útil si los alumnos llegan con un
                pago parcial ya hecho en la academia anterior.
              </p>

              <div className="wiz-grid">
                <div className="form-group">
                  <label>Alcance</label>
                  <select value={wizard.abonoDraft.scope_tipo}
                    onChange={e => setAD({ scope_tipo: e.target.value, scope_valor: '' })}>
                    {Object.entries(SCOPE_LABEL).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
                {wizard.abonoDraft.scope_tipo !== 'global' && (
                  <div className="form-group">
                    <label>Valor</label>
                    <input value={wizard.abonoDraft.scope_valor}
                      onChange={e => setAD({ scope_valor: e.target.value })}
                      placeholder={
                        wizard.abonoDraft.scope_tipo === 'alumno' ? 'ID del alumno' :
                        wizard.abonoDraft.scope_tipo === 'dia'    ? 'lunes / martes / …' :
                        'Nombre del ' + wizard.abonoDraft.scope_tipo
                      } />
                  </div>
                )}
                <div className="form-group">
                  <label>Mes</label>
                  <select value={wizard.abonoDraft.mes}
                    onChange={e => setAD({ mes: parseInt(e.target.value) })}>
                    {MESES_LABEL.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Monto del abono (Q)</label>
                  <input type="number" step="0.01" value={wizard.abonoDraft.monto}
                    onChange={e => setAD({ monto: e.target.value })} />
                </div>
              </div>

              <button type="button" className="btn-primary" onClick={aplicarAbono}
                disabled={wizard.guardandoAbono} style={{ marginTop: '0.5rem' }}>
                {wizard.guardandoAbono ? 'Aplicando…' : '💰 Aplicar abono'}
              </button>

              {wizard.abonos.length > 0 && (
                <div className="wiz-list">
                  <strong>Abonos aplicados:</strong>
                  <ul>
                    {wizard.abonos.map((a, i) => (
                      <li key={i}>
                        {SCOPE_LABEL[a.scope_tipo]}{a.scope_valor ? ` = ${a.scope_valor}` : ''}
                        {' '}→ {MESES_LABEL[a.mes - 1]} {wizard.anio}: Q{parseFloat(a.monto).toFixed(2)}
                        {' '}({a.aplicados} alumno{a.aplicados === 1 ? '' : 's'})
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="modal-actions">
                <button type="button" className="btn-cancel" onClick={() => set({ paso: 2 })}>← Atrás</button>
                <button type="button" className="btn-primary" onClick={onCerrar}>Finalizar</button>
              </div>
            </div>
          )}

          {wizard.msg && <p className="wiz-msg">{wizard.msg}</p>}
        </div>
      </div>
    </div>
  );
}
