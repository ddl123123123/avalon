import { useId, type ReactNode } from 'react';
import { seededRandom } from '../fx/motion';
import { sector, wedge } from './geometry';

/** 各款桌游共用的彩色玻璃美术：铅条、金边、拱窗牌面、牌背、桌面。 */

export const LEAD = '#05081a';
export const GILT = '#e0b04a';
export const EMBLEM = '#f7e6b0';

/** 一组玻璃色：深 / 中 / 亮 */
export type Glass = [string, string, string];

const ARCH = 'M24 198V100Q24 42 100 18Q176 42 176 100V198Z';
const CX = 100;
const CY = 118;

/**
 * 哥特拱窗牌面（5:7）。玻璃纹理由 seed 决定，徽记画在 100×100 的格子里，
 * 由调用方以 children 传入（默认淡金填充 + 铅条描边）。
 */
export function ArchCard({
  seed,
  glass,
  name,
  accent,
  badge,
  label,
  children,
}: {
  seed: string;
  glass: Glass;
  name: string;
  /** 名字下方小菱形的颜色，用来表示阵营或类别 */
  accent: string;
  /** 左上角的数字（如角色的行动顺序） */
  badge?: number | string;
  label: string;
  children: ReactNode;
}) {
  const id = useId();
  const [dark, mid, light] = glass;
  const rand = seededRandom(`glass:${seed}`);
  const tones = [dark, dark, mid, mid, mid, light];
  const tone = () => tones[Math.floor(rand() * tones.length)]!;

  return (
    <svg className="role-face" viewBox="0 0 200 280" role="img" aria-label={label}>
      <defs>
        <clipPath id={`${id}a`}>
          <path d={ARCH} />
        </clipPath>
        <radialGradient id={`${id}l`} cx="50%" cy="38%" r="62%">
          <stop offset="0" stopColor="#fff" stopOpacity="0.42" />
          <stop offset="0.55" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.35" />
        </radialGradient>
      </defs>
      <rect x="3" y="3" width="194" height="274" rx="13" fill="#0a0f2b" stroke={GILT} strokeWidth="2.5" />
      <rect x="10" y="10" width="180" height="260" rx="8" fill="none" stroke={GILT} strokeOpacity="0.35" />

      <g clipPath={`url(#${id}a)`} stroke={LEAD} strokeWidth="2.6" strokeLinejoin="round">
        {Array.from({ length: 16 }, (_, i) => (
          <path key={`w${i}`} d={wedge(CX, CY, 220, i * 22.5 - 90, (i + 1) * 22.5 - 90)} fill={tone()} />
        ))}
        {Array.from({ length: 12 }, (_, i) => (
          <path key={`s${i}`} d={sector(CX, CY, 50, 80, i * 30 - 75, (i + 1) * 30 - 75)} fill={tone()} />
        ))}
        <circle cx={CX} cy={CY} r="50" fill={dark} />
        <circle cx={CX} cy={CY} r="44" fill={mid} strokeWidth="1.6" />
        <rect x="0" y="0" width="200" height="220" fill={`url(#${id}l)`} stroke="none" />
      </g>
      <path d={ARCH} fill="none" stroke={LEAD} strokeWidth="7" strokeLinejoin="round" />
      <path d={ARCH} fill="none" stroke={GILT} strokeWidth="2" strokeLinejoin="round" />

      <g transform="translate(62 80) scale(0.76)" fill={EMBLEM} stroke={LEAD} strokeWidth="3.4" strokeLinejoin="round" paintOrder="stroke">
        {children}
      </g>

      {badge !== undefined && (
        <g>
          <circle cx="34" cy="36" r="17" fill={GILT} stroke={LEAD} strokeWidth="3" />
          <text x="34" y="45" textAnchor="middle" className="roundel-number" style={{ fill: '#1b1404' }} fontSize="26">
            {badge}
          </text>
        </g>
      )}

      <text x="100" y="238" textAnchor="middle" className="role-face-name" fontSize={name.length > 5 ? 20 : 27}>
        {name}
      </text>
      <g transform="translate(100 257)">
        <path d="M-34 0h20M14 0h20" stroke={accent} strokeWidth="1.5" />
        <path d="M0 -6L6 0L0 6L-6 0Z" fill={accent} />
      </g>
    </svg>
  );
}

