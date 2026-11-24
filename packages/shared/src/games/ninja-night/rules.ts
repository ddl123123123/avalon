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
  keeper: { name: '镇阵师', skill: '固阵', mark: '阵', detail: '在所选阵眼为己方增加 2 点力量。' },
  pathfinder: { name: '引路使', skill: '连阵', mark: '路', detail: '所选阵眼和顺时针下一处各增加 1 点力量。' },
  mist: { name: '执烟人', skill: '蒙阵', mark: '烟', detail: '在所选阵眼增加 1 点己方力量，并减去 1 点对方力量。' },
  loner: { name: '夜游侠', skill: '独进', mark: '侠', detail: '在所选阵眼增加 1 点力量。没有队友选这里时，再加 1 点。' },
  stargazer: { name: '司天官', skill: '观星', mark: '星', detail: '在本夜焦点增加 3 点力量，在其他阵眼增加 1 点。' },
  seal: { name: '执印使', skill: '合印', mark: '印', detail: '在所选阵眼增加 1 点力量。有队友也选这里时，再加 1 点。' },
} as const;
export type Profession = keyof typeof professions;
export const professionIds = Object.keys(professions) as Profession[];

export function shadowCount(players: number) {
  return Math.floor(players / 2);
}
