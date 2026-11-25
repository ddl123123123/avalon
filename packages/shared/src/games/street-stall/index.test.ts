import { expect, it } from 'vitest';
import { modeFor, modes, reachable, street, streetStall, type DuelMode, type StallOptions } from './index';

const rng = () => 0;
const players = ['p1', 'p2', 'p3', 'p4'];
const fresh = (count = 3, duel: DuelMode = 'duel-a') => {
  const options = { duel, ...Object.fromEntries(modes[modeFor(count, duel)].seats.map((role, i) => [role, players[i]])) };
  return streetStall.setup(players.slice(0, count), options, rng);
};
type State = ReturnType<typeof fresh>;
type Action = Parameters<typeof streetStall.reduce>[2];

function act(state: State, player: string, action: Omit<Action, 'actor' | 'round'> | { type: 'move'; to: string; rush?: boolean }) {
  return streetStall.reduce(state, player, { ...action, actor: state.turn, round: state.round } as Action, rng);
}

const wait = { type: 'wait' } as const;
const buy = { type: 'buy' } as const;
const sell = { type: 'sell' } as const;
const refuse = { type: 'refuse' } as const;
const move = (to: string) => ({ type: 'move' as const, to });
const finishWithWait = (state: State) => act(state, state.owners.officer, wait);

it('creates 21 connected cells and a customer can stop officer movement through a junction', () => {
  expect(street).toHaveLength(21);
  expect(reachable('m0', 21)).toHaveLength(20);
  expect(reachable('m6', 3, 'm4').map(({ to }) => to)).toContain('m4');
  expect(reachable('m6', 3, 'm4').map(({ to }) => to)).not.toContain('a1');
  expect(reachable('m6', 3).map(({ to }) => to)).toContain('a1');
});

it('requires a full wait, protects a shared square and resets a refused purchase', () => {
  let state = fresh();
  for (const to of ['m2', 'm4', 'a2']) {
    state = finishWithWait(act(state, 'p1', move(to)));
  }
  expect(state.round).toBe(4);
  expect(() => act(state, 'p1', buy)).toThrow();
  state = { ...state, officerCell: 'a2' };
  state = finishWithWait(act(state, 'p1', wait));
  expect(state.ready).toBe('a');
  expect(state.stalls.a.clearedRound).toBeNull();
  state = act(state, 'p1', buy);
  expect(() => act(state, 'p2', refuse)).toThrow();
  state = finishWithWait(act(state, 'p3', refuse));
  expect(state.meals).toBe(0);
  expect(() => act(state, 'p1', buy)).toThrow();
  state = finishWithWait(act(state, 'p1', wait));
  state = act(state, 'p1', buy);
  expect(state.turn).toBe('officer');
  state = finishWithWait(state);
  expect(state.meals).toBe(1);
  state = finishWithWait(act(state, 'p1', wait));
  state = finishWithWait(act(state, 'p1', buy));
  expect(state.result).toMatchObject({ reason: 'customer', winners: ['p1'] });
});

it('shares refusal in a standard room but keeps the two refusals independent in a split room', () => {
  for (const count of [3, 4]) {
    let state: State = { ...fresh(count), customerCell: 'a2', ready: 'a' };
    state = finishWithWait(act(act(state, 'p1', buy), 'p3', refuse));
    state = act({ ...state, customerCell: 'b2', ready: 'b' }, 'p1', buy);
    if (count === 3) {
      expect(state.turn).toBe('officer');
    } else {
      expect(streetStall.view(state, 'p4').currentPlayer).toBe('p4');
      expect(act(state, 'p4', refuse).usedRefusals).toEqual(['p3', 'p4']);
    }
  }
});

it('awards the city win only for clearing both stalls by round five', () => {
  let state = fresh();
  for (const to of ['b1', 'b2', 'm7', 'm4', 'a2']) state = act(act(state, 'p1', wait), 'p2', move(to));
  expect(state.round).toBe(5);
  expect(state.result).toMatchObject({ reason: 'officer', winners: ['p2'] });
});

