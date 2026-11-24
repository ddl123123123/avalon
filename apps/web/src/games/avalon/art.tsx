import { useId } from 'react';
import { Avalon } from '@tabletop/shared';
import { polar, sector } from '../../art/geometry';
import { DecodedImage } from '../../art/DecodedImage';
import { ArchCard, EMBLEM, GILT, LEAD, type Glass } from '../../art/glass';
import { getAvalonCardAsset, useAvalonCardStyle, type AvalonCardStyle } from './cardLibrary';

type Role = Avalon.Role;

/** 每个角色一组玻璃色：深 / 中 / 亮 */
const GLASS: Record<Role, Glass> = {
  merlin: ['#1d3f94', '#3f6fd8', '#8fb8ff'],
  percival: ['#12606e', '#2a98a8', '#9fe0e0'],
  servant: ['#23408a', '#3b62bd', '#86a8ea'],
  assassin: ['#6e1226', '#b8263b', '#ec6a78'],
  morgana: ['#4d1760', '#8a2e9e', '#d07adc'],
  mordred: ['#4a0c14', '#8f1d26', '#d4513f'],
  oberon: ['#33314f', '#59558a', '#a59fd0'],
  minion: ['#5f1616', '#9c2e2e', '#dd6a55'],
};

/** 角色徽记，画在 100×100 的格子里。 */
function Emblem({ role }: { role: Role }) {
  switch (role) {
    case 'merlin':
      // 尖顶法师帽与星
      return (
        <>
          <path d="M52 8L72 62H28Z" />
          <path d="M12 68Q50 52 88 68Q50 86 12 68Z" />
          <path d="M50 30l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" fill="#3f6fd8" stroke="none" />
        </>
      );
    case 'percival':
      // 圣杯
      return (
        <>
          <path d="M26 22H74C74 50 64 60 50 60C36 60 26 50 26 22Z" />
          <path d="M45 60H55V76H45Z" />
          <path d="M32 86C32 79 41 76 50 76C59 76 68 79 68 86Z" />
          <path d="M50 4v8M34 8l3 7M66 8l-3 7" fill="none" stroke={EMBLEM} strokeWidth="3" strokeLinecap="round" />
        </>
      );
    case 'servant':
      // 十字盾
      return (
        <>
          <path d="M22 14H78V46C78 70 62 84 50 90C38 84 22 70 22 46Z" />
          <path d="M45 14h10v24h23v10H55v38l-5 4-5-4V48H22V38h23z" fill="#3b62bd" stroke="none" />
        </>
      );
    case 'assassin':
      // 匕首
      return (
        <>
          <path d="M50 94L41 44H59Z" />
          <path d="M28 36H72V46H28Z" />
          <path d="M45 16H55V36H45Z" />
          <circle cx="50" cy="12" r="7" />
        </>
      );
    case 'morgana':
      // 弦月与星
      return (
        <>
          <path d="M60 10A40 40 0 1 0 60 90A31 31 0 1 1 60 10Z" />
          <path d="M70 38l4 9 9 4-9 4-4 9-4-9-9-4 9-4z" />
        </>
      );
    case 'mordred':
      // 裂开的王冠
      return (
        <>
          <path d="M16 68L12 28L32 46L50 18L68 46L88 28L84 68Z" />
          <path d="M16 74H84V86H16Z" />
          <path d="M50 18L45 38L55 50L48 68" fill="none" stroke={LEAD} strokeWidth="4" strokeLinejoin="round" />
        </>
      );
    case 'oberon':
      // 面具
      return (
        <>
          <path d="M8 38C24 26 40 30 50 40C60 30 76 26 92 38C92 58 80 70 66 68C58 67 54 60 50 54C46 60 42 67 34 68C20 70 8 58 8 38Z" />
          <path d="M20 46q11-9 22 2q-11 7-22-2zM80 46q-11-9-22 2q11 7 22-2z" fill={LEAD} stroke="none" />
        </>
      );
    case 'minion':
      // 三道爪痕
      return (
        <g transform="rotate(14 50 50)">
          <path d="M26 12Q40 50 28 90Q18 50 26 12Z" />
          <path d="M50 8Q64 50 52 94Q42 50 50 8Z" />
          <path d="M74 12Q88 50 76 90Q66 50 74 12Z" />
        </g>
      );
  }
}

