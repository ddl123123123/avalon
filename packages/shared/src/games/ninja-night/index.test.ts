import { expect, it } from 'vitest';
import { ninjaNight, NIGHT_LIMIT, type Profession, type Site } from './index';

const rng = () => 0.999;
const host = 'p0';
const fresh = (count = 4) => ninjaNight.setup(Array.from({ length: count }, (_, i) => `p${i}`), {}, rng);
type State = ReturnType<typeof fresh>;

function draft(state: State, roles: Profession[]) {
  const offers = Object.fromEntries(state.players.map((player, index) => [player, [roles[index]]]));
  return state.players.reduce((next, player, index) => ninjaNight.reduce(next, player, {
    type: 'draft', night: state.night, profession: roles[index],
  }, rng), { ...state, offers });
}

function visit(state: State, targets: Site[]) {
  return state.players.reduce((next, player, index) => ninjaNight.reduce(next, player, {
    type: 'visit', night: state.night, site: targets[index],
  }, rng), state);
}

function nextNight(state: State) {
  return ninjaNight.reduce(state, host, { type: 'next_night', night: state.night }, rng, { hostId: host, offlinePlayers: [] });
}

it('shows only the viewer’s offer, selected occupation and destination until public scoring', () => {
  const state = fresh();
  const offer = ninjaNight.view(state, host).offers;
  expect(offer).toHaveLength(3);
  expect(new Set(offer).size).toBe(3);
  expect(ninjaNight.view(state, 'outsider')).toMatchObject({ faction: null, rank: null, offers: [], final: null });
  expect(() => ninjaNight.reduce(state, host, { type: 'draft', night: 1, profession: 'seal' }, rng)).toThrow();

  const chosen = ninjaNight.reduce(state, host, { type: 'draft', night: 1, profession: offer[0] }, rng);
  expect(ninjaNight.view(chosen, 'p2')).toMatchObject({ profession: null, target: null, waiting: ['p1', 'p2', 'p3'] });
  const night = draft(state, ['keeper', 'keeper', 'keeper', 'keeper']);
  const pending = ninjaNight.reduce(night, host, { type: 'visit', night: 1, site: 'gate' }, rng);
  expect(ninjaNight.view(pending, host).target).toBe('gate');
  expect(ninjaNight.view(pending, 'p2')).toMatchObject({ target: null, history: [] });
});

it('combines all six professions before scoring and gives no points for a tied focus', () => {
  const night = draft(fresh(6), ['keeper', 'mist', 'pathfinder', 'stargazer', 'seal', 'loner']);
  const done = visit(night, ['tower', 'tower', 'court', 'tower', 'tower', 'gate']);
  expect(done.phase).toBe('dawn');
  expect(done.history[0].sites).toEqual([
    { site: 'gate', power: { guard: 2, shadow: 0 }, winner: 'guard', merit: 1 },
    { site: 'court', power: { guard: 0, shadow: 1 }, winner: 'shadow', merit: 1 },
    { site: 'tower', power: { guard: 4, shadow: 4 }, winner: null, merit: 0 },
  ]);
});

it('adds an odd-table shadow bonus on the focus only when a shadow actually visits it', () => {
  const night = draft(fresh(5), Array(5).fill('keeper'));
  const withShadow = visit(night, ['tower', 'tower', 'tower', 'tower', 'gate']);
  expect(withShadow.history[0].sites.find(({ site }) => site === 'tower')).toMatchObject({
    power: { guard: 4, shadow: 5 }, winner: 'shadow', merit: 2,
  });
  const noShadow = visit(night, ['court', 'court', 'tower', 'tower', 'gate']);
  expect(noShadow.history[0].sites.find(({ site }) => site === 'tower')?.power.shadow).toBe(0);
});

it('skips a rank held by both sides, then awards the win to the sole eligible next rank', () => {
  const initial = { ...fresh(), night: NIGHT_LIMIT, merit: { p0: 2, p1: 1, p2: 2, p3: 2 } };
  const state = visit(draft(initial, Array(4).fill('keeper')), Array(4).fill(initial.focus));
  expect(ninjaNight.view(state, 'p3')).toMatchObject({
    phase: 'ended', final: { winner: 'guard', queen: null, rank: 2 },
  });
});

it('reveals the queen only to its holder before settlement and awards their side the win without merit', () => {
  const initial = { ...fresh(), queen: 'p1', night: NIGHT_LIMIT, merit: { p2: 2 } };
  expect(ninjaNight.view(initial, 'p1')).toMatchObject({ rank: 2, hasQueen: true, final: null });
  expect(ninjaNight.view(initial, 'p2')).toMatchObject({ hasQueen: false, final: null });
  const ended = visit(draft(initial, Array(4).fill('keeper')), Array(4).fill(initial.focus));
  expect(ninjaNight.view(ended, 'p2').final).toMatchObject({ winner: 'shadow', queen: 'p1', rank: null });
});

it('draws after five nights when all places and all eligible ranks are tied', () => {
  let tied = fresh();
  for (let night = 1; night <= NIGHT_LIMIT; night++) {
    tied = visit(draft(tied, Array(4).fill('keeper')), Array(4).fill(tied.focus));
    if (night < NIGHT_LIMIT) tied = nextNight(tied);
  }
  expect(ninjaNight.view(tied, 'p3')).toMatchObject({ phase: 'ended', final: { winner: 'draw' } });
});

it('deals all five ranks without duplicates on each side in a ten-player room', () => {
  const state = fresh(10);
  for (const side of [state.shadows, state.players.filter((player) => !state.shadows.includes(player))]) {
    expect(side.map((player) => state.ranks[player]).sort()).toEqual([1, 2, 3, 4, 5]);
  }
});

it('lets only the host skip outstanding offline seats without leaking their cards', () => {
  let state = fresh();
  const context = { hostId: host, offlinePlayers: ['p3'] };
  const skip = { type: 'settle_offline', night: 1, phase: 'draft' } as const;
  expect(() => ninjaNight.reduce(state, host, skip, rng, context)).toThrow();
  for (const player of ['p0', 'p1', 'p2']) {
    state = ninjaNight.reduce(state, player, { type: 'draft', night: 1, profession: 'keeper' }, rng);
  }
  expect(() => ninjaNight.reduce(state, 'p1', skip, rng, context)).toThrow();
  state = ninjaNight.reduce(state, host, skip, rng, context);
  expect(ninjaNight.view(state, 'p3')).toMatchObject({ phase: 'night', profession: null, waiting: ['p0', 'p1', 'p2'] });
  expect(() => ninjaNight.reduce(state, 'p3', { type: 'visit', night: 1, site: 'gate' }, rng)).toThrow();
});
