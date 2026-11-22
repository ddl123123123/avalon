import { describe, expect, it } from 'vitest';
import { GameError, type PlayerId } from '../../framework';
import { citadels, scoreCity, type CitadelsAction, type CitadelsState } from './engine';
import { CHARACTERS, DISTRICTS, buildDistrictDeck, districtOf, draftDiscards, type CharacterId } from './rules';

function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}
const ids = (n: number): PlayerId[] => Array.from({ length: n }, (_, i) => `p${i}`);
const rng = seeded(99);
const act = (s: CitadelsState, p: PlayerId, a: CitadelsAction) => citadels.reduce(s, p, a, rng);
const fresh = (n: number, seed = 1) => citadels.setup(ids(n), {}, seeded(seed));
const clone = (s: CitadelsState): CitadelsState => structuredClone(s);

/** 跳过随机的移牌，让每个人拿到指定的角色（按选角顺序依次选），然后进入叫号 */
function deal(state: CitadelsState, roles: Record<PlayerId, CharacterId | CharacterId[]>): CitadelsState {
  let s = clone(state);
  const wanted = Object.values(roles).flat();
  const rest = CHARACTERS.map((c) => c.id).filter((c) => !wanted.includes(c));
  s.draft!.faceUp = [];
  s.draft!.faceDown = [rest[0]!];
  s.draft!.pool = [...wanted, ...rest.slice(1)];
  const queue = Object.fromEntries(Object.entries(roles).map(([p, r]) => [p, [r].flat()]));
  while (s.phase === 'draft') {
    const step = s.draft!.steps[s.draft!.index]!;
    if (step.kind === 'pick') s = act(s, step.player, { type: 'pick', character: queue[step.player]!.shift()! });
    else s = act(s, step.player, { type: 'discard', character: s.draft!.pool.find((c) => !wanted.includes(c))! });
  }
  return s;
}
/** 给玩家指定的手牌 / 城区 / 金币 */
function give(state: CitadelsState, p: PlayerId, what: { hand?: string[]; city?: string[]; gold?: number }): CitadelsState {
  const s = clone(state);
  const taken = [...(what.hand ?? []), ...(what.city ?? [])];
  s.deck = s.deck.filter((c) => !taken.includes(c));
  for (const q of s.players) {
    if (q !== p) {
      s.hands[q] = s.hands[q]!.filter((c) => !taken.includes(c));
      s.cities[q] = s.cities[q]!.filter((c) => !taken.includes(c));
    }
  }
  if (what.hand) s.hands[p] = what.hand.slice();
  if (what.city) {
    s.cities[p] = what.city.slice();
    for (const c of what.city) s.builtRound[c] = 0;
  }
  if (what.gold !== undefined) s.gold[p] = what.gold;
  return s;
}
const pass = (s: CitadelsState) => {
  const p = s.turn!.player;
  if (!s.turn!.actionTaken) s = act(s, p, { type: 'take_gold' });
  return act(s, p, { type: 'end_turn' });
};
const four = { p0: 'assassin', p1: 'thief', p2: 'king', p3: 'warlord' } as const;

describe('牌堆与开局', () => {
  it('城区牌共 66 张，各色数量符合规则书', () => {
    const deck = buildDistrictDeck();
    expect(deck).toHaveLength(66);
    const count = (type: string) => deck.filter((c) => districtOf(c).type === type).length;
    expect([count('noble'), count('religious'), count('trade'), count('military'), count('special')]).toEqual([12, 11, 20, 11, 12]);
    expect(new Set(deck).size).toBe(66);
    expect(DISTRICTS.find((d) => d.id === 'keep')!.count).toBe(2);
  });
  it('每人 4 张手牌、2 枚金币', () => {
    const s = fresh(5);
    for (const p of s.players) {
      expect(s.hands[p]).toHaveLength(4);
      expect(s.gold[p]).toBe(2);
    }
    expect(s.deck).toHaveLength(66 - 20);
  });
});

