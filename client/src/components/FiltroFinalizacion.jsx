import { MESES_FINALIZACION, SIN_DEFINIR } from '../lib/finalizacion';
import { useAniosFiltros } from '../lib/anios';

/**
 * Par de selects "mes de finalización" + "año de finalización".
 *
 * Lo comparten Alumnos, Asistencia, Mecanografía, Notas TAC, Notas de
 * Diplomados, Impresión, Constancias y Mis Tablas para que el filtro se vea y
 * se comporte igual en todos lados.
 *
 * Ambos valores son strings ('' = sin filtrar, 'sin' = a quien le falta el
 * dato) porque salen directo de un <select> y viajan así en el query string.
 */
export default function FiltroFinalizacion({ mes, anio, onMes, onAnio, compacto = false }) {
  const { anios } = useAniosFiltros();
  return (
    <>
      <select
        value={mes}
        onChange={e => onMes(e.target.value)}
        title="Mes en que el alumno termina"
        style={{ minWidth: compacto ? 130 : 160 }}
      >
        <option value="">Todos los meses fin.</option>
        {MESES_FINALIZACION.map(m => (
          <option key={m.num} value={m.num}>{m.nombre}</option>
        ))}
        <option value={SIN_DEFINIR}>— Sin definir —</option>
      </select>
      <select
        value={anio}
        onChange={e => onAnio(e.target.value)}
        title="Año en que el alumno termina"
        style={{ minWidth: compacto ? 110 : 140 }}
      >
        <option value="">Todos los años fin.</option>
        {anios.map(a => <option key={a} value={a}>{a}</option>)}
        <option value={SIN_DEFINIR}>— Sin definir —</option>
      </select>
    </>
  );
}
