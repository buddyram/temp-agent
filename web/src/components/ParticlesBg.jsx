import { useEffect, useRef } from 'react';

export default function ParticlesBg() {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas.getContext('2d');
    let W = 0, H = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    function resize() {
      W = window.innerWidth; H = window.innerHeight;
      canvas.width = W * dpr; canvas.height = H * dpr;
      canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener('resize', resize);

    const COLORS = ['#ff7a59', '#5fa8ff', '#c084fc', '#ffa37a', '#6ee7a7'];
    const N = 110;
    const particles = [];
    for (let i = 0; i < N; i++) {
      particles.push({
        x: Math.random() * W,
        y: Math.random() * H,
        r: 0.8 + Math.random() * 2.2,
        vx: (0.15 + Math.random() * 0.4) * (Math.random() < 0.5 ? 1 : -1),
        amp: 0.4 + Math.random() * 1.4,
        freq: 0.0008 + Math.random() * 0.002,
        phase: Math.random() * Math.PI * 2,
        color: COLORS[i % COLORS.length],
        alpha: 0.25 + Math.random() * 0.55,
      });
    }

    let raf;
    function tick(now) {
      ctx.clearRect(0, 0, W, H);
      for (const p of particles) {
        const vy = Math.sin(p.x * 0.005 + now * p.freq + p.phase) * p.amp;
        p.x += p.vx;
        p.y += vy * 0.6;
        if (p.x < -10) p.x = W + 10;
        if (p.x > W + 10) p.x = -10;
        if (p.y < -10) p.y = H + 10;
        if (p.y > H + 10) p.y = -10;
        ctx.beginPath();
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.alpha;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 14;
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(raf);
    };
  }, []);

  return <canvas id="particles-bg" ref={ref} />;
}
