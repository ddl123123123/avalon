import { Citadels } from '@tabletop/shared';

const { CHARACTER, districtOf } = Citadels;

/** 把一条事件记录写成一句话。 */
export function describe(e: Citadels.LogEvent, nameOf: (id: string) => string): string {
  const who = 'player' in e && e.player ? nameOf(e.player) : '';
  switch (e.t) {
    case 'round':
      return `第 ${e.round} 轮开始，${nameOf(e.crown)} 执王冠，先选角色`;
    case 'call': {
      const c = CHARACTER[e.character];
      return e.player ? `${c.rank} 号${c.name}，是 ${who}` : `${c.rank} 号${c.name}，无人应答`;
    }
    case 'gold':
      if (e.why === 'action') return `${who} 拿了 ${e.amount} 枚金币`;
      if (e.why === 'income') return `${who} 收取城区收入 ${e.amount} 枚金币`;
      if (e.why === 'merchant') return `${who} 身为商人，多得 ${e.amount} 枚金币`;
      return `${who} 用实验室换得 ${e.amount} 枚金币`;
    case 'draw':
      if (e.why === 'action') return `${who} 抽牌，留下 ${e.count} 张`;
      if (e.why === 'architect') return `${who} 身为建筑师，多抽 ${e.count} 张牌`;
      return `${who} 用铁匠铺抽了 ${e.count} 张牌`;
    case 'build':
      return `${who} 建成了${districtOf(e.card).name}`;
    case 'murder':
      return `刺客的目标是${CHARACTER[e.character].name}`;
    case 'rob':
      return `盗贼盯上了${CHARACTER[e.character].name}`;
    case 'stolen':
      return `${nameOf(e.to)} 偷走了 ${nameOf(e.from)} 的 ${e.amount} 枚金币`;
    case 'swap':
      return `${who} 和 ${nameOf(e.target)} 交换了全部手牌`;
    case 'redraw':
      return `${who} 换掉了 ${e.count} 张手牌`;
    case 'destroy':
      return `${who} 花 ${e.cost} 枚金币摧毁了 ${nameOf(e.target)} 的${districtOf(e.card).name}`;
    case 'graveyard':
      return `${who} 花 1 枚金币，从废墟里收回了${districtOf(e.card).name}`;
    case 'crown':
      return `王冠交到了 ${who} 手上`;
    case 'murdered':
      return `${who} 是这一轮被刺杀的${CHARACTER[e.character].name}`;
    case 'complete':
      return e.first ? `${who} 第一个建成了城市，这是最后一轮` : `${who} 也建成了城市`;
  }
}

/** 值得用醒目样式播报的事件 */
export function toneOf(e: Citadels.LogEvent): 'plain' | 'gilt' | 'danger' {
  if (e.t === 'murder' || e.t === 'destroy' || e.t === 'stolen' || e.t === 'murdered') return 'danger';
  if (e.t === 'build' || e.t === 'complete' || e.t === 'crown' || e.t === 'round') return 'gilt';
  return 'plain';
}

/** 军阀摧毁这座城区的花费；不能摧毁时返回 null（与服务器的判定一致，服务器仍会再校验） */
export function destroyCostOf(view: Citadels.CitadelsView, target: string, card: string): number | null {
  const seat = view.seats[target];
  if (!seat || !seat.city.includes(card)) return null;
  const def = districtOf(card);
  if (def.id === 'keep' || seat.city.length >= view.citySize || seat.revealed.includes('bishop')) return null;
  const wall = def.id !== 'great_wall' && seat.city.some((c) => districtOf(c).id === 'great_wall') ? 1 : 0;
  return def.cost - 1 + wall;
}

export function incomeOf(view: Citadels.CitadelsView, player: string, character: Citadels.CharacterId): number {
  const type = CHARACTER[character].income;
  if (!type) return 0;
  return view.seats[player]!.city.filter((c) => districtOf(c).type === type || districtOf(c).id === 'school_of_magic').length;
}
