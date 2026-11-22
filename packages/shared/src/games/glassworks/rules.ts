/**
 * 《琉璃工坊》规则书（本项目的原创设计）
 *
 * 你经营一间彩窗作坊：取玻璃料，烧制窗片，承接委托，声望最高者获胜。2–4 人。
 *
 * 【物料】
 * - 五色玻璃料：钴蓝、茜红、铜绿、琥珀、紫晶。它们装在布袋里，随机摆上「晾架」排成一行。
 * - 金箔：万用料，烧制时可以顶替任意一色。金箔不进布袋，只能靠「描样」获得。
 * - 窗片：分小窗、花窗、玫瑰窗三档。每档翻开 4 张作为「画廊」，其余盖着作为牌堆。
 *   每块窗片有造价、声望，以及一种「炉色」。
 * - 委托：开局翻开（人数 + 1）张，每张要求若干种炉色各达到一定数量。
 *
 * 【回合】轮到你时，从下面选一件事做：
 * 1. 取料：从晾架上拿走相邻的 1–3 块玻璃料。
 * 2. 描样：把画廊里的一张窗片（或某一档牌堆顶的一张，不给别人看）收作图稿，并拿 1 片金箔
 *    （金箔发完了就没有）。手里最多留 3 张图稿。
 * 3. 烧制：支付造价，把画廊里或自己图稿里的一张窗片烧成。付出的玻璃料回到布袋，金箔回到供应。
 * 只有晾架空了、又没有别的事可做时才可以跳过。
 *
 * 【炉色】你每拥有一块某色的窗片，以后烧制时该色的造价就少 1。炉色只增不减。
 *
 * 【回合结束】依次处理：
 * - 手里的料（含金箔）超过 10 块时，把多出的放回去。
 * - 你的炉色满足某张委托的要求时，拿走它（一回合最多一张，自动拿声望最高的）。
 * - 画廊补满；晾架上剩下的料向左靠拢，再从布袋里随机摸料补到右边。布袋空了就不补。
 *
 * 【声望】窗片与委托上的声望，加上「光谱」：五种炉色每凑齐一整套，加 2 分。
 *
 * 【结束】有人的声望达到目标分后，打到这一圈的最后一人（起始玩家的上家）为止，然后结算。
 * 声望最高者获胜；平分时窗片更少的人胜，再平则手里玻璃料更多的人胜。
 *
 * 【数值是怎么定的】用两种打法的机器人自对战调出来的（各人数 800–1200 局）：
 * - 一局约 20 圈；各座次胜率接近（2 人 51% / 49%，4 人 26% / 26% / 25% / 23%），所以不设后手补偿。
 * - 初版里花窗和玫瑰窗太贵，「只烧小窗」的打法能赢七成。下调造价、提高玫瑰窗声望后，
 *   「搭好炉色后只冲大窗」对「什么便宜烧什么」约为 55 比 45，两条路线都走得通。
 * - 机器人只是粗糙的参照，不会抢图稿、不会卡位，真人对局的手感仍需要实际玩过才知道。
 */

export type Hue = 'blue' | 'red' | 'green' | 'amber' | 'violet';
/** 一块料：五色之一，或金箔 */
export type Piece = Hue | 'gold';

export const HUES: readonly Hue[] = ['blue', 'red', 'green', 'amber', 'violet'];
export const PIECES: readonly Piece[] = [...HUES, 'gold'];

export const PIECE_NAMES: Record<Piece, string> = {
  blue: '钴蓝',
  red: '茜红',
  green: '铜绿',
  amber: '琥珀',
  violet: '紫晶',
  gold: '金箔',
};

export type Cost = Partial<Record<Hue, number>>;
export type Tier = 1 | 2 | 3;
export const TIERS: readonly Tier[] = [1, 2, 3];
export const TIER_NAMES: Record<Tier, string> = { 1: '小窗', 2: '花窗', 3: '玫瑰窗' };

export interface PanelDef {
  id: string;
  tier: Tier;
  /** 烧成后获得的炉色 */
  hue: Hue;
  points: number;
  cost: Cost;
}

/**
 * 窗片的造价模板。offset 是相对炉色的色环位置（0 为本色），
 * 每个模板在五种炉色上各转一圈，所以五色天然平衡。
 */
interface Template {
  tier: Tier;
  points: number;
  cost: [offset: number, amount: number][];
}

