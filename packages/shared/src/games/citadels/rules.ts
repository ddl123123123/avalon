/**
 * 《富饶之城》（Citadels）经典版基础游戏：规则书里的静态数据。
 *
 * 依据 Fantasy Flight Games 第三版规则书（2006 / 2010 印次）与官方 FAQ v1.2。
 * 注意不要和 2016 年的修订版混淆：那一版 4 人以上建成 7 座即结束，平分看角色号码，
 * 紫色城区的组成和部分数值也不同。
 *
 * 规则书没有写明、这里自行决定的几处：
 * - 被摧毁和被弃掉的城区牌放回牌堆底；牌堆抽完后有多少抽多少。
 * - 金币不设上限。
 * - 首位执王冠的人随机决定（规则书是「最年长的玩家」）。
 */

export type DistrictType = 'noble' | 'religious' | 'trade' | 'military' | 'special';

export const DISTRICT_TYPES: readonly DistrictType[] = ['noble', 'religious', 'trade', 'military', 'special'];

export const TYPE_NAMES: Record<DistrictType, string> = {
  noble: '贵族',
  religious: '宗教',
  trade: '商业',
  military: '军事',
  special: '特殊',
};

export interface DistrictDef {
  id: string;
  name: string;
  type: DistrictType;
  cost: number;
  /** 牌堆里有几张 */
  count: number;
  /** 特殊城区的效果说明 */
  text?: string;
}

export const DISTRICTS: readonly DistrictDef[] = [
  // 贵族（黄）12 张
  { id: 'manor', name: '庄园', type: 'noble', cost: 3, count: 5 },
  { id: 'castle', name: '城堡', type: 'noble', cost: 4, count: 4 },
  { id: 'palace', name: '宫殿', type: 'noble', cost: 5, count: 3 },
  // 宗教（蓝）11 张
  { id: 'temple', name: '神殿', type: 'religious', cost: 1, count: 3 },
  { id: 'church', name: '教堂', type: 'religious', cost: 2, count: 3 },
  { id: 'monastery', name: '修道院', type: 'religious', cost: 3, count: 3 },
  { id: 'cathedral', name: '大教堂', type: 'religious', cost: 5, count: 2 },
  // 商业（绿）20 张
  { id: 'tavern', name: '酒馆', type: 'trade', cost: 1, count: 5 },
  { id: 'trading_post', name: '贸易站', type: 'trade', cost: 2, count: 3 },
  { id: 'market', name: '市场', type: 'trade', cost: 2, count: 4 },
  { id: 'docks', name: '码头', type: 'trade', cost: 3, count: 3 },
  { id: 'harbor', name: '港口', type: 'trade', cost: 4, count: 3 },
  { id: 'town_hall', name: '市政厅', type: 'trade', cost: 5, count: 2 },
  // 军事（红）11 张
  { id: 'watchtower', name: '瞭望塔', type: 'military', cost: 1, count: 3 },
  { id: 'prison', name: '监狱', type: 'military', cost: 2, count: 3 },
  { id: 'battlefield', name: '战场', type: 'military', cost: 3, count: 3 },
  { id: 'fortress', name: '堡垒', type: 'military', cost: 5, count: 2 },
  // 特殊（紫）
  {
    id: 'haunted_city',
    name: '鬼城',
    type: 'special',
    cost: 2,
    count: 1,
    text: '终局计分时可以当作任意一种颜色的城区。在最后一轮建成的鬼城没有这个效果。',
  },
  { id: 'keep', name: '要塞', type: 'special', cost: 3, count: 2, text: '不会被军阀摧毁。' },
  { id: 'laboratory', name: '实验室', type: 'special', cost: 5, count: 1, text: '每回合一次：弃掉一张手牌，获得 1 枚金币。' },
  { id: 'smithy', name: '铁匠铺', type: 'special', cost: 5, count: 1, text: '每回合一次：支付 2 枚金币，抽 3 张牌。' },
  { id: 'observatory', name: '天文台', type: 'special', cost: 5, count: 1, text: '选择抽牌时，抽 3 张，留 1 张。' },
  {
    id: 'graveyard',
    name: '墓地',
    type: 'special',
    cost: 5,
    count: 1,
    text: '军阀摧毁城区时，你可以支付 1 枚金币把那张牌收入手牌。你自己是军阀时不能使用。',
  },
  { id: 'dragon_gate', name: '龙门', type: 'special', cost: 6, count: 1, text: '造价 6，终局计 8 分。' },
  { id: 'university', name: '大学', type: 'special', cost: 6, count: 1, text: '造价 6，终局计 8 分。' },
  { id: 'library', name: '图书馆', type: 'special', cost: 6, count: 1, text: '选择抽牌时，抽到的两张都留下。同时拥有天文台时，抽 3 张留 2 张。' },
  { id: 'great_wall', name: '长城', type: 'special', cost: 6, count: 1, text: '军阀摧毁你其他城区的花费增加 1。' },
  {
    id: 'school_of_magic',
    name: '魔法学院',
    type: 'special',
    cost: 6,
    count: 1,
    text: '收取城区收入时，可以当作任意一种颜色。',
  },
];

