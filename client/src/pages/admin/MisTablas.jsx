import { useState, useEffect, useRef, useCallback } from 'react';
import Sidebar from '../../components/Sidebar';
import API from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import * as XLSX from 'xlsx-js-style';
import './admin.css';
import './MisTablas.css';

/* ─────────────────────────── Utilidades ─────────────────────────── */
const colLetter = (i) => {
  let s = '';
  let n = i;
  do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; } while (n >= 0);
  return s;
};

const letterToIdx = (l) => {
  let r = 0;
  for (const c of l.toUpperCase()) r = r * 26 + (c.charCodeAt(0) - 64);
  return r - 1;
};

const slugKey = (s, i) =>
  (s || `col_${i}`).toString().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || `col_${i}`;

const fmtDate = (d) => d ? String(d).slice(0, 10) : '';

const toNum = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

// Comparador "natural" — entiende números embebidos en strings.
// Ej: "clave2" < "clave10" (alfabético los pondría al revés).
const cmpNatural = (a, b) => {
  const av = a ?? '', bv = b ?? '';
  return String(av).localeCompare(String(bv), 'es', { numeric: true, sensitivity: 'base' });
};

/* ─ Columnas disponibles de alumno ─ */
const COLS_ALUMNO = [
  { key: 'clave',             label: 'Clave',            tipo: 'texto'   },
  { key: 'codigo_estudiante', label: 'Código',           tipo: 'texto'   },
  { key: 'nombre',            label: 'Nombre',           tipo: 'texto'   },
  { key: 'apellido',          label: 'Apellido',         tipo: 'texto'   },
  { key: 'fecha_nacimiento',  label: 'F. Nacimiento',    tipo: 'fecha'   },
  { key: 'fecha_inicio',      label: 'F. Inicio',        tipo: 'fecha'   },
  { key: 'encargado',         label: 'Encargado',        tipo: 'texto'   },
  { key: 'telefono',          label: 'Teléfono',         tipo: 'texto'   },
  { key: 'email',             label: 'Email',            tipo: 'texto'   },
  { key: 'diplomado',         label: 'Diplomado',        tipo: 'texto'   },
  { key: 'tac',               label: 'TAC',              tipo: 'texto'   },
  { key: 'horario',           label: 'Horario',          tipo: 'texto'   },
  { key: 'laboratorio',       label: 'Laboratorio',      tipo: 'texto'   },
  { key: 'dia_clases1',       label: 'Día 1',            tipo: 'texto'   },
  { key: 'dia_clases2',       label: 'Día 2',            tipo: 'texto'   },
  { key: 'direccion',         label: 'Dirección',        tipo: 'texto'   },
  { key: 'establecimiento',   label: 'Establecimiento',  tipo: 'texto'   },
  { key: 'observaciones',     label: 'Observaciones',    tipo: 'texto'   },
  { key: 'estado',            label: 'Estado',           tipo: 'texto'   },
  { key: 'cuota_mensual',     label: 'Cuota mensual',    tipo: 'decimal' },
];

/* ─ Columnas disponibles de alumno (instituciones) ─ */
const COLS_ALUMNO_INST = [
  { key: 'clave',             label: 'Clave',            tipo: 'texto'   },
  { key: 'codigo_estudiante', label: 'Código',           tipo: 'texto'   },
  { key: 'nombre',            label: 'Nombre',           tipo: 'texto'   },
  { key: 'apellido',          label: 'Apellido',         tipo: 'texto'   },
  { key: 'fecha_nacimiento',  label: 'F. Nacimiento',    tipo: 'fecha'   },
  { key: 'fecha_inicio',      label: 'F. Inscripción',   tipo: 'fecha'   },
  { key: 'encargado',         label: 'Encargado',        tipo: 'texto'   },
  { key: 'telefono',          label: 'Teléfono',         tipo: 'texto'   },
  { key: 'email',             label: 'Email',            tipo: 'texto'   },
  { key: 'grado',             label: 'Grado',            tipo: 'texto'   },
  { key: 'seccion',           label: 'Sección',          tipo: 'texto'   },
  { key: 'maestro_guia',      label: 'Maestro guía',     tipo: 'texto'   },
  { key: 'plan_clases',       label: 'Plan',             tipo: 'texto'   },
  { key: 'dias_clase',        label: 'Días de clase',    tipo: 'texto'   },
  { key: 'horario',           label: 'Horario',          tipo: 'texto'   },
  { key: 'direccion',         label: 'Dirección',        tipo: 'texto'   },
  { key: 'observaciones',     label: 'Observaciones',    tipo: 'texto'   },
  { key: 'estado',            label: 'Estado',           tipo: 'texto'   },
  { key: 'cuota_mensual',     label: 'Cuota mensual',    tipo: 'decimal' },
];

const DIAS = ['lunes','martes','miercoles','jueves','viernes','sabado','domingo'];

/* ─────────────────────── Evaluador de fórmulas ─────────────────────── */
const FUNCIONES = ['promedio', 'prom', 'sumar', 'suma', 'contar', 'cuenta'];

const esFormula = (v) => typeof v === 'string' && v.trim().startsWith('=');

