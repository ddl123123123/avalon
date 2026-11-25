import { expect, it } from 'vitest';
import { reachable, street, streetStall, type DuelMode } from './index';

const rng = () => 0;
const fresh = (count = 3, duel: DuelMode = 'duel-a') => streetStall.setup(['p1', 'p2', 'p3', 'p4'].slice(0, count), { duel }, rng);
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
