import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * 按天的趋势图（SVG，不引图表库）。
 * - stack：堆叠柱，段与段之间留 2px 底色间隙，顶端 4px 圆角；
 * - line：2px 折线 + 浅色面积，末端点带 2px 底色描边并直接标注最新值。
 * 悬停（或键盘聚焦）某一天显示这一天所有系列的数值；完整数据另有表格视图。
 */

export interface DaySeries<T> {
  key: string;
  label: string;
  /** CSS 颜色，通常是 var(--viz-1) 这类 token */
  color: string;
  value: (row: T) => number;
}

const H = 200;
const PAD = { top: 16, right: 44, bottom: 26, left: 40 };
const BAR_MAX = 24;

function niceMax(value: number): number {
  if (value <= 4) return 4;
  const pow = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 2, 2.5, 5, 10]) if (step * pow >= value) return step * pow;
  return 10 * pow;
}
const fmt = (n: number) => (n >= 10_000 ? `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}K` : n.toLocaleString('zh-CN'));
const shortDay = (day: string) => `${Number(day.slice(5, 7))}/${Number(day.slice(8, 10))}`;

export function DayChart<T extends { day: string }>({
  rows,
  series,
  mode,
  label,
  extra,
}: {
  rows: T[];
  series: DaySeries<T>[];
  mode: 'stack' | 'line';
  /** 图表的可读名称（给读屏） */
  label: string;
  /** 提示框里在各系列之后追加的行 */
  extra?: (row: T) => ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(280, entry!.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const n = rows.length;
  const plotW = width - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const totals = rows.map((row) => (mode === 'stack' ? series.reduce((sum, s) => sum + s.value(row), 0) : Math.max(...series.map((s) => s.value(row)))));
  const top = niceMax(Math.max(0, ...totals));
  const y = (v: number) => PAD.top + plotH - (v / top) * plotH;
  const band = plotW / Math.max(1, n);
  const x = (i: number) => PAD.left + band * i + band / 2;
  const barW = Math.max(2, Math.min(BAR_MAX, band - 2));
  const ticks = [0, top / 2, top];
  // 日期刻度：最多 7 个，首尾一定标
  const every = Math.max(1, Math.ceil(n / 7));
  const labelled = rows.map((_, i) => i === n - 1 || (i % every === 0 && n - 1 - i >= every / 2));

  const hovered = hover === null ? null : rows[hover];

  return (
    <div className="viz-chart" ref={box}>
      <svg width={width} height={H} role="img" aria-label={label}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} className="viz-grid" />
            <text x={PAD.left - 8} y={y(t)} className="viz-tick" textAnchor="end" dominantBaseline="middle">{fmt(t)}</text>
          </g>
        ))}
        {rows.map((row, i) => labelled[i] && (
          <text key={row.day} x={x(i)} y={H - 8} className="viz-tick" textAnchor="middle">{shortDay(row.day)}</text>
        ))}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + plotH} className="viz-crosshair" />}

        {mode === 'stack' && rows.map((row, i) => {
          let base = 0;
          const segments = series.map((s) => ({ s, v: s.value(row) })).filter((seg) => seg.v > 0);
          return (
            <g key={row.day} opacity={hover === null || hover === i ? 1 : 0.55}>
              {segments.map(({ s, v }, k) => {
                const y0 = y(base);
                base += v;
                const y1 = y(base);
                // 段之间留 2px 底色间隙；只有最上面一段圆顶
                const gap = k > 0 ? 2 : 0;
                const h = Math.max(0, y0 - y1 - gap);
                const isTop = k === segments.length - 1;
                const r = isTop ? Math.min(4, h, barW / 2) : 0;
                const left = x(i) - barW / 2;
                const yTop = y1;
                const yBottom = y1 + h;
                const d = `M${left},${yBottom} V${yTop + r} Q${left},${yTop} ${left + r},${yTop} H${left + barW - r} Q${left + barW},${yTop} ${left + barW},${yTop + r} V${yBottom} Z`;
                return <path key={s.key} d={d} fill={s.color} />;
              })}
            </g>
          );
        })}

        {mode === 'line' && series.map((s) => {
          const points = rows.map((row, i) => `${x(i)},${y(s.value(row))}`);
          const last = rows[n - 1];
          return (
            <g key={s.key}>
              <path d={`M${x(0)},${y(0)} L${points.join(' L')} L${x(n - 1)},${y(0)} Z`} fill={s.color} opacity={0.1} />
              <polyline points={points.join(' ')} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              {last && (
                <>
                  <circle cx={x(n - 1)} cy={y(s.value(last))} r={4} fill={s.color} className="viz-dot" />
                  <text x={x(n - 1) + 8} y={y(s.value(last))} className="viz-end" dominantBaseline="middle">{fmt(s.value(last))}</text>
                </>
              )}
              {hovered && hover !== n - 1 && <circle cx={x(hover!)} cy={y(s.value(hovered))} r={4} fill={s.color} className="viz-dot" />}
            </g>
          );
        })}

        {/* 命中区：整条日期带，比柱子本身宽 */}
        {rows.map((row, i) => (
          <rect
            key={row.day}
            x={PAD.left + band * i}
            y={PAD.top}
            width={band}
            height={plotH}
            fill="transparent"
            tabIndex={0}
            aria-label={`${row.day}：${series.map((s) => `${s.label} ${s.value(row)}`).join('，')}`}
            onPointerEnter={() => setHover(i)}
            onPointerMove={() => setHover(i)}
            onPointerLeave={() => setHover(null)}
            onFocus={() => setHover(i)}
            onBlur={() => setHover(null)}
          />
        ))}
      </svg>
      {hovered && (
        // 放在准线旁边、绘图区里面；靠右时翻到左边，不压住卡片标题
        <div className="viz-tooltip" role="status"
          style={x(hover!) > width / 2 ? { right: width - x(hover!) + 10, top: PAD.top } : { left: x(hover!) + 10, top: PAD.top }}>
          <div className="viz-tooltip-day">{hovered.day}</div>
          {series.map((s) => (
            <div key={s.key} className="viz-tooltip-row">
              <span className="viz-key" style={{ background: s.color }} />
              <strong>{fmt(s.value(hovered))}</strong>
              <span>{s.label}</span>
            </div>
          ))}
          {extra?.(hovered)}
        </div>
      )}
    </div>
  );
}

export function Legend({ items }: { items: { label: string; color: string; shape?: 'rect' | 'line' }[] }) {
  return (
    <ul className="viz-legend">
      {items.map((item) => (
        <li key={item.label}>
          <span className={item.shape === 'line' ? 'viz-key viz-key-line' : 'viz-swatch'} style={{ background: item.color }} />
          {item.label}
        </li>
      ))}
    </ul>
  );
}
