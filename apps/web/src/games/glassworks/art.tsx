import { createContext, useContext, useId, type ReactNode } from 'react';
import { Glassworks } from '@tabletop/shared';
import { polar, sector } from '../../art/geometry';
import { EMBLEM, GILT, LEAD, type Glass } from '../../art/glass';
import { seededRandom } from '../../fx/motion';

type Hue = Glassworks.Hue;
type Piece = Glassworks.Piece;

/** 六种料的玻璃色：深 / 中 / 亮 */
export const PIECE_GLASS: Record<Piece, Glass> = {
  blue: ['#1d3f94', '#3f6fd8', '#9cc0ff'],
  red: ['#6e1226', '#c7304a', '#f59aa6'],
  green: ['#14532d', '#23856a', '#86d8ae'],
  amber: ['#6b4a0c', '#c9972e', '#f6dc8a'],
  violet: ['#3d1a6e', '#7a3fb0', '#cfa6f5'],
  gold: ['#9c6f1e', '#e0b04a', '#fff3c9'],
};

/**
 * 每种料一个轮廓，颜色分不清时也能靠形状认：
 * 钴蓝是圆，茜红是三角，铜绿是六边，琥珀是方，紫晶是菱，金箔是八角星。
 */
const OUTLINE: Record<Piece, string> = {
  blue: 'M20 3A17 17 0 1 1 19.99 3Z',
  red: 'M20 3L37 34H3Z',
  green: 'M20 2L36 11V29L20 38L4 29V11Z',
  amber: 'M5 5H35V35H5Z',
  violet: 'M20 1L37 20L20 39L3 20Z',
  gold: 'M20 1l5 10 11-3-3 11 6 8-11 4-2 11-9-6-9 6-2-11-11-4 7-8-3-11 11 3z',
};
/** 切面的高光：从中心到左上的几片 */
const FACET: Record<Piece, string> = {
  blue: 'M20 20L8 8A17 17 0 0 1 20 3Z',
  red: 'M20 22L20 3L11.5 18.5Z',
  green: 'M20 20L4 11L20 2Z',
  amber: 'M20 20L5 5H20Z',
  violet: 'M20 20L20 1L3 20Z',
  gold: 'M20 20L14 11L25 11Z',
};

/** 一块玻璃料 */
export function Shard({ piece, className = '' }: { piece: Piece; className?: string }) {
  const [dark, mid, light] = PIECE_GLASS[piece];
  return (
    <svg className={`shard ${className}`} viewBox="0 0 40 40" aria-hidden="true">
      <path d={OUTLINE[piece]} fill={mid} stroke={LEAD} strokeWidth="2.6" strokeLinejoin="round" />
      <path d={FACET[piece]} fill={light} opacity="0.85" />
      <path d={OUTLINE[piece]} fill="none" stroke={dark} strokeWidth="1" strokeLinejoin="round" opacity="0.6" transform="translate(20 20) scale(0.62) translate(-20 -20)" />
    </svg>
  );
}

export type GlassworksCardStyle = 'blue-gold' | 'starry-night';
export const GlassworksCardStyleContext = createContext<GlassworksCardStyle>('blue-gold');

function useCardArt(asset: string) {
  const style = useContext(GlassworksCardStyleContext);
  return `${import.meta.env.BASE_URL}glassworks-cards/${style}/${asset}.webp`;
}

