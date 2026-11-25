export const ROUND_LIMIT = 10;
export const ENFORCEMENT_LIMIT = 5;
export const MEAL_TARGET = 2;

export type Mode = 'standard' | 'split' | 'duel-a' | 'duel-b';
export type DuelMode = Extract<Mode, 'duel-a' | 'duel-b'>;
export type StallId = 'a' | 'b';
export const stallIds = ['a', 'b'] as const;
export const stallNames = { a: '① 小摊', b: '② 小摊' } as const;
export const roles = {
  customer: '顾客',
  officer: '城管',
  vendor: '摊主（两个摊）',
  westVendor: '① 号摊主',
  eastVendor: '② 号摊主',
  officerVendor: '城管和两个小摊',
  customerVendor: '顾客和两个小摊',
} as const;
export type Role = keyof typeof roles;
export const modes: Record<Mode, { name: string; seats: readonly Role[] }> = {
  standard: { name: '3 人标准局', seats: ['customer', 'officer', 'vendor'] },
  split: { name: '4 人欢乐局', seats: ['customer', 'officer', 'westVendor', 'eastVendor'] },
  'duel-a': { name: '2 人 A · 顾客对双控', seats: ['customer', 'officerVendor'] },
  'duel-b': { name: '2 人 B · 城管对双控', seats: ['officer', 'customerVendor'] },
};

export function modeFor(count: number, duel: DuelMode): Mode {
  return count === 2 ? duel : count === 4 ? 'split' : 'standard';
}

export type Cell = { id: string; x: number; y: number; label: string };
export const street: readonly Cell[] = [
  ...Array.from({ length: 13 }, (_, y) => ({ id: `m${y}`, x: 4, y, label: `主街 ${y + 1}` })),
  ...Array.from({ length: 4 }, (_, i) => ({ id: `a${i + 1}`, x: 3 - i, y: 4, label: `西巷 ${i + 1}` })),
  ...Array.from({ length: 4 }, (_, i) => ({ id: `b${i + 1}`, x: 5 + i, y: 8, label: `东巷 ${i + 1}` })),
];
const byId = new Map(street.map((cell) => [cell.id, cell]));

export const startCells = { customer: 'm0', officer: 'm6', a: 'a2', b: 'b2' };

export function cellName(id: string) {
  return byId.get(id)?.label ?? id;
}

/** 相邻铺路格可达；顾客所在格可作终点，不能作为城管行进的中转格。 */
export function reachable(from: string, steps: number, stopAt?: string) {
  const start = byId.get(from);
  if (!start) return [];
  const seen = new Set([from]);
  const queue = [{ cell: start, steps: 0 }];
  const moves: { to: string; steps: number }[] = [];
  for (let i = 0; i < queue.length; i++) {
    const here = queue[i];
    if (here.steps === steps || (here.steps > 0 && here.cell.id === stopAt)) continue;
    for (const cell of street) {
      if (seen.has(cell.id) || Math.abs(cell.x - here.cell.x) + Math.abs(cell.y - here.cell.y) !== 1) continue;
      seen.add(cell.id);
      queue.push({ cell, steps: here.steps + 1 });
      moves.push({ to: cell.id, steps: here.steps + 1 });
    }
  }
  return moves;
}
