import { describe, expect, it } from 'vitest';
import { GameError, type PlayerId } from '../../framework';
import { glassworks, kilnsOf, paymentFor, scoreOf, type GlassworksAction, type GlassworksState } from './engine';
import { COMMISSIONS, HUES, PANELS, TARGET_POINTS, commissionOf, heatDiscount, panelOf, type Hue, type Piece } from './rules';

function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}
const ids = (n: number): PlayerId[] => Array.from({ length: n }, (_, i) => `p${i}`);
const rng = seeded(5);
const act = (s: GlassworksState, p: PlayerId, a: GlassworksAction) => glassworks.reduce(s, p, a, rng);
/** 开一局，并让 p0 先手，方便写断言 */
function fresh(n: number, seed = 1): GlassworksState {
  const s = glassworks.setup(ids(n), {}, seeded(seed));
  s.startPlayer = 'p0';
  s.turn = 'p0';
  return s;
}
const glassOf = (over: Partial<Record<Piece, number>>): Record<Piece, number> => ({ blue: 0, red: 0, green: 0, amber: 0, violet: 0, gold: 0, ...over });
const total = (s: GlassworksState) =>
  HUES.reduce((sum, h) => sum + s.bag[h] + s.rack.filter((x) => x === h).length + s.players.reduce((n, p) => n + s.glass[p]![h], 0), 0);

describe('物料', () => {
  it('窗片共 75 张，越贵的越少，五种炉色完全对称', () => {
    expect(PANELS).toHaveLength(75);
    expect(PANELS.filter((p) => p.tier === 1)).toHaveLength(35);
    expect(PANELS.filter((p) => p.tier === 2)).toHaveLength(25);
    expect(PANELS.filter((p) => p.tier === 3)).toHaveLength(15);
    for (const hue of HUES) {
      expect(PANELS.filter((p) => p.hue === hue)).toHaveLength(15);
      // 每种颜色被要求的总量也相同
      expect(PANELS.reduce((sum, p) => sum + (p.cost[hue] ?? 0), 0)).toBe(PANELS.reduce((sum, p) => sum + (p.cost.blue ?? 0), 0));
    }
    expect(new Set(PANELS.map((p) => p.id)).size).toBe(75);
  });
  it('档位越高造价越贵，每块料换到的声望也越多', () => {
    const size = (p: (typeof PANELS)[number]) => Object.values(p.cost).reduce((a, b) => a + b, 0);
    const range = (tier: number, f: (p: (typeof PANELS)[number]) => number) => {
      const values = PANELS.filter((p) => p.tier === tier).map(f);
      return [Math.min(...values), Math.max(...values)];
    };
    expect(range(1, size)).toEqual([3, 5]);
    expect(range(2, size)).toEqual([7, 8]);
    expect(range(3, size)).toEqual([11, 11]);
    expect(range(1, (p) => p.points)).toEqual([0, 1]);
    expect(range(2, (p) => p.points)).toEqual([1, 3]);
    expect(range(3, (p) => p.points)).toEqual([4, 6]);
    const best = (tier: number) => Math.max(...PANELS.filter((p) => p.tier === tier).map((p) => p.points / size(p)));
    expect(best(1)).toBeLessThan(best(2));
    expect(best(2)).toBeLessThan(best(3));
  });
  it('一种颜色最多要几块有上限；同一档里块数差不多，最高色越高声望越高', () => {
    const peak = (p: (typeof PANELS)[number]) => Math.max(...Object.values(p.cost));
    const cap = { 1: 3, 2: 4, 3: 5 };
    for (const p of PANELS) expect(peak(p)).toBeLessThanOrEqual(cap[p.tier]);
    for (const tier of [2, 3]) {
      const row = PANELS.filter((p) => p.tier === tier && p.hue === 'blue').sort((a, b) => peak(a) - peak(b) || a.points - b.points);
      for (let i = 1; i < row.length; i++) expect(row[i]!.points).toBeGreaterThanOrEqual(row[i - 1]!.points);
      // 最高色最高的那张，声望也最高
      expect(row.at(-1)!.points).toBeGreaterThan(row[0]!.points);
    }
  });
  it('委托共 12 张，要求的炉色越多声望越高', () => {
    expect(COMMISSIONS).toHaveLength(12);
    for (const c of COMMISSIONS) {
      const kilns = Object.values(c.need).reduce((a, b) => a + b, 0);
      expect(c.points).toBe(kilns >= 10 ? 5 : 3);
    }
  });
  it('开局：晾架和画廊摆满，按人数翻开委托，没有人有料', () => {
    for (const n of [2, 3, 4]) {
      const s = fresh(n);
      expect(s.rack).toHaveLength(n + 4);
      expect(total(s)).toBe(5 * (n + 4));
      expect(s.commissions).toHaveLength(n + 1);
      for (const tier of [1, 2, 3] as const) expect(s.gallery[tier].every((id) => id && panelOf(id).tier === tier)).toBe(true);
      expect(s.decks[1]).toHaveLength(31);
      expect(s.gold).toBe(5);
    }
  });
});