const TEMPLATES: Template[] = [
  // 小窗：便宜，主要是为了炉色
  { tier: 1, points: 0, cost: [[1, 2], [2, 1]] },
  { tier: 1, points: 0, cost: [[2, 2], [3, 2]] },
  { tier: 1, points: 0, cost: [[1, 1], [3, 1], [4, 2]] },
  { tier: 1, points: 0, cost: [[4, 3]] },
  { tier: 1, points: 1, cost: [[0, 1], [2, 3]] },
  // 花窗
  { tier: 2, points: 1, cost: [[1, 2], [2, 2], [4, 2]] },
  { tier: 2, points: 2, cost: [[3, 4], [4, 1]] },
  { tier: 2, points: 2, cost: [[0, 2], [1, 2], [3, 3]] },
  { tier: 2, points: 3, cost: [[2, 5]] },
  // 玫瑰窗
  { tier: 3, points: 4, cost: [[1, 3], [2, 3], [3, 2], [4, 2]] },
  { tier: 3, points: 5, cost: [[0, 3], [2, 4], [4, 3]] },
  { tier: 3, points: 6, cost: [[3, 6], [4, 3]] },
];

export const PANELS: readonly PanelDef[] = TEMPLATES.flatMap((t, index) =>
  HUES.map((hue, h) => {
    const cost: Cost = {};
    for (const [offset, amount] of t.cost) cost[HUES[(h + offset) % HUES.length]!] = amount;
    return { id: `t${t.tier}-${index}-${hue}`, tier: t.tier, hue, points: t.points, cost };
  }),
);

const PANEL_BY_ID = new Map(PANELS.map((p) => [p.id, p]));
export function panelOf(id: string): PanelDef {
  const def = PANEL_BY_ID.get(id);
  if (!def) throw new Error(`unknown panel: ${id}`);
  return def;
}

export interface CommissionDef {
  id: string;
  /** 委托人 */
  name: string;
  points: number;
  /** 需要的炉色数量 */
  need: Cost;
}

const PAIR_PATRONS = ['渡口礼拜堂', '染坊行会', '钟楼修会', '河畔医院', '市政厅'];
const TRIO_PATRONS = ['学院藏书楼', '商人公所', '城门小教堂', '修道院回廊', '灯塔守望所'];

export const COMMISSIONS: readonly CommissionDef[] = [
  // 两色并重
  ...HUES.map((hue, h) => ({
    id: `pair-${hue}`,
    name: PAIR_PATRONS[h]!,
    points: 3,
    need: { [hue]: 4, [HUES[(h + 1) % 5]!]: 4 } as Cost,
  })),
  // 一主两辅
  ...HUES.map((hue, h) => ({
    id: `trio-${hue}`,
    name: TRIO_PATRONS[h]!,
    points: 3,
    need: { [hue]: 4, [HUES[(h + 2) % 5]!]: 2, [HUES[(h + 3) % 5]!]: 2 } as Cost,
  })),
  // 五色俱全
  { id: 'full-1', name: '主教座堂', points: 5, need: { blue: 2, red: 2, green: 2, amber: 2, violet: 2 } },
  { id: 'full-2', name: '王宫礼拜堂', points: 5, need: { blue: 2, red: 2, green: 2, amber: 2, violet: 2 } },
];

const COMMISSION_BY_ID = new Map(COMMISSIONS.map((c) => [c.id, c]));
export function commissionOf(id: string): CommissionDef {
  const def = COMMISSION_BY_ID.get(id);
  if (!def) throw new Error(`unknown commission: ${id}`);
  return def;
}

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;

/** 画廊每档翻开几张 */
export const GALLERY_SIZE = 4;
/** 一次最多取几块相邻的料 */
export const TAKE_LIMIT = 3;
/** 手里最多留几块料（含金箔） */
export const HAND_LIMIT = 10;
/** 手里最多留几张图稿 */
export const SKETCH_LIMIT = 3;
export const GOLD_SUPPLY = 5;
/** 每凑齐一整套五种炉色的加分 */
export const SPECTRUM_BONUS = 2;
/** 声望达到这个数就进入最后一圈 */
export const TARGET_POINTS = 17;

/** 每种颜色的玻璃料总数 */
export function piecesPerHue(playerCount: number): number {
  return playerCount + 4;
}
/** 晾架上摆几块料 */
export function rackSize(playerCount: number): number {
  return playerCount + 4;
}
export function commissionCount(playerCount: number): number {
  return playerCount + 1;
}

// 这一版没有可调的开局选项
export type GlassworksOptions = Record<string, never>;
