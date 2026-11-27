/**
 * 《琉璃工坊》规则书（本项目的原创设计）
 *
 * 你经营一间彩窗作坊：取玻璃料，烧制窗片，承接委托，声望最高者获胜。2–4 人。
 *
 * 【物料】
 * - 五色玻璃料：钴蓝、茜红、铜绿、琥珀、紫晶。它们装在布袋里，随机摆上「晾架」排成一行。
 * - 金箔：万用料，烧制时可以顶替任意一色。金箔不进布袋，只能靠「描样」获得。
 * - 窗片 75 张：小窗 35、花窗 25、玫瑰窗 15。每档翻开 4 张作为「画廊」，其余盖着作为牌堆。
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
 * 【余温】炉温要一档一档往上升，余温只能给高一档的窗片用：
 * - 上一回合烧的是小窗，这一回合接着烧花窗，少付 1 块料；
 * - 上一回合烧的是花窗，这一回合接着烧玫瑰窗，少付 2 块料。
 * 同一档连着烧不减，小窗之后直接烧玫瑰窗（跳档）也不减；中间去取料或描样，炉子就凉了。
 * 省哪种颜色由系统替你挑最划算的：先省你手里缺的。
 * 所以值得攒够两三块窗片的料，按小窗、花窗、玫瑰窗的顺序一口气烧上去。
 *
 * 【回合结束】依次处理：
 * - 手里的料（含金箔）超过 10 块时，把多出的放回去。
 * - 你的炉色满足某张委托的要求时，拿走它（一回合最多一张，自动拿声望最高的）。
 * - 画廊补满；晾架上剩下的料向左靠拢，再从布袋里随机摸料补到右边。布袋空了就不补。
 *
 * 【声望】窗片与委托上的声望，加上两种套组：
 * - 光谱：五种炉色每凑齐一整套，加 2 分（横着凑：什么颜色都烧一点）。
 * - 联窗：同一种炉色的小窗、花窗、玫瑰窗各有一块，凑成一组，加 3 分（竖着凑：一种颜色烧到顶）。
 *
 * 【结束】有人的声望达到 17 分后，打到这一圈的最后一人（起始玩家的上家）为止，然后结算。
 * 声望最高者获胜；平分时窗片更少的人胜，再平则手里玻璃料更多的人胜。
 *
 * 【数值是怎么定的】
 * 骨架是这类引擎构筑游戏的通行路子：牌库呈金字塔（越贵的越少），小窗基本不带声望、为的是炉色，
 * 档位越高每块料换到的声望越多，但不靠炉色烧不起。每一张的具体造价是本作自己排的：
 * 15 个模板在五种炉色上各转一圈，所以五色天然对称。
 *
 * 定价看两个数：一张窗片总共要几块料，以及其中一种颜色最多要几块（下面叫「最高色」）。
 * 晾架上只能拿相邻的料：三种颜色各 1 块常常一回合就拿齐，同一种颜色 3 块却要拿三回，
 * 还可能被别人拿走。所以最高色比总数更能决定一张窗片难不难凑。原则是：
 * - 同一档的总数压在很窄的范围里（小窗 3–5、花窗 7–8、玫瑰窗一律 11），声望跟着最高色走；
 * - 最高色设上限：小窗 3、花窗 4、玫瑰窗 5。上一版有单色 6 块的花窗和单色 7 块的玫瑰窗，
 *   量下来不靠金箔平均要凑 8 和 10 个回合，一成的对局里超过 12 和 18 个回合；
 *   2 人局每种颜色一共才 6 块，单色 7 块没有炉色根本付不出。这两张已经去掉。
 *
 * 每个模板要凑几个回合是量出来的（scripts/glassworks-cost.ts：3 人局里只盯着一张凑料，
 * 从空手到烧成的回合数；小窗按 0 块炉色、花窗按 3 块、玫瑰窗按 6 块算。前一个数可以描样拿金箔补缺，
 * 后一个数只靠晾架）：
 *
 *   档      造价      总数  最高色  回合数      声望
 *   小窗    2+1        3     2     3.1 / 3.4    0
 *   小窗    1+1+1+1    4     1     3.2 / 3.4    0
 *   小窗    2+1+1      4     2     3.4 / 3.7    0
 *   小窗    2+2        4     2     3.6 / 3.9    0
 *   小窗    3          3     3     3.5 / 4.2    0
 *   小窗    2+1+1+1    5     2     3.7 / 4.0    0
 *   小窗    3+2        5     3     4.3 / 4.7    1
 *   花窗    2+2+2+1    7     2     3.7 / 4.0    1
 *   花窗    3+2+2      7     3     4.1 / 4.5    1
 *   花窗    3+3+2      8     3     4.6 / 5.0    2
 *   花窗    4+3        7     4     4.8 / 5.4    2
 *   花窗    4+4        8     4     5.4 / 6.7    3
 *   玫瑰窗  3+3+3+2   11     3     4.5 / 4.8    4
 *   玫瑰窗  4+4+3     11     4     5.2 / 5.8    5
 *   玫瑰窗  5+4+2     11     5     5.5 / 6.4    6
 *
 * 不带声望的小窗都落在 3–4 个回合里，没有哪张明显白给；3 块同色和 5 块散色差不多难。
 * 同一档里最高色每高 1，大约多凑半个到一个回合，声望也多 1。
 * 晾架（只能拿相邻的料）、余温、光谱和联窗是本作自己的东西。
 *
 * 整局的平衡用两种打法的机器人自对战看（scripts/glassworks-sim.ts，各人数 3000 局）：
 * - 一局约 20 圈（2 人 20.7，3 人 19.9，4 人 19.5）。
 * - 「攀高枝」（先搭炉色再冲大窗）对「铺摊子」（什么便宜烧什么）每个座位的胜率：
 *   2 人 50 比 50，3 人 50 比 50，4 人 48 比 52。两条路都走得通。
 * - 座次：2 人 49.8% / 50.2%；3 人 33.6% / 33.6% / 32.7%；4 人 27.5% / 25.8% / 23.4% / 23.3%。
 *   没有设后手补偿（试过让后手开局先摸 1 块料，补过了头）。
 * - 余温每局触发 4–7 次，约占全部烧制的六分之一。上一版只要连着烧就减，后期连烧小窗也在吃余温；
 *   现在只有往上升一档才减。
 * - 赢家平均烧 12 块：小窗 8、花窗 3、玫瑰窗 1.2；分数里窗片 10–12、委托 2–4、套组约 5.5。
 * - 机器人只是粗糙的参照：会顺手接上余温，但不会为了连烧特意攒料，也不会抢图稿、卡位。
 *   真人对局的手感仍需要实际玩过才知道。
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
  // 小窗：3–5 块料，一种颜色最多 3 块。主要是为了炉色，只有最难凑的一张带声望
  { tier: 1, points: 0, cost: [[1, 2], [2, 1]] },
  { tier: 1, points: 0, cost: [[1, 1], [2, 1], [3, 1], [4, 1]] },
  { tier: 1, points: 0, cost: [[4, 2], [1, 1], [3, 1]] },
  { tier: 1, points: 0, cost: [[2, 2], [3, 2]] },
  { tier: 1, points: 0, cost: [[4, 3]] },
  { tier: 1, points: 0, cost: [[3, 2], [1, 1], [2, 1], [4, 1]] },
  { tier: 1, points: 1, cost: [[2, 3], [1, 2]] },
  // 花窗：都是 7–8 块料，一种颜色最多 4 块。块数差不多，最高色越高声望越高
  { tier: 2, points: 1, cost: [[1, 2], [2, 2], [4, 2], [3, 1]] },
  { tier: 2, points: 1, cost: [[1, 3], [3, 2], [4, 2]] },
  { tier: 2, points: 2, cost: [[0, 2], [2, 3], [3, 3]] },
  { tier: 2, points: 2, cost: [[3, 4], [4, 3]] },
  { tier: 2, points: 3, cost: [[0, 4], [2, 4]] },
  // 玫瑰窗：都是 11 块料，最高色 3、4、5，声望 4、5、6。不靠炉色基本烧不起
  { tier: 3, points: 4, cost: [[1, 3], [2, 3], [3, 3], [4, 2]] },
  { tier: 3, points: 5, cost: [[0, 3], [2, 4], [4, 4]] },
  { tier: 3, points: 6, cost: [[1, 5], [3, 4], [0, 2]] },
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
/** 同一种炉色的小窗、花窗、玫瑰窗各一块凑成一组「联窗」的加分 */
export const TRIPTYCH_BONUS = 3;
/**
 * 余温只能逐级往上用：上一回合烧的是小窗，这一回合接着烧花窗少付 1 块；
 * 上一回合烧的是花窗，接着烧玫瑰窗少付 2 块。同档连烧、跳档都不减。
 */
export const HEAT_DISCOUNT: Record<Tier, number> = { 1: 0, 2: 1, 3: 2 };
/** 炉温：上一回合烧成的窗片是哪一档；0 表示炉子是凉的 */
export type Heat = 0 | Tier;
/** 炉温为 heat 时，烧 tier 这一档的窗片能少付几块料 */
export function heatDiscount(heat: Heat, tier: Tier): number {
  return heat > 0 && tier === heat + 1 ? HEAT_DISCOUNT[tier] : 0;
}
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
