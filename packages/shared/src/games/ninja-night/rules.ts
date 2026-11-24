export type Faction = 'guard' | 'shadow';
export const NIGHT_LIMIT = 5;
export const TARGET_SCORE = 9;

export const sites = {
  gate: { name: '山门', mark: '門' },
  court: { name: '枫庭', mark: '楓' },
  tower: { name: '钟楼', mark: '鐘' },
} as const;
export type Site = keyof typeof sites;
export const siteOrder = ['gate', 'court', 'tower'] as const;

export const professions = {
  keeper: { name: '守阵人', mark: '陣', detail: '在所选阵眼为己方增加 2 点力量。' },
  pathfinder: { name: '探径人', mark: '路', detail: '所选阵眼和顺时针下一处各增加 1 点力量。' },
  mist: { name: '扰阵师', mark: '霧', detail: '在所选阵眼增加 1 点己方力量，并减去 1 点对方力量。' },
  loner: { name: '独行客', mark: '獨', detail: '在所选阵眼增加 1 点力量。没有队友选这里时，再加 1 点。' },
  stargazer: { name: '星图师', mark: '星', detail: '在本夜焦点增加 3 点力量，在其他阵眼增加 1 点。' },
  seal: { name: '合印人', mark: '印', detail: '在所选阵眼增加 1 点力量。有队友也选这里时，再加 1 点。' },
} as const;
export type Profession = keyof typeof professions;
export const professionIds = Object.keys(professions) as Profession[];

export function shadowCount(players: number) {
  return Math.floor(players / 2);
}
