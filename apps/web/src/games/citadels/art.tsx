import { useId, type ReactNode } from 'react';
import { Citadels } from '@tabletop/shared';
import { EMBLEM, GILT, LEAD, type Glass } from '../../art/glass';
import { seededRandom } from '../../fx/motion';
import { useCitadelsCardArt } from './cardStyle';

type CharacterId = Citadels.CharacterId;
type DistrictType = Citadels.DistrictType;

/** 五种城区的玻璃色 */
export const TYPE_GLASS: Record<DistrictType, Glass> = {
  noble: ['#5c3f0a', '#a8741c', '#e8bf58'],
  religious: ['#1d3f94', '#3f6fd8', '#8fb8ff'],
  trade: ['#14532d', '#23856a', '#7ed0a6'],
  military: ['#6e1226', '#b8263b', '#ec6a78'],
  special: ['#3d1a6e', '#7a3fb0', '#c59af0'],
};
export const TYPE_ACCENT: Record<DistrictType, string> = {
  noble: '#e8bf58',
  religious: '#6f9cf0',
  trade: '#4fbf8f',
  military: '#e3566a',
  special: '#b98af0',
};

export function CharacterCard({ character }: { character: CharacterId }) {
  const def = Citadels.CHARACTER[character];
  const art = useCitadelsCardArt(character);
  const accent = def.income ? TYPE_ACCENT[def.income] : GILT;
  return (
    <svg className="ct-character-card" viewBox="0 0 200 280" role="img" aria-label={`${def.rank} 号角色，${def.name}`}>
      <rect width="200" height="280" fill={LEAD} />
      <image href={art} width="200" height="280" />
      <circle cx="27" cy="25" r="19" fill={LEAD} stroke={accent} strokeWidth="1.5" />
      <text x="27" y="26" dominantBaseline="central" textAnchor="middle" className="roundel-number" fontSize="26">{def.rank}</text>
      <rect x="9" y="239" width="182" height="34" rx="6" fill={LEAD} fillOpacity="0.96" stroke={accent} strokeWidth="1.5" />
      <text x="100" y="257" dominantBaseline="central" textAnchor="middle" className="role-face-name" fontSize="25">{def.name}</text>
    </svg>
  );
}

export function CitadelsCardBack({ kind }: { kind: 'character' | 'district' }) {
  const art = useCitadelsCardArt(`${kind}-back`);
  return <img className="ct-card-back" src={art} width={300} height={420} alt="" draggable={false} />;
}

/* ---------- 建筑剪影 ---------- */

type Roof = 'gable' | 'spire' | 'dome' | 'battlement' | 'flat' | 'hip' | 'pediment';

/** 一块带屋顶的墙体。x 为左边缘，ground 为地面的 y 坐标。 */
export function block(x: number, w: number, h: number, roof: Roof, ground = 90): string {
  const t = ground - h;
  const r = x + w;
  const m = x + w / 2;
  switch (roof) {
    case 'gable':
      return `M${x} ${ground}V${t}L${m} ${t - w * 0.5}L${r} ${t}V${ground}Z`;
    case 'spire':
      return `M${x} ${ground}V${t}L${m} ${t - w * 1.3}L${r} ${t}V${ground}Z`;
    case 'dome':
      return `M${x} ${ground}V${t}A${w / 2} ${w * 0.55} 0 0 1 ${r} ${t}V${ground}Z`;
    case 'hip':
      return `M${x} ${ground}V${t}H${x - 3}L${x + w * 0.2} ${t - 13}H${x + w * 0.8}L${r + 3} ${t}H${r}V${ground}Z`;
    case 'pediment':
      return `M${x} ${ground}V${t}H${x - 4}L${m} ${t - w * 0.3}L${r + 4} ${t}H${r}V${ground}Z`;
    case 'flat':
      return `M${x} ${ground}V${t}H${x - 3}V${t - 5}H${r + 3}V${t}H${r}V${ground}Z`;
    case 'battlement': {
      const k = Math.max(1, Math.round(w / 14));
      const u = w / (2 * k + 1);
      let d = `M${x} ${ground}V${t - 6}`;
      for (let i = 0; i <= 2 * k; i++) {
        d += `H${x + (i + 1) * u}`;
        if (i < 2 * k) d += `V${i % 2 === 0 ? t : t - 6}`;
      }
      return `${d}V${ground}Z`;
    }
  }
}