describe('选角', () => {
  it('各人数移出的角色牌数量正确，国王不会被明着移出', () => {
    expect([4, 5, 6, 7, 2, 3].map((n) => draftDiscards(n))).toEqual([
      { faceDown: 1, faceUp: 2 },
      { faceDown: 1, faceUp: 1 },
      { faceDown: 1, faceUp: 0 },
      { faceDown: 1, faceUp: 0 },
      { faceDown: 1, faceUp: 0 },
      { faceDown: 1, faceUp: 0 },
    ]);
    for (let seed = 0; seed < 200; seed++) {
      const d = fresh(4, seed).draft!;
      expect(d.faceUp).toHaveLength(2);
      expect(d.faceUp).not.toContain('king');
      expect(d.pool).toHaveLength(5);
    }
  });
  it('从持王冠的人开始顺时针选，别人看不到传递中的牌', () => {
    const s = fresh(5, 3);
    const order = s.draft!.steps.map((x) => x.player);
    const start = s.players.indexOf(s.crown);
    expect(order).toEqual(s.players.map((_, i) => s.players[(start + i) % 5]));
    const picker = order[0]!;
    const other = order[1]!;
    expect(citadels.view(s, picker).draft!.pool).toEqual(s.draft!.pool);
    expect(citadels.view(s, other).draft!.pool).toBeNull();
    expect(() => act(s, other, { type: 'pick', character: s.draft!.pool[0]! })).toThrow(/没轮到/);
    const after = act(s, picker, { type: 'pick', character: s.draft!.pool[0]! });
    expect(citadels.view(after, other).seats[picker]!.hidden).toBe(1);
    expect(JSON.stringify(citadels.view(after, other))).not.toContain(`"characters":["${s.draft!.pool[0]}"]`);
  });
  it('两人局：各拿两个角色，中间各盖弃一张', () => {
    let s = fresh(2, 4);
    expect(s.draft!.steps.map((x) => x.kind)).toEqual(['pick', 'pick', 'discard', 'pick', 'discard', 'pick']);
    expect(s.draft!.pool).toHaveLength(7);
    while (s.phase === 'draft') {
      const step = s.draft!.steps[s.draft!.index]!;
      s = act(s, step.player, { type: step.kind, character: s.draft!.pool[0]! });
    }
    for (const p of s.players) expect(s.characters[p]).toHaveLength(2);
    expect(s.draft!.faceDown).toHaveLength(4);
  });
  it('三人局转两圈，最后一张盖弃', () => {
    let s = fresh(3, 5);
    expect(s.draft!.steps).toHaveLength(6);
    while (s.phase === 'draft') s = act(s, s.draft!.steps[s.draft!.index]!.player, { type: 'pick', character: s.draft!.pool[0]! });
    for (const p of s.players) expect(s.characters[p]).toHaveLength(2);
    expect(s.draft!.faceDown).toHaveLength(2);
  });
  it('七人局：最后一人在剩下的一张和最初盖着的那张里选', () => {
    let s = fresh(7, 6);
    const hidden = s.draft!.faceDown[0]!;
    for (let i = 0; i < 6; i++) s = act(s, s.draft!.steps[i]!.player, { type: 'pick', character: s.draft!.pool[0]! });
    expect(s.draft!.pool).toHaveLength(2);
    expect(s.draft!.pool).toContain(hidden);
    s = act(s, s.draft!.steps[6]!.player, { type: 'pick', character: hidden });
    expect(s.phase).toBe('turns');
    expect(s.draft!.faceDown).toHaveLength(1);
  });
});

