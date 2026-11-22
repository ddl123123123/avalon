import { polar, sector } from './geometry';

const C = 300;
const LEAD = '#05081a';
const OUTER = ['#1d3f94', '#4c86ea', '#b8263b', '#1d3f94', '#e0b04a', '#4c86ea'];
const PETALS = ['#2f63cf', '#c7304a', '#4c86ea', '#8e1f38'];

function petal(angle: number, r1: number, r2: number, spread: number): string {
  const [ax, ay] = polar(C, C, r1, angle - spread * 0.55);
  const [bx, by] = polar(C, C, r1, angle + spread * 0.55);
  const [tx, ty] = polar(C, C, r2, angle);
  const mid = r1 + (r2 - r1) * 0.55;
  const [c1x, c1y] = polar(C, C, mid, angle - spread);
  const [c2x, c2y] = polar(C, C, mid, angle + spread);
  return `M${ax} ${ay}Q${c1x} ${c1y} ${tx} ${ty}Q${c2x} ${c2y} ${bx} ${by}A${r1} ${r1} 0 0 0 ${ax} ${ay}Z`;
}

/**
 * 首页的玫瑰窗。全部由几何规则生成：外圈 24 块玻璃、12 枚圆章、12 片花瓣、中心圆桌。
 * 每块玻璃各自缓慢明灭（.pane），内外两圈反向慢转。
 */
export function RoseWindow({ className = '' }: { className?: string }) {
  const outer = Array.from({ length: 24 }, (_, i) => i);
  const twelve = Array.from({ length: 12 }, (_, i) => i);
  const flicker = (i: number, n: number) => ({ animationDelay: `${-((i * 7) % n) * 0.9}s` });

  return (
    <svg className={`rose ${className}`} viewBox="0 0 600 600" role="img" aria-label="彩色玻璃玫瑰窗">
      <defs>
        <radialGradient id="rose-core" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fff3c9" />
          <stop offset="60%" stopColor="#e0b04a" />
          <stop offset="100%" stopColor="#9c6f1e" />
        </radialGradient>
        <radialGradient id="rose-sheen" cx="34%" cy="28%" r="80%">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.28" />
          <stop offset="45%" stopColor="#fff" stopOpacity="0" />
          <stop offset="100%" stopColor="#000" stopOpacity="0.28" />
        </radialGradient>
      </defs>

      <circle cx={C} cy={C} r="296" fill={LEAD} />
      <circle cx={C} cy={C} r="292" fill="none" stroke="#9c6f1e" strokeWidth="3" />
      <circle cx={C} cy={C} r="232" fill="#0e1540" />

      <g className="rose-spin rose-spin-slow" stroke={LEAD} strokeWidth="5" strokeLinejoin="round">
        {outer.map((i) => (
          <path
            key={i}
            className="pane"
            style={flicker(i, 9)}
            d={sector(C, C, 238, 284, i * 15, (i + 1) * 15)}
            fill={OUTER[i % OUTER.length]}
          />
        ))}
      </g>

      <g className="rose-spin rose-spin-reverse" stroke={LEAD} strokeLinejoin="round">
        {twelve.map((i) => {
          const a = i * 30 + 15;
          const [x, y] = polar(C, C, 202, a);
          return (
            <g key={`r${i}`}>
              <path d={sector(C, C, 172, 232, i * 30, (i + 1) * 30)} fill={i % 2 ? '#131c52' : '#18246a'} strokeWidth="4" />
              <circle className="pane" style={flicker(i, 5)} cx={x} cy={y} r="24" fill={i % 2 ? '#c7304a' : '#4c86ea'} strokeWidth="5" />
              <circle cx={x} cy={y} r="8" fill="#e0b04a" strokeWidth="3" />
            </g>
          );
        })}
        <circle cx={C} cy={C} r="170" fill="#0e1540" strokeWidth="5" />
        {twelve.map((i) => (
          <path
            key={`p${i}`}
            className="pane"
            style={flicker(i, 7)}
            d={petal(i * 30, 56, 166, 15)}
            fill={PETALS[i % PETALS.length]}
            strokeWidth="5"
          />
        ))}
        {twelve.map((i) => (
          <path key={`i${i}`} d={petal(i * 30, 60, 122, 7)} fill="#f2d48a" fillOpacity="0.55" strokeWidth="3" />
        ))}
      </g>

      <g stroke={LEAD} strokeWidth="5" strokeLinejoin="round">
        <circle cx={C} cy={C} r="54" fill="url(#rose-core)" />
        {Array.from({ length: 8 }, (_, i) => (
          <path key={i} d={sector(C, C, 16, 44, i * 45, (i + 1) * 45)} fill={i % 2 ? '#fff3c9' : '#e0b04a'} strokeWidth="3" />
        ))}
        <circle cx={C} cy={C} r="16" fill="#c7304a" strokeWidth="4" />
      </g>

      <circle cx={C} cy={C} r="286" fill="url(#rose-sheen)" pointerEvents="none" />
    </svg>
  );
}
