/**
 * 《抵抗组织：阿瓦隆》规则书中的静态数据。
 */

export type Alignment = 'good' | 'evil';

export type Role =
  | 'merlin'
  | 'percival'
  | 'servant'
  | 'assassin'
  | 'morgana'
  | 'mordred'
  | 'oberon'
  | 'minion';

export interface RoleInfo {
  id: Role;
  name: string;
  alignment: Alignment;
  /** 一句话能力说明 */
  ability: string;
}

export const ROLES: Record<Role, RoleInfo> = {
  merlin: {
    id: 'merlin',
    name: '梅林',
    alignment: 'good',
    ability: '知道哪些人是邪恶方（莫德雷德除外）。但若最后被刺客认出，正义方功亏一篑。',
  },
  percival: {
    id: 'percival',
    name: '派西维尔',
    alignment: 'good',
    ability: '知道谁是梅林。若莫甘娜在场，她会和梅林一起出现，你分不清谁是真的。',
  },
  servant: {
    id: 'servant',
    name: '亚瑟的忠臣',
    alignment: 'good',
    ability: '没有额外信息。靠发言、投票和任务结果找出同伴。',
  },
  assassin: {
    id: 'assassin',
    name: '刺客',
    alignment: 'evil',
    ability: '正义方完成三次任务后，由你指认梅林。猜中则邪恶方反败为胜。',
  },
  morgana: {
    id: 'morgana',
    name: '莫甘娜',
    alignment: 'evil',
    ability: '在派西维尔眼中，你和梅林一模一样。',
  },
  mordred: {
    id: 'mordred',
    name: '莫德雷德',
    alignment: 'evil',
    ability: '梅林看不到你。',
  },
  oberon: {
    id: 'oberon',
    name: '奥伯伦',
    alignment: 'evil',
    ability: '你不认识其他邪恶方，他们也不认识你。梅林能看到你。',
  },
  minion: {
    id: 'minion',
    name: '莫德雷德的爪牙',
    alignment: 'evil',
    ability: '认识其他邪恶方（奥伯伦除外）。',
  },
};

export const MIN_PLAYERS = 5;
export const MAX_PLAYERS = 10;

/** 人数 → 邪恶方人数 */
export const EVIL_COUNT: Record<number, number> = {
  5: 2,
  6: 2,
  7: 3,
  8: 3,
  9: 3,
  10: 4,
};

/** 人数 → 五次任务各需要的队员数 */
export const TEAM_SIZES: Record<number, readonly number[]> = {
  5: [2, 3, 2, 3, 3],
  6: [2, 3, 4, 3, 4],
  7: [2, 3, 3, 4, 4],
  8: [3, 4, 4, 5, 5],
  9: [3, 4, 4, 5, 5],
  10: [3, 4, 4, 5, 5],
};

export const QUEST_COUNT = 5;
/** 三次任务成功或失败即分出胜负 */
export const QUESTS_TO_WIN = 3;
/** 同一轮任务中连续五次组队被否决，邪恶方获胜 */
export const MAX_REJECTS = 5;
/** 湖中仙女在第 2、3、4 次任务结束后使用 */
export const LADY_AFTER_QUESTS: readonly number[] = [1, 2, 3];
/** 规则书建议 7 人及以上使用湖中仙女 */
export const LADY_RECOMMENDED_PLAYERS = 7;

/** 7 人及以上时，第 4 次任务需要两张失败牌才算失败 */
export function failsRequired(playerCount: number, questIndex: number): number {
  return playerCount >= 7 && questIndex === 3 ? 2 : 1;
}

export interface AvalonOptions {
  percival: boolean;
  morgana: boolean;
  mordred: boolean;
  oberon: boolean;
  ladyOfTheLake: boolean;
}

export const OPTIONAL_ROLES = ['percival', 'morgana', 'mordred', 'oberon'] as const;
export type OptionalRole = (typeof OPTIONAL_ROLES)[number];

/** 大厅推荐阵容，普通角色由对应阵营的剩余名额补齐。 */
export function recommendedOptions(playerCount: number): Pick<AvalonOptions, OptionalRole> {
  return {
    percival: true,
    morgana: true,
    mordred: playerCount >= 7,
    oberon: playerCount === 10,
  };
}

export function defaultOptions(): AvalonOptions {
  return { percival: false, morgana: false, mordred: false, oberon: false, ladyOfTheLake: false };
}

export function normalizeOptions(raw: unknown): AvalonOptions {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    percival: src.percival === true,
    morgana: src.morgana === true,
    mordred: src.mordred === true,
    oberon: src.oberon === true,
    ladyOfTheLake: src.ladyOfTheLake === true,
  };
}

export function validateOptions(options: AvalonOptions, playerCount: number): string | null {
  if (playerCount < MIN_PLAYERS) return `还差 ${MIN_PLAYERS - playerCount} 人才能开局（至少 ${MIN_PLAYERS} 人）`;
  if (playerCount > MAX_PLAYERS) return `最多 ${MAX_PLAYERS} 人`;
  const evil = EVIL_COUNT[playerCount]!;
  const evilSpecials = 1 + Number(options.morgana) + Number(options.mordred) + Number(options.oberon);
  if (evilSpecials > evil) {
    return `${playerCount} 人局只有 ${evil} 名邪恶方，刺客之外最多再选 ${evil - 1} 个邪恶角色`;
  }
  return null;
}

/** 按人数和选项组出角色牌堆（未洗牌）。梅林与刺客始终在场。 */
export function buildRoleDeck(playerCount: number, options: AvalonOptions): Role[] {
  const problem = validateOptions(options, playerCount);
  if (problem) throw new Error(problem);
  const evilCount = EVIL_COUNT[playerCount]!;
  const goodCount = playerCount - evilCount;

  const evil: Role[] = ['assassin'];
  if (options.morgana) evil.push('morgana');
  if (options.mordred) evil.push('mordred');
  if (options.oberon) evil.push('oberon');
  while (evil.length < evilCount) evil.push('minion');

  const good: Role[] = ['merlin'];
  if (options.percival) good.push('percival');
  while (good.length < goodCount) good.push('servant');

  return [...good, ...evil];
}