/** 角色牌正面：哥特拱窗里的一扇彩色玻璃。 */
export function RoleFace({ role, style }: { role: Role; style?: AvalonCardStyle }) {
  const activeStyle = useAvalonCardStyle();
  const cardStyle = style ?? activeStyle;
  const asset = getAvalonCardAsset(cardStyle, role);
  const info = Avalon.ROLES[role];
  const good = info.alignment === 'good';
  const label = `${info.name}，${good ? '正义方' : '邪恶方'}`;
  return (
    <div className="role-face role-face-raster" role="img" aria-label={label} data-card-style={cardStyle}>
      <div className="role-face-fallback" aria-hidden="true">
        <ArchCard seed={role} glass={GLASS[role]} name={info.name} accent={good ? '#4c86ea' : '#d2384f'} label={label}>
          <Emblem role={role} />
        </ArchCard>
      </div>
      <DecodedImage className="role-face-art" data-side={asset.side} src={asset.src} alt="" />
    </div>
  );
}

/** 投票币：白为赞成，黑为反对（与实体游戏一致）。 */
export function VoteToken({ approve, className = '' }: { approve: boolean; className?: string }) {
  return (
    <svg className={`vote-token ${className}`} viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r="46" fill={approve ? '#f3ecd8' : '#11152c'} stroke={LEAD} strokeWidth="5" />
      <circle cx="50" cy="50" r="37" fill="none" stroke={approve ? '#b98f33' : GILT} strokeWidth="2" strokeDasharray="2 5" />
      {approve ? (
        <path d="M30 52L45 67L72 35" fill="none" stroke="#1d2a5c" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <path d="M34 34L66 66M66 34L34 66" fill="none" stroke="#e9dfc4" strokeWidth="10" strokeLinecap="round" />
      )}
    </svg>
  );
}

function Sword({ broken }: { broken: boolean }) {
  if (!broken) {
    return (
      <>
        <path d="M50 6L58 20V62H42V20Z" />
        <path d="M26 62H74V71H26Z" />
        <path d="M45 71H55V87H45Z" />
        <circle cx="50" cy="91" r="6.5" />
      </>
    );
  }
  return (
    <>
      <path d="M42 62V44L50 36L54 46L58 40V62Z" />
      <path d="M26 62H74V71H26Z" />
      <path d="M45 71H55V87H45Z" />
      <circle cx="50" cy="91" r="6.5" />
      {/* 断掉的剑尖，斜落在一旁 */}
      <path d="M50 2L58 16V34L54 28L50 36L46 30L42 34V16Z" transform="translate(24 8) rotate(52 50 20)" />
    </>
  );
}

/** 任务牌：成功是完整的剑，失败是折断的剑。 */
export function QuestCard({ success }: { success: boolean }) {
  const id = useId();
  const [dark, mid, light] = success ? GLASS.merlin : GLASS.assassin;
  return (
    <svg className="quest-card-art" viewBox="0 0 120 168" role="img" aria-label={success ? '任务成功' : '任务失败'}>
      <defs>
        <radialGradient id={`${id}q`} cx="50%" cy="36%" r="70%">
          <stop offset="0" stopColor={light} />
          <stop offset="0.6" stopColor={mid} />
          <stop offset="1" stopColor={dark} />
        </radialGradient>
      </defs>
      <rect x="2.5" y="2.5" width="115" height="163" rx="10" fill="#0a0f2b" stroke={GILT} strokeWidth="2.5" />
      <g stroke={LEAD} strokeWidth="2.4" strokeLinejoin="round">
        {Array.from({ length: 10 }, (_, i) => (
          <path key={i} d={sector(60, 68, 36, 50, i * 36 - 90, (i + 1) * 36 - 90)} fill={i % 2 ? dark : mid} />
        ))}
        <circle cx="60" cy="68" r="36" fill={`url(#${id}q)`} />
      </g>
      <g transform="translate(29 34) scale(0.62)" fill={EMBLEM} stroke={LEAD} strokeWidth="4" strokeLinejoin="round" paintOrder="stroke">
        <Sword broken={!success} />
      </g>
      <text x="60" y="148" textAnchor="middle" className="role-face-name" fontSize="22">
        {success ? '成功' : '失败'}
      </text>
    </svg>
  );
}

