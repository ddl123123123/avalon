import { expect, it } from 'vitest';
import { greyTide, ROUND_LIMIT } from './index';

const rng = () => 0.999;
const operator = 'p1';
const engineer = 'p2';
const fresh = () => greyTide.setup([operator, engineer], {}, rng);
type State = ReturnType<typeof fresh>;

function plan(state: State, player: string, order: unknown) {
  return greyTide.reduce(state, player, { type: 'plan', round: state.round, order }, rng);
}

function both(state: State, signal: unknown, mechanic: unknown) {
  return plan(plan(state, operator, signal), engineer, mechanic);
}

const wait = { kind: 'wait' };
const listen = { kind: 'listen' };
const salvage = { kind: 'salvage' };

it('shows readiness without leaking another player’s committed order or unread signal', () => {
  const state = plan(fresh(), operator, listen);
  expect(greyTide.view(state, engineer)).toMatchObject({
    ready: ['signal'], yourPlan: null, readings: [], revealedChannel: null, history: [],
  });
  expect(greyTide.view(state, operator).yourPlan?.order).toEqual(listen);
  expect(() => plan(state, operator, wait)).toThrow('本轮行动已经提交');
  expect(greyTide.view(plan(state, engineer, salvage), engineer)).toMatchObject({
    round: 2, readings: [{ field: 'direction', value: '南方' }], parts: { bracket: 'recovered' },
  });
});

it('lets the repair engineer pass a blocked route only with a matching same-round guide', () => {
  const state = both(both(fresh(), listen, salvage), listen, wait);
  const move = { kind: 'move', to: 'lamp' };
  expect(greyTide.view(both(state, wait, move), engineer).positions.mechanic).toBe('workshop');
  expect(greyTide.view(both(state, { kind: 'guide' }, move), engineer).positions.mechanic).toBe('lamp');
});

it('supports a complete rescue with the last repair and the matching signal in the same round', () => {
  let state = both(fresh(), listen, salvage);
  state = both(state, listen, { kind: 'move', to: 'lamp' });
  state = both(state, { kind: 'move', to: 'gallery' }, { kind: 'move', to: 'gallery' });
  state = both(state, salvage, wait);
  state = both(state, { kind: 'move', to: 'radio' }, { kind: 'move', to: 'lamp' });
  state = both(state, wait, { kind: 'fit', part: 'bracket' });
  const finalPart = { kind: 'fit', part: 'wire' };
  const failed = both(state, { kind: 'send', channel: 'north-short' }, finalPart);
  expect(greyTide.view(failed, operator)).toMatchObject({ round: 7, outcome: 'storm' });

  const won = both(state, { kind: 'send', channel: 'south-short' }, finalPart);
  expect(greyTide.isOver(won)).toBe(true);
  expect(greyTide.view(won, engineer)).toMatchObject({
    outcome: 'rescued', revealedChannel: 'south-short', parts: { bracket: 'installed', wire: 'installed' },
  });
});

it('ends after the last forecast and rejects invalid orders without advancing time', () => {
  let state = fresh();
  expect(() => plan(state, operator, { kind: 'move', to: 'lamp' })).toThrow('请选择一个可用的行动');
  expect(() => plan(state, engineer, { kind: 'send', channel: 'south-short' })).toThrow('请选择一个可用的行动');
  for (let round = 1; round <= ROUND_LIMIT; round++) state = both(state, wait, wait);
  expect(greyTide.view(state, null)).toMatchObject({ outcome: 'storm', round: ROUND_LIMIT });
});