describe('回合', () => {
  it('按号码叫角色；必须先行动才能建造和结束回合', () => {
    let s = deal(fresh(4), four);
    expect(s.turn).toMatchObject({ player: 'p0', character: 'assassin' });
    s = give(s, 'p0', { hand: ['tavern-1'], gold: 5 });
    expect(() => act(s, 'p0', { type: 'build', card: 'tavern-1' })).toThrow(/先拿金币或抽牌/);
    expect(() => act(s, 'p0', { type: 'end_turn' })).toThrow(GameError);
    expect(() => act(s, 'p1', { type: 'take_gold' })).toThrow(/没轮到/);
    s = act(s, 'p0', { type: 'take_gold' });
    expect(s.gold.p0).toBe(7);
    expect(() => act(s, 'p0', { type: 'draw' })).toThrow(/已经执行过/);
    s = act(s, 'p0', { type: 'build', card: 'tavern-1' });
    expect(s.cities.p0).toEqual(['tavern-1']);
    expect(s.gold.p0).toBe(6);
    s = act(s, 'p0', { type: 'end_turn' });
    expect(s.turn).toMatchObject({ player: 'p1', character: 'thief' });
  });
  it('抽两张留一张，另一张放回牌堆底', () => {
    let s = deal(fresh(4), four);
    const [a, b] = s.deck;
    s = act(s, 'p0', { type: 'draw' });
    expect(s.turn!.drawn).toEqual([a, b]);
    expect(citadels.view(s, 'p1').turn!.drawn).toBeNull();
    expect(citadels.view(s, 'p1').turn!.drawnCount).toBe(2);
    expect(() => act(s, 'p0', { type: 'end_turn' })).toThrow(GameError);
    s = act(s, 'p0', { type: 'keep', cards: [b!] });
    expect(s.hands.p0).toContain(b);
    expect(s.deck.at(-1)).toBe(a);
  });
  it('一回合只能建一座，城里不能有同名城区', () => {
    let s = deal(fresh(4), four);
    s = give(s, 'p0', { hand: ['tavern-1', 'tavern-2', 'temple-1'], gold: 9 });
    s = act(s, 'p0', { type: 'take_gold' });
    s = act(s, 'p0', { type: 'build', card: 'tavern-1' });
    expect(() => act(s, 'p0', { type: 'build', card: 'temple-1' })).toThrow(/最多建造 1/);
    const next = give(clone(s), 'p0', {});
    next.turn!.builds = 0;
    expect(() => act(next, 'p0', { type: 'build', card: 'tavern-2' })).toThrow(/已经有/);
    const poor = give(deal(fresh(4), four), 'p0', { hand: ['palace-1'], gold: 0 });
    expect(() => act(act(poor, 'p0', { type: 'take_gold' }), 'p0', { type: 'build', card: 'palace-1' })).toThrow(/金币不够/);
  });
});

