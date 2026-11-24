export type Faction = 'guard' | 'shadow';
export const NIGHT_LIMIT = 5;
export const REQUIRED_MERIT = 2;
export const QUEEN_CHANCE = 1 / 4;
export const ranks = [1, 2, 3, 4, 5] as const;
export type Rank = typeof ranks[number];
export const factionNames = { guard: '忠臣', shadow: '反贼' } as const;

export const sites = {
  gate: { name: '宫门', mark: '门' },
  court: { name: '御花园', mark: '苑' },
  tower: { name: '望楼', mark: '楼' },
} as const;
export type Site = keyof typeof sites;
export const siteOrder = ['gate', 'court', 'tower'] as const;

export const professions = {
  spy: { name: '探子', skill: '查身份', mark: '探', detail: '私下得知同处一名随机玩家的阵营。' },
  clerk: { name: '文书', skill: '翻档案', mark: '卷', detail: '私下得知同处一名随机玩家的位阶和本夜职业。' },
  mystic: { name: '术士', skill: '出奇招', mark: '奇', detail: '随机生效一招：本处加 1 力量、顺时针下一处加 1 力量，或使本处对方减 1 力量。' },
  nightwalker: { name: '夜行客', skill: '封行动', mark: '夜', detail: '同处的对方最高位阶者本夜无法领取功牌。' },
  inspector: { name: '监察使', skill: '先查后封', mark: '察', detail: '私下查同处一名随机玩家的阵营；若为对方，封住其本夜领取功牌的机会。' },
} as const;
export type Profession = keyof typeof professions;
export const professionIds = Object.keys(professions) as Profession[];

export function shadowCount(players: number) {
  return Math.floor(players / 2);
}