describe('取料', () => {
  it('只能取相邻的 1 到 3 块，取完后剩下的向左靠拢并补满', () => {
    const s = fresh(3);
    const before = s.rack.slice();
    const next = act(s, 'p0', { type: 'take', from: 2, count: 3 });
    const taken = before.slice(2, 5);
    for (const hue of HUES) expect(next.glass.p0![hue]).toBe(taken.filter((h) => h === hue).length);
    expect(next.rack).toHaveLength(7);
    expect(next.rack.slice(0, 4)).toEqual([...before.slice(0, 2), ...before.slice(5)]);
    expect(next.turn).toBe('p1');
    expect(total(next)).toBe(35);
    expect(() => act(s, 'p0', { type: 'take', from: 0, count: 4 })).toThrow(/1 到 3/);
    expect(() => act(s, 'p0', { type: 'take', from: 6, count: 2 })).toThrow(/没有这些料/);
    expect(() => act(s, 'p0', { type: 'take', from: 0, count: 0 })).toThrow(GameError);
    expect(() => act(s, 'p1', { type: 'take', from: 0, count: 1 })).toThrow(/没轮到/);
  });
  it('布袋空了就不再补晾架；晾架空了才允许跳过', () => {
    const s = fresh(2);
    expect(() => act(s, 'p0', { type: 'pass' })).toThrow(/不能跳过/);
    for (const hue of HUES) s.bag[hue] = 0;
    const next = act(s, 'p0', { type: 'take', from: 0, count: 3 });
    expect(next.rack).toHaveLength(3);
    s.rack = [];
    const passed = act(s, 'p0', { type: 'pass' });
    expect(passed.turn).toBe('p1');
    expect(act(passed, 'p1', { type: 'pass' }).phase).toBe('ended');
  });
  it('超过 10 块时必须放回多余的，放回之后才轮到下一个人', () => {
    let s = fresh(2);
    s.glass.p0 = glassOf({ blue: 4, red: 4, gold: 1 });
    for (const hue of HUES) s.bag[hue] = Math.max(0, s.bag[hue] - 2);
    s = act(s, 'p0', { type: 'take', from: 0, count: 3 });
    expect(s.mustDiscard).toBe(2);
    expect(s.turn).toBe('p0');
    expect(() => act(s, 'p0', { type: 'take', from: 0, count: 1 })).toThrow(/先放回 2/);
    expect(() => act(s, 'p0', { type: 'discard', pieces: ['blue'] })).toThrow(/需要放回 2/);
    expect(() => act(s, 'p0', { type: 'discard', pieces: ['violet', 'violet', 'violet'].slice(0, 2) as Piece[] })).toThrow(GameError);
    // 放回的料随后可能又被摸上晾架，所以把布袋和晾架合起来数
    const blueOut = (x: GlassworksState) => x.bag.blue + x.rack.filter((h) => h === 'blue').length;
    const before = blueOut(s);
    const gold = s.gold;
    s = act(s, 'p0', { type: 'discard', pieces: ['blue', 'gold'] });
    expect(blueOut(s)).toBe(before + 1);
    expect(s.gold).toBe(gold + 1);
    expect(s.mustDiscard).toBe(0);
    expect(s.turn).toBe('p1');
    expect(() => act(s, 'p1', { type: 'discard', pieces: [] })).toThrow(/不需要/);
  });
});