const B = (x: number, w: number, h: number, roof: Roof, ground?: number) => <path d={block(x, w, h, roof, ground)} />;
/** 门窗等镂空细节，用铅条色填充 */
const Dark = ({ d }: { d: string }) => <path d={d} fill={LEAD} stroke="none" />;
const door = (cx: number, w = 10, h = 16) => `M${cx - w / 2} 90V${90 - h + w / 2}A${w / 2} ${w / 2} 0 0 1 ${cx + w / 2} ${90 - h + w / 2}V90Z`;
const win = (cx: number, y: number, w = 6, h = 9) => `M${cx - w / 2} ${y + h}V${y + w / 2}A${w / 2} ${w / 2} 0 0 1 ${cx + w / 2} ${y + w / 2}V${y + h}Z`;
const cross = (cx: number, top: number) => (
  <path d={`M${cx} ${top}v14M${cx - 5} ${top + 5}h10`} fill="none" stroke={EMBLEM} strokeWidth="3" strokeLinecap="round" />
);
const flag = (cx: number, top: number) => (
  <>
    <path d={`M${cx} ${top}v16`} fill="none" stroke={EMBLEM} strokeWidth="2.5" />
    <path d={`M${cx} ${top}l12 4-12 5z`} />
  </>
);
const sword = (
  <>
    <path d="M50 8L56 20V60H44V20Z" />
    <path d="M34 60H66V67H34Z" />
    <path d="M47 67H53V82H47Z" />
    <circle cx="50" cy="86" r="4.5" />
  </>
);

