import { GameError, shuffle, type GameDefinition, type PlayerId } from '../../framework';
import { promptBank, type PromptKind } from './promptBank';

export { promptBank, promptPresets, type PromptKind, type PromptPreset } from './promptBank';

export type TruthOptions = { laps: 1 | 2 };

interface TruthState {
  players: PlayerId[];
  decks: Record<PromptKind, string[]>;
  turn: number;
  totalTurns: number;
  prompt: { kind: PromptKind; text: string } | null;
}

export interface TruthView {
  turn: number;
  totalTurns: number;
  current: PlayerId | null;
  prompt: TruthState['prompt'];
}

type Action =
  | { type: 'draw'; turn: number; kind: PromptKind }
  | { type: 'done' | 'skip' | 'end'; turn: number };

export const truthOrDare: GameDefinition<TruthState, Action, TruthView, TruthOptions> = {
  id: 'truth-or-dare',
  name: '真心话大冒险',
  tagline: '轮流抽题，随时可以跳过',
  minPlayers: 2,
  maxPlayers: 10,
  defaultOptions: () => ({ laps: 1 }),
  normalizeOptions: (raw) => ({
    laps: (raw as Partial<TruthOptions> | null)?.laps === 2 ? 2 : 1,
  }),
  validateOptions: (_, count) => count >= 2 && count <= 10 ? null : '需要 2 到 10 人才能开局',
  setup: (players, options, rng) => ({
    players,
    decks: { truth: shuffle(promptBank['13+'].truth, rng), dare: shuffle(promptBank['13+'].dare, rng) },
    turn: 0,
    totalTurns: players.length * options.laps,
    prompt: null,
  }),
  reduce(state, player, action, _rng, context) {
    if (state.turn >= state.totalTurns || !state.players.includes(player)) throw new GameError('你无法在这局行动');
    if (!action || action.turn !== state.turn) throw new GameError('当前回合已经更新');
    const current = state.players[state.turn % state.players.length];
    const isHost = context?.hostId === player;

    if (action.type === 'end' && isHost) return { ...state, turn: state.totalTurns, prompt: null };
    if (action.type === 'skip' && isHost && context.offlinePlayers.includes(current)) {
      return { ...state, turn: state.turn + 1, prompt: null };
    }
    if (player !== current) throw new GameError('还没轮到你');
    switch (action.type) {
      case 'draw': {
        const { kind } = action;
        if (kind !== 'truth' && kind !== 'dare') throw new GameError('请选择一种题目');
        if (state.prompt) throw new GameError('本回合已经抽题');
        const [text, ...remaining] = state.decks[kind];
        if (!text) throw new GameError('这类题目已经抽完，请选择另一类');
        return { ...state, decks: { ...state.decks, [kind]: remaining }, prompt: { kind, text } };
      }
      case 'done':
        if (!state.prompt) throw new GameError('请先抽题');
        return { ...state, turn: state.turn + 1, prompt: null };
      case 'skip':
        return { ...state, turn: state.turn + 1, prompt: null };
      default:
        throw new GameError('无法识别的行动');
    }
  },
  view: ({ players, turn, totalTurns, prompt }) => ({
    turn,
    totalTurns,
    prompt,
    current: turn < totalTurns ? players[turn % players.length] : null,
  }),
  isOver: (state) => state.turn >= state.totalTurns,
};
