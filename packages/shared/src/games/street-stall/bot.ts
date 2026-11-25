import { pick, type PlayerId, type Rng } from '../../framework';
import type { StallAction, StallState } from './index';
import { ENFORCEMENT_LIMIT, MEAL_TARGET, reachable, stallIds, street } from './rules';

function distance(from: string, to: string, blocked?: string) {
  return from === to ? 0 : (reachable(from, street.length, blocked).find((move) => move.to === to)?.steps ?? street.length);
}

function bestMove<T>(moves: readonly T[], score: (move: T) => number, rng: Rng) {
  const scored = moves.map((move) => ({ move, score: score(move) }));
  const best = Math.max(...scored.map((candidate) => candidate.score));
  return pick(scored.filter((candidate) => candidate.score === best), rng).move;
}

export function chooseBotAction(state: StallState, player: PlayerId, canBuy: boolean, rng: Rng): StallAction {
  const turn = { round: state.round, actor: state.turn };
  const open = stallIds.filter((id) => state.stalls[id].clearedRound === null).map((id) => state.stalls[id].cell);
  if (state.turn === 'customer') {
    if (canBuy) return { ...turn, type: 'buy' };
    if (open.includes(state.customerCell)) return { ...turn, type: 'wait' };
    const moves = reachable(state.customerCell, 2);
    const destination = bestMove(moves, ({ to }) => Math.max(...open.map((cell) => {
      const walking = distance(to, cell);
      const rival = distance(state.officerCell, cell, to);
      const exposed = walking > 0 && Math.ceil(rival / 3) <= Math.ceil(walking / 2);
      return -walking - (exposed ? 2 : 0);
    })), rng);
    return { ...turn, type: 'move', to: destination.to };
  }

  if (state.turn === 'stall') {
    const refuse = player !== state.owners.customer && state.meals + 1 === MEAL_TARGET;
    return { ...turn, type: refuse ? 'refuse' : 'sell' };
  }

  const normal = reachable(state.officerCell, 3, state.customerCell).map(({ to }) => ({ to, rush: false }));
  const rush = state.mode === 'duel-b' && !state.rushed
    ? reachable(state.officerCell, 5, state.customerCell).filter(({ steps }) => steps > 3).map(({ to }) => ({ to, rush: true }))
    : [];
  const action = bestMove([{ to: state.officerCell, rush: false }, ...normal, ...rush], ({ to, rush }) => {
    const clears = to !== state.customerCell && open.includes(to);
    if (clears && open.length === 1) {
      const wouldAwardOpponent = state.round > ENFORCEMENT_LIMIT && state.mode === 'standard';
      return wouldAwardOpponent ? -1000 : 1000 - Number(rush);
    }
    const nextTargets = open.filter((cell) => cell !== state.customerCell && !(clears && cell === to));
    const nextDistance = nextTargets.length ? Math.min(...nextTargets.map((cell) => distance(to, cell, state.customerCell))) : 0;
    return (clears ? 100 : 0) - nextDistance - (rush ? 2 : 0);
  }, rng);
  return action.to === state.officerCell ? { ...turn, type: 'wait' } : { ...turn, type: 'move', ...action };
}
