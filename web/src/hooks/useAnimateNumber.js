import { useEffect, useRef } from 'react';

export function useAnimateNumber(target, decimals = 1) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (target === null || target === undefined || isNaN(target)) {
      el.textContent = '—';
      return;
    }
    const dur = 900;
    const t0 = performance.now();
    let raf = 0;
    function tick(now) {
      const p = Math.min(1, (now - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = (target * eased).toFixed(decimals);
      if (p < 1) raf = requestAnimationFrame(tick);
      else el.textContent = decimals === 0 ? Math.round(target).toString() : target.toFixed(decimals);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, decimals]);
  return ref;
}
