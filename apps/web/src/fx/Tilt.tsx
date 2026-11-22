import { useRef, type CSSProperties, type ReactNode } from 'react';
import { useReducedMotion } from './motion';

/**
 * 指针划过时的立体倾斜 + 跟随高光。
 * 高光的位置通过 CSS 变量 --mx / --my 暴露给子元素（见 .glare）。
 */
export function Tilt({
  children,
  className = '',
  max = 10,
  style,
}: {
  children: ReactNode;
  className?: string;
  max?: number;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  const onMove = (e: React.PointerEvent) => {
    const el = ref.current;
    if (!el || reduced || e.pointerType === 'touch') return;
    const rect = el.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    el.style.setProperty('--rx', `${(0.5 - py) * max * 2}deg`);
    el.style.setProperty('--ry', `${(px - 0.5) * max * 2}deg`);
    el.style.setProperty('--mx', `${px * 100}%`);
    el.style.setProperty('--my', `${py * 100}%`);
    el.style.setProperty('--glare', '1');
  };
  const onLeave = () => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty('--rx', '0deg');
    el.style.setProperty('--ry', '0deg');
    el.style.setProperty('--glare', '0');
  };

  return (
    <div ref={ref} className={`tilt ${className}`} style={style} onPointerMove={onMove} onPointerLeave={onLeave}>
      {children}
      <span className="glare" aria-hidden="true" />
    </div>
  );
}