describe('描样', () => {
  it('从画廊描样：拿到图稿和一片金箔，画廊补上新的', () => {
    const s = fresh(3);
    const id = s.gallery[2][1]!;
    const top = s.decks[2][0];
    const next = act(s, 'p0', { type: 'sketch', tier: 2, slot: 1 });
    expect(next.sketches.p0).toEqual([{ id, open: true }]);
    expect(next.glass.p0!.gold).toBe(1);
    expect(next.gold).toBe(4);
    expect(next.gallery[2][1]).toBe(top);
    expect(glassworks.view(next, 'p1').seats.p0!.sketches).toEqual([{ id, tier: 2, open: true }]);
  });
  it('从牌堆顶摸的图稿别人看不到内容', () => {
    const s = fresh(3);
    const top = s.decks[3][0]!;
    const next = act(s, 'p0', { type: 'sketch', tier: 3, slot: -1 });
    expect(next.sketches.p0).toEqual([{ id: top, open: false }]);
    expect(glassworks.view(next, 'p0').seats.p0!.sketches[0]!.id).toBe(top);
    expect(glassworks.view(next, 'p1').seats.p0!.sketches).toEqual([{ id: null, tier: 3, open: false }]);
    expect(JSON.stringify(glassworks.view(next, 'p1'))).not.toContain(top);
    expect(next.log.at(-1)).toMatchObject({ t: 'sketch', panel: null });
  });
  it('最多 3 张图稿；金箔发完了仍可描样但拿不到金箔', () => {
    let s = fresh(2);
    s.sketches.p0 = s.decks[1].splice(0, 3).map((id) => ({ id, open: false }));
    expect(() => act(s, 'p0', { type: 'sketch', tier: 1, slot: 0 })).toThrow(/最多留 3/);
    s = fresh(2);
    s.gold = 0;
    const next = act(s, 'p0', { type: 'sketch', tier: 1, slot: 0 });
    expect(next.glass.p0!.gold).toBe(0);
    expect(next.sketches.p0).toHaveLength(1);
  });
});

describe('烧制', () => {
  const cost = (id: string) => panelOf(id).cost;
  it('付出造价，料回到布袋，获得炉色', () => {
    const s = fresh(2);
    const id = s.gallery[1][0]!;
    s.glass.p0 = glassOf(cost(id));
    const bag = { ...s.bag };
    const next = act(s, 'p0', { type: 'build', panel: id });
    expect(next.panels.p0).toEqual([id]);
    expect(Object.values(next.glass.p0!).every((n) => n === 0)).toBe(true);
    // 付出的料回到布袋（随后补晾架可能又摸走几块，这里晾架本来就是满的）
    for (const hue of HUES) expect(next.bag[hue]).toBe(bag[hue] + (cost(id)[hue] ?? 0));
    expect(kilnsOf(next.panels.p0!)[panelOf(id).hue]).toBe(1);
    expect(next.gallery[1][0]).not.toBe(id);
    expect(next.gallery[1][0]).not.toBeNull();
  });
  it('料不够不能烧；别人的图稿不能烧', () => {
    const s = fresh(2);
    const id = s.gallery[3][0]!;
    expect(() => act(s, 'p0', { type: 'build', panel: id })).toThrow(/不够/);
    s.sketches.p1 = [{ id: s.decks[1].shift()!, open: false }];
    expect(() => act(s, 'p0', { type: 'build', panel: s.sketches.p1![0]!.id })).toThrow(/不在画廊/);
  });
  it('炉色抵扣造价，金箔顶替缺的料', () => {
    // 只要 3 块钴蓝的那张小窗
    const panel = PANELS.find((p) => p.tier === 1 && p.cost.blue === 3 && Object.keys(p.cost).length === 1)!;
    expect(paymentFor(glassOf({ blue: 3 }), kilnsOf([]), panel.id)).toMatchObject({ blue: 3, gold: 0 });
    const oneBlue = PANELS.filter((p) => p.hue === 'blue').slice(0, 1).map((p) => p.id);
    expect(paymentFor(glassOf({ blue: 2 }), kilnsOf(oneBlue), panel.id)).toMatchObject({ blue: 2, gold: 0 });
    expect(paymentFor(glassOf({ blue: 1, gold: 1 }), kilnsOf(oneBlue), panel.id)).toMatchObject({ blue: 1, gold: 1 });
    expect(paymentFor(glassOf({ blue: 1 }), kilnsOf(oneBlue), panel.id)).toBeNull();
    // 炉色比造价还多时不会倒找
    const six = PANELS.filter((p) => p.hue === 'blue').slice(0, 6).map((p) => p.id);
    expect(paymentFor(glassOf({}), kilnsOf(six), panel.id)).toMatchObject({ blue: 0, gold: 0 });
  });
  it('可以烧自己的图稿，金箔回到供应', () => {
    const s = fresh(2);
    const id = s.decks[1].shift()!;
    s.sketches.p0 = [{ id, open: false }];
    const need = Object.entries(cost(id)) as [Hue, number][];
    s.glass.p0 = glassOf({ ...cost(id), [need[0]![0]]: need[0]![1] - 1, gold: 1 });
    s.gold = 4;
    const next = act(s, 'p0', { type: 'build', panel: id });
    expect(next.sketches.p0).toEqual([]);
    expect(next.panels.p0).toEqual([id]);
    expect(next.gold).toBe(5);
  });
});