it('awards late clearance to a shared owner, and can award two independent owners at the cap', () => {
  const lostA = { ...fresh().stalls.a, clearedRound: 5 };
  const late: State = { ...fresh(), round: 6, officerCell: 'b2', stalls: { ...fresh().stalls, a: lostA } };
  expect(finishWithWait(act(late, 'p1', wait)).result).toMatchObject({ reason: 'late-clear', winners: ['p3'] });
  expect(finishWithWait(act({ ...late, ...{ mode: 'split' as const, owners: fresh(4).owners } }, 'p1', wait)).result?.winners).toEqual([]);
  const split = fresh(4);
  const end: State = { ...split, round: 10, stalls: { a: { ...split.stalls.a, sold: 1 }, b: { ...split.stalls.b, sold: 1 } } };
  expect(finishWithWait(act(end, 'p1', wait)).result).toMatchObject({ reason: 'stalls', winners: ['p3', 'p4'] });
  expect(finishWithWait(act({ ...end, officerCell: 'a2' }, 'p1', wait)).result?.winners).toEqual(['p4']);
  expect(finishWithWait(act({ ...fresh(), round: 10 }, 'p1', wait)).result?.reason).toBe('none');
});

it('settles a second successful purchase before a clearance on the same turn', () => {
  const state: State = { ...fresh(), customerCell: 'a2', officerCell: 'm8', meals: 1, ready: 'a' };
  const result = act(act(act(state, 'p1', buy), 'p3', sell), 'p2', move('b2'));
  expect(result.result?.reason).toBe('customer');
  expect(result.stalls.b.clearedRound).toBeNull();
});

it('maps both duel controllers and validates a single five-step rush in mode B', () => {
  const a = fresh(2);
  expect(a.owners).toEqual({ customer: 'p1', officer: 'p2', stalls: { a: 'p2', b: 'p2' } });
  const b = fresh(2, 'duel-b');
  expect(b.owners).toEqual({ customer: 'p2', officer: 'p1', stalls: { a: 'p2', b: 'p2' } });
  const police = act(b, 'p2', wait);
  expect(() => act(police, 'p1', move('m11'))).toThrow();
  const rushed = act(police, 'p1', { type: 'move', to: 'm11', rush: true });
  expect(rushed.rushed).toBe(true);
  expect(() => act(act(rushed, 'p2', wait), 'p1', { type: 'move', to: 'm10', rush: true })).toThrow();
});

it('keeps fixed players and randomizes the remaining roles without duplication', () => {
  const options: StallOptions = { duel: 'duel-a', officer: 'p3', westVendor: 'former-player', eastVendor: 'p3' };
  const first = streetStall.setup(players, options, () => 0).roleOwners;
  const second = streetStall.setup(players, options, () => 0.99).roleOwners;
  for (const dealt of [first, second]) {
    expect(dealt.officer).toBe('p3');
    expect(Object.values(dealt).sort()).toEqual(players);
  }
  expect(first.customer).not.toBe(second.customer);
  expect(streetStall.normalizeOptions({ duel: 'duel-b', officer: null, customerVendor: 'p1', customer: false }))
    .toEqual({ duel: 'duel-b', customerVendor: 'p1' });
  expect(streetStall.setup(players.slice(0, 2), { duel: 'duel-b', customerVendor: 'p1' }, rng).owners)
    .toEqual({ officer: 'p2', customer: 'p1', stalls: { a: 'p1', b: 'p1' } });
});

it('lets a bot sell its first meal and refuse a rival customer about to win', () => {
  const state = act({ ...fresh(), customerCell: 'a2', ready: 'a' }, 'p1', buy);
  expect(streetStall.botAction!(state, 'p1', rng)).toBeNull();
  expect(streetStall.botAction!(state, 'p3', rng)?.type).toBe('sell');
  expect(streetStall.botAction!({ ...state, meals: 1 }, 'p3', rng)?.type).toBe('refuse');
  const duel = act({ ...fresh(2, 'duel-b'), customerCell: 'a2', ready: 'a', meals: 1 }, 'p2', buy);
  expect(streetStall.botAction!(duel, 'p2', rng)?.type).toBe('sell');
});

it('runs legal robot turns through an entire game in all four configurations', () => {
  for (const [count, duel] of [[2, 'duel-a'], [2, 'duel-b'], [3, 'duel-a'], [4, 'duel-a']] as const) {
    for (let seed = 1; seed <= 12; seed++) {
      let random = seed;
      const roll = () => ((random = (Math.imul(random, 1664525) + 1013904223) >>> 0) / 2 ** 32);
      const seated = players.slice(0, count);
      let state = streetStall.setup(seated, { duel }, roll);
      for (let turn = 0; !state.result && turn < 30; turn++) {
        const choices = seated.flatMap((player) => {
          const action = streetStall.botAction!(state, player, roll);
          return action ? [{ player, action }] : [];
        });
        expect(choices).toHaveLength(1);
        state = streetStall.reduce(state, choices[0].player, choices[0].action, roll);
      }
      expect(state.result).not.toBeNull();
      expect(state.round).toBeLessThanOrEqual(10);
    }
  }
});