describe('角色', () => {
  it('刺客：被刺杀的角色不出声、不行动，轮末才揭晓', () => {
    let s = deal(fresh(4), four);
    expect(() => act(s, 'p0', { type: 'murder', character: 'assassin' })).toThrow(GameError);
    s = act(s, 'p0', { type: 'murder', character: 'king' });
    expect(() => act(s, 'p0', { type: 'murder', character: 'thief' })).toThrow(/已经用过/);
    s = pass(s);
    s = pass(s);
    expect(s.turn).toMatchObject({ player: 'p3', character: 'warlord' });
    expect(s.revealed).not.toContain('king');
    expect(citadels.view(s, 'p0').seats.p2!.hidden).toBe(1);
    const kingCall = s.log.find((e) => e.t === 'call' && e.character === 'king');
    expect(kingCall).toMatchObject({ player: null });
  });
  it('被刺杀的国王在轮末继承王冠', () => {
    let s = deal(fresh(4), four);
    s.crown = 'p0';
    s = act(s, 'p0', { type: 'murder', character: 'king' });
    s = pass(pass(pass(s)));
    expect(s.round).toBe(2);
    expect(s.crown).toBe('p2');
    expect(s.log.some((e) => e.t === 'murdered' && e.player === 'p2')).toBe(true);
    expect(s.draft!.steps[0]!.player).toBe('p2');
  });
  it('国王被叫到时立刻拿走王冠；没人当国王时王冠不动', () => {
    let s = deal(fresh(4), four);
    s.crown = 'p0';
    s = pass(pass(s));
    expect(s.turn!.character).toBe('king');
    expect(s.crown).toBe('p2');
    let t = deal(fresh(4), { p0: 'assassin', p1: 'thief', p2: 'bishop', p3: 'warlord' });
    const crown = t.crown;
    t = pass(pass(pass(pass(t))));
    expect(t.crown).toBe(crown);
  });
  it('盗贼：轮到目标时拿走他全部金币；不能偷刺客和被刺杀的人', () => {
    let s = deal(fresh(4), four);
    s = act(s, 'p0', { type: 'murder', character: 'warlord' });
    s = pass(s);
    expect(() => act(s, 'p1', { type: 'rob', character: 'assassin' })).toThrow(GameError);
    expect(() => act(s, 'p1', { type: 'rob', character: 'warlord' })).toThrow(/被刺杀/);
    s = give(s, 'p2', { gold: 6 });
    s = act(s, 'p1', { type: 'rob', character: 'king' });
    const thiefGold = s.gold.p1!;
    expect(s.gold.p2).toBe(6);
    s = pass(s);
    expect(s.turn!.player).toBe('p2');
    expect(s.gold.p2).toBe(0);
    expect(s.gold.p1).toBe(thiefGold + 2 + 6);
  });
  it('魔术师：与人交换全部手牌，或弃牌重抽', () => {
    let s = deal(fresh(4), { p0: 'magician', p1: 'king', p2: 'bishop', p3: 'warlord' });
    s = give(s, 'p0', { hand: [] });
    const theirs = s.hands.p1!.slice();
    const swapped = act(s, 'p0', { type: 'swap_hand', target: 'p1' });
    expect(swapped.hands.p0).toEqual(theirs);
    expect(swapped.hands.p1).toEqual([]);
    expect(() => act(swapped, 'p0', { type: 'redraw', cards: theirs.slice(0, 1) })).toThrow(/已经用过/);

    s = give(s, 'p0', { hand: ['tavern-1', 'manor-1', 'temple-1'] });
    const top = s.deck.slice(0, 2);
    const redrawn = act(s, 'p0', { type: 'redraw', cards: ['tavern-1', 'manor-1'] });
    expect(redrawn.hands.p0).toEqual(['temple-1', ...top]);
    expect(redrawn.deck.slice(-2)).toEqual(['tavern-1', 'manor-1']);
  });
  it('城区收入：每回合一次，按当前城区计算；忘了收会在结束回合时补上', () => {
    let s = deal(fresh(4), four);
    s = give(pass(pass(s)), 'p2', { city: ['manor-1', 'castle-1', 'tavern-1'], gold: 0 });
    const taken = act(s, 'p2', { type: 'income' });
    expect(taken.gold.p2).toBe(2);
    expect(() => act(taken, 'p2', { type: 'income' })).toThrow(/已经收过/);
    const lazy = act(act(s, 'p2', { type: 'take_gold' }), 'p2', { type: 'end_turn' });
    expect(lazy.gold.p2).toBe(4);
    const assassin = deal(fresh(4), four);
    expect(() => act(assassin, 'p0', { type: 'income' })).toThrow(/没有城区收入/);
  });
  it('商人行动后多得 1 枚金币；建筑师多抽 2 张并可建 3 座', () => {
    let s = deal(fresh(4), { p0: 'merchant', p1: 'architect', p2: 'king', p3: 'warlord' });
    s = pass(s); // 国王
    expect(s.turn!.character).toBe('merchant');
    const before = s.gold.p0!;
    s = act(s, 'p0', { type: 'take_gold' });
    expect(s.gold.p0).toBe(before + 3);
    s = act(s, 'p0', { type: 'end_turn' });
    expect(s.turn!.character).toBe('architect');
    s = give(s, 'p1', { hand: ['tavern-1', 'temple-1', 'watchtower-1', 'market-1'], gold: 10 });
    s = act(s, 'p1', { type: 'take_gold' });
    expect(s.hands.p1).toHaveLength(6);
    for (const card of ['tavern-1', 'temple-1', 'watchtower-1']) s = act(s, 'p1', { type: 'build', card });
    expect(() => act(s, 'p1', { type: 'build', card: 'market-1' })).toThrow(/最多建造 3/);
  });
});

