import { GameError, pick, shuffle, type GameDefinition, type PlayerId } from '../../framework';

export type Faction = 'guard' | 'shadow';
export const MAX_ROUNDS = 3;

export function shadowCount(players: number) {
  return players >= 6 ? 2 : 1;
}

type Clue = { first: PlayerId; second: PlayerId; same: boolean };
type RoundResult = {
  round: number;
  tally: { target: PlayerId; votes: number }[];
  revealed: { player: PlayerId; faction: Faction } | null;
};

interface NinjaState {
  players: PlayerId[];
  shadows: PlayerId[];
  round: number;
  votes: Partial<Record<PlayerId, PlayerId>>;
  clues: Partial<Record<PlayerId, Clue>>;
  history: RoundResult[];
  winner: Faction | null;
}

export interface NinjaView {
  round: number;
  faction: Faction | null;
  allies: PlayerId[];
  clue: Clue | null;
  votedPlayers: PlayerId[];
  myVote: PlayerId | null;
  history: RoundResult[];
  winner: Faction | null;
  revealedShadows: PlayerId[] | null;
}

type Action =
  | { type: 'scout'; round: number; first: PlayerId; second: PlayerId }
  | { type: 'vote'; round: number; target: PlayerId }
  | { type: 'settle_offline'; round: number };

function factionOf(state: NinjaState, player: PlayerId): Faction {
  return state.shadows.includes(player) ? 'shadow' : 'guard';
}

function alreadyRevealed(state: NinjaState, player: PlayerId) {
  return state.history.some((entry) => entry.revealed?.player === player);
}

function settle(state: NinjaState): NinjaState {
  const votes = Object.values(state.votes);
  const tally = state.players
    .map((target) => ({ target, votes: votes.filter((vote) => vote === target).length }))
    .filter((entry) => entry.votes > 0)
    .sort((a, b) => b.votes - a.votes);
  const top = tally[0];
  const revealed = top && top.votes !== tally[1]?.votes
    ? { player: top.target, faction: factionOf(state, top.target) }
    : null;
  const history = [...state.history, { round: state.round, tally, revealed }];
  const allFound = state.shadows.every((shadow) => history.some((entry) => entry.revealed?.player === shadow));
  const winner = allFound ? 'guard' : state.round === MAX_ROUNDS ? 'shadow' : null;
  return { ...state, history, votes: {}, winner, round: winner ? state.round : state.round + 1 };
}

export const ninjaNight: GameDefinition<NinjaState, Action, NinjaView, Record<string, never>> = {
  id: 'ninja-night',
  name: '忍者之夜：密令',
  tagline: '三轮查验，找出潜伏的影忍',
  minPlayers: 4,
  maxPlayers: 8,
  playerCountOptions: { defaultCount: 4, recommendedOptions: () => ({}) },
  defaultOptions: () => ({}),
  normalizeOptions: () => ({}),
  validateOptions: (_, count) => count >= 4 && count <= 8 ? null : '需要 4 到 8 人才能开局',
  setup: (players, _, rng) => ({
    players,
    shadows: shuffle(players, rng).slice(0, shadowCount(players.length)),
    round: 1,
    votes: {},
    clues: {},
    history: [],
    winner: null,
  }),
  reduce(state, player, action, _rng, context) {
    if (state.winner || !state.players.includes(player)) throw new GameError('你无法在这局行动');
    if (!action || action.round !== state.round) throw new GameError('当前轮次已经更新');

    switch (action.type) {
      case 'scout': {
        const { first, second } = action;
        if (state.clues[player]) throw new GameError('每局只能侦察一次');
        if (state.votes[player]) throw new GameError('本轮投票后请等到下一轮再侦察');
        if (first === second || first === player || second === player ||
            !state.players.includes(first) || !state.players.includes(second)) {
          throw new GameError('请选择两位其他玩家');
        }
        const clue = { first, second, same: factionOf(state, first) === factionOf(state, second) };
        return { ...state, clues: { ...state.clues, [player]: clue } };
      }
      case 'vote': {
        if (state.votes[player]) throw new GameError('本轮已经投票');
        if (action.target === player || !state.players.includes(action.target) || alreadyRevealed(state, action.target)) {
          throw new GameError('请投给一位尚未公开身份的其他玩家');
        }
        const next = { ...state, votes: { ...state.votes, [player]: action.target } };
        return state.players.every((id) => next.votes[id]) ? settle(next) : next;
      }
      case 'settle_offline': {
        const waiting = state.players.filter((id) => !state.votes[id]);
        if (context?.hostId !== player || !waiting.length ||
            waiting.some((id) => !context.offlinePlayers.includes(id))) {
          throw new GameError('还有在线玩家没有投票');
        }
        return settle(state);
      }
      default:
        throw new GameError('无法识别的行动');
    }
  },
  view: (state, viewer) => {
    const member = viewer !== null && state.players.includes(viewer) ? viewer : null;
    const faction = member ? factionOf(state, member) : null;
    return {
      round: state.round,
      faction,
      allies: faction === 'shadow' ? state.shadows.filter((id) => id !== member) : [],
      clue: member ? state.clues[member] ?? null : null,
      votedPlayers: state.players.filter((id) => state.votes[id]),
      myVote: member ? state.votes[member] ?? null : null,
      history: state.history,
      winner: state.winner,
      revealedShadows: state.winner ? state.shadows : null,
    };
  },
  isOver: (state) => state.winner !== null,
  botAction: (state, player, rng) => {
    if (state.winner || state.votes[player]) return null;
    const targets = state.players.filter((id) => id !== player && !alreadyRevealed(state, id));
    const preferred = factionOf(state, player) === 'shadow'
      ? targets.filter((id) => factionOf(state, id) === 'guard')
      : targets;
    return { type: 'vote', round: state.round, target: pick(preferred.length ? preferred : targets, rng) };
  },
};
