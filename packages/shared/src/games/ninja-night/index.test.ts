import { expect, it } from 'vitest';
import { ninjaNight } from './index';

const players = ['a', 'b', 'c', 'd'];
const rng = () => 0;

it('keeps clues and individual ballots private, then reveals the highest vote', () => {
  let state = ninjaNight.setup(players, {}, rng);
  const [shadow] = state.shadows;
  const guards = players.filter((id) => id !== shadow);
  const [voter, other, witness] = guards;

  state = ninjaNight.reduce(state, voter, { type: 'scout', round: 1, first: shadow, second: other }, rng);
  expect(ninjaNight.view(state, voter).clue?.same).toBe(false);
  expect(ninjaNight.view(state, other).clue).toBeNull();
  state = ninjaNight.reduce(state, voter, { type: 'vote', round: 1, target: shadow }, rng);
  expect(ninjaNight.view(state, other)).toMatchObject({
    myVote: null, votedPlayers: [voter], history: [], revealedShadows: null,
  });

  state = ninjaNight.reduce(state, other, { type: 'vote', round: 1, target: shadow }, rng);
  state = ninjaNight.reduce(state, witness, { type: 'vote', round: 1, target: shadow }, rng);
  state = ninjaNight.reduce(state, shadow, { type: 'vote', round: 1, target: voter }, rng);
  expect(ninjaNight.view(state, other)).toMatchObject({ winner: 'guard', revealedShadows: [shadow] });
});

it('allows the host to settle only when every outstanding vote belongs to an offline player', () => {
  let state = ninjaNight.setup(players, {}, rng);
  const context = { hostId: 'a', offlinePlayers: ['d'] };
  const settle = { type: 'settle_offline', round: 1 } as const;
  expect(() => ninjaNight.reduce(state, 'a', settle, rng, context)).toThrow();
  state = ninjaNight.reduce(state, 'a', { type: 'vote', round: 1, target: 'b' }, rng);
  state = ninjaNight.reduce(state, 'b', { type: 'vote', round: 1, target: 'c' }, rng);
  state = ninjaNight.reduce(state, 'c', { type: 'vote', round: 1, target: 'd' }, rng);
  expect(() => ninjaNight.reduce(state, 'b', settle, rng, context)).toThrow();
  state = ninjaNight.reduce(state, 'a', settle, rng, context);
  expect(ninjaNight.view(state, 'a')).toMatchObject({ round: 2, history: [{ revealed: null }] });
});