describe('军阀', () => {
  const toWarlord = (roles: Record<PlayerId, CharacterId> = { p0: 'assassin', p1: 'bishop', p2: 'king', p3: 'warlord' }) => {
    let s = deal(fresh(4), roles);
    while (s.turn!.character !== 'warlord') s = pass(s);
    return act(s, 'p3', { type: 'take_gold' });
  };
  it('花费为造价减 1，造价 1 的城区免费', () => {
    let s = give(toWarlord(), 'p2', { city: ['palace-1', 'tavern-1'] });
    s = give(s, 'p3', { gold: 4 });
    const cheap = act(s, 'p3', { type: 'destroy', target: 'p2', card: 'tavern-1' });
    expect(cheap.gold.p3).toBe(4);
    expect(cheap.cities.p2).toEqual(['palace-1']);
    expect(cheap.deck.at(-1)).toBe('tavern-1');
    const dear = act(s, 'p3', { type: 'destroy', target: 'p2', card: 'palace-1' });
    expect(dear.gold.p3).toBe(0);
    expect(() => act(give(s, 'p3', { gold: 3 }), 'p3', { type: 'destroy', target: 'p2', card: 'palace-1' })).toThrow(/金币不够/);
    expect(() => act(cheap, 'p3', { type: 'destroy', target: 'p2', card: 'palace-1' })).toThrow(/已经用过/);
  });
  it('主教的城区受庇护，被刺杀的主教不受庇护', () => {
    const s = give(give(toWarlord(), 'p1', { city: ['temple-1'] }), 'p3', { gold: 5 });
    expect(() => act(s, 'p3', { type: 'destroy', target: 'p1', card: 'temple-1' })).toThrow(/主教/);
    let m = deal(fresh(4), { p0: 'assassin', p1: 'bishop', p2: 'king', p3: 'warlord' });
    m = act(m, 'p0', { type: 'murder', character: 'bishop' });
    while (m.turn!.character !== 'warlord') m = pass(m);
    m = give(act(m, 'p3', { type: 'take_gold' }), 'p1', { city: ['temple-1'] });
    expect(act(m, 'p3', { type: 'destroy', target: 'p1', card: 'temple-1' }).cities.p1).toEqual([]);
  });
  it('要塞、已建成的城市动不了；长城让其他城区贵 1，对自己无效', () => {
    let s = give(toWarlord(), 'p3', { gold: 9 });
    s = give(s, 'p2', { city: ['keep-1', 'great_wall-1', 'manor-1'] });
    expect(() => act(s, 'p3', { type: 'destroy', target: 'p2', card: 'keep-1' })).toThrow(/要塞/);
    expect(act(s, 'p3', { type: 'destroy', target: 'p2', card: 'manor-1' }).gold.p3).toBe(9 - 3);
    expect(act(s, 'p3', { type: 'destroy', target: 'p2', card: 'great_wall-1' }).gold.p3).toBe(9 - 5);
    const full = give(s, 'p0', { city: ['tavern-1', 'temple-1', 'manor-1', 'castle-1', 'market-1', 'docks-1', 'prison-1', 'church-1'] });
    expect(() => act(full, 'p3', { type: 'destroy', target: 'p0', card: 'tavern-1' })).toThrow(/建成/);
    const own = give(s, 'p3', { city: ['watchtower-1'], gold: 0 });
    expect(act(own, 'p3', { type: 'destroy', target: 'p3', card: 'watchtower-1' }).cities.p3).toEqual([]);
  });
  it('墓地：主人可以花 1 金币收回被摧毁的城区，但救不了墓地自己，军阀自己也不能用', () => {
    let s = give(toWarlord(), 'p3', { gold: 9 });
    s = give(s, 'p0', { city: ['graveyard-1'], gold: 1, hand: [] });
    s = give(s, 'p2', { city: ['manor-1'] });
    let hit = act(s, 'p3', { type: 'destroy', target: 'p2', card: 'manor-1' });
    expect(hit.pendingGraveyard).toEqual({ owner: 'p0', card: 'manor-1' });
    expect(() => act(hit, 'p3', { type: 'end_turn' })).toThrow(/墓地/);
    const taken = act(hit, 'p0', { type: 'graveyard', take: true });
    expect(taken.hands.p0).toEqual(['manor-1']);
    expect(taken.gold.p0).toBe(0);
    const declined = act(hit, 'p0', { type: 'graveyard', take: false });
    expect(declined.deck.at(-1)).toBe('manor-1');
    expect(declined.pendingGraveyard).toBeNull();

    hit = act(s, 'p3', { type: 'destroy', target: 'p0', card: 'graveyard-1' });
    expect(hit.pendingGraveyard).toBeNull();
    const mine = give(give(toWarlord(), 'p3', { city: ['graveyard-1'], gold: 9 }), 'p2', { city: ['manor-1'] });
    expect(act(mine, 'p3', { type: 'destroy', target: 'p2', card: 'manor-1' }).pendingGraveyard).toBeNull();
  });
});