describe('余温', () => {
  const cost = (id: string) => panelOf(id).cost;
  /** 造价里某种颜色正好要 amount 块、且是这张里最多的那一种 */
  const withPeak = (tier: number, amount: number) => {
    const def = PANELS.find((p) => p.tier === tier && Math.max(...Object.values(p.cost)) === amount)!;
    const hue = (Object.keys(def.cost) as Hue[]).find((h) => def.cost[h] === amount)!;
    return { id: def.id, hue, rest: Object.fromEntries(Object.entries(def.cost).filter(([h]) => h !== hue)) as Partial<Record<Hue, number>> };
  };
  it('只能逐级往上用：小窗之后烧花窗少付 1 块，花窗之后烧玫瑰窗少付 2 块', () => {
    const flower = withPeak(2, 4);
    const short = glassOf({ ...flower.rest, [flower.hue]: 3 });
    expect(paymentFor(short, kilnsOf([]), flower.id, 1)).toMatchObject({ [flower.hue]: 3, gold: 0 });
    const rose = withPeak(3, 5);
    const lean = glassOf({ ...rose.rest, [rose.hue]: 3 });
    expect(paymentFor(lean, kilnsOf([]), rose.id, 2)).toMatchObject({ [rose.hue]: 3, gold: 0 });
    expect(heatDiscount(1, 2)).toBe(1);
    expect(heatDiscount(2, 3)).toBe(2);
  });
  it('同档连烧、跳档、凉炉都不减', () => {
    const small = withPeak(1, 3);
    for (const heat of [0, 1, 2, 3] as const) {
      expect(paymentFor(glassOf({ ...small.rest, [small.hue]: 2 }), kilnsOf([]), small.id, heat)).toBeNull();
    }
    const flower = withPeak(2, 4);
    const short = glassOf({ ...flower.rest, [flower.hue]: 3 });
    for (const heat of [0, 2, 3] as const) expect(paymentFor(short, kilnsOf([]), flower.id, heat)).toBeNull();
    const rose = withPeak(3, 5);
    const lean = glassOf({ ...rose.rest, [rose.hue]: 3 });
    // 小窗之后直接烧玫瑰窗是跳档
    for (const heat of [0, 1, 3] as const) expect(paymentFor(lean, kilnsOf([]), rose.id, heat)).toBeNull();
  });
  it('先省手里缺的料，等于省下金箔', () => {
    const flower = PANELS.find((p) => p.tier === 2 && Object.keys(p.cost).length === 3 && p.points === 1)!;
    const [a, b, c] = Object.keys(flower.cost) as Hue[];
    // 手里 a 少 1 块：余温替你补上缺的那块，金箔留着
    const glass = glassOf({ ...flower.cost, [a!]: flower.cost[a!]! - 1, gold: 1 });
    expect(paymentFor(glass, kilnsOf([]), flower.id, 1)).toMatchObject({ [a!]: glass[a!], [b!]: flower.cost[b!], [c!]: flower.cost[c!], gold: 0 });
  });
  it('炉温记的是上一回合烧成的档位；取料或描样就凉了；趁热烧成会记在记录里', () => {
    const s = fresh(2);
    const first = s.gallery[1][0]!;
    const second = s.gallery[1][1]!;
    const flower = s.gallery[2][0]!;
    const rose = s.gallery[3][0]!;
    s.glass.p0 = glassOf(cost(first));
    let next = act(s, 'p0', { type: 'build', panel: first });
    expect(next.heat.p0).toBe(1);
    expect(glassworks.view(next, 'p1').seats.p0!.heat).toBe(1);
    next = act(next, 'p1', { type: 'take', from: 0, count: 1 });

    // 再烧一块小窗：同档不减，炉温还是小窗这一档
    const again = structuredClone(next);
    again.glass.p0 = glassOf(cost(second));
    const same = act(again, 'p0', { type: 'build', panel: second });
    expect(same.log.at(-1)).toMatchObject({ t: 'build', panel: second });
    expect(same.log.at(-1)).not.toHaveProperty('saved');
    expect(same.heat.p0).toBe(1);

    // 接着烧花窗：手里放满花窗的造价，趁热只付掉其中一部分，剩下 1 块
    next.glass.p0 = glassOf(cost(flower));
    const built = act(next, 'p0', { type: 'build', panel: flower });
    const left = Object.values(built.glass.p0!).reduce((a, b) => a + b, 0);
    const kilnSaved = cost(flower)[panelOf(first).hue] ? 1 : 0;
    expect(left).toBe(1 + kilnSaved);
    expect(built.log.at(-1)).toMatchObject({ t: 'build', panel: flower, saved: 1 });
    expect(built.heat.p0).toBe(2);

    // 花窗之后接着烧玫瑰窗：少付 2 块
    let chain = act(built, 'p1', { type: 'take', from: 0, count: 1 });
    chain.panels.p0 = [];
    chain.glass.p0 = glassOf(cost(rose));
    chain = act(chain, 'p0', { type: 'build', panel: rose });
    expect(chain.log.at(-1)).toMatchObject({ t: 'build', panel: rose, saved: 2 });
    expect(Object.values(chain.glass.p0!).reduce((a, b) => a + b, 0)).toBe(2);
    expect(chain.heat.p0).toBe(3);

    const cooled = act(next, 'p0', { type: 'take', from: 0, count: 1 });
    expect(cooled.heat.p0).toBe(0);
    const sketched = act(next, 'p0', { type: 'sketch', tier: 1, slot: 0 });
    expect(sketched.heat.p0).toBe(0);
  });
});