/** 每种城区的剪影，画在 100×100 的格子里，地面在 y=90。 */
const GLYPHS: Record<string, ReactNode> = {
  manor: (
    <>
      <path d="M64 44H72V62H64Z" />
      {B(20, 60, 28, 'gable')}
      <Dark d={door(50) + win(32, 70) + win(68, 70)} />
    </>
  ),
  castle: (
    <>
      {B(30, 40, 30, 'battlement')}
      {B(14, 20, 48, 'battlement')}
      {B(66, 20, 48, 'battlement')}
      <Dark d={door(50, 14, 20) + win(24, 52, 5, 9) + win(76, 52, 5, 9)} />
    </>
  ),
  palace: (
    <>
      {B(36, 28, 40, 'dome')}
      {B(22, 56, 28, 'flat')}
      {B(12, 12, 44, 'spire')}
      {B(76, 12, 44, 'spire')}
      <Dark d={door(50, 12, 18) + win(32, 68) + win(68, 68)} />
    </>
  ),
  temple: (
    <>
      <path d="M14 84H86V90H14Z" />
      {B(22, 56, 24, 'pediment', 84)}
      <path d="M31 62V84M40.5 62V84M50 62V84M59.5 62V84M69 62V84" fill="none" stroke={LEAD} strokeWidth="2.6" />
    </>
  ),
  church: (
    <>
      {B(40, 40, 26, 'gable')}
      {B(20, 20, 44, 'spire')}
      {cross(30, 6)}
      <Dark d={door(60) + win(30, 54, 6, 10)} />
    </>
  ),
  monastery: (
    <>
      {B(43, 14, 44, 'gable')}
      {B(14, 72, 22, 'hip')}
      {cross(50, 24)}
      <Dark d={win(24, 74, 7, 12) + win(37, 74, 7, 12) + win(63, 74, 7, 12) + win(76, 74, 7, 12) + door(50, 9, 14)} />
    </>
  ),
  cathedral: (
    <>
      {B(34, 32, 40, 'gable')}
      {B(16, 18, 54, 'spire')}
      {B(66, 18, 54, 'spire')}
      <circle cx="50" cy="56" r="6.5" fill={LEAD} stroke="none" />
      <Dark d={door(50, 10, 18) + win(25, 50, 5, 12) + win(75, 50, 5, 12)} />
    </>
  ),
  tavern: (
    <>
      <path d="M30 42H38V58H30Z" />
      {B(24, 46, 26, 'gable')}
      <path d="M70 56H90" fill="none" stroke={EMBLEM} strokeWidth="2.5" />
      <path d="M78 58h10v11h-10z" />
      <Dark d={door(40) + win(58, 70, 8, 9)} />
    </>
  ),
  trading_post: (
    <>
      {B(20, 60, 30, 'flat')}
      <path d="M16 62H84L90 72H10Z" />
      <path d="M28 62L24 72M42 62L40 72M58 62L60 72M72 62L76 72" fill="none" stroke={LEAD} strokeWidth="2.5" />
      <Dark d={door(36, 10, 14) + 'M52 76H74V86H52Z'} />
    </>
  ),
  market: (
    <>
      <path d="M18 56H24V90H18ZM76 56H82V90H76Z" />
      <path d="M18 74H82V84H18Z" />
      <path d="M10 50Q50 22 90 50V58Q80 66 70 58Q60 66 50 58Q40 66 30 58Q20 66 10 58Z" />
      <path d="M30 58V44M50 58V36M70 58V44" fill="none" stroke={LEAD} strokeWidth="2.5" />
    </>
  ),
  docks: (
    <>
      <path d="M47 16H53V70H47Z" />
      <path d="M56 22L82 62H56Z" />
      <path d="M44 32L22 62H44Z" />
      <path d="M12 68H88L76 88H24Z" />
    </>
  ),
  harbor: (
    <>
      <path d="M40 30L50 14L60 30Z" />
      <path d="M42 30H58V42H42Z" />
      <path d="M36 42H64V48H36Z" />
      <path d="M38 90L43 48H57L62 90Z" />
      <path d="M41 62H59M40 74H60" fill="none" stroke={LEAD} strokeWidth="3" />
      <path d="M66 34L84 28M66 38L86 40M34 34L16 28M34 38L14 40" fill="none" stroke={EMBLEM} strokeWidth="2.5" strokeLinecap="round" />
    </>
  ),
  town_hall: (
    <>
      {B(42, 16, 52, 'spire')}
      {B(18, 64, 26, 'hip')}
      {flag(50, 2)}
      <circle cx="50" cy="48" r="5" fill={LEAD} stroke="none" />
      <Dark d={door(50, 10, 16) + win(28, 72) + win(72, 72)} />
    </>
  ),
  watchtower: (
    <>
      {B(41, 18, 56, 'flat')}
      {B(34, 32, 12, 'battlement', 36)}
      {flag(50, 2)}
      <Dark d={win(50, 48, 5, 12) + door(50, 8, 14)} />
    </>
  ),
  prison: (
    <>
      {B(18, 64, 36, 'flat')}
      <Dark d={'M26 60H38V74H26ZM44 60H56V74H44ZM62 60H74V74H62Z' + door(50, 10, 12)} />
      <path d="M30 60V74M34 60V74M48 60V74M52 60V74M66 60V74M70 60V74" fill="none" stroke={EMBLEM} strokeWidth="1.8" />
    </>
  ),
  battlefield: (
    <>
      <g transform="rotate(38 50 52)">{sword}</g>
      <g transform="rotate(-38 50 52)">{sword}</g>
    </>
  ),
  fortress: (
    <>
      {B(24, 52, 26, 'battlement')}
      {B(6, 24, 44, 'battlement')}
      {B(70, 24, 44, 'battlement')}
      <Dark d={door(50, 16, 20) + win(18, 54, 5, 10) + win(82, 54, 5, 10)} />
    </>
  ),
  haunted_city: (
    <>
      <path d="M70 12A16 16 0 1 0 86 34A12 12 0 1 1 70 12Z" />
      <g transform="skewX(-9) translate(14 0)">
        {B(26, 38, 34, 'gable')}
        <Dark d={'M34 62H42V72H34ZM50 66H58V74H50Z' + door(45, 9, 12)} />
      </g>
    </>
  ),
  keep: (
    <>
      {B(22, 56, 12, 'flat')}
      {B(30, 40, 60, 'battlement')}
      <Dark d={win(50, 40, 5, 12) + win(40, 58, 5, 10) + win(60, 58, 5, 10) + door(50, 10, 14)} />
    </>
  ),
  laboratory: (
    <>
      <path d="M40 14H60V20H57V42L76 80Q78 90 68 90H32Q22 90 24 80L43 42V20H40Z" />
      <path d="M33 68H67L74 82Q75 86 70 86H30Q25 86 26 82Z" fill={LEAD} stroke="none" />
      <circle cx="68" cy="22" r="4" />
      <circle cx="78" cy="10" r="3" />
    </>
  ),
  smithy: (
    <>
      <path d="M14 46H68Q84 46 90 56H66V62Q60 66 60 74H72V88H28V74H40Q40 66 34 62Q20 60 14 46Z" />
      <g transform="rotate(-28 46 24)">
        <path d="M22 14H44V30H22Z" />
        <path d="M44 19H78V25H44Z" />
      </g>
    </>
  ),
  observatory: (
    <>
      <path d="M56 46L80 20" fill="none" stroke={LEAD} strokeWidth="13" strokeLinecap="round" />
      <path d="M56 46L80 20" fill="none" stroke={EMBLEM} strokeWidth="8" strokeLinecap="round" />
      {B(28, 44, 20, 'dome', 66)}
      {B(24, 52, 24, 'flat')}
      <Dark d={door(50, 9, 14) + win(34, 72, 5, 8) + win(66, 72, 5, 8)} />
    </>
  ),
  graveyard: (
    <>
      <path d="M20 90V66A10 10 0 0 1 40 66V90Z" />
      <path d="M44 90V50A12 12 0 0 1 68 50V90Z" />
      <path d="M72 90V70A8 8 0 0 1 88 70V90Z" />
      <path d="M56 50V72M49 58H63" fill="none" stroke={LEAD} strokeWidth="4" />
    </>
  ),
  dragon_gate: (
    <>
      <path d="M20 46H34V90H20ZM66 46H80V90H66Z" />
      <path d="M6 42Q50 22 94 42L88 52Q50 36 12 52Z" />
      <path d="M22 28Q50 12 78 28L74 36Q50 24 26 36Z" />
      <path d="M40 60H60V70H40Z" />
    </>
  ),
  university: (
    <>
      {B(38, 24, 14, 'dome', 52)}
      <path d="M14 84H86V90H14Z" />
      {B(20, 60, 24, 'pediment', 84)}
      <path d="M30 62V84M40 62V84M60 62V84M70 62V84" fill="none" stroke={LEAD} strokeWidth="2.6" />
      <Dark d="M46 70H54V84H46Z" />
    </>
  ),
  library: (
    <>
      <path d="M20 74H80V90H20Z" />
      <path d="M26 58H78V74H26Z" />
      <path d="M22 42H74V58H22Z" />
      <path d="M30 26Q40 20 50 28Q60 20 70 26V42Q60 36 50 42Q40 36 30 42Z" />
      <path d="M30 74V90M70 58V74M32 42V58M50 28V42" fill="none" stroke={LEAD} strokeWidth="3" />
    </>
  ),
  great_wall: (
    <>
      {B(0, 100, 22, 'battlement')}
      {B(38, 24, 46, 'battlement')}
      <Dark d={win(50, 50, 6, 12) + door(50, 9, 12)} />
    </>
  ),
  school_of_magic: (
    <>
      {B(20, 14, 30, 'spire')}
      {B(66, 14, 36, 'spire')}
      {B(38, 24, 44, 'spire')}
      <path d="M50 0l3 8 8 3-8 3-3 8-3-8-8-3 8-3z" transform="translate(28 -2)" />
      <Dark d={win(50, 52, 6, 12) + door(50, 9, 14)} />
    </>
  ),
};