describe('特殊城区', () => {
  const first = () => deal(fresh(4), four);
  it('天文台抽 3 留 1；图书馆两张都留；两者都有时抽 3 留 2', () => {
    const obs = act(give(first(), 'p0', { city: ['observatory-1'] }), 'p0', { type: 'draw' });
    expect(obs.turn!.drawn).toHaveLength(3);
    expect(obs.turn!.keepCount).toBe(1);

    const base = give(first(), 'p0', { city: ['library-1'], hand: [] });
    const lib = act(base, 'p0', { type: 'draw' });
    expect(lib.turn!.drawn).toBeNull();
    expect(lib.hands.p0).toHaveLength(2);
    expect(lib.turn!.actionTaken).toBe(true);

    const both = act(give(first(), 'p0', { city: ['library-1', 'observatory-1'], hand: [] }), 'p0', { type: 'draw' });
    expect(both.turn!.drawn).toHaveLength(3);
    expect(both.turn!.keepCount).toBe(2);
    expect(() => act(both, 'p0', { type: 'keep', cards: both.turn!.drawn!.slice(0, 1) })).toThrow(/留下 2/);
    expect(act(both, 'p0', { type: 'keep', cards: both.turn!.drawn!.slice(0, 2) }).hands.p0).toHaveLength(2);
  });
  it('实验室每回合一次弃 1 牌得 1 金；铁匠铺付 2 金抽 3 张', () => {
    let s = give(first(), 'p0', { city: ['laboratory-1', 'smithy-1'], hand: ['tavern-1', 'temple-1'], gold: 2 });
    s = act(s, 'p0', { type: 'laboratory', card: 'tavern-1' });
    expect(s.gold.p0).toBe(3);
    expect(s.hands.p0).toEqual(['temple-1']);
    expect(() => act(s, 'p0', { type: 'laboratory', card: 'temple-1' })).toThrow(/一次/);
    s = act(s, 'p0', { type: 'smithy' });
    expect(s.gold.p0).toBe(1);
    expect(s.hands.p0).toHaveLength(4);
    expect(() => act(s, 'p0', { type: 'smithy' })).toThrow(/一次/);
    expect(() => act(first(), 'p0', { type: 'smithy' })).toThrow(/没有铁匠铺/);
  });
  it('魔法学院在收入时算作需要的颜色', () => {
    let s = pass(pass(first()));
    s = give(s, 'p2', { city: ['school_of_magic-1', 'manor-1'], gold: 0 });
    expect(act(s, 'p2', { type: 'income' }).gold.p2).toBe(2);
  });
});

