// Selector de asistencia para celulares: en móvil no hay teclado físico para
// las teclas X/E/P/F/R, así que al tocar una celda se abre este panel.
// Solo se usa cuando useEsTactil() es true; en desktop no se monta.

const OPCIONES = [
  { k: 'x', label: 'Asistió',  bg: '#c8e6c9', color: '#1b5e20' },
  { k: 'f', label: 'Falta',    bg: '#ffcdd2', color: '#b71c1c' },
  { k: 'e', label: 'Enfermo',  bg: '#fff9c4', color: '#e65100' },
  { k: 'p', label: 'Permiso',  bg: '#bbdefb', color: '#0d47a1' },
  { k: 'r', label: 'Recuperó', bg: '#d1c4e9', color: '#4527a0' },
];

export default function SelectorAsistenciaMovil({ titulo, subtitulo, valor, onElegir, onCerrar }) {
  return (
    <div
      onClick={onCerrar}
      style={{
        position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.35)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-label="Marcar asistencia"
        style={{
          background: '#fff', width: '100%', maxWidth: 480, borderRadius: '14px 14px 0 0',
          padding: '14px 16px calc(14px + env(safe-area-inset-bottom))',
          boxShadow: '0 -4px 16px rgba(0,0,0,0.15)',
        }}
      >
        <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#222' }}>{titulo}</div>
        {subtitulo && <div style={{ fontSize: '0.8rem', color: '#777', marginTop: 2 }}>{subtitulo}</div>}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, marginTop: 12 }}>
          {OPCIONES.map(o => (
            <button
              key={o.k}
              type="button"
              onClick={() => onElegir(o.k)}
              style={{
                background: o.bg, color: o.color, border: valor === o.k ? `2px solid ${o.color}` : '2px solid transparent',
                borderRadius: 10, padding: '10px 2px', cursor: 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
              }}
            >
              <span style={{ fontWeight: 800, fontSize: '1.1rem' }}>{o.k.toUpperCase()}</span>
              <span style={{ fontSize: '0.62rem', fontWeight: 600 }}>{o.label}</span>
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button
            type="button"
            onClick={() => onElegir('')}
            disabled={!valor}
            style={{
              flex: 1, padding: '10px', borderRadius: 10, border: '1px solid #ddd',
              background: '#fafafa', color: valor ? '#c62828' : '#bbb', fontWeight: 600,
            }}
          >Borrar</button>
          <button
            type="button"
            onClick={onCerrar}
            style={{
              flex: 1, padding: '10px', borderRadius: 10, border: '1px solid #ddd',
              background: '#fff', color: '#444', fontWeight: 600,
            }}
          >Cancelar</button>
        </div>
      </div>
    </div>
  );
}
