import { useState, useEffect, useCallback } from 'react';
import API from '../api/axios';

const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

const SCOPES = [
  { value: 'global',      label: 'Todos los alumnos (global)' },
  { value: 'diplomado',   label: 'Por diplomado' },
  { value: 'horario',     label: 'Por horario' },
  { value: 'laboratorio', label: 'Por laboratorio' },
  { value: 'dia',         label: 'Por día de clases' },
  { value: 'alumno',      label: 'Alumno específico' },
];

const draftInicial = () => ({
  scope_tipo: 'global',
  scope_valor: '',
  mes_inicio: 1,
  mes_fin: 12,
  multiplicador: 1,
  descripcion: '',
});

export default function ConfigPagosModal({ anio, onClose, filtros, alumnos }) {
  const [reglas, setReglas] = useState([]);
  const [draft, setDraft] = useState(draftInicial());
  const [editId, setEditId] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const { data } = await API.get(`/config-pagos?anio=${anio}`);
      setReglas(data);
    } catch (err) { console.error(err); }
    finally { setCargando(false); }
  }, [anio]);

  useEffect(() => { cargar(); }, [cargar]);

  const optionsParaScope = () => {
    switch (draft.scope_tipo) {
      case 'diplomado':   return [...new Set((alumnos || []).map(a => a.diplomado).filter(Boolean))].sort();
      case 'horario':     return filtros?.horarios || [];
      case 'laboratorio': return filtros?.laboratorios || [];
      case 'dia':         return filtros?.dias || [];
      case 'alumno':      return (alumnos || []).map(a => ({ id: a.id, label: `${a.clave} — ${a.nombre} ${a.apellido}` }));
      default: return [];
    }
  };

  const guardarRegla = async () => {
    setError('');
    if (draft.scope_tipo !== 'global' && !String(draft.scope_valor).trim()) {
      setError('Selecciona un valor para el scope.');
      return;
    }
    setGuardando(true);
    try {
      const payload = {
        anio,
        scope_tipo: draft.scope_tipo,
        scope_valor: draft.scope_tipo === 'global' ? null : String(draft.scope_valor),
        mes_inicio: parseInt(draft.mes_inicio),
        mes_fin: parseInt(draft.mes_fin),
        multiplicador: parseFloat(draft.multiplicador),
        descripcion: draft.descripcion || null,
      };
      if (editId) await API.put(`/config-pagos/${editId}`, payload);
      else        await API.post('/config-pagos', payload);
      setDraft(draftInicial());
      setEditId(null);
      await cargar();
    } catch (err) {
      setError(err.response?.data?.message || 'Error al guardar.');
    } finally { setGuardando(false); }
  };

  const editarRegla = (r) => {
    setEditId(r.id);
    setDraft({
      scope_tipo: r.scope_tipo,
      scope_valor: r.scope_valor || '',
      mes_inicio: r.mes_inicio,
      mes_fin: r.mes_fin,
      multiplicador: r.multiplicador,
      descripcion: r.descripcion || '',
    });
  };

  const eliminarRegla = async (r) => {
    if (!window.confirm(`¿Eliminar la regla "${describir(r)}"?`)) return;
    try {
      await API.delete(`/config-pagos/${r.id}`);
      await cargar();
    } catch (err) {
      setError(err.response?.data?.message || 'Error al eliminar.');
    }
  };

  const describir = (r) => {
    const mes = `${MESES[r.mes_inicio-1]}–${MESES[r.mes_fin-1]}`;
    const mult = parseFloat(r.multiplicador) === 1
      ? 'cuota completa'
      : `cuota × ${parseFloat(r.multiplicador).toFixed(2)}`;
    const scopeStr = r.scope_tipo === 'global'
      ? 'TODOS'
      : `${r.scope_tipo}: ${r.scope_valor}`;
    return `${scopeStr} · ${mes} · ${mult}`;
  };

  const opts = optionsParaScope();

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '1rem',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 12,
          width: '100%', maxWidth: 820, maxHeight: '92vh', overflow: 'auto',
          padding: '1.5rem', boxShadow: '0 6px 22px rgba(0,0,0,0.25)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
          <h2 style={{ margin: 0, color: '#1a237e' }}>⚙ Configuración de pagos — {anio}</h2>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', fontSize: '1.4rem', cursor: 'pointer', color: '#666' }}>✕</button>
        </div>
        <p style={{ color: '#666', fontSize: '0.85rem', marginBottom: '1rem' }}>
          Cada regla define qué meses se le cobran a un grupo de alumnos y con qué multiplicador
          (1.00 = cuota completa, 0.50 = medio mes). La regla más específica (alumno) gana sobre
          las generales (global). Si no hay reglas para un alumno, se le cobran los 12 meses normales.
        </p>

        {/* ── Formulario nueva/editar regla ── */}
        <div style={{
          background: '#f8f9fe', border: '1px solid #e3e8ff',
          borderRadius: 10, padding: '1rem', marginBottom: '1rem',
        }}>
          <div style={{ fontWeight: 700, color: '#1a237e', marginBottom: 8 }}>
            {editId ? 'Editar regla' : 'Nueva regla'}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem', marginBottom: '0.5rem' }}>
            <div>
              <label style={{ fontSize: '0.78rem', color: '#555' }}>Aplica a</label>
              <select
                value={draft.scope_tipo}
                onChange={e => setDraft({ ...draft, scope_tipo: e.target.value, scope_valor: '' })}
                style={inputStyle}
              >
                {SCOPES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>

            {draft.scope_tipo !== 'global' && (
              <div>
                <label style={{ fontSize: '0.78rem', color: '#555' }}>Valor</label>
                {draft.scope_tipo === 'alumno' ? (
                  <select
                    value={draft.scope_valor}
                    onChange={e => setDraft({ ...draft, scope_valor: e.target.value })}
                    style={inputStyle}
                  >
                    <option value="">— selecciona alumno —</option>
                    {opts.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                  </select>
                ) : (
                  <select
                    value={draft.scope_valor}
                    onChange={e => setDraft({ ...draft, scope_valor: e.target.value })}
                    style={inputStyle}
                  >
                    <option value="">— selecciona —</option>
                    {opts.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                )}
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.6rem', marginBottom: '0.5rem' }}>
            <div>
              <label style={{ fontSize: '0.78rem', color: '#555' }}>Mes inicio</label>
              <select
                value={draft.mes_inicio}
                onChange={e => setDraft({ ...draft, mes_inicio: Number(e.target.value) })}
                style={inputStyle}
              >
                {MESES.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: '0.78rem', color: '#555' }}>Mes fin</label>
              <select
                value={draft.mes_fin}
                onChange={e => setDraft({ ...draft, mes_fin: Number(e.target.value) })}
                style={inputStyle}
              >
                {MESES.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: '0.78rem', color: '#555' }}>Multiplicador (cuota)</label>
              <input
                type="number" min="0.05" max="5" step="0.05"
                value={draft.multiplicador}
                onChange={e => setDraft({ ...draft, multiplicador: e.target.value })}
                style={inputStyle}
              />
            </div>
          </div>

          <div style={{ marginBottom: '0.5rem' }}>
            <label style={{ fontSize: '0.78rem', color: '#555' }}>Descripción (opcional)</label>
            <input
              type="text"
              value={draft.descripcion}
              onChange={e => setDraft({ ...draft, descripcion: e.target.value })}
              placeholder="Ej. Promoción medio mes octubre"
              style={inputStyle}
            />
          </div>

          {error && (
            <div style={{ color: '#c62828', fontSize: '0.85rem', marginBottom: 8 }}>{error}</div>
          )}

          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
            {editId && (
              <button
                className="btn-cancel"
                onClick={() => { setDraft(draftInicial()); setEditId(null); setError(''); }}
              >
                Cancelar edición
              </button>
            )}
            <button className="btn-primary" onClick={guardarRegla} disabled={guardando}>
              {guardando ? 'Guardando...' : (editId ? 'Actualizar regla' : '+ Crear regla')}
            </button>
          </div>
        </div>

        {/* ── Lista de reglas existentes ── */}
        <div style={{ fontWeight: 700, color: '#1a237e', marginBottom: 8 }}>
          Reglas activas ({reglas.length})
        </div>
        {cargando ? (
          <p style={{ color: '#888' }}>Cargando...</p>
        ) : reglas.length === 0 ? (
          <p style={{ color: '#888', fontStyle: 'italic' }}>
            No hay reglas. Sin reglas se cobra el año completo (12 meses) con cuota normal.
          </p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ background: '#e8eaf6' }}>
                <th style={th}>Aplica a</th>
                <th style={th}>Rango</th>
                <th style={{ ...th, textAlign: 'right' }}>×</th>
                <th style={th}>Descripción</th>
                <th style={{ ...th, textAlign: 'center', width: 90 }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {reglas.map(r => (
                <tr key={r.id} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={td}>
                    {r.scope_tipo === 'global'
                      ? <strong>TODOS</strong>
                      : <span><strong>{r.scope_tipo}:</strong> {r.scope_valor}</span>}
                  </td>
                  <td style={td}>{MESES[r.mes_inicio-1]} – {MESES[r.mes_fin-1]}</td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{parseFloat(r.multiplicador).toFixed(2)}</td>
                  <td style={{ ...td, color: '#666' }}>{r.descripcion || '—'}</td>
                  <td style={{ ...td, textAlign: 'center' }}>
                    <button onClick={() => editarRegla(r)} style={btnMini}>✎</button>
                    <button onClick={() => eliminarRegla(r)} style={{ ...btnMini, background: '#e53935', color: '#fff' }}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

const inputStyle = {
  width: '100%', padding: '0.45rem 0.6rem',
  border: '1.5px solid #c5cae9', borderRadius: 6,
  fontSize: '0.88rem', boxSizing: 'border-box',
};

const th = { padding: '0.4rem 0.6rem', textAlign: 'left', fontSize: '0.78rem', color: '#1a237e' };
const td = { padding: '0.4rem 0.6rem' };
const btnMini = {
  background: '#e8eaf6', border: 'none', borderRadius: 4,
  padding: '3px 8px', cursor: 'pointer', fontSize: '0.85rem', marginRight: 4,
};
