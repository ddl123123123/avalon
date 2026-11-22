import { useEffect, useRef } from 'react';
import { useReducedMotion } from './motion';

/** 背景里缓缓上浮的金色微尘，像彩窗透下的光柱里的灰。 */
export function Motes({ density = 1 }: { density?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;
    let w = 0;
    let h = 0;
    let raf = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    type Mote = { x: number; y: number; r: number; vx: number; vy: number; phase: number; speed: number };
    let motes: Mote[] = [];
    const spawn = (): Mote => ({
      x: Math.random() * w,
      y: Math.random() * h,
      r: 0.5 + Math.random() * 1.6,
      vx: (Math.random() - 0.5) * 0.12,
      vy: -(0.05 + Math.random() * 0.22),
      phase: Math.random() * Math.PI * 2,
      speed: 0.4 + Math.random() * 1.2,
    });

    const resize = () => {
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.round(Math.min(90, (w * h) / 16000) * density);
      motes = Array.from({ length: count }, spawn);
    };

    const draw = (t: number) => {
      ctx.clearRect(0, 0, w, h);
      for (const m of motes) {
        if (!reduced) {
          m.x += m.vx + Math.sin(t / 2400 + m.phase) * 0.06;
          m.y += m.vy;
          if (m.y < -4) {
            m.y = h + 4;
            m.x = Math.random() * w;
          }
          if (m.x < -4) m.x = w + 4;
          if (m.x > w + 4) m.x = -4;
        }
        const twinkle = 0.25 + 0.75 * (0.5 + 0.5 * Math.sin((t / 1000) * m.speed + m.phase));
        ctx.globalAlpha = twinkle * 0.7;
        ctx.fillStyle = '#f2d48a';
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
        ctx.fill();
      }
      if (!reduced) raf = requestAnimationFrame(draw);
    };

    resize();
    raf = requestAnimationFrame(draw);
    const ro = new ResizeObserver(() => {
      resize();
      if (reduced) draw(0);
    });
    ro.observe(canvas);
    const onVisibility = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden && !reduced) raf = requestAnimationFrame(draw);
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [density, reduced]);

  return <canvas ref={ref} className="motes" aria-hidden="true" />;
}
