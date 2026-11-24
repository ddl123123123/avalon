import { GameError, pick, shuffle, type GameActionContext, type GameDefinition, type PlayerId, type Rng } from '../../framework';

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 7;
export const DECREES = ['favor', 'dissent'] as const;
export type Decree = typeof DECREES[number];
export const DECREE_INFO = {
  favor: { name: '恩赏', text: '获正向牌指向最多的罪名额外 +2 分。并列第一则都不加。' },
  dissent: { name: '清算', text: '遭弹劾次数最多的罪名额外 −2 分。无人被弹劾或并列第一则不扣。' },
};

export const SCENES = {
  pride: { name: '傲慢', place: '空冠王庭', mark: '♛', color: '#d3ae6b', card: 'tribute', debate: '谁值得戴上王冠？替一个罪名争取手牌上的支持。' },
  greed: { name: '贪婪', place: '黄金密库', mark: '◆', color: '#d9ba7c', card: 'pact', debate: '说服两位对手结成临时同盟。谁愿意为一次交易分出筹码？' },
  lust: { name: '色欲', place: '绯幕舞会', mark: '♥', color: '#da8ea5', card: 'follow', debate: '谁正在吸引最多支持？跟随它，或说服别人改变风向。' },
  envy: { name: '嫉妒', place: '裂镜长廊', mark: '◇', color: '#87b4a2', card: 'reversal', debate: '哪些罪名被低估了？为一个落后的罪名找出翻盘的理由。' },
  gluttony: { name: '暴食', place: '无尽宴席', mark: '✷', color: '#ca965f', card: 'rally', debate: '满桌都是筹码，谁能吃下最多？选一个值得大家同时支持的罪名。' },
  wrath: { name: '暴怒', place: '灰烬法庭', mark: '▲', color: '#dd8d7f', card: 'censure', debate: '为一宗弹劾提出理由。有人会扣分，也有人可能提前庇护。' },
  sloth: { name: '怠惰', place: '沉钟修道院', mark: '☾', color: '#a3a0d2', card: 'shield', debate: '谁该稳住已有分数？说服桌上玩家在这一轮暂缓进攻。' },
} as const;
export type Sin = keyof typeof SCENES;
export const SINS = Object.keys(SCENES) as Sin[];

export const CARDS = {
  tribute: { name: '献礼', mark: '✦', text: '选一个罪名，使其 +3 分。' },
  pact: { name: '密约', mark: '∞', text: '选两个不同罪名，各使其 +2 分。' },
  shield: { name: '庇护', mark: '⬡', text: '使一个罪名 +2 分，并抵消对它的最多 2 点扣分。' },
  censure: { name: '弹劾', mark: '×', text: '选一个罪名，使其 −2 分。' },
  rally: { name: '造势', mark: '✶', text: '使一个罪名 +1 分。如果还有别人的正向牌指向它，再 +2 分。' },
  reversal: { name: '逆风', mark: '↟', text: '使一个罪名 +1 分。如果其本轮开始时的分数不高于七宗罪的中位数，再 +2 分。' },
  follow: { name: '顺风', mark: '◈', text: '使一个罪名 +1 分。如果它是唯一获得最多正向牌的罪名，再 +2 分。' },
} as const;
export type Card = keyof typeof CARDS;
export const CARD_IDS = Object.keys(CARDS) as Card[];
export const MAX_SPEECH_LENGTH = 160;

type Scores = Record<Sin, number>;
type Phase = 'debate' | 'cards' | 'recap' | 'ended';
type Play = { card: Card; target: Sin; second?: Sin };
type Ballot = Play & { decree: Decree };
type Remark = { player: PlayerId; text: string };
type TakeTurn = { type: 'speak'; text: string } | ({ type: 'play' } & Ballot);
type Action = { round: number } & (TakeTurn | { type: 'advance' } | { type: 'fill_offline'; phase: 'debate' | 'cards' });

export interface SceneResult {
  scene: Sin;
  decree: Decree;
  decreeTarget: Sin | null;
  cards: Play[];
  speeches: Remark[];
  changes: Scores;
}

interface State {
  players: PlayerId[];
  roles: Record<PlayerId, Sin>;
  hands: Record<PlayerId, Card[]>;
  scenes: Sin[];
  round: number;
  phase: Phase;
  scores: Scores;
  speeches: Remark[];
  ballots: Partial<Record<PlayerId, Ballot>>;
  history: SceneResult[];
}