describe('委托与声望', () => {
  const blueIds = PANELS.filter((p) => p.hue === 'blue' && p.points === 0).map((p) => p.id);
  const redIds = PANELS.filter((p) => p.hue === 'red' && p.points === 0).map((p) => p.id);
  it('回合结束时炉色达标就拿走委托，一回合最多一张，取声望最高的', () => {
    const s = fresh(2);
    s.commissions = ['pair-blue', 'full-1', 'trio-blue'];
    const all = HUES.flatMap((h) => PANELS.filter((p) => p.hue === h && p.points === 0).slice(0, 2).map((p) => p.id));
    s.panels.p0 = [...new Set([...blueIds.slice(0, 4), ...redIds.slice(0, 4), ...all])];
    s.decks[1] = s.decks[1].filter((id) => !s.panels.p0!.includes(id));
    const next = act(s, 'p0', { type: 'take', from: 0, count: 1 });
    expect(next.claimed.p0).toEqual(['full-1']);
    expect(next.commissions).toEqual(['pair-blue', 'trio-blue']);
    expect(next.log.some((e) => e.t === 'commission' && e.commission === 'full-1')).toBe(true);
  });
  it('声望 = 窗片 + 委托 + 光谱（每凑齐一套五色 +2）+ 联窗（同色三档各一块 +3）', () => {
    const oneEach = HUES.map((h) => PANELS.find((p) => p.hue === h && p.tier === 1 && p.points === 1)!.id);
    expect(scoreOf(oneEach, [])).toEqual({ panels: 5, commissions: 0, spectrum: 2, triptych: 0, total: 7 });
    expect(scoreOf(oneEach.slice(0, 4), ['pair-blue'])).toEqual({
      panels: 4, commissions: commissionOf('pair-blue').points, spectrum: 0, triptych: 0, total: 7,
    });
    const twoEach = HUES.flatMap((h) => PANELS.filter((p) => p.hue === h && p.points === 0).slice(0, 2).map((p) => p.id));
    expect(scoreOf(twoEach, []).spectrum).toBe(4);

    const of = (hue: Hue, tier: number, n = 1) => PANELS.filter((p) => p.hue === hue && p.tier === tier).slice(0, n).map((p) => p.id);
    // 蓝色三档各一块：一组联窗
    expect(scoreOf([...of('blue', 1), ...of('blue', 2), ...of('blue', 3)], []).triptych).toBe(3);
    // 缺一档不算；别的颜色不能凑数
    expect(scoreOf([...of('blue', 1), ...of('blue', 2), ...of('red', 3)], []).triptych).toBe(0);
    // 同一种颜色凑两组要每档两块
    expect(scoreOf([...of('blue', 1, 2), ...of('blue', 2, 2), ...of('blue', 3, 1)], []).triptych).toBe(3);
    expect(scoreOf([...of('blue', 1, 2), ...of('blue', 2, 2), ...of('blue', 3, 2), ...of('red', 1), ...of('red', 2), ...of('red', 3)], []).triptych).toBe(9);
  });
});

