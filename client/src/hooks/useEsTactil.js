import { useEffect, useState } from 'react';

// true en celulares/tablets (pantalla táctil sin mouse). En desktop con mouse
// es false aunque la ventana sea angosta, así el escritorio no cambia.
const QUERY = '(hover: none) and (pointer: coarse)';

export default function useEsTactil() {
  const [tactil, setTactil] = useState(
    () => typeof window !== 'undefined' && !!window.matchMedia?.(QUERY).matches
  );
  useEffect(() => {
    const mq = window.matchMedia?.(QUERY);
    if (!mq) return;
    const onChange = e => setTactil(e.matches);
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);
  return tactil;
}