const BY_ID = new Map(DISTRICTS.map((d) => [d.id, d]));

/** 牌的实例 id 形如 manor-2；这里取回它的定义 */
export function districtOf(card: string): DistrictDef {
  const def = BY_ID.get(card.slice(0, card.lastIndexOf('-')));
  if (!def) throw new Error(`unknown district card: ${card}`);
  return def;
}

export function buildDistrictDeck(): string[] {
  return DISTRICTS.flatMap((d) => Array.from({ length: d.count }, (_, i) => `${d.id}-${i + 1}`));
}

/** 终局计分时这张城区值多少分 */
export function districtScore(card: string): number {
  const def = districtOf(card);
  return def.id === 'dragon_gate' || def.id === 'university' ? 8 : def.cost;
}

export type CharacterId = 'assassin' | 'thief' | 'magician' | 'king' | 'bishop' | 'merchant' | 'architect' | 'warlord';

export interface CharacterDef {
  id: CharacterId;
  /** 行动顺序，1 最先 */
  rank: number;
  name: string;
  ability: string;
  /** 每座这种颜色的城区带来 1 枚金币 */
  income?: DistrictType;
}

export const CHARACTERS: readonly CharacterDef[] = [
  { id: 'assassin', rank: 1, name: '刺客', ability: '指定一个角色，这一轮他不能行动。' },
  { id: 'thief', rank: 2, name: '盗贼', ability: '指定一个角色，轮到他时偷走他所有的金币。不能偷刺客，也不能偷被刺杀的角色。' },
  { id: 'magician', rank: 3, name: '魔术师', ability: '与另一名玩家交换全部手牌；或者弃掉任意张手牌，再抽同样数量的牌。' },
  { id: 'king', rank: 4, name: '国王', ability: '每座贵族城区带来 1 枚金币。拿走王冠，下一轮由你先选角色。', income: 'noble' },
  { id: 'bishop', rank: 5, name: '主教', ability: '每座宗教城区带来 1 枚金币。你的城区不会被军阀摧毁。', income: 'religious' },
  { id: 'merchant', rank: 6, name: '商人', ability: '每座商业城区带来 1 枚金币。执行行动后额外获得 1 枚金币。', income: 'trade' },
  { id: 'architect', rank: 7, name: '建筑师', ability: '执行行动后额外抽 2 张牌。这一回合最多可以建造 3 座城区。' },
  { id: 'warlord', rank: 8, name: '军阀', ability: '每座军事城区带来 1 枚金币。可以支付城区造价减 1 的金币，摧毁一座城区。', income: 'military' },
];

export const CHARACTER: Record<CharacterId, CharacterDef> = Object.fromEntries(CHARACTERS.map((c) => [c.id, c])) as Record<
  CharacterId,
  CharacterDef
>;

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 7;

/** 建成这么多座城区即触发终局 */
export const CITY_SIZE = 8;
export const STARTING_GOLD = 2;
export const STARTING_HAND = 4;
/** 选择「拿金币」时得到的数量 */
export const ACTION_GOLD = 2;

export const BONUS_ALL_TYPES = 3;
export const BONUS_FIRST_COMPLETE = 4;
export const BONUS_COMPLETE = 2;

/** 选角前先移出的角色牌数量 */
export function draftDiscards(playerCount: number): { faceDown: number; faceUp: number } {
  switch (playerCount) {
    case 4:
      return { faceDown: 1, faceUp: 2 };
    case 5:
      return { faceDown: 1, faceUp: 1 };
    default:
      // 2、3、6、7 人：只盖一张
      return { faceDown: 1, faceUp: 0 };
  }
}

/** 2–3 人局每人持有两个角色 */
export function charactersPerPlayer(playerCount: number): number {
  return playerCount <= 3 ? 2 : 1;
}

// 这一版没有可调的开局选项；保留结构，方便以后加入扩展角色
export type CitadelsOptions = Record<string, never>;
