import { Glassworks } from '@tabletop/shared';

const { HUES, PIECE_NAMES, TIER_NAMES, commissionOf, panelOf } = Glassworks;
type Piece = Glassworks.Piece;

/** 「钴蓝 2、茜红 1」 */
export function listPieces(counts: Partial<Record<Piece, number>>): string {
  return Glassworks.PIECES.filter((p) => (counts[p] ?? 0) > 0)
    .map((p) => `${PIECE_NAMES[p]} ${counts[p]}`)
    .join('、');
}

export function describe(e: Glassworks.GlassLogEvent, nameOf: (id: string) => string, target: number): string {
  const who = nameOf(e.player);
  switch (e.t) {
    case 'take':
      return `${who} 从晾架取走了${e.pieces.map((h) => PIECE_NAMES[h]).join('、')}`;
    case 'sketch': {
      const tail = e.gold ? '，拿了 1 片金箔' : '';
      return e.panel
        ? `${who} 把一张${PIECE_NAMES[panelOf(e.panel).hue]}${TIER_NAMES[e.tier]}收作图稿${tail}`
        : `${who} 从${TIER_NAMES[e.tier]}牌堆摸了一张图稿${tail}`;
    }
    case 'build': {
      const def = panelOf(e.panel);
      return `${who} 烧成了一块${PIECE_NAMES[def.hue]}${TIER_NAMES[def.tier]}${def.points ? `，声望 +${def.points}` : ''}`;
    }
    case 'discard':
      return `${who} 手里的料太多，放回了 ${e.count} 块`;
    case 'commission': {
      const def = commissionOf(e.commission);
      return `${who} 接下了${def.name}的委托，声望 +${def.points}`;
    }
    case 'final':
      return `${who} 的声望达到 ${target}，这是最后一圈`;
    case 'pass':
      return `${who} 无事可做，跳过了这一回合`;
  }
}

export function toneOf(e: Glassworks.GlassLogEvent): 'plain' | 'gilt' | 'danger' {
  if (e.t === 'final') return 'danger';
  if (e.t === 'build' || e.t === 'commission') return 'gilt';
  return 'plain';
}

/** 烧这块窗片还差哪些料（已经扣掉炉色和手里的料；金箔另算） */
export function shortfall(seat: Glassworks.GlassworksSeat, panel: string): { missing: Partial<Record<Glassworks.Hue, number>>; total: number } {
  const def = panelOf(panel);
  const missing: Partial<Record<Glassworks.Hue, number>> = {};
  let total = -seat.glass.gold;
  for (const hue of HUES) {
    const gap = Math.max(0, (def.cost[hue] ?? 0) - seat.kilns[hue] - seat.glass[hue]);
    if (gap > 0) missing[hue] = gap;
    total += gap;
  }
  return { missing, total: Math.max(0, total) };
}
