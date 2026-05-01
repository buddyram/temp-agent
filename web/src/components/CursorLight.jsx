import { useEffect, useRef } from 'react';

export default function CursorLight() {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    let raf = null;
    function onMove(e) {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        el.style.left = e.clientX + 'px';
        el.style.top = e.clientY + 'px';
        raf = null;
      });
    }
    window.addEventListener('mousemove', onMove);
    return () => {
      window.removeEventListener('mousemove', onMove);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);
  return <div className="cursor-light" ref={ref} />;
}