/** 出任务的队员标记：一面小盾 */
export function TeamMark({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 36" aria-hidden="true">
      <path d="M3 3H29V17C29 26 22 31 16 34C10 31 3 26 3 17Z" fill="#f3ecd8" stroke={LEAD} strokeWidth="2.6" strokeLinejoin="round" />
      <path d="M16 8v18M9 15h14" stroke="#c7304a" strokeWidth="4" />
    </svg>
  );
}

/** 湖中仙女：水面上托起的剑 */
export function LadyToken({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 40 40" aria-hidden="true">
      <circle cx="20" cy="20" r="18" fill="#12606e" stroke={LEAD} strokeWidth="2.6" />
      <path d="M20 5L23 10V24H17V10Z" fill={EMBLEM} stroke={LEAD} strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M13 24H27" stroke={EMBLEM} strokeWidth="3" strokeLinecap="round" />
      <path d="M5 28q4-4 7.5 0t7.5 0t7.5 0t7.5 0" fill="none" stroke="#9fe0e0" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M9 33q3.5-3 7 0t7 0t7 0" fill="none" stroke="#9fe0e0" strokeWidth="2" strokeLinecap="round" opacity="0.7" />
    </svg>
  );
}

/** 任务轨上的一枚圆章 */
export function QuestRoundel({
  state,
  size,
  twoFails,
}: {
  state: 'pending' | 'current' | 'success' | 'fail';
  size: number;
  twoFails: boolean;
}) {
  const id = useId();
  const done = state === 'success' || state === 'fail';
  const [dark, mid, light] = state === 'success' ? GLASS.merlin : state === 'fail' ? GLASS.assassin : ['#0c1236', '#18225a', '#2a3a86'];
  return (
    <svg className={`roundel roundel-${state}`} viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <radialGradient id={`${id}r`} cx="50%" cy="34%" r="72%">
          <stop offset="0" stopColor={light} />
          <stop offset="0.6" stopColor={mid} />
          <stop offset="1" stopColor={dark} />
        </radialGradient>
      </defs>
      <circle cx="50" cy="50" r="47" fill={LEAD} />
      <g stroke={LEAD} strokeWidth="2.6">
        {Array.from({ length: 12 }, (_, i) => (
          <path key={i} d={sector(50, 50, 34, 45, i * 30, (i + 1) * 30)} fill={i % 2 ? dark : mid} />
        ))}
        <circle cx="50" cy="50" r="34" fill={`url(#${id}r)`} />
      </g>
      <circle cx="50" cy="50" r="46" fill="none" stroke={state === 'pending' ? '#6b5a2c' : GILT} strokeWidth="2" />
      {done ? (
        <g transform="translate(26 24) scale(0.48)" fill={EMBLEM} stroke={LEAD} strokeWidth="5" strokeLinejoin="round" paintOrder="stroke">
          <Sword broken={state === 'fail'} />
        </g>
      ) : (
        <text x="50" y="63" textAnchor="middle" className="roundel-number" fontSize="40">
          {size}
        </text>
      )}
      {twoFails && !done && (
        <g>
          {[polar(50, 50, 40, 60), polar(50, 50, 40, 120)].map(([x, y]) => (
            <circle key={x} cx={x} cy={y} r="6" fill="#d2384f" stroke={LEAD} strokeWidth="2" />
          ))}
        </g>
      )}
    </svg>
  );
}
