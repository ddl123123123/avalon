import { GameError, shuffle, type GameDefinition, type PlayerId } from '../../framework';
import {
  ENFORCEMENT_LIMIT, MEAL_TARGET, ROUND_LIMIT, cellName, modeFor, modes, reachable, roles, stallIds, stallNames, startCells,
  type DuelMode, type Mode, type Role, type StallId,
} from './rules';
import { chooseBotAction } from './bot';

export * from './rules';

export type StallOptions = { duel: DuelMode } & Partial<Record<Role, PlayerId>>;
export type Turn = 'customer' | 'stall' | 'officer';
type Stall = { cell: string; sold: number; clearedRound: number | null };
type ResultReason = 'customer' | 'officer' | 'late-clear' | 'stalls' | 'none';
type Result = { reason: ResultReason; winners: PlayerId[]; stalls: StallId[] };

export interface StallState {
  mode: Mode;
  round: number;
  turn: Turn;
  roleOwners: Partial<Record<Role, PlayerId>>;
  owners: { customer: PlayerId; officer: PlayerId; stalls: Record<StallId, PlayerId> };
  customerCell: string;
  officerCell: string;
  stalls: Record<StallId, Stall>;
  meals: number;
  ready: StallId | null;
  didWait: boolean;
  sale: { stall: StallId; refused: boolean } | null;
  usedRefusals: PlayerId[];
  rushed: boolean;
  events: string[];
  history: { round: number; events: string[] }[];
  result: Result | null;
}

export interface StallView extends StallState {
  currentPlayer: PlayerId | null;
  moves: ReturnType<typeof reachable>;
  rushMoves: ReturnType<typeof reachable>;
  canBuy: boolean;
}

export type StallAction = { round: number; actor: Turn } & (
  | { type: 'move'; to: string; rush?: boolean }
  | { type: 'wait' | 'buy' | 'sell' | 'refuse' }
);

/** A vacant or no longer occupied choice returns to the random pool. */
export function fixedRoles(options: StallOptions, mode: Mode, players: readonly PlayerId[]) {
  const assigned: Partial<Record<Role, PlayerId>> = {};
  const available = new Set(players);
  for (const role of modes[mode].seats) {
    const player = options[role];
    if (player && available.delete(player)) assigned[role] = player;
  }
  return assigned;
}

function ownerAt(players: PlayerId[], mode: Mode): StallState['owners'] {
  const [first, second, third, fourth] = players;
  if (mode === 'duel-a') return { customer: first, officer: second, stalls: { a: second, b: second } };
  if (mode === 'duel-b') return { customer: second, officer: first, stalls: { a: second, b: second } };
  return { customer: first, officer: second, stalls: { a: third, b: mode === 'split' ? fourth : third } };
}

function aliveAtCustomer(state: StallState): StallId | null {
  return stallIds.find((id) => state.stalls[id].clearedRound === null && state.stalls[id].cell === state.customerCell) ?? null;
}

function activePlayer(state: StallState) {
  if (state.result) return null;
  return state.turn === 'stall' ? state.owners.stalls[state.sale!.stall] : state.owners[state.turn];
}

function eligiblePurchase(state: StallState): StallId | null {
  return state.ready === aliveAtCustomer(state) ? state.ready : null;
}

function endRound(state: StallState) {
  state.history = [...state.history, { round: state.round, events: state.events }];
  state.events = [];
}

function finish(state: StallState, reason: ResultReason, shops: readonly StallId[] = []): StallState {
  const winners = reason === 'customer' || reason === 'officer'
    ? [state.owners[reason]] : [...new Set(shops.map((shop) => state.owners.stalls[shop]))];
  state.result = { reason, winners, stalls: [...shops] };
  endRound(state);
  return state;
}

function settle(state: StallState): StallState {
  if (state.sale && !state.sale.refused) {
    const id = state.sale.stall;
    state.meals++;
    state.stalls = { ...state.stalls, [id]: { ...state.stalls[id], sold: state.stalls[id].sold + 1 } };
    state.events.push(`顾客在${stallNames[id]}买到一份食物，累计 ${state.meals} 份。`);
    if (state.meals === MEAL_TARGET) return finish(state, 'customer');
  }

  const cleared = stallIds.find((id) => state.stalls[id].clearedRound === null && state.stalls[id].cell === state.officerCell);
  if (cleared) {
    if (state.customerCell === state.officerCell) {
      state.events.push(`顾客挡在${stallNames[cleared]}旁，本轮无法清除。`);
    } else {
      state.stalls = { ...state.stalls, [cleared]: { ...state.stalls[cleared], clearedRound: state.round } };
      state.events.push(`城管清除了${stallNames[cleared]}。`);
    }
  }

  const alive = stallIds.filter((id) => state.stalls[id].clearedRound === null);
  if (!alive.length) {
    if (state.round <= ENFORCEMENT_LIMIT) return finish(state, 'officer');
    return state.mode === 'split' ? finish(state, 'none') : finish(state, 'late-clear', stallIds);
  }

  if (state.round === ROUND_LIMIT) {
    const sold = stallIds.some((id) => state.stalls[id].sold > 0);
    const winners = state.mode === 'split' ? alive.filter((id) => state.stalls[id].sold > 0) : sold ? alive : [];
    return winners.length ? finish(state, 'stalls', winners) : finish(state, 'none');
  }

  state.ready = state.didWait ? aliveAtCustomer(state) : null;
  endRound(state);
  state.round++;
  state.turn = 'customer';
  state.sale = null;
  state.didWait = false;
  return state;
}

