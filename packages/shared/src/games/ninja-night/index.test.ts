import { expect, it } from 'vitest';
import { ninjaNight, NIGHT_LIMIT, TARGET_SCORE, siteOrder, type Profession, type Site } from './index';

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
  expect(ninjaNight.view(state, 'outsider')).toMatchObject({ faction: null, offers: [], revealedShadows: null });
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
    { site: 'gate', power: { guard: 2, shadow: 0 }, winner: 'guard', points: 1 },
    { site: 'court', power: { guard: 0, shadow: 1 }, winner: 'shadow', points: 1 },
    { site: 'tower', power: { guard: 4, shadow: 4 }, winner: null, points: 0 },
  ]);
});

it('adds an odd-table shadow bonus on the focus only when a shadow actually visits it', () => {
  const night = draft(fresh(5), Array(5).fill('keeper'));
  const withShadow = visit(night, ['tower', 'tower', 'tower', 'tower', 'gate']);
  expect(withShadow.history[0].sites.find(({ site }) => site === 'tower')).toMatchObject({
    power: { guard: 4, shadow: 5 }, winner: 'shadow', points: 2,
  });
  const noShadow = visit(night, ['court', 'court', 'tower', 'tower', 'gate']);
  expect(noShadow.history[0].sites.find(({ site }) => site === 'tower')?.power.shadow).toBe(0);
});

it('awards an early win at the score target and draws on a fifth-night tie', () => {
  let state = fresh();
  for (let night = 1; night <= 3; night++) {
    const [secondary, other] = siteOrder.filter((site) => site !== state.focus);
    state = visit(draft(state, Array(4).fill('keeper')), [state.focus, secondary, other, other]);
    if (night < 3) state = nextNight(state);
  }
  expect(ninjaNight.view(state, 'p3')).toMatchObject({
    phase: 'ended', winner: 'shadow', scores: { shadow: TARGET_SCORE }, revealedShadows: ['p0', 'p1'],
  });

  let tied = fresh();
  for (let night = 1; night <= NIGHT_LIMIT; night++) {
    tied = visit(draft(tied, Array(4).fill('keeper')), Array(4).fill(tied.focus));
    if (night < NIGHT_LIMIT) tied = nextNight(tied);
  }
  expect(ninjaNight.view(tied, 'p3')).toMatchObject({ phase: 'ended', winner: 'draw' });
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