/** 同类城区共用插画，具体建筑继续用名称和剪影区分。 */
export function DistrictCard({ card, compact = false }: { card: string; compact?: boolean }) {
  const id = useId();
  const def = Citadels.districtOf(card);
  const art = useCitadelsCardArt(def.type);
  const accent = TYPE_ACCENT[def.type];
  const height = compact ? 214 : 280;
  const glyphY = compact ? 142 : 183;
  return (
    <svg className="district-card" viewBox={`0 0 200 ${height}`} role="img"
      aria-label={`${def.name}，${Citadels.TYPE_NAMES[def.type]}城区，造价 ${def.cost}`}>
      <defs>
        <clipPath id={id}>
          <rect x="2" y="2" width="196" height={height - 4} rx="9" />
        </clipPath>
      </defs>
      <rect width="200" height={height} fill={LEAD} />
      <image href={art} y={compact ? -10 : 0} width="200" height="280" clipPath={`url(#${id})`} />
      <rect x="2" y="2" width="196" height={height - 4} rx="9" fill="none" stroke={accent} strokeWidth="2" />
      <circle cx="28" cy="25" r="19" fill={LEAD} stroke={GILT} strokeWidth="1.8" />
      <text x="28" y="26" dominantBaseline="central" textAnchor="middle" className="roundel-number" fontSize="27">{def.cost}</text>

      <g transform={`translate(138 ${glyphY})`}>
        <rect width="52" height="47" rx="6" fill={LEAD} fillOpacity="0.94" stroke={accent} strokeWidth="1.5" />
        <g transform="translate(5 2) scale(.42)" fill={accent} stroke={LEAD} strokeWidth="2.6" strokeLinejoin="round" paintOrder="stroke">
          {GLYPHS[def.id]}
        </g>
      </g>
      {compact ? (
        <text x="12" y="202" className="role-face-name" fontSize="22" paintOrder="stroke" stroke={LEAD} strokeWidth="7">{def.name}</text>
      ) : (
        <>
          <rect x="9" y="237" width="182" height="36" rx="6" fill={LEAD} fillOpacity="0.96" stroke={accent} strokeWidth="1.5" />
          <text x="100" y="256" dominantBaseline="central" textAnchor="middle" className="role-face-name" fontSize={def.name.length > 3 ? 23 : 26}>{def.name}</text>
        </>
      )}
    </svg>
  );
}