export const streetStall: GameDefinition<StallState, StallAction, StallView, StallOptions> = {
  id: 'street-stall',
  name: '路边摊',
  tagline: '买吃的、守摊位、赶在五回合内清摊',
  minPlayers: 2,
  maxPlayers: 4,
  playerCountOptions: { defaultCount: 3, recommendedOptions: () => ({}) },
  defaultOptions: () => ({ duel: 'duel-a' }),
  normalizeOptions(raw) {
    const input = raw as Partial<StallOptions> | null;
    const options: StallOptions = { duel: input?.duel === 'duel-b' ? 'duel-b' : 'duel-a' };
    for (const role of Object.keys(roles) as Role[]) {
      const player = input?.[role];
      if (typeof player === 'string' && player.length > 0 && player.length <= 64) options[role] = player;
    }
    return options;
  },
  validateOptions: (_, count) => count >= 2 && count <= 4 ? null : '需要 2 到 4 人才能开局',
  setup: (players, options, rng) => {
    const mode = modeFor(players.length, options.duel);
    const roleOwners = fixedRoles(options, mode, players);
    const assigned = new Set(Object.values(roleOwners));
    const random = shuffle(players.filter((id) => !assigned.has(id)), rng);
    const ordered = modes[mode].seats.map((role) => roleOwners[role] ??= random.pop()!);
    return {
      mode,
      round: 1,
      turn: 'customer',
      roleOwners,
      owners: ownerAt(ordered, mode),
      customerCell: startCells.customer,
      officerCell: startCells.officer,
      stalls: { a: { cell: startCells.a, sold: 0, clearedRound: null }, b: { cell: startCells.b, sold: 0, clearedRound: null } },
      meals: 0,
      ready: null,
      didWait: false,
      sale: null,
      usedRefusals: [],
      rushed: false,
      events: [],
      history: [],
      result: null,
    };
  },
  reduce(state, player, action) {
    if (state.result) throw new GameError('这一局已结束');
    if (!action || action.round !== state.round || action.actor !== state.turn) throw new GameError('当前行动已经更新');
    if (activePlayer(state) !== player) throw new GameError('还没轮到你行动');
    const next = { ...state, events: [...state.events] };

    if (state.turn === 'customer') {
      switch (action.type) {
        case 'move':
          if (action.rush || !reachable(state.customerCell, 2).some(({ to }) => to === action.to)) {
            throw new GameError('顾客只能沿通路移动至多 2 格');
          }
          next.customerCell = action.to;
          next.ready = null;
          next.events.push(`顾客到了${cellName(action.to)}。`);
          break;
        case 'wait':
          next.didWait = true;
          next.events.push(aliveAtCustomer(state) ? '顾客在摊旁完整等一回合。' : '顾客原地待机。');
          break;
        case 'buy': {
          const id = eligiblePurchase(state);
          if (!id) throw new GameError('请先在同一摊位完整待机一回合');
          next.ready = null;
          next.sale = { stall: id, refused: false };
          next.events.push(`顾客向${stallNames[id]}提出购买。`);
          next.turn = state.usedRefusals.includes(state.owners.stalls[id]) ? 'officer' : 'stall';
          return next;
        }
        default: throw new GameError('顾客现在只能移动、原地等候或购买');
      }
      next.turn = 'officer';
      return next;
    }

    if (state.turn === 'stall') {
      const sale = state.sale!;
      if (action.type !== 'sell' && action.type !== 'refuse') throw new GameError('请选择卖出或拒售');
      if (action.type === 'refuse') {
        if (state.usedRefusals.includes(player)) throw new GameError('拒售额度已用完');
        next.usedRefusals = [...state.usedRefusals, player];
        next.sale = { ...sale, refused: true };
        next.events.push(`${stallNames[sale.stall]}使用了拒售，顾客需要重新等候。`);
      } else {
        next.events.push(`${stallNames[sale.stall]}同意卖出。`);
      }
      next.turn = 'officer';
      return next;
    }

    if (action.type === 'move') {
      if (action.rush !== undefined && typeof action.rush !== 'boolean') throw new GameError('突击选项无效');
      const rush = action.rush === true;
      if (rush && (state.mode !== 'duel-b' || state.rushed)) throw new GameError('本局没有可用的突击');
      const maxSteps = rush ? 5 : 3;
      if (!reachable(state.officerCell, maxSteps, state.customerCell).some(({ to }) => to === action.to)) {
        throw new GameError('城管不能穿过顾客，也不能超过本回合可移动的格数');
      }
      next.rushed = state.rushed || rush;
      next.officerCell = action.to;
      next.events.push(`城管${rush ? '使用突击' : ''}到了${cellName(action.to)}。`);
    } else if (action.type === 'wait') {
      next.events.push('城管原地待机。');
    } else {
      throw new GameError('城管现在只能移动或待机');
    }
    return settle(next);
  },
  view(state, viewer) {
    const currentPlayer = activePlayer(state);
    const canAct = currentPlayer !== null && currentPlayer === viewer;
    return {
      ...state,
      currentPlayer,
      moves: !canAct || state.turn === 'stall' ? [] : state.turn === 'customer'
        ? reachable(state.customerCell, 2) : reachable(state.officerCell, 3, state.customerCell),
      rushMoves: canAct && state.turn === 'officer' && state.mode === 'duel-b' && !state.rushed
        ? reachable(state.officerCell, 5, state.customerCell) : [],
      canBuy: canAct && state.turn === 'customer' && eligiblePurchase(state) !== null,
    };
  },
  isOver: (state) => state.result !== null,
  botAction(state, player, rng) {
    if (activePlayer(state) !== player) return null;
    return chooseBotAction(state, player, eligiblePurchase(state) !== null, rng);
  },
};