/** 牌背：圆桌与剑。 */
export function CardBack() {
  return (
    <svg className="role-face" viewBox="0 0 200 280" aria-hidden="true">
      <rect x="3" y="3" width="194" height="274" rx="13" fill="#0a0f2b" stroke={GILT} strokeWidth="2.5" />
      <rect x="10" y="10" width="180" height="260" rx="8" fill="#101a4a" stroke={GILT} strokeOpacity="0.35" />
      <g stroke={LEAD} strokeWidth="2.6" strokeLinejoin="round">
        {Array.from({ length: 12 }, (_, i) => (
          <path key={i} d={sector(100, 140, 30, 72, i * 30, (i + 1) * 30)} fill={i % 2 ? '#1d3f94' : '#16286a'} />
        ))}
        <circle cx="100" cy="140" r="30" fill={GILT} />
        <circle cx="100" cy="140" r="78" fill="none" stroke={GILT} strokeWidth="2" />
      </g>
      <g fill="#0a0f2b">
        <path d="M100 118L104 126V148H96V126Z" />
        <path d="M88 148H112V152H88Z" />
        <path d="M97.5 152H102.5V160H97.5Z" />
        <circle cx="100" cy="163" r="3.4" />
      </g>
      {[
        [34, 38],
        [166, 38],
        [34, 242],
        [166, 242],
      ].map(([x, y]) => (
        <path key={`${x}-${y}`} d={`M${x} ${y! - 9}L${x! + 9} ${y}L${x} ${y! + 9}L${x! - 9} ${y}Z`} fill="none" stroke={GILT} strokeWidth="1.6" />
      ))}
    </svg>
  );
}

/** 王冠：阿瓦隆的队长、富饶之城的国王标记 */
export function Crown({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 40 32" aria-hidden="true">
      <path d="M5 27L2 8L12 17L20 3L28 17L38 8L35 27Z" fill={GILT} stroke={LEAD} strokeWidth="2.6" strokeLinejoin="round" />
      <circle cx="20" cy="20" r="3" fill="#c7304a" stroke={LEAD} strokeWidth="1.4" />
    </svg>
  );
}

/** 圆桌桌面。会被拉伸成椭圆，所以描边用 non-scaling-stroke。 */
export function TableSurface({ seats }: { seats: number }) {
  const id = useId();
  const n = Math.max(seats, 5) * 2;
  return (
    <svg className="table-surface" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <radialGradient id={`${id}-table-glow`} cx="50%" cy="42%" r="60%">
          <stop offset="0" stopColor="#607287" stopOpacity="0.3" />
          <stop offset="0.6" stopColor="#293744" stopOpacity="0.2" />
          <stop offset="1" stopColor="#000" stopOpacity="0.5" />
        </radialGradient>
        <clipPath id={`${id}-table-clip`}>
          <circle cx="500" cy="500" r="478" />
        </clipPath>
      </defs>
      <circle cx="500" cy="500" r="496" fill="#090d12" />
      <g stroke={LEAD} strokeWidth="2.5" vectorEffect="non-scaling-stroke">
        {Array.from({ length: n }, (_, i) => (
          <path
            key={i}
            d={sector(500, 500, 330, 478, (i * 360) / n + 90 - 180 / n, ((i + 1) * 360) / n + 90 - 180 / n)}
            fill={i % 2 ? '#141d26' : '#101820'}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        <circle cx="500" cy="500" r="330" fill="#0d141b" vectorEffect="non-scaling-stroke" />
      </g>
      <circle cx="500" cy="500" r="478" fill={`url(#${id}-table-glow)`} />
      <g clipPath={`url(#${id}-table-clip)`} fill="none" stroke="#aeb7bb" strokeWidth="1.35" vectorEffect="non-scaling-stroke" opacity="0.12">
        <path d="M4 310C96 333 128 282 214 292S330 343 408 306 514 253 594 286 702 343 789 302 906 263 1000 286" />
        <path d="M0 347C94 370 143 324 225 332S340 383 423 346 520 292 610 325 717 380 802 342 916 301 1000 326" />
        <path d="M-5 664C79 636 136 676 216 661S338 606 418 635 533 697 609 665 723 612 812 638 928 698 1005 664" />
        <path d="M-8 706C76 676 139 720 223 703S344 649 425 678 539 739 617 706 728 654 817 679 929 739 1008 705" />
        <path d="M270 4C297 87 257 129 276 208S331 319 298 396 249 503 280 581 337 694 308 775 264 909 294 1004" />
        <path d="M704 0C674 83 715 129 695 211S640 323 672 401 720 507 690 585 633 698 663 779 709 910 678 1003" />
      </g>
      <circle cx="500" cy="500" r="486" fill="none" stroke="#a49a83" strokeWidth="2" vectorEffect="non-scaling-stroke" opacity="0.56" />
      <circle cx="500" cy="500" r="330" fill="none" stroke="#a49a83" strokeWidth="1.2" vectorEffect="non-scaling-stroke" opacity="0.34" />
    </svg>
  );
}