export function Coin({ className = '' }: { className?: string }) {
  return (
    <svg className={`coin ${className}`} viewBox="0 0 40 40" aria-hidden="true">
      <circle cx="20" cy="20" r="18" fill={GILT} stroke={LEAD} strokeWidth="2.6" />
      <circle cx="20" cy="20" r="13" fill="none" stroke="#9c6f1e" strokeWidth="1.6" />
      <path className="ct-coin-crown" d="M12 25L11 14L16 19L20 12L24 19L29 14L28 25Z" fill="#fbe9ae" stroke="#9c6f1e" strokeWidth="1.4" strokeLinejoin="round" />
      <g className="ct-coin-pig-mark">
        <ellipse cx="20" cy="20" rx="9" ry="6" fill="#ffbbc7" stroke="#a25b72" strokeWidth="1.5" />
        <path d="M17 18v4m6-4v4" stroke="#8b435e" strokeWidth="2" strokeLinecap="round" />
      </g>
    </svg>
  );
}

/** 手牌的小图标 */
export function HandIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 40 40" aria-hidden="true">
      <rect x="6" y="9" width="18" height="25" rx="3" fill="#16286a" stroke={GILT} strokeWidth="2" transform="rotate(-12 15 21)" />
      <rect x="16" y="7" width="18" height="25" rx="3" fill="#1d3f94" stroke={GILT} strokeWidth="2" transform="rotate(10 25 19)" />
    </svg>
  );
}

/* ---------- 首页的城市彩窗 ---------- */

