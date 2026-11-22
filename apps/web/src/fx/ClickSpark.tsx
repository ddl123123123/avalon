import { useEffect, useRef } from 'react';
import { useReducedMotion } from './motion';

/** 点击时迸出几道金色火星。挂一次在最外层即可。 */
export function ClickSpark() {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) return;
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const sparks: { x: number; y: number; angle: number; born: number }[] = [];
    const LIFE = 420;
    let raf = 0;

    const resize = () => {
      canvas.width = innerWidth * dpr;
      canvas.height = innerHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    addEventListener('resize', resize);

    const frame = (now: number) => {
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i]!;
        const p = (now - s.born) / LIFE;
        if (p >= 1) {
          sparks.splice(i, 1);
          continue;
        }
        const eased = 1 - (1 - p) ** 3;
        const d0 = 6 + eased * 22;
        const len = 9 * (1 - eased);
        ctx.strokeStyle = `rgba(240, 200, 110, ${1 - p})`;
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(s.x + Math.cos(s.angle) * d0, s.y + Math.sin(s.angle) * d0);
        ctx.lineTo(s.x + Math.cos(s.angle) * (d0 + len), s.y + Math.sin(s.angle) * (d0 + len));
        ctx.stroke();
      }
      raf = sparks.length ? requestAnimationFrame(frame) : 0;
    };

    const onDown = (e: PointerEvent) => {
      const now = performance.now();
      for (let i = 0; i < 8; i++) sparks.push({ x: e.clientX, y: e.clientY, angle: (Math.PI * 2 * i) / 8, born: now });
      if (!raf) raf = requestAnimationFrame(frame);
    };
    addEventListener('pointerdown', onDown);
    return () => {
      removeEventListener('pointerdown', onDown);
      removeEventListener('resize', resize);
      cancelAnimationFrame(raf);
    };
  }, [reduced]);

  return <canvas ref={ref} className="click-spark" aria-hidden="true" />;
}
