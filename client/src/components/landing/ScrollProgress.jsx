import { useEffect, useRef } from 'react';

// Barra fina arriba de la página que se llena según el avance del scroll.
const ScrollProgress = () => {
  const ref = useRef(null);

  useEffect(() => {
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const h = document.documentElement;
        const max = h.scrollHeight - h.clientHeight;
        const p = max > 0 ? h.scrollTop / max : 0;
        if (ref.current) ref.current.style.setProperty('--lp-scroll', p.toFixed(4));
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return <div ref={ref} className="lp-scrollbar" aria-hidden="true" />;
};

export default ScrollProgress;