const WINDOW_ARCH = 'M60 588V250Q60 70 300 16Q540 70 540 250V588Z';
type Tower = [x: number, w: number, h: number, roof: Roof, type: DistrictType];
const BACK: Tower[] = [
  [70, 70, 250, 'spire', 'religious'],
  [150, 90, 200, 'battlement', 'military'],
  [246, 108, 290, 'dome', 'noble'],
  [362, 80, 220, 'spire', 'special'],
  [448, 84, 180, 'battlement', 'military'],
];
const FRONT: Tower[] = [
  [56, 96, 120, 'gable', 'trade'],
  [146, 70, 160, 'spire', 'noble'],
  [212, 104, 104, 'hip', 'trade'],
  [310, 64, 150, 'battlement', 'religious'],
  [368, 100, 112, 'gable', 'special'],
  [462, 84, 138, 'flat', 'trade'],
];

export function CityWindow() {
  const rand = seededRandom('city-window');
  const sky: ReactNode[] = [];
  const S = 64;
  for (let row = 0; row < 14; row++) {
    for (let col = 0; col < 10; col++) {
      const cx = 30 + col * S + (row % 2 ? S / 2 : 0);
      const cy = 20 + row * S * 0.72;
      const depth = Math.min(1, row / 10);
      const blues = ['#0f1b52', '#16286a', '#1d3f94', '#2f63cf'];
      sky.push(
        <path
          key={`${row}-${col}`}
          className="pane"
          style={{ animationDelay: `${-rand() * 7}s` }}
          d={`M${cx} ${cy - S * 0.72}L${cx + S / 2} ${cy}L${cx} ${cy + S * 0.72}L${cx - S / 2} ${cy}Z`}
          fill={blues[Math.min(3, Math.floor(rand() * 2 + depth * 2.4))]}
        />,
      );
    }
  }
  const lit = (towers: Tower[], shade: 0 | 1) =>
    towers.map(([x, w, h, roof, type], i) => {
      const glass = TYPE_GLASS[type];
      const windows: ReactNode[] = [];
      for (let wy = 588 - h + 22; wy < 570; wy += 34) {
        for (let wx = x + 12; wx < x + w - 14; wx += 24) {
          if (rand() < 0.55) {
            windows.push(
              <rect
                key={`${wx}-${wy}`}
                className="pane"
                style={{ animationDelay: `${-rand() * 7}s` }}
                x={wx}
                y={wy}
                width="10"
                height="16"
                rx="5"
                fill="#f6d98a"
                stroke={LEAD}
                strokeWidth="2.5"
              />,
            );
          }
        }
      }
      return (
        <g key={`${shade}-${i}`}>
          <path d={block(x, w, h, roof, 588)} fill={glass[shade]} />
          {windows}
        </g>
      );
    });

  return (
    <svg className="rose" viewBox="0 0 600 600" role="img" aria-label="彩色玻璃窗里的城市">
      <defs>
        <clipPath id="city-arch">
          <path d={WINDOW_ARCH} />
        </clipPath>
        <radialGradient id="city-sun" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#fff6d6" />
          <stop offset="0.6" stopColor="#e0b04a" />
          <stop offset="1" stopColor="#9c6f1e" />
        </radialGradient>
        <linearGradient id="city-sheen" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.22" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.3" />
        </linearGradient>
      </defs>
      <path d="M46 598V248Q46 58 300 0Q554 58 554 248V598Z" fill={LEAD} />
      <g clipPath="url(#city-arch)" strokeLinejoin="round">
        <g stroke={LEAD} strokeWidth="4">
          {sky}
        </g>
        <g stroke={LEAD} strokeWidth="5">
          <circle cx="300" cy="150" r="64" fill="url(#city-sun)" />
          <path d="M262 176L254 120L284 146L300 108L316 146L346 120L338 176Z" fill="#fff3c9" strokeWidth="4" />
          {lit(BACK, 0)}
          {lit(FRONT, 1)}
        </g>
        {/* 三联窗的两根竖棂 */}
        <path d="M218 0V600M382 0V600" stroke={LEAD} strokeWidth="12" />
        <path d="M218 0V600M382 0V600" stroke="#9c6f1e" strokeWidth="2" />
        <rect width="600" height="600" fill="url(#city-sheen)" />
      </g>
      <path d={WINDOW_ARCH} fill="none" stroke="#9c6f1e" strokeWidth="3" />
    </svg>
  );
}