/** 窗片：一扇彩窗的设计图。上半是窗，下方一行是造价。 */
export function PanelCard({ panel }: { panel: string }) {
  const id = useId();
  const def = Glassworks.panelOf(panel);
  const art = useCardArt(`front-${def.tier}`);
  const [, mid, light] = PIECE_GLASS[def.hue];
  const cost = Glassworks.HUES.filter((h) => def.cost[h]);
  const step = Math.min(46, 172 / cost.length);
  const costText = cost.map((h) => `${Glassworks.PIECE_NAMES[h]} ${def.cost[h]}`).join('、');

  return (
    <svg
      className="panel-card"
      viewBox="0 0 200 280"
      role="img"
      aria-label={`${Glassworks.TIER_NAMES[def.tier]}，炉色${Glassworks.PIECE_NAMES[def.hue]}，声望 ${def.points}，造价：${costText}`}
    >
      <defs>
        <clipPath id={`${id}art`}>
          <rect x="5" y="5" width="190" height="270" rx="11" />
        </clipPath>
      </defs>
      <rect x="3" y="3" width="194" height="274" rx="13" fill="#0a0f2b" stroke={GILT} strokeWidth="2.5" />
      <image href={art} x="5" y="5" width="190" height="196" preserveAspectRatio="xMidYMid slice" clipPath={`url(#${id}art)`} />
      <path d="M5 202H195" stroke={GILT} strokeWidth="2" />

      {/* 左上：声望；右上：炉色 */}
      {def.points > 0 && (
        <g>
          <circle cx="36" cy="36" r="21" fill={GILT} stroke={LEAD} strokeWidth="3.5" />
          <text x="36" y="48" textAnchor="middle" className="roundel-number" style={{ fill: '#1b1404' }} fontSize="34">
            {def.points}
          </text>
        </g>
      )}
      <g transform="translate(142 14) scale(1.1)">
        <rect x="-3" y="-3" width="46" height="46" rx="8" fill="#0a0f2b" stroke={GILT} strokeWidth="1.6" />
        <path d={OUTLINE[def.hue]} fill={mid} stroke={LEAD} strokeWidth="2.6" strokeLinejoin="round" />
        <path d={FACET[def.hue]} fill={light} opacity="0.85" />
      </g>

      {/* 造价 */}
      <g transform={`translate(${86 - ((cost.length - 1) * step) / 2} 208)`}>
        {cost.map((h, i) => (
          <g key={h} transform={`translate(${i * step} 0)`}>
            <g transform="scale(0.72)">
              <path d={OUTLINE[h]} fill={PIECE_GLASS[h][1]} stroke={LEAD} strokeWidth="3" strokeLinejoin="round" />
              <path d={FACET[h]} fill={PIECE_GLASS[h][2]} opacity="0.85" />
            </g>
            <text x="14" y="58" textAnchor="middle" className="roundel-number" fontSize="30">
              {def.cost[h]}
            </text>
          </g>
        ))}
      </g>
    </svg>
  );
}

/** 盖着的窗片（牌堆顶、别人摸走的图稿） */
export function PanelBack({ tier }: { tier: Glassworks.Tier }) {
  const art = useCardArt(`back-${tier}`);
  return (
    <svg className="panel-card" viewBox="0 0 200 280" role="img" aria-label={`盖着的${Glassworks.TIER_NAMES[tier]}`}>
      <rect x="3" y="3" width="194" height="274" rx="10" fill="#0a0f2b" />
      <image href={art} width="200" height="280" />
    </svg>
  );
}

/** 委托：委托人、需要的炉色、声望 */
export function CommissionTile({ commission }: { commission: string }) {
  const id = useId();
  const art = useCardArt('commission');
  const def = Glassworks.commissionOf(commission);
  const need = Glassworks.HUES.filter((h) => def.need[h]);
  const text = need.map((h) => `${Glassworks.PIECE_NAMES[h]}炉色 ${def.need[h]}`).join('、');
  return (
    <svg className="commission-tile" viewBox="0 0 220 120" role="img" aria-label={`${def.name}的委托，声望 ${def.points}，需要${text}`}>
      <defs>
        <clipPath id={`${id}commission`}>
          <rect x="3" y="3" width="214" height="114" rx="10" />
        </clipPath>
        <linearGradient id={`${id}shade`}>
          <stop offset="48%" stopColor="#0a0f2b" />
          <stop offset="100%" stopColor="#0a0f2b" stopOpacity="0.25" />
        </linearGradient>
      </defs>
      <g clipPath={`url(#${id}commission)`}>
        <rect x="3" y="3" width="214" height="114" fill="#0a0f2b" />
        <image href={art} x="106" y="3" width="111" height="114" preserveAspectRatio="xMidYMid slice" />
        <rect x="3" y="3" width="214" height="114" fill={`url(#${id}shade)`} />
        <rect x="3" y="44" width="214" height="73" fill="#0a0f2b" opacity="0.66" />
      </g>
      <rect x="3" y="3" width="214" height="114" rx="10" fill="none" stroke={GILT} strokeWidth="2.5" />
      <path d="M3 44H217" stroke={GILT} strokeOpacity="0.35" />
      <circle cx="30" cy="24" r="16" fill={GILT} stroke={LEAD} strokeWidth="3" />
      <text x="30" y="33" textAnchor="middle" className="roundel-number" style={{ fill: '#1b1404' }} fontSize="25">
        {def.points}
      </text>
      <text x="56" y="31" className="role-face-name" fontSize="19" paintOrder="stroke" stroke="#0a0f2b" strokeWidth="4">
        {def.name}
      </text>
      <g transform={`translate(${110 - need.length * 20} 56)`}>
        {need.map((h, i) => (
          <g key={h} transform={`translate(${i * 40} 0)`}>
            <rect x="1" y="1" width="34" height="34" rx="6" fill={PIECE_GLASS[h][1]} stroke={LEAD} strokeWidth="2.6" />
            <rect x="5" y="5" width="12" height="12" rx="2" fill={PIECE_GLASS[h][2]} opacity="0.7" />
            <text x="18" y="29" textAnchor="middle" className="roundel-number" fontSize="26" style={{ fill: '#fff', paintOrder: 'stroke', stroke: LEAD, strokeWidth: 4 }}>
              {def.need[h]}
            </text>
            <text x="18" y="52" textAnchor="middle" fontSize="11" fill="#aaa58e">
              {Glassworks.PIECE_NAMES[h]}
            </text>
          </g>
        ))}
      </g>
    </svg>
  );
}

