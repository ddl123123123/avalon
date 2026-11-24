import { expect, it } from 'vitest';
import { truthOrDare } from './index';

const rng = () => 0;

it('supports a full two-lap game without repeating a truth prompt', () => {
  const players = Array.from({ length: 10 }, (_, index) => `player-${index}`);
  let state = truthOrDare.setup(players, { laps: 2 }, rng);
  const drawn = new Set<string>();
  for (let turn = 0; turn < 20; turn++) {
    const player = players[turn % players.length];
    expect(truthOrDare.view(state, null).current).toBe(player);
    state = truthOrDare.reduce(state, player, { type: 'draw', turn }, rng);
    drawn.add(truthOrDare.view(state, null).prompt!.text);
    state = truthOrDare.reduce(state, player, { type: 'done', turn }, rng);
  }
  expect(drawn.size).toBe(20);
  expect(truthOrDare.isOver(state)).toBe(true);
});

it('lets the host skip an offline turn and rejects stale turn submissions', () => {
  let state = truthOrDare.setup(['a', 'b'], { laps: 2 }, rng);
  state = truthOrDare.reduce(state, 'a', { type: 'skip', turn: 0 }, rng);
  const skip = { type: 'skip', turn: 1 } as const;
  expect(() => truthOrDare.reduce(state, 'a', skip, rng, { hostId: 'a', offlinePlayers: [] })).toThrow();
  const context = { hostId: 'a', offlinePlayers: ['b'] };
  state = truthOrDare.reduce(state, 'a', skip, rng, context);
  expect(truthOrDare.view(state, null).current).toBe('a');
  expect(() => truthOrDare.reduce(state, 'a', skip, rng, context)).toThrow();
});