const evalFormula = (expr, fila, rowIdx, columnas, filas, pila = new Set()) => {
  const m = /^=\s*([a-záéíóúñ_]+)\s*\(([^)]*)\)\s*$/i.exec(expr.trim());
  if (!m) return '#ERR';
  const fn = m[1].toLowerCase();
  if (!FUNCIONES.includes(fn)) return '#FUN?';
  const args = m[2].split(',').map(s => s.trim()).filter(Boolean);

  // Expande cada arg: letra, rango letra:letra (columna completa), celda letra+num (A1, A2), rango A1:A5
  const valores = [];
  for (const a of args) {
    if (!a) continue;
    const rango = a.split(':');
    if (rango.length === 2) {
      const r1 = /^([A-Z]+)(\d*)$/i.exec(rango[0]);
      const r2 = /^([A-Z]+)(\d*)$/i.exec(rango[1]);
      if (!r1 || !r2) { valores.push(NaN); continue; }
      const ci1 = letterToIdx(r1[1]);
      const ci2 = letterToIdx(r2[1]);
      const minC = Math.min(ci1, ci2), maxC = Math.max(ci1, ci2);
      // Rango de filas: si hay número, usarlo; si no, todas las filas
      const f1 = r1[2] ? parseInt(r1[2], 10) - 1 : 0;
      const f2 = r2[2] ? parseInt(r2[2], 10) - 1 : filas.length - 1;
      const minF = Math.min(f1, f2), maxF = Math.max(f1, f2);
      const rangoColCompleta = !r1[2] && !r2[2];
      for (let ci = minC; ci <= maxC; ci++) {
        for (let fi = minF; fi <= maxF; fi++) {
          if (rangoColCompleta && fi === rowIdx) continue;
          valores.push(obtenerValorCelda(ci, fi, columnas, filas, pila));
        }
      }
    } else {
      const m1 = /^([A-Z]+)(\d*)$/i.exec(a);
      if (!m1) { valores.push(NaN); continue; }
      const ci = letterToIdx(m1[1]);
      const fi = m1[2] ? parseInt(m1[2], 10) - 1 : rowIdx;
      valores.push(obtenerValorCelda(ci, fi, columnas, filas, pila));
    }
  }

  const nums = valores.map(toNum).filter(v => v !== null);
  if (fn === 'promedio' || fn === 'prom') {
    if (nums.length === 0) return 0;
    return +(nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(4);
  }
  if (fn === 'sumar' || fn === 'suma') {
    return +nums.reduce((a, b) => a + b, 0).toFixed(4);
  }
  if (fn === 'contar' || fn === 'cuenta') {
    return valores.filter(v => v !== null && v !== '' && v !== undefined).length;
  }
  return '#ERR';
};

const obtenerValorCelda = (colIdx, rowIdx, columnas, filas, pila) => {
  if (colIdx < 0 || colIdx >= columnas.length) return null;
  if (rowIdx < 0 || rowIdx >= filas.length) return null;
  const col = columnas[colIdx];
  const v = filas[rowIdx]?.[col.key];
  if (esFormula(v)) {
    const k = `${rowIdx}:${colIdx}`;
    if (pila.has(k)) return '#REF';
    const nueva = new Set(pila); nueva.add(k);
    return evalFormula(v, filas[rowIdx], rowIdx, columnas, filas, nueva);
  }
  return v;
};

/* ══════════════════════════ Componente ══════════════════════════ */
const DIAS_RETENCION = 7;

// Devuelve un texto regresivo del estilo "5d 03h 14m 22s" hasta que la tabla
// desactivada cumpla los 7 días y se elimine automáticamente.
const tiempoRestante = (desactivadoAt, ahora) => {
  if (!desactivadoAt) return null;
  const t0 = new Date(desactivadoAt).getTime();
  const limite = t0 + DIAS_RETENCION * 24 * 60 * 60 * 1000;
  const diff = limite - ahora;
  if (diff <= 0) return { vencida: true, label: 'Eliminándose…' };
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  return {
    vencida: false,
    label: `${d}d ${String(h).padStart(2,'0')}h ${String(m).padStart(2,'0')}m ${String(s).padStart(2,'0')}s`,
  };
};