describe('终局与计分', () => {
  const FIVE = ['manor-1', 'temple-1', 'tavern-1', 'watchtower-1', 'keep-1'];
  it('建成第 8 座后打完这一轮才结束；率先建成 +4，其他建成者 +2', () => {
    let s = deal(fresh(4), { p0: 'assassin', p1: 'architect', p2: 'king', p3: 'warlord' });
    const seven = ['tavern-1', 'temple-1', 'manor-1', 'castle-1', 'market-1', 'docks-1', 'prison-1'];
    s = give(s, 'p0', { city: seven, hand: ['church-1'], gold: 9 });
    s = give(s, 'p1', { city: ['tavern-2', 'temple-2', 'manor-2', 'castle-2', 'market-2', 'docks-2', 'prison-2'], hand: ['church-2'], gold: 9 });
    s = act(act(s, 'p0', { type: 'take_gold' }), 'p0', { type: 'build', card: 'church-1' });
    expect(s.completed).toEqual(['p0']);
    expect(citadels.view(s, 'p1').finalRound).toBe(true);
    s = act(s, 'p0', { type: 'end_turn' });
    expect(s.phase).toBe('turns');
    s = pass(s); // 国王
    s = act(act(s, 'p1', { type: 'take_gold' }), 'p1', { type: 'build', card: 'church-2' });
    s = act(s, 'p1', { type: 'end_turn' });
    s = pass(s); // 军阀
    expect(s.phase).toBe('ended');
    expect(s.scores!.p0).toMatchObject({ complete: 4 });
    expect(s.scores!.p1).toMatchObject({ complete: 2 });
    expect(s.scores!.p2).toMatchObject({ complete: 0 });
    expect(citadels.view(s, 'p3').characters).toEqual(s.characters);
  });
  it('五色齐全 +3；龙门和大学计 8 分', () => {
    let s = give(fresh(4), 'p0', { city: FIVE });
    expect(scoreCity(s, 'p0')).toMatchObject({ districts: 3 + 1 + 1 + 1 + 3, allTypes: 3 });
    s = give(fresh(4), 'p0', { city: FIVE.slice(0, 4) });
    expect(scoreCity(s, 'p0').allTypes).toBe(0);
    s = give(fresh(4), 'p0', { city: ['dragon_gate-1', 'university-1'] });
    expect(scoreCity(s, 'p0').districts).toBe(16);
  });
  it('鬼城可以补上缺的一种颜色，但最后一轮才建成的不行', () => {
    const city = ['manor-1', 'temple-1', 'tavern-1', 'haunted_city-1', 'keep-1'];
    let s = give(fresh(4), 'p0', { city });
    s.round = 5;
    expect(scoreCity(s, 'p0').allTypes).toBe(3);
    s.builtRound['haunted_city-1'] = 5;
    expect(scoreCity(s, 'p0').allTypes).toBe(0);
    const purpleless = give(fresh(4), 'p0', { city: ['manor-1', 'temple-1', 'tavern-1', 'watchtower-1', 'haunted_city-1'] });
    purpleless.round = 5;
    purpleless.builtRound['haunted_city-1'] = 5;
    expect(scoreCity(purpleless, 'p0').allTypes).toBe(3);
  });
  it('平分时先比城区分，再比金币', () => {
    let s = deal(fresh(4), four);
    s.completed = ['p3'];
    // p0：城区 9 + 五色 3 = 12；p1：城区 12。总分相同，p1 的城区分更高
    s = give(s, 'p0', { city: FIVE, gold: 9 });
    s = give(s, 'p1', { city: ['palace-1', 'cathedral-1', 'church-1'], gold: 0 });
    s = pass(pass(pass(pass(s))));
    expect(s.phase).toBe('ended');
    expect(s.scores!.p0!.total).toBe(s.scores!.p1!.total);
    expect(s.winner).toBe('p1');
  });
});

describe('机器人', () => {
  it('2 到 7 人都能把一局打完', () => {
    for (let n = 2; n <= 7; n++) {
      for (let seed = 0; seed < 12; seed++) {
        const r = seeded(seed * 17 + n);
        let s = citadels.setup(ids(n), {}, r);
        let steps = 0;
        while (!citadels.isOver(s)) {
          const mover = s.players.find((p) => citadels.botAction!(s, p, r) !== null);
          expect(mover, `卡住了：${s.phase} 第 ${s.round} 轮`).toBeDefined();
          s = citadels.reduce(s, mover!, citadels.botAction!(s, mover!, r)!, r);
          expect(++steps).toBeLessThan(6000);
        }
        expect(s.winner).not.toBeNull();
        const all = [...s.deck, ...s.players.flatMap((p) => [...s.hands[p]!, ...s.cities[p]!])];
        expect(all).toHaveLength(66);
        expect(new Set(all).size).toBe(66);
      }
    }
  });
});