export interface SevenSinsView {
  round: number;
  scenes: Sin[];
  phase: Phase;
  scores: Scores;
  speeches: Remark[];
  ready: PlayerId[];
  history: SceneResult[];
  me: { sin: Sin; hand: Card[]; banker: boolean } | null;
  final: { roles: Record<PlayerId, Sin>; winners: PlayerId[] } | null;
}

const zero = () => Object.fromEntries(SINS.map((sin) => [sin, 0])) as Scores;

function setup(players: PlayerId[], _options: object, rng: Rng): State {
  const dealt = shuffle(SINS, rng);
  return {
    players: players.slice(),
    roles: Object.fromEntries(players.map((id, i) => [id, dealt[i]])),
    hands: Object.fromEntries(players.map((id) => [id, CARD_IDS.slice()])),
    scenes: shuffle(SINS, rng),
    round: 0,
    phase: 'debate',
    scores: zero(),
    speeches: [],
    ballots: {},
    history: [],
  };
}

function uniqueLeader(counts: Scores): Sin | null {
  const highest = Math.max(...Object.values(counts));
  const leaders = SINS.filter((sin) => counts[sin] === highest);
  return highest > 0 && leaders.length === 1 ? leaders[0] : null;
}

function settle(state: State, rng: Rng) {
  const scene = state.scenes[state.round];
  const banker = state.players.find((id) => state.roles[id] === scene);
  const decree = banker === undefined ? pick(DECREES, rng) : state.ballots[banker]!.decree;
  // Omit author and decree vote. Sort the public cards independently of submission or seat order.
  const plays: Play[] = Object.values(state.ballots).map((ballot) => ({
    card: ballot!.card, target: ballot!.target, second: ballot!.second,
  })).sort((a, b) => a.card.localeCompare(b.card) || a.target.localeCompare(b.target) || (a.second ?? '').localeCompare(b.second ?? ''));

  const support = zero();
  const attacks = zero();
  const gains = zero();
  const losses = zero();
  const shields = zero();
  const median = Object.values(state.scores).sort((a, b) => a - b)[3];
  const featured = SCENES[scene].card;

  for (const { card, target, second } of plays) {
    if (card === 'censure') attacks[target]++;
    else support[target]++;
    if (second) support[second]++;
  }
  const favorite = uniqueLeader(support);

  for (const { card, target, second } of plays) {
    const featuredBonus = card === featured ? 1 : 0;
    switch (card) {
      case 'censure':
        losses[target] += 2 + featuredBonus;
        break;
      case 'tribute':
        gains[target] += 3 + featuredBonus;
        break;
      case 'pact':
        gains[target] += 2 + featuredBonus;
        gains[second!] += 2;
        break;
      case 'shield':
        gains[target] += 2 + featuredBonus;
        shields[target] += 2;
        break;
      case 'rally':
        gains[target] += 1 + 2 * Number(support[target] >= 2) + featuredBonus;
        break;
      case 'reversal':
        gains[target] += 1 + 2 * Number(state.scores[target] <= median) + featuredBonus;
        break;
      case 'follow':
        gains[target] += 1 + 2 * Number(favorite === target) + featuredBonus;
        break;
    }
  }

  const decreeTarget = decree === 'favor' ? favorite : uniqueLeader(attacks);
  if (decreeTarget && decree === 'favor') gains[decreeTarget] += 2;
  if (decreeTarget && decree === 'dissent') losses[decreeTarget] += 2;

  const changes = zero();
  for (const sin of SINS) {
    changes[sin] = gains[sin] - Math.max(0, losses[sin] - shields[sin]);
    state.scores[sin] += changes[sin];
  }
  state.history.push({ scene, decree, decreeTarget, cards: plays, speeches: state.speeches, changes });
  state.phase = state.round === SINS.length - 1 ? 'ended' : 'recap';
}

function isSin(value: unknown): value is Sin {
  return typeof value === 'string' && SINS.includes(value as Sin);
}

function submit(state: State, player: PlayerId, action: TakeTurn, rng: Rng) {
  if (action.type === 'speak') {
    if (state.phase !== 'debate' || state.speeches.some((entry) => entry.player === player)) throw new GameError('本轮已结束发言');
    if (typeof action.text !== 'string' || action.text.length > MAX_SPEECH_LENGTH) throw new GameError('发言最多 160 字');
    state.speeches.push({ player, text: action.text.trim() });
    if (state.speeches.length === state.players.length) state.phase = 'cards';
    return;
  }
  if (state.phase !== 'cards' || Object.hasOwn(state.ballots, player)) throw new GameError('本轮不能再出牌');
  if (!state.hands[player].includes(action.card) || !isSin(action.target) || !DECREES.includes(action.decree)) {
    throw new GameError('请选择有效的卡牌、目标和庄家提案');
  }
  const second = action.card === 'pact' ? action.second : undefined;
  if (action.card === 'pact' && (!isSin(second) || second === action.target)) throw new GameError('密约必须选择两个不同的罪名');
  state.hands[player] = state.hands[player].filter((card) => card !== action.card);
  state.ballots[player] = { card: action.card, target: action.target, second, decree: action.decree };
  if (Object.keys(state.ballots).length === state.players.length) settle(state, rng);
}

