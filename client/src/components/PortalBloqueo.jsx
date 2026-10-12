import { Lock } from 'lucide-react';

// Mensaje que ve el alumno cuando sus notas no están disponibles.
const TEXTOS = {
  solvencia: {
    titulo: 'Notas no disponibles',
    detalle: 'Para ver tus notas debes estar al día con tus mensualidades. Comunícate con la administración.',
  },
  no_publicado: {
    titulo: 'Aún no publicadas',
    detalle: 'Estas notas todavía no han sido publicadas por la academia.',
  },
};

export default function PortalBloqueo({ motivo }) {
  const t = TEXTOS[motivo] || TEXTOS.no_publicado;
  return (
    <div className="card" style={{ textAlign: 'center', padding: '2rem 1rem', color: '#555' }}>
      <Lock size={28} style={{ color: '#9e9e9e' }} />
      <h3 style={{ margin: '0.5rem 0 0.25rem', color: '#1a237e', fontSize: '1rem' }}>{t.titulo}</h3>
      <p style={{ fontSize: '0.88rem', margin: 0 }}>{t.detalle}</p>
    </div>
  );
}