const MisTablas = () => {
  const { sede } = useAuth();
  const esInstitucion = sede?.tipo === 'institucion';
  const colsCat = esInstitucion ? COLS_ALUMNO_INST : COLS_ALUMNO;
  const [tablas, setTablas]       = useState([]);
  const [cargando, setCargando]   = useState(false);
  const [wizard, setWizard]       = useState(null);   // objeto con los datos del wizard
  const [editor, setEditor]       = useState(null);   // tabla en edición (cargada de DB)
  const [filtro, setFiltro]       = useState('activas'); // 'activas' | 'inactivas'
  const [now, setNow]             = useState(Date.now());

  // Tick para que el contador regresivo de las tablas inactivas se actualice.
  useEffect(() => {
    if (filtro !== 'inactivas') return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [filtro]);

  /* ── Listado ── */
  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const param = filtro === 'inactivas' ? '0' : '1';
      const { data } = await API.get(`/mis-tablas?activo=${param}`);
      setTablas(data);
    } catch (err) { console.error(err); }
    finally { setCargando(false); }
  }, [filtro]);
  useEffect(() => { cargar(); }, [cargar]);

  const abrirTabla = async (id) => {
    try {
      const { data } = await API.get(`/mis-tablas/${id}`);
      setEditor(data);
    } catch { alert('Error al abrir la tabla'); }
  };

  const desactivarTabla = async (id, nombre) => {
    if (!confirm(
      `¿Desactivar la tabla "${nombre}"?\n\n` +
      `Quedará en papelera durante ${DIAS_RETENCION} días.\n` +
      `Si no la reactivas antes, se eliminará automáticamente.`
    )) return;
    try {
      await API.delete(`/mis-tablas/${id}`);
      cargar();
    } catch { alert('Error al desactivar'); }
  };

  const reactivarTabla = async (id) => {
    try {
      await API.post(`/mis-tablas/${id}/reactivar`);
      cargar();
    } catch { alert('Error al reactivar'); }
  };

  const eliminarDefinitivo = async (id, nombre) => {
    if (!confirm(`Eliminar definitivamente "${nombre}". Esta acción no se puede deshacer.`)) return;
    try {
      await API.delete(`/mis-tablas/${id}/eliminar`);
      cargar();
    } catch { alert('Error al eliminar'); }
  };

  const exportarDesdeListado = async (id) => {
    try {
      const { data } = await API.get(`/mis-tablas/${id}`);
      exportarExcel(data);
    } catch { alert('Error al exportar la tabla'); }
  };

  /* ── Wizard de creación ── */
  const iniciarWizard = () => {
    setWizard({
      paso: 1,
      nombre: '',
      descripcion: '',
      encabezado: '',
      conAlumnos: null,
      filtros: { estado: 'activo', horario: '', laboratorio: '', dia: '', tac: '', diplomado: '', establecimiento: '', grado: '', seccion: '', plan: '' },
      colsSeleccionadas: ['codigo_estudiante', 'nombre', 'apellido'],
      alumnosPreview: [],
      guardando: false,
      opciones: { horarios: [], laboratorios: [], dias: DIAS, tacs: [], diplomados: [], establecimientos: [], grados: [], secciones: [], planes: [] },
    });
  };

  const cancelarWizard = () => setWizard(null);

  // carga de opciones para filtros
  useEffect(() => {
    if (!wizard || wizard.paso !== 3) return;
    (async () => {
      try {
        const [{ data: filtrosSrv }, { data: alumnos }] = await Promise.all([
          API.get('/asistencia/filtros').catch(() => ({ data: { horarios: [], laboratorios: [], dias: DIAS } })),
          API.get('/alumnos'),
        ]);
        const uniq = (arr, k) => [...new Set(arr.map(a => a[k]).filter(Boolean))].sort();
        setWizard(w => w && {
          ...w,
          opciones: {
            horarios:        filtrosSrv.horarios        || uniq(alumnos, 'horario'),
            laboratorios:    filtrosSrv.laboratorios    || uniq(alumnos, 'laboratorio'),
            dias:            filtrosSrv.dias            || DIAS,
            tacs:            uniq(alumnos, 'tac'),
            diplomados:      uniq(alumnos, 'diplomado'),
            establecimientos: uniq(alumnos, 'establecimiento'),
            grados:          uniq(alumnos, 'grado'),
            secciones:       uniq(alumnos, 'seccion'),
            planes:          uniq(alumnos, 'plan_clases'),
          }
        });
      } catch (err) { console.error(err); }
    })();
  }, [wizard?.paso]); // eslint-disable-line

  // cada vez que cambian filtros -> actualizar preview count
  useEffect(() => {
    if (!wizard || wizard.paso !== 3) return;
    (async () => {
      try {
        const params = {};
        for (const [k, v] of Object.entries(wizard.filtros)) if (v) params[k] = v;
        const { data } = await API.get('/mis-tablas/_alumnos/filtrar', { params });
        setWizard(w => w && { ...w, alumnosPreview: data });
      } catch (err) { console.error(err); }
    })();
  }, [wizard?.paso, JSON.stringify(wizard?.filtros || {})]); // eslint-disable-line

  const generarTabla = async () => {
    if (!wizard.nombre.trim()) { alert('Ingresa un nombre para la tabla'); return; }
    setWizard(w => ({ ...w, guardando: true }));

    let columnas = [];
    let filas = [];

    if (wizard.conAlumnos) {
      // Ordena las claves seleccionadas según el orden definido en
      // COLS_ALUMNO. Así el usuario obtiene siempre las columnas en el
      // orden esperado (clave, código, nombre, apellido…) sin importar
      // en qué orden marcó los checkboxes.
      const ordenCat = colsCat.map(c => c.key);
      const colsOrdenadas = [...wizard.colsSeleccionadas]
        .sort((a, b) => ordenCat.indexOf(a) - ordenCat.indexOf(b));

      columnas = colsOrdenadas.map((k) => {
        const meta = colsCat.find(c => c.key === k);
        return { key: k, label: meta?.label || k, tipo: meta?.tipo || 'texto' };
      });

      // Si entre las columnas hay clave/código, ordenamos las filas por ahí
      // de forma natural (clave1, clave2, …, clave10) para que no salgan
      // saltadas. Si no, mantenemos el orden del backend (apellido/nombre).
      let alumnosOrden = wizard.alumnosPreview;
      const colOrden = colsOrdenadas.includes('clave')
        ? 'clave'
        : colsOrdenadas.includes('codigo_estudiante') ? 'codigo_estudiante' : null;
      if (colOrden) {
        alumnosOrden = [...alumnosOrden].sort((x, y) => cmpNatural(x[colOrden], y[colOrden]));
      }

      filas = alumnosOrden.map(a => {
        const row = {};
        for (const c of columnas) {
          let val = a[c.key];
          if (c.tipo === 'fecha') val = fmtDate(val);
          row[c.key] = val ?? '';
        }
        return row;
      });
    }

    try {
      const { data } = await API.post('/mis-tablas', {
        nombre: wizard.nombre,
        descripcion: wizard.descripcion,
        encabezado: wizard.encabezado,
        columnas, filas,
      });
      setWizard(null);
      await cargar();
      abrirTabla(data.id);
    } catch (err) {
      alert(err.response?.data?.message || 'Error al crear tabla');
      setWizard(w => ({ ...w, guardando: false }));
    }
  };

  /* ── Editor ── */
  if (editor) {
    return (
      <EditorTabla
        tabla={editor}
        onCerrar={() => { setEditor(null); cargar(); }}
      />
    );
  }

  /* ── Vista listado + wizard ── */
  return (
    <div className="admin-layout">
      <Sidebar />
      <div className="admin-content">
        <h1>📊 Mis Tablas</h1>
        <p className="subtitle">
          Tablas compartidas por todos los usuarios con acceso al módulo.
          Las tablas desactivadas se conservan {DIAS_RETENCION} días antes de eliminarse.
        </p>

        <div className="mt-toolbar">
          <button className="mt-btn primary" onClick={iniciarWizard} disabled={filtro === 'inactivas'}>
            + Nueva Tabla
          </button>
          <div className="mt-filtro">
            <label>Mostrar:</label>
            <select value={filtro} onChange={e => setFiltro(e.target.value)}>
              <option value="activas">Activas</option>
              <option value="inactivas">Inactivas (papelera)</option>
            </select>
          </div>
        </div>

        {cargando ? (
          <p style={{ marginTop: '1rem' }}>Cargando...</p>
        ) : tablas.length === 0 ? (
          <div className="mt-empty">
            {filtro === 'inactivas' ? (
              <p>No hay tablas en la papelera.</p>
            ) : (
              <>
                <p>No hay tablas todavía.</p>
                <p>Haz clic en "Nueva Tabla" para crear la primera.</p>
              </>
            )}
          </div>
        ) : (
          <div className="mt-list-grid">
            {tablas.map(t => {
              const inactiva = t.activo === false || t.activo === 0;
              const tr = inactiva ? tiempoRestante(t.desactivado_at, now) : null;
              return (
                <div key={t.id} className={`mt-card${inactiva ? ' inactiva' : ''}`}>
                  <h3>{t.nombre}</h3>
                  <div className="mt-desc">{t.descripcion || <em style={{ color:'#aaa' }}>Sin descripción</em>}</div>
                  <div className="mt-meta">Actualizada: {new Date(t.updated_at).toLocaleString()}</div>

                  {inactiva && tr && (
                    <div className={`mt-countdown${tr.vencida ? ' vencida' : ''}`}>
                      <span className="mt-countdown-label">Se eliminará en</span>
                      <span className="mt-countdown-time">{tr.label}</span>
                    </div>
                  )}

                  <div className="mt-card-actions">
                    {inactiva ? (
                      <>
                        <button className="mt-btn primary" onClick={() => reactivarTabla(t.id)}>
                          ♻ Reactivar
                        </button>
                        <button className="mt-btn danger" onClick={() => eliminarDefinitivo(t.id, t.nombre)}>
                          Eliminar
                        </button>
                      </>
                    ) : (
                      <>
                        <button className="mt-btn primary" onClick={() => abrirTabla(t.id)}>Abrir</button>
                        <button className="mt-btn success" onClick={() => exportarDesdeListado(t.id)} title="Descargar como Excel">📊 Excel</button>
                        <button className="mt-btn danger"  onClick={() => desactivarTabla(t.id, t.nombre)}>
                          Desactivar
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {wizard && (
          <Wizard
            wizard={wizard}
            setWizard={setWizard}
            onCancelar={cancelarWizard}
            onGenerar={generarTabla}
            esInstitucion={esInstitucion}
            colsCat={colsCat}
          />
        )}
      </div>
    </div>
  );
};

/* ══════════════════════════ Wizard ══════════════════════════ */
const Wizard = ({ wizard, setWizard, onCancelar, onGenerar, esInstitucion, colsCat }) => {
  const w = wizard;
  const set = (patch) => setWizard({ ...w, ...patch });

  return (
    <div className="mt-modal-bg" onClick={onCancelar}>
      <div className="mt-modal" onClick={e => e.stopPropagation()}>

        {w.paso === 1 && (
          <>
            <h2>Nueva Tabla</h2>
            <div className="mt-step-indicator">Paso 1 de 3 — Información básica</div>

            <div className="mt-field">
              <label>Nombre *</label>
              <input value={w.nombre} onChange={e => set({ nombre: e.target.value })} placeholder="Ej. Notas del 2° trimestre" autoFocus />
            </div>
            <div className="mt-field">
              <label>Descripción</label>
              <textarea value={w.descripcion} onChange={e => set({ descripcion: e.target.value })} />
            </div>
            <div className="mt-field">
              <label>Encabezado (texto opcional que aparecerá sobre la tabla)</label>
              <textarea value={w.encabezado} onChange={e => set({ encabezado: e.target.value })} placeholder="Ej. Reporte del mes de octubre 2025" />
            </div>

            <div className="mt-modal-actions">
              <button className="mt-btn secondary" onClick={onCancelar}>Cancelar</button>
              <button className="mt-btn primary" disabled={!w.nombre.trim()} onClick={() => set({ paso: 2 })}>Siguiente →</button>
            </div>
          </>
        )}

        {w.paso === 2 && (
          <>
            <h2>¿Cargar datos de alumnos?</h2>
            <div className="mt-step-indicator">Paso 2 de 3 — Origen de datos</div>

            <p style={{ color: '#555', marginBottom: '1rem' }}>
              Puedes empezar la tabla con datos de los alumnos existentes o crearla vacía para ingresar manualmente.
            </p>

            <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
              <button
                className={`mt-btn ${w.conAlumnos === true ? 'primary' : 'secondary'}`}
                onClick={() => set({ conAlumnos: true })}
              >
                📥 Sí, con datos de alumnos
              </button>
              <button
                className={`mt-btn ${w.conAlumnos === false ? 'primary' : 'secondary'}`}
                onClick={() => set({ conAlumnos: false })}
              >
                ⬜ No, tabla vacía
              </button>
            </div>

            <div className="mt-modal-actions">
              <button className="mt-btn secondary" onClick={() => set({ paso: 1 })}>← Atrás</button>
              {w.conAlumnos === false ? (
                <button className="mt-btn success" onClick={onGenerar} disabled={w.guardando}>
                  {w.guardando ? 'Generando...' : 'Generar tabla vacía'}
                </button>
              ) : (
                <button className="mt-btn primary" disabled={w.conAlumnos !== true} onClick={() => set({ paso: 3 })}>
                  Siguiente →
                </button>
              )}
            </div>
          </>
        )}

        {w.paso === 3 && (
          <>
            <h2>Filtros y columnas</h2>
            <div className="mt-step-indicator">Paso 3 de 3 — Selecciona qué alumnos y qué columnas incluir</div>

            <h4 style={{ color: '#1a237e', marginTop: '0.4rem', marginBottom: '0.4rem' }}>Filtros</h4>
            <div className="mt-filters-grid">
              <div className="mt-field">
                <label>Estado</label>
                <select value={w.filtros.estado} onChange={e => set({ filtros: { ...w.filtros, estado: e.target.value } })}>
                  <option value="">Todos</option>
                  <option value="activo">Activos</option>
                  <option value="retirado">Retirados</option>
                </select>
              </div>
              {esInstitucion ? (
                <>
                  <div className="mt-field">
                    <label>Grado</label>
                    <select value={w.filtros.grado} onChange={e => set({ filtros: { ...w.filtros, grado: e.target.value } })}>
                      <option value="">Todos</option>
                      {w.opciones.grados.map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                  </div>
                  <div className="mt-field">
                    <label>Sección</label>
                    <select value={w.filtros.seccion} onChange={e => set({ filtros: { ...w.filtros, seccion: e.target.value } })}>
                      <option value="">Todas</option>
                      {w.opciones.secciones.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div className="mt-field">
                    <label>Plan</label>
                    <select value={w.filtros.plan} onChange={e => set({ filtros: { ...w.filtros, plan: e.target.value } })}>
                      <option value="">Todos</option>
                      {w.opciones.planes.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                </>
              ) : (
                <>
                  <div className="mt-field">
                    <label>Horario</label>
                    <select value={w.filtros.horario} onChange={e => set({ filtros: { ...w.filtros, horario: e.target.value } })}>
                      <option value="">Todos</option>
                      {w.opciones.horarios.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                  <div className="mt-field">
                    <label>Laboratorio</label>
                    <select value={w.filtros.laboratorio} onChange={e => set({ filtros: { ...w.filtros, laboratorio: e.target.value } })}>
                      <option value="">Todos</option>
                      {w.opciones.laboratorios.map(l => <option key={l} value={l}>{l}</option>)}
                    </select>
                  </div>
                  <div className="mt-field">
                    <label>Día</label>
                    <select value={w.filtros.dia} onChange={e => set({ filtros: { ...w.filtros, dia: e.target.value } })}>
                      <option value="">Todos</option>
                      {w.opciones.dias.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                  <div className="mt-field">
                    <label>TAC</label>
                    <select value={w.filtros.tac} onChange={e => set({ filtros: { ...w.filtros, tac: e.target.value } })}>
                      <option value="">Todos</option>
                      {w.opciones.tacs.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="mt-field">
                    <label>Diplomado</label>
                    <select value={w.filtros.diplomado} onChange={e => set({ filtros: { ...w.filtros, diplomado: e.target.value } })}>
                      <option value="">Todos</option>
                      {w.opciones.diplomados.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                  <div className="mt-field">
                    <label>Establecimiento</label>
                    <select value={w.filtros.establecimiento} onChange={e => set({ filtros: { ...w.filtros, establecimiento: e.target.value } })}>
                      <option value="">Todos</option>
                      {w.opciones.establecimientos.map(e => <option key={e} value={e}>{e}</option>)}
                    </select>
                  </div>
                </>
              )}
            </div>

            <div className="mt-preview-count">
              <strong>{w.alumnosPreview.length}</strong> alumno(s) coincide(n) con los filtros seleccionados.
            </div>

            <h4 style={{ color: '#1a237e', marginTop: '0.4rem', marginBottom: '0.4rem' }}>Columnas a incluir</h4>
            <div className="mt-cols-picker">
              {colsCat.map(c => (
                <label key={c.key}>
                  <input
                    type="checkbox"
                    checked={w.colsSeleccionadas.includes(c.key)}
                    onChange={() => {
                      const has = w.colsSeleccionadas.includes(c.key);
                      set({ colsSeleccionadas: has ? w.colsSeleccionadas.filter(x => x !== c.key) : [...w.colsSeleccionadas, c.key] });
                    }}
                  />
                  {c.label}
                </label>
              ))}
            </div>

            <div className="mt-modal-actions">
              <button className="mt-btn secondary" onClick={() => set({ paso: 2 })}>← Atrás</button>
              <button
                className="mt-btn success"
                disabled={w.guardando || w.colsSeleccionadas.length === 0}
                onClick={onGenerar}
              >
                {w.guardando ? 'Generando...' : `Generar tabla (${w.alumnosPreview.length} filas)`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

/* ══════════════════════════ Exportar a Excel ══════════════════════════ */
const PALETA = {
  titulo:      { bg: '1A237E', fg: 'FFFFFF' },   // azul profundo
  subtitulo:   { bg: '283593', fg: 'FFFFFF' },
  encabezado:  { bg: 'FFF9C4', fg: '5D4037' },   // amarillo suave (caja aviso)
  head:        { bg: '1A237E', fg: 'FFFFFF' },   // cabecera de columnas
  zebraClaro:  { bg: 'FFFFFF', fg: '212121' },
  zebraOscuro: { bg: 'F5F7FB', fg: '212121' },
  borde:       'C5CAE9',
  bordeFuerte: '1A237E',
};

const colAncho = (label, filas, key, tipo) => {
  let m = String(label || '').length;
  for (const f of filas) {
    const v = f?.[key];
    if (v != null) m = Math.max(m, String(v).length);
  }
  if (tipo === 'fecha') m = Math.max(m, 11);
  if (tipo === 'decimal' || tipo === 'entero') m = Math.max(m, 10);
  return Math.min(Math.max(m + 2, 10), 42);
};

const exportarExcel = ({ nombre, descripcion, encabezado, columnas, filas }) => {
  const wb = XLSX.utils.book_new();
  const aoa = [];

  const totalCols = columnas.length || 1;
  const merges = [];

  // Fila 1: Título (nombre de la tabla)
  aoa.push([nombre || 'Tabla']);
  merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: totalCols - 1 } });

  // Fila 2: Descripción (si existe)
  let rowOffset = 1;
  if (descripcion && descripcion.trim()) {
    aoa.push([descripcion]);
    merges.push({ s: { r: rowOffset, c: 0 }, e: { r: rowOffset, c: totalCols - 1 } });
    rowOffset++;
  }

  // Fila 3: Encabezado personalizado (si existe)
  if (encabezado && encabezado.trim()) {
    aoa.push([encabezado]);
    merges.push({ s: { r: rowOffset, c: 0 }, e: { r: rowOffset, c: totalCols - 1 } });
    rowOffset++;
  }

  // Fila separadora vacía
  aoa.push(Array(totalCols).fill(''));
  rowOffset++;

  // Headers de columnas
  const headerRow = rowOffset;
  aoa.push(columnas.map(c => c.label));
  rowOffset++;

  // Datos: evaluar fórmulas antes de exportar
  const dataStart = rowOffset;
  for (let ri = 0; ri < filas.length; ri++) {
    const row = columnas.map((c, ci) => {
      const raw = filas[ri]?.[c.key] ?? '';
      const valor = esFormula(raw)
        ? evalFormula(raw, filas[ri], ri, columnas, filas, new Set([`${ri}:${ci}`]))
        : raw;
      if ((c.tipo === 'entero' || c.tipo === 'decimal') && valor !== '' && valor != null) {
        const n = toNum(valor);
        return n == null ? valor : n;
      }
      return valor;
    });
    aoa.push(row);
  }
  const dataEnd = aoa.length - 1;

  // ─── Construir worksheet ───
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!merges'] = merges;
  ws['!cols'] = columnas.map(c => ({ wch: colAncho(c.label, filas, c.key, c.tipo) }));
  ws['!rows'] = [];

  const border = { style: 'thin', color: { rgb: PALETA.borde } };
  const borderAll = { top: border, bottom: border, left: border, right: border };

  // Estilo: título
  {
    const addr = XLSX.utils.encode_cell({ r: 0, c: 0 });
    ws[addr].s = {
      font: { bold: true, sz: 18, color: { rgb: PALETA.titulo.fg }, name: 'Calibri' },
      fill: { patternType: 'solid', fgColor: { rgb: PALETA.titulo.bg } },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: borderAll,
    };
    ws['!rows'][0] = { hpt: 34 };
  }

  // Estilo: descripción / encabezado (filas intermedias fusionadas)
  let fila = 1;
  if (descripcion && descripcion.trim()) {
    const addr = XLSX.utils.encode_cell({ r: fila, c: 0 });
    ws[addr].s = {
      font: { italic: true, sz: 11, color: { rgb: PALETA.subtitulo.fg }, name: 'Calibri' },
      fill: { patternType: 'solid', fgColor: { rgb: PALETA.subtitulo.bg } },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
      border: borderAll,
    };
    ws['!rows'][fila] = { hpt: 22 };
    fila++;
  }
  if (encabezado && encabezado.trim()) {
    const addr = XLSX.utils.encode_cell({ r: fila, c: 0 });
    ws[addr].s = {
      font: { bold: true, sz: 11, color: { rgb: PALETA.encabezado.fg }, name: 'Calibri' },
      fill: { patternType: 'solid', fgColor: { rgb: PALETA.encabezado.bg } },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
      border: borderAll,
    };
    // alto aproximado según líneas del encabezado
    const lineas = Math.max(1, (encabezado.match(/\n/g) || []).length + 1);
    ws['!rows'][fila] = { hpt: Math.min(20 + lineas * 14, 120) };
    fila++;
  }

  // Fila separadora — sin estilo
  ws['!rows'][fila] = { hpt: 6 };

  // Headers de columnas
  for (let c = 0; c < columnas.length; c++) {
    const addr = XLSX.utils.encode_cell({ r: headerRow, c });
    if (!ws[addr]) ws[addr] = { t: 's', v: columnas[c].label };
    ws[addr].s = {
      font: { bold: true, sz: 11, color: { rgb: PALETA.head.fg }, name: 'Calibri' },
      fill: { patternType: 'solid', fgColor: { rgb: PALETA.head.bg } },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
      border: {
        top:    { style: 'medium', color: { rgb: PALETA.bordeFuerte } },
        bottom: { style: 'medium', color: { rgb: PALETA.bordeFuerte } },
        left:   border,
        right:  border,
      },
    };
  }
  ws['!rows'][headerRow] = { hpt: 28 };

  // Celdas de datos con zebra + bordes + tipo
  for (let r = dataStart; r <= dataEnd; r++) {
    const zebra = (r - dataStart) % 2 === 0 ? PALETA.zebraClaro : PALETA.zebraOscuro;
    for (let c = 0; c < columnas.length; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      if (!ws[addr]) ws[addr] = { t: 's', v: '' };
      const col = columnas[c];
      const esNum = col.tipo === 'entero' || col.tipo === 'decimal';
      const esFecha = col.tipo === 'fecha';
      ws[addr].s = {
        font:  { sz: 10.5, color: { rgb: zebra.fg }, name: 'Calibri' },
        fill:  { patternType: 'solid', fgColor: { rgb: zebra.bg } },
        alignment: {
          horizontal: esNum ? 'right' : (esFecha ? 'center' : 'left'),
          vertical: 'center',
          wrapText: false,
        },
        border: borderAll,
        ...(col.tipo === 'entero'  ? { numFmt: '#,##0' } : {}),
        ...(col.tipo === 'decimal' ? { numFmt: '#,##0.00' } : {}),
      };
      // numFmt debe ir en z para xlsx-js-style
      if (col.tipo === 'entero')  ws[addr].z = '#,##0';
      if (col.tipo === 'decimal') ws[addr].z = '#,##0.00';
    }
  }

  // Freeze pane justo debajo del header
  ws['!freeze'] = { xSplit: 0, ySplit: headerRow + 1 };
  ws['!autofilter'] = { ref: XLSX.utils.encode_range({
    s: { r: headerRow, c: 0 },
    e: { r: Math.max(headerRow, dataEnd), c: totalCols - 1 },
  }) };

  XLSX.utils.book_append_sheet(wb, ws, (nombre || 'Tabla').slice(0, 28));
  const safe = (nombre || 'tabla').replace(/[\\/:*?"<>|]/g, '_');
  XLSX.writeFile(wb, `${safe}.xlsx`);
};

/* ══════════════════════════ Editor ══════════════════════════ */
const EditorTabla = ({ tabla, onCerrar }) => {
  const [nombre, setNombre]         = useState(tabla.nombre);
  const [descripcion, setDescripcion] = useState(tabla.descripcion || '');
  const [encabezado, setEncabezado] = useState(tabla.encabezado || '');
  const [columnas, setColumnas]     = useState(tabla.columnas || []);
  const [filas, setFilas]           = useState(tabla.filas || []);
  const [saveState, setSaveState]   = useState('saved');   // 'saved' | 'saving' | 'error'
  const firstRender = useRef(true);
  const timerRef = useRef(null);

  const guardar = useCallback(async () => {
    setSaveState('saving');
    try {
      await API.put(`/mis-tablas/${tabla.id}`, {
        nombre, descripcion, encabezado, columnas, filas,
      });
      setSaveState('saved');
    } catch (err) {
      console.error(err);
      setSaveState('error');
    }
  }, [tabla.id, nombre, descripcion, encabezado, columnas, filas]);

  // auto-save con debounce
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    if (timerRef.current) clearTimeout(timerRef.current);
    setSaveState('saving');
    timerRef.current = setTimeout(() => { guardar(); }, 900);
    return () => clearTimeout(timerRef.current);
  }, [nombre, descripcion, encabezado, columnas, filas, guardar]);

  const setCelda = (rowIdx, colKey, val) => {
    setFilas(prev => {
      const copia = [...prev];
      copia[rowIdx] = { ...copia[rowIdx], [colKey]: val };
      return copia;
    });
  };

  const agregarFila = () => {
    const nueva = {};
    for (const c of columnas) nueva[c.key] = '';
    setFilas([...filas, nueva]);
  };

  const eliminarFila = (idx) => {
    if (!confirm('¿Eliminar esta fila?')) return;
    setFilas(filas.filter((_, i) => i !== idx));
  };

  const agregarColumna = () => {
    const label = prompt('Nombre de la columna:');
    if (!label) return;
    const tipo = prompt('Tipo (texto, entero, decimal, fecha):', 'texto') || 'texto';
    if (!['texto','entero','decimal','fecha'].includes(tipo)) {
      alert('Tipo inválido. Debe ser: texto, entero, decimal o fecha.');
      return;
    }
    const keys = new Set(columnas.map(c => c.key));
    let base = slugKey(label, columnas.length);
    let key = base, n = 2;
    while (keys.has(key)) { key = `${base}_${n++}`; }
    setColumnas([...columnas, { key, label, tipo }]);
    setFilas(filas.map(f => ({ ...f, [key]: '' })));
  };

  const eliminarColumna = (idx) => {
    const c = columnas[idx];
    if (!confirm(`¿Eliminar la columna "${c.label}"?`)) return;
    setColumnas(columnas.filter((_, i) => i !== idx));
    setFilas(filas.map(f => {
      const { [c.key]: _, ...resto } = f;
      return resto;
    }));
  };

  const renombrarColumna = (idx) => {
    const c = columnas[idx];
    const nuevo = prompt('Nuevo nombre:', c.label);
    if (!nuevo) return;
    const copia = [...columnas];
    copia[idx] = { ...c, label: nuevo };
    setColumnas(copia);
  };

  const cambiarTipoColumna = (idx) => {
    const c = columnas[idx];
    const tipo = prompt('Tipo (texto, entero, decimal, fecha):', c.tipo);
    if (!tipo || !['texto','entero','decimal','fecha'].includes(tipo)) return;
    const copia = [...columnas];
    copia[idx] = { ...c, tipo };
    setColumnas(copia);
  };

  // Mueve la columna en `idx` una posición a izquierda (dir=-1) o derecha (dir=+1).
  // No reordena las filas — solo el array de columnas. Como las filas son objetos
  // accedidos por `key`, la presentación cambia automáticamente en la tabla y en
  // la exportación a Excel.
  const moverColumna = (idx, dir) => {
    const dest = idx + dir;
    if (dest < 0 || dest >= columnas.length) return;
    const copia = [...columnas];
    const [c] = copia.splice(idx, 1);
    copia.splice(dest, 0, c);
    setColumnas(copia);
  };

  // Estado de ordenamiento global: { colKey, dir: 'asc'|'desc' } o null.
  const [sortState, setSortState] = useState(null);

  // Click ordena: 1ª vez asc, 2ª desc, 3ª restaura. Comparación natural para
  // texto y numérica para enteros/decimales. Las fórmulas se ordenan por su
  // valor calculado.
  const ordenarPorColumna = (idx) => {
    const col = columnas[idx];
    const next = !sortState || sortState.colKey !== col.key
      ? { colKey: col.key, dir: 'asc' }
      : sortState.dir === 'asc'
        ? { colKey: col.key, dir: 'desc' }
        : null;
    setSortState(next);
    if (!next) return; // tercer click — no hacemos nada (mantiene orden actual)

    const esNum = col.tipo === 'entero' || col.tipo === 'decimal';
    const valorOrden = (fila, ri) => {
      const raw = fila[col.key];
      const v = esFormula(raw)
        ? evalFormula(raw, fila, ri, columnas, filas, new Set([`${ri}:${idx}`]))
        : raw;
      return v;
    };

    const filasIndexadas = filas.map((f, i) => ({ f, i }));
    filasIndexadas.sort((a, b) => {
      const va = valorOrden(a.f, a.i);
      const vb = valorOrden(b.f, b.i);
      // Vacíos siempre al final (independiente de la dirección).
      const aVac = va === '' || va == null;
      const bVac = vb === '' || vb == null;
      if (aVac && bVac) return 0;
      if (aVac) return 1;
      if (bVac) return -1;
      let r;
      if (esNum) {
        r = (toNum(va) ?? 0) - (toNum(vb) ?? 0);
      } else {
        r = cmpNatural(va, vb);
      }
      return next.dir === 'asc' ? r : -r;
    });

    setFilas(filasIndexadas.map(x => x.f));
  };

  const inputTypeFor = (tipo) => {
    if (tipo === 'entero' || tipo === 'decimal') return 'number';
    if (tipo === 'fecha') return 'date';
    return 'text';
  };

  const stepFor = (tipo) => {
    if (tipo === 'entero') return '1';
    if (tipo === 'decimal') return 'any';
    return undefined;
  };

  return (
    <div className="admin-layout">
      <Sidebar />
      <div className="admin-content">
        <div className="mt-editor-header">
          <button className="mt-btn secondary" onClick={onCerrar}>← Volver</button>
          <input
            value={nombre}
            onChange={e => setNombre(e.target.value)}
            style={{
              fontSize: '1.3rem', fontWeight: 700, color: '#1a237e',
              border: 'none', borderBottom: '2px solid transparent', padding: '0.3rem 0.2rem',
              flex: 1, minWidth: '200px', background: 'transparent', outline: 'none',
            }}
            onFocus={e => e.target.style.borderBottomColor = '#1a237e'}
            onBlur={e => e.target.style.borderBottomColor = 'transparent'}
          />
          <button
            className="mt-btn success"
            onClick={() => exportarExcel({ nombre, descripcion, encabezado, columnas, filas })}
            disabled={columnas.length === 0}
            title="Descargar como Excel con diseño"
          >
            📊 Exportar a Excel
          </button>
          <span className={`mt-save-status ${saveState}`}>
            {saveState === 'saving' && '💾 Guardando...'}
            {saveState === 'saved'  && '✓ Guardado'}
            {saveState === 'error'  && '⚠ Error al guardar'}
          </span>
        </div>

        <input
          value={descripcion}
          onChange={e => setDescripcion(e.target.value)}
          placeholder="Descripción..."
          style={{
            width: '100%', border: 'none', borderBottom: '1px solid #e0e0e0',
            padding: '0.4rem 0.2rem', fontSize: '0.9rem', color: '#555',
            background: 'transparent', outline: 'none', marginBottom: '0.8rem',
          }}
        />

        <div className="mt-encabezado">
          <textarea
            value={encabezado}
            onChange={e => setEncabezado(e.target.value)}
            placeholder="Encabezado de la tabla (opcional)..."
          />
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.6rem', flexWrap: 'wrap' }}>
          <button className="mt-btn primary"   onClick={agregarColumna}>+ Columna</button>
          <button className="mt-btn primary"   onClick={agregarFila} disabled={columnas.length === 0}>+ Fila</button>
        </div>

        <div className="mt-formula-help">
          <strong>Fórmulas:</strong>{' '}
          <code>=promedio(A,B,C)</code>{' '}
          <code>=sumar(A,B,C)</code>{' '}
          <code>=contar(A,B,C)</code>{' '}
          — usa letras de columna de la fila actual. Para una columna completa: <code>=sumar(A:A)</code>. Rango: <code>=promedio(A1:A5)</code>.
        </div>

        {columnas.length === 0 ? (
          <div className="mt-empty">
            <p>Esta tabla está vacía.</p>
            <p>Agrega una columna para comenzar.</p>
          </div>
        ) : (
          <div className="mt-table-wrapper">
            <table className="mt-table">
              <thead>
                <tr>
                  <th className="mt-row-idx">#</th>
                  {columnas.map((c, i) => {
                    const sortHere = sortState?.colKey === c.key;
                    const sortIcon = sortHere ? (sortState.dir === 'asc' ? '↑' : '↓') : '↕';
                    return (
                      <th key={c.key}>
                        <span className="mt-col-letter">{colLetter(i)}</span>
                        {c.label}
                        <span style={{ fontSize: '0.65rem', opacity: 0.7, marginLeft: '0.3rem' }}>({c.tipo})</span>
                        <span className="mt-col-actions">
                          <button title="Mover ←" disabled={i === 0} onClick={() => moverColumna(i, -1)}>◀</button>
                          <button title="Mover →" disabled={i === columnas.length - 1} onClick={() => moverColumna(i, +1)}>▶</button>
                          <button
                            title={sortHere
                              ? (sortState.dir === 'asc' ? 'Ordenado ascendente — clic para descendente' : 'Ordenado descendente — clic para limpiar')
                              : 'Ordenar por esta columna'}
                            className={sortHere ? 'mt-col-sort active' : 'mt-col-sort'}
                            onClick={() => ordenarPorColumna(i)}
                          >
                            {sortIcon}
                          </button>
                          <button title="Renombrar" onClick={() => renombrarColumna(i)}>✎</button>
                          <button title="Cambiar tipo" onClick={() => cambiarTipoColumna(i)}>⚙</button>
                          <button title="Eliminar" onClick={() => eliminarColumna(i)}>✕</button>
                        </span>
                      </th>
                    );
                  })}
                  <th style={{ minWidth: '40px' }}></th>
                </tr>
              </thead>
              <tbody>
                {filas.map((fila, ri) => (
                  <tr key={ri}>
                    <td className="mt-row-idx">{ri + 1}</td>
                    {columnas.map((c, ci) => {
                      const raw = fila[c.key] ?? '';
                      const esF = esFormula(raw);
                      const mostrado = esF
                        ? evalFormula(raw, fila, ri, columnas, filas, new Set([`${ri}:${ci}`]))
                        : raw;
                      return (
                        <td key={c.key} className={esF ? 'mt-formula-cell' : ''}>
                          <CeldaEditable
                            raw={raw}
                            mostrado={mostrado}
                            inputType={inputTypeFor(c.tipo)}
                            step={stepFor(c.tipo)}
                            onCommit={(nuevo) => setCelda(ri, c.key, nuevo)}
                          />
                        </td>
                      );
                    })}
                    <td style={{ textAlign: 'center' }}>
                      <button className="mt-row-delete" title="Eliminar fila" onClick={() => eliminarFila(ri)}>🗑</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

/* Celda: muestra el valor calculado de la fórmula cuando no está enfocada;
   al hacer focus permite editar la expresión `=…` original. */
const CeldaEditable = ({ raw, mostrado, inputType, step, onCommit }) => {
  const [focus, setFocus] = useState(false);
  const [local, setLocal] = useState(raw);

  useEffect(() => { setLocal(raw); }, [raw]);

  const esF = esFormula(local);
  const valorVista = esF ? mostrado : local;

  // Si estamos editando una fórmula (empieza con =), usamos text siempre
  const tipoInput = focus
    ? (local && local.toString().startsWith('=') ? 'text' : inputType)
    : (esF ? 'text' : inputType);

  return (
    <input
      type={tipoInput}
      step={step}
      value={focus ? local : (valorVista ?? '')}
      onFocus={() => setFocus(true)}
      onBlur={() => {
        setFocus(false);
        if (local !== raw) onCommit(local);
      }}
      onChange={(e) => setLocal(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.target.blur(); }
        if (e.key === 'Escape') { setLocal(raw); e.target.blur(); }
      }}
    />
  );
};

export default MisTablas;