function waitingFor(state: State): PlayerId[] {
  if (state.phase === 'debate') return state.players.filter((id) => !state.speeches.some((speech) => speech.player === id));
  if (state.phase === 'cards') return state.players.filter((id) => !Object.hasOwn(state.ballots, id));
  return [];
}

function automaticTurn(state: State, player: PlayerId, rng: Rng): TakeTurn {
  const sin = state.roles[player];
  if (state.phase === 'debate') {
    const topic = rng() < 0.4 ? sin : pick(SINS, rng);
    const name = SCENES[topic].name;
    const text = pick([
      `我想听听大家怎么看${name}，这轮有人愿意给它加分吗？`,
      `可以把${name}放进我们的谈判，有人愿意交换支持吗？`,
      `我会留意${name}的分数，这轮先听听谁愿意站出来。`,
    ], rng);
    return { type: 'speak', text };
  }
  const rivals = SINS.filter((id) => id !== sin);
  const ranked = shuffle(rivals, rng).sort((a, b) => state.scores[b] - state.scores[a]);
  const card = pick(state.hands[player], rng);
  return {
    type: 'play', card,
    target: card === 'censure' ? ranked[0] : sin,
    second: card === 'pact' ? ranked.at(-1) : undefined,
    decree: card === 'censure' ? 'dissent' : 'favor',
  };
}

function reduce(previous: State, player: PlayerId, action: Action, rng: Rng, context?: GameActionContext): State {
  if (!previous.players.includes(player)) throw new GameError('你不在本局中');
  if (!action || action.round !== previous.round || previous.phase === 'ended') throw new GameError('这一轮已经结束');
  const state = structuredClone(previous);
  switch (action.type) {
    case 'speak':
    case 'play':
      submit(state, player, action, rng);
      break;
    case 'advance':
      if (state.phase !== 'recap' || context?.hostId !== player) throw new GameError('请等房主开启下一幕');
      state.round++;
      state.phase = 'debate';
      state.speeches = [];
      state.ballots = {};
      break;
    case 'fill_offline': {
      if (context?.hostId !== player || action.phase !== state.phase) throw new GameError('此时不能代行');
      const missing = waitingFor(state).filter((id) => context.offlinePlayers.includes(id));
      if (!missing.length) throw new GameError('没有等待操作的离线座位');
      for (const id of missing) {
        const turn = action.phase === 'debate' ? { type: 'speak', text: '' } as const : automaticTurn(state, id, rng);
        submit(state, id, turn, rng);
      }
      break;
    }
    default:
      throw new GameError('无效的操作');
  }
  return state;
}

function view(state: State, viewer: PlayerId | null): SevenSinsView {
  const sin = viewer && state.players.includes(viewer) ? state.roles[viewer] : null;
  const top = state.phase === 'ended' ? Math.max(...state.players.map((id) => state.scores[state.roles[id]])) : null;
  const waiting = waitingFor(state);
  return {
    round: state.round,
    scenes: state.scenes,
    phase: state.phase,
    scores: state.scores,
    speeches: state.speeches,
    ready: state.players.filter((id) => !waiting.includes(id)),
    history: state.history,
    me: viewer && sin ? { sin, hand: state.hands[viewer], banker: sin === state.scenes[state.round] } : null,
    final: top === null ? null : { roles: state.roles, winners: state.players.filter((id) => state.scores[state.roles[id]] === top) },
  };
}

export const sevenSins: GameDefinition<State, Action, SevenSinsView, object> = {
  id: 'seven-sins',
  name: '七宗罪',
  tagline: '七幕暗议，一顶王冠',
  minPlayers: MIN_PLAYERS,
  maxPlayers: MAX_PLAYERS,
  defaultOptions: () => ({}),
  normalizeOptions: () => ({}),
  validateOptions: (_options, count) => count >= MIN_PLAYERS && count <= MAX_PLAYERS ? null : '七宗罪需要 3 至 7 位玩家',
  setup,
  reduce,
  view,
  isOver: (state) => state.phase === 'ended',
  botAction: (state, player, rng) => waitingFor(state).includes(player) ? { ...automaticTurn(state, player, rng), round: state.round } : null,
};