/** 炉色的小方章：方形表示「永久的折扣」，和可以花掉的玻璃料区分开 */
export function KilnMark({ hue, className = '' }: { hue: Hue; className?: string }) {
  const [, mid, light] = PIECE_GLASS[hue];
  return (
    <svg className={className} viewBox="0 0 40 40" aria-hidden="true">
      <rect x="4" y="4" width="32" height="32" rx="6" fill={mid} stroke={LEAD} strokeWidth="2.6" />
      <rect x="8" y="8" width="11" height="11" rx="2" fill={light} opacity="0.7" />
    </svg>
  );
}

/* ---------- 首页的作坊彩窗 ---------- */

const ARCH = 'M60 588V250Q60 70 300 16Q540 70 540 250V588Z';

export function WorkshopWindow() {
  const rand = seededRandom('workshop-window');
  const hues = Glassworks.HUES;
  const rays: ReactNode[] = [];
  const N = 30;
  // 从窗底的金色圆心放射出去的五色玻璃
  for (let i = 0; i < N; i++) {
    const a1 = 180 + (i * 180) / N;
    const a2 = 180 + ((i + 1) * 180) / N;
    const glass = PIECE_GLASS[hues[i % 5]!];
    [
      [70, 190],
      [190, 330],
      [330, 700],
    ].forEach(([r1, r2], ring) => {
      rays.push(
        <path
          key={`${i}-${ring}`}
          className="pane"
          style={{ animationDelay: `${-rand() * 7}s` }}
          d={sector(300, 588, r1!, r2!, a1, a2)}
          // 外圈深、内圈亮，像光从窗底的圆心透出来
          fill={ring === 2 ? glass[rand() < 0.6 ? 0 : 1] : ring === 1 ? glass[rand() < 0.75 ? 1 : 2] : glass[2]}
        />,
      );
    });
  }
  return (
    <svg className="rose" viewBox="0 0 600 600" role="img" aria-label="五色玻璃拼成的彩窗">
      <defs>
        <clipPath id="workshop-arch">
          <path d={ARCH} />
        </clipPath>
        <radialGradient id="workshop-core" cx="50%" cy="100%" r="100%">
          <stop offset="0" stopColor="#fff6d6" />
          <stop offset="0.7" stopColor="#e0b04a" />
          <stop offset="1" stopColor="#9c6f1e" />
        </radialGradient>
        <linearGradient id="workshop-sheen" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.22" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.3" />
        </linearGradient>
      </defs>
      <path d="M46 598V248Q46 58 300 0Q554 58 554 248V598Z" fill={LEAD} />
      <g clipPath="url(#workshop-arch)" strokeLinejoin="round">
        <g stroke={LEAD} strokeWidth="4">
          {rays}
          <path d={sector(300, 588, 0.1, 70, 180, 360)} fill="url(#workshop-core)" />
        </g>
        {/* 五种料各一枚，沿拱顶排开 */}
        {hues.map((hue, i) => {
          const [x, y] = polar(300, 588, 300, 230 + i * 20);
          return (
            <g key={hue} transform={`translate(${x - 44} ${y - 44}) scale(2.2)`}>
              <circle cx="20" cy="20" r="23" fill="#0a0f2b" stroke={LEAD} strokeWidth="2" />
              <path d={OUTLINE[hue]} fill={PIECE_GLASS[hue][1]} stroke={LEAD} strokeWidth="2.4" strokeLinejoin="round" />
              <path d={FACET[hue]} fill={PIECE_GLASS[hue][2]} opacity="0.9" />
            </g>
          );
        })}
        <g transform="translate(256 500) scale(2.2)">
          <path d={OUTLINE.gold} fill={EMBLEM} stroke={LEAD} strokeWidth="2.2" strokeLinejoin="round" />
        </g>
        <rect width="600" height="600" fill="url(#workshop-sheen)" />
      </g>
      <path d={ARCH} fill="none" stroke="#9c6f1e" strokeWidth="3" />
    </svg>
  );
}