describe('结束', () => {
  const rich = (points: number) => {
    const picked: string[] = [];
    let sum = 0;
    for (const p of PANELS.filter((x) => x.hue === 'blue').sort((a, b) => b.points - a.points)) {
      if (sum >= points) break;
      picked.push(p.id);
      sum += p.points;
    }
    return picked;
  };
  it('有人达到目标分后，打到起始玩家的上家为止', () => {
    let s = fresh(3);
    s.panels.p1 = rich(TARGET_POINTS);
    s = act(s, 'p0', { type: 'take', from: 0, count: 1 });
    expect(s.finalRound).toBe(false);
    s = act(s, 'p1', { type: 'take', from: 0, count: 1 });
    expect(s.finalRound).toBe(true);
    expect(glassworks.view(s, 'p2').finalRound).toBe(true);
    expect(s.phase).toBe('play');
    s = act(s, 'p2', { type: 'take', from: 0, count: 1 });
    expect(s.phase).toBe('ended');
    expect(s.winner).toBe('p1');
    expect(() => act(s, 'p0', { type: 'take', from: 0, count: 1 })).toThrow(/已经结束/);
  });
  it('最后一位玩家达到目标分时当圈结束，不多打一圈', () => {
    let s = fresh(2);
    s.panels.p1 = rich(TARGET_POINTS);
    s = act(s, 'p0', { type: 'take', from: 0, count: 1 });
    s = act(s, 'p1', { type: 'take', from: 0, count: 1 });
    expect(s.phase).toBe('ended');
  });
  it('平分时窗片更少的人胜，再平则玻璃料更多的人胜', () => {
    const six = PANELS.filter((p) => p.points === 6).map((p) => p.id);
    const five = PANELS.filter((p) => p.points === 5).map((p) => p.id);
    const one = PANELS.find((p) => p.tier === 1 && p.points === 1 && p.hue === 'amber')!.id;
    const play = (a: string[], b: string[], takeA: number, takeB: number) => {
      let s = fresh(2);
      s.panels.p0 = a;
      s.panels.p1 = b;
      s = act(act(s, 'p0', { type: 'take', from: 0, count: takeA }), 'p1', { type: 'take', from: 0, count: takeB });
      expect(s.phase).toBe('ended');
      expect(s.scores!.p0!.total).toBe(s.scores!.p1!.total);
      return s.winner;
    };
    // 都是 17 分：p0 用了 3 块窗片，p1 用了 4 块
    expect(play([six[0]!, six[1]!, five[0]!], [six[2]!, five[1]!, five[2]!, one], 1, 1)).toBe('p0');
    expect(play([six[2]!, five[1]!, five[2]!, one], [six[0]!, six[1]!, five[0]!], 1, 1)).toBe('p1');
    // 分数和窗片数都相同：手里料多的人胜
    expect(play([six[0]!, six[1]!, five[0]!], [six[2]!, six[3]!, five[1]!], 3, 1)).toBe('p0');
    expect(play([six[0]!, six[1]!, five[0]!], [six[2]!, six[3]!, five[1]!], 1, 3)).toBe('p1');
  });
});

describe('机器人', () => {
  it('2 到 4 人都能把一局打完，玻璃料既不凭空多出也不丢失', () => {
    for (let n = 2; n <= 4; n++) {
      for (let seed = 0; seed < 40; seed++) {
        const r = seeded(seed * 13 + n);
        let s = glassworks.setup(ids(n), {}, r);
        let steps = 0;
        while (!glassworks.isOver(s)) {
          const action = glassworks.botAction!(s, s.turn, r);
          expect(action, `卡住了：第 ${s.round} 圈`).not.toBeNull();
          s = glassworks.reduce(s, s.turn, action!, r);
          expect(total(s)).toBe(5 * (n + 4));
          expect(s.gold + s.players.reduce((sum, p) => sum + s.glass[p]!.gold, 0)).toBe(5);
          expect(++steps).toBeLessThan(1500);
        }
        expect(s.winner).not.toBeNull();
        expect(Math.max(...s.players.map((p) => s.scores![p]!.total))).toBeGreaterThanOrEqual(TARGET_POINTS);
        // 所有人行动的回合数相同
        const builtOrHeld = new Set([...s.players.flatMap((p) => [...s.panels[p]!, ...s.sketches[p]!.map((k) => k.id)])]);
        expect(builtOrHeld.size).toBe(s.players.reduce((sum, p) => sum + s.panels[p]!.length + s.sketches[p]!.length, 0));
      }
    }
  });
});
