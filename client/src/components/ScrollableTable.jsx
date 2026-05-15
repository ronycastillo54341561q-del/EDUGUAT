import { useRef, useEffect } from 'react';

export default function ScrollableTable({ children }) {
  const topRef    = useRef(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    const top    = topRef.current;
    const bottom = scrollRef.current;
    if (!top || !bottom) return;

    const inner = top.firstElementChild;

    const updateWidth = () => {
      if (inner) inner.style.width = bottom.scrollWidth + 'px';
    };

    const onBottom = () => { top.scrollLeft = bottom.scrollLeft; };
    const onTop    = () => { bottom.scrollLeft = top.scrollLeft; };

    bottom.addEventListener('scroll', onBottom);
    top.addEventListener('scroll', onTop);
    updateWidth();

    const ro = new ResizeObserver(updateWidth);
    ro.observe(bottom);

    return () => {
      bottom.removeEventListener('scroll', onBottom);
      top.removeEventListener('scroll', onTop);
      ro.disconnect();
    };
  }, []);

  return (
    <div className="st-wrapper">
      <div ref={topRef} className="st-top-scroll">
        <div className="st-mirror-inner" />
      </div>
      <div ref={scrollRef} className="table-scroll">
        {children}
      </div>
    </div>
  );
}
