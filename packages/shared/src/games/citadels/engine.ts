import { GameError, pick, shuffle, type GameDefinition, type PlayerId, type Rng } from '../../framework';
import {
  ACTION_GOLD,
  BONUS_ALL_TYPES,
  BONUS_COMPLETE,
  BONUS_FIRST_COMPLETE,
  CHARACTER,
  CHARACTERS,
  CITY_SIZE,
  DISTRICT_TYPES,
  MAX_PLAYERS,
  MIN_PLAYERS,
  STARTING_GOLD,
  STARTING_HAND,
  buildDistrictDeck,
  charactersPerPlayer,
  districtOf,
  districtScore,
  draftDiscards,
  type CharacterId,
  type CitadelsOptions,
  type DistrictType,
} from './rules';

export type CardId = string;
export type CitadelsPhase = 'draft' | 'turns' | 'ended';

interface DraftStep {
  player: PlayerId;
  kind: 'pick' | 'discard';
}

interface DraftState {
  /** 明着移出的角色，所有人可见 */
  faceUp: CharacterId[];
  /** 盖着移出的角色，没人知道是什么 */
  faceDown: CharacterId[];
  /** 还在传递的角色牌，只有当前选角的人看得到 */
  pool: CharacterId[];
  steps: DraftStep[];
  index: number;
}

export interface TurnState {
  player: PlayerId;
  character: CharacterId;
  /** 是否已经执行了「拿金币 / 抽牌」 */
  actionTaken: boolean;
  /** 抽到手、等待挑选的牌 */
  drawn: CardId[] | null;
  keepCount: number;
  builds: number;
  buildLimit: number;
  incomeTaken: boolean;
  /** 角色技能（刺杀 / 偷窃 / 魔术 / 摧毁）是否已用 */
  powerUsed: boolean;
  labUsed: boolean;
  smithyUsed: boolean;
}

/** 公开的事件记录，界面据此播报 */
export type LogEvent =
  | { t: 'round'; round: number; crown: PlayerId }
  | { t: 'call'; character: CharacterId; player: PlayerId | null }
  | { t: 'gold'; player: PlayerId; amount: number; why: 'action' | 'income' | 'merchant' | 'laboratory' }
  | { t: 'draw'; player: PlayerId; count: number; why: 'action' | 'architect' | 'smithy' }
  | { t: 'build'; player: PlayerId; card: CardId }
  | { t: 'murder'; character: CharacterId }
  | { t: 'rob'; character: CharacterId }
  | { t: 'stolen'; from: PlayerId; to: PlayerId; amount: number }
  | { t: 'swap'; player: PlayerId; target: PlayerId }
  | { t: 'redraw'; player: PlayerId; count: number }
  | { t: 'destroy'; player: PlayerId; target: PlayerId; card: CardId; cost: number }
  | { t: 'graveyard'; player: PlayerId; card: CardId }
  | { t: 'crown'; player: PlayerId }
  | { t: 'murdered'; player: PlayerId; character: CharacterId }
  | { t: 'complete'; player: PlayerId; first: boolean };

export type LogEntry = LogEvent & { seq: number };

export interface ScoreBreakdown {
  districts: number;
  allTypes: number;
  complete: number;
  total: number;
}

export interface CitadelsState {
  players: PlayerId[];
  gold: Record<PlayerId, number>;
  hands: Record<PlayerId, CardId[]>;
  cities: Record<PlayerId, CardId[]>;
  /** 每座城区是在第几轮建成的（鬼城的效果要用） */
  builtRound: Record<CardId, number>;
  /** 牌堆，下标 0 是牌堆顶 */
  deck: CardId[];
  crown: PlayerId;
  round: number;
  phase: CitadelsPhase;
  draft: DraftState | null;
  characters: Record<PlayerId, CharacterId[]>;
  /** 本轮已经亮明身份的角色 */
  revealed: CharacterId[];
  /** 已经叫到第几号角色 */
  calledRank: number;
  turn: TurnState | null;
  murdered: CharacterId | null;
  robbed: CharacterId | null;
  /** 军阀摧毁了一座城区，等墓地的主人决定要不要买下 */
  pendingGraveyard: { owner: PlayerId; card: CardId } | null;
  /** 按建成的先后顺序 */
  completed: PlayerId[];
  log: LogEntry[];
  logSeq: number;
  scores: Record<PlayerId, ScoreBreakdown> | null;
  winner: PlayerId | null;
}

export type CitadelsAction =
  | { type: 'pick'; character: CharacterId }
  | { type: 'discard'; character: CharacterId }
  | { type: 'take_gold' }
  | { type: 'draw' }
  | { type: 'keep'; cards: CardId[] }
  | { type: 'build'; card: CardId }
  | { type: 'income' }
  | { type: 'murder'; character: CharacterId }
  | { type: 'rob'; character: CharacterId }
  | { type: 'swap_hand'; target: PlayerId }
  | { type: 'redraw'; cards: CardId[] }
  | { type: 'destroy'; target: PlayerId; card: CardId }
  | { type: 'graveyard'; take: boolean }
  | { type: 'laboratory'; card: CardId }
  | { type: 'smithy' }
  | { type: 'end_turn' };

export interface CitadelsSeat {
  gold: number;
  handCount: number;
  city: CardId[];
  /** 本轮已亮明的角色 */
  revealed: CharacterId[];
  /** 手里还盖着几张角色牌 */
  hidden: number;
}

export interface CitadelsView {
  players: PlayerId[];
  round: number;
  phase: CitadelsPhase;
  crown: PlayerId;
  citySize: number;
  deckCount: number;
  seats: Record<PlayerId, CitadelsSeat>;
  /** 本轮选角前明着移出的角色（整轮公开） */
  faceUp: CharacterId[];
  draft: null | {
    faceDownCount: number;
    picker: PlayerId;
    step: 'pick' | 'discard';
    /** 只有轮到选角的人能看到传到手里的牌 */
    pool: CharacterId[] | null;
    poolCount: number;
  };
  calledRank: number;
  turn: null | (Omit<TurnState, 'drawn'> & { drawn: CardId[] | null; drawnCount: number });
  murdered: CharacterId | null;
  robbed: CharacterId | null;
  pendingGraveyard: { owner: PlayerId; card: CardId } | null;
  /** 已经有人建成，这是最后一轮 */
  finalRound: boolean;
  completed: PlayerId[];
  log: LogEntry[];
  scores: Record<PlayerId, ScoreBreakdown> | null;
  winner: PlayerId | null;
  /** 结束后公开所有人最后一轮的角色 */
  characters: Record<PlayerId, CharacterId[]> | null;
  me: null | { id: PlayerId; hand: CardId[]; characters: CharacterId[] };
}

const LOG_LIMIT = 80;

function log(state: CitadelsState, event: LogEvent) {
  state.log.push({ ...event, seq: ++state.logSeq } as LogEntry);
  if (state.log.length > LOG_LIMIT) state.log.splice(0, state.log.length - LOG_LIMIT);
}

const has = (state: CitadelsState, player: PlayerId, districtId: string) =>
  state.cities[player]!.some((c) => districtOf(c).id === districtId);

function ownerOf(state: CitadelsState, character: CharacterId): PlayerId | null {
  return state.players.find((p) => state.characters[p]!.includes(character)) ?? null;
}

/** 从牌堆顶抽牌；牌堆不够时有多少抽多少 */
function drawCards(state: CitadelsState, count: number): CardId[] {
  return state.deck.splice(0, count);
}

/** 弃掉的城区牌放回牌堆底 */
function toBottom(state: CitadelsState, cards: CardId[]) {
  state.deck.push(...cards);
}

function gain(state: CitadelsState, player: PlayerId, amount: number, why: Extract<LogEvent, { t: 'gold' }>['why']) {
  if (amount <= 0) return;
  state.gold[player]! += amount;
  log(state, { t: 'gold', player, amount, why });
}

function setup(players: PlayerId[], _options: CitadelsOptions, rng: Rng): CitadelsState {
  const deck = shuffle(buildDistrictDeck(), rng);
  const state: CitadelsState = {
    players: players.slice(),
    gold: {},
    hands: {},
    cities: {},
    builtRound: {},
    deck,
    crown: pick(players, rng),
    round: 0,
    phase: 'draft',
    draft: null,
    characters: {},
    revealed: [],
    calledRank: 0,
    turn: null,
    murdered: null,
    robbed: null,
    pendingGraveyard: null,
    completed: [],
    log: [],
    logSeq: 0,
    scores: null,
    winner: null,
  };
  for (const p of players) {
    state.gold[p] = STARTING_GOLD;
    state.hands[p] = drawCards(state, STARTING_HAND);
    state.cities[p] = [];
    state.characters[p] = [];
  }
  startRound(state, rng);
  return state;
}

function draftSteps(players: PlayerId[], crown: PlayerId): DraftStep[] {
  const start = players.indexOf(crown);
  const order = players.map((_, i) => players[(start + i) % players.length]!);
  const picks = (ids: PlayerId[]): DraftStep[] => ids.map((player) => ({ player, kind: 'pick' }));
  if (order.length === 2) {
    // 两人局：先手选一张；之后每人选一张并盖弃一张，最后剩下的一张也盖弃
    const [a, b] = order as [PlayerId, PlayerId];
    return [
      { player: a, kind: 'pick' },
      { player: b, kind: 'pick' },
      { player: b, kind: 'discard' },
      { player: a, kind: 'pick' },
      { player: a, kind: 'discard' },
      { player: b, kind: 'pick' },
    ];
  }
  // 三人局转两圈，每人两个角色
  if (order.length === 3) return picks([...order, ...order]);
  return picks(order);
}

function startRound(state: CitadelsState, rng: Rng) {
  state.round += 1;
  state.phase = 'draft';
  state.revealed = [];
  state.calledRank = 0;
  state.turn = null;
  state.murdered = null;
  state.robbed = null;
  for (const p of state.players) state.characters[p] = [];

  const { faceDown, faceUp } = draftDiscards(state.players.length);
  const cards = shuffle(
    CHARACTERS.map((c) => c.id),
    rng,
  );
  const down = cards.splice(0, faceDown);
  // 国王不能明着移出：翻到国王就换一张
  const up: CharacterId[] = [];
  for (let i = 0; i < cards.length && up.length < faceUp; ) {
    if (cards[i] === 'king') i++;
    else up.push(...cards.splice(i, 1));
  }
  state.draft = {
    faceUp: up,
    faceDown: down,
    pool: cards.sort((a, b) => CHARACTER[a].rank - CHARACTER[b].rank),
    steps: draftSteps(state.players, state.crown),
    index: 0,
  };
  log(state, { t: 'round', round: state.round, crown: state.crown });
}

function advanceDraft(state: CitadelsState, rng: Rng) {
  const draft = state.draft!;
  draft.index += 1;
  if (draft.index < draft.steps.length) {
    // 七人局：最后一人在剩下的一张和最初盖着的那张之间选
    if (state.players.length === 7 && draft.index === draft.steps.length - 1) {
      draft.pool.push(...draft.faceDown.splice(0));
      draft.pool.sort((a, b) => CHARACTER[a].rank - CHARACTER[b].rank);
    }
    return;
  }
  draft.faceDown.push(...draft.pool.splice(0));
  state.phase = 'turns';
  callNext(state, rng);
}

function newTurn(player: PlayerId, character: CharacterId): TurnState {
  return {
    player,
    character,
    actionTaken: false,
    drawn: null,
    keepCount: 1,
    builds: 0,
    buildLimit: character === 'architect' ? 3 : 1,
    incomeTaken: false,
    powerUsed: false,
    labUsed: false,
    smithyUsed: false,
  };
}

/** 国王按顺序叫号，直到有人应答 */
function callNext(state: CitadelsState, rng: Rng) {
  state.turn = null;
  for (let rank = state.calledRank + 1; rank <= CHARACTERS.length; rank++) {
    const character = CHARACTERS[rank - 1]!.id;
    state.calledRank = rank;
    const owner = ownerOf(state, character);
    // 被刺杀的人保持沉默，场面上和「没人选这个角色」一模一样
    if (!owner || state.murdered === character) {
      log(state, { t: 'call', character, player: null });
      continue;
    }
    state.revealed.push(character);
    log(state, { t: 'call', character, player: owner });
    if (state.robbed === character) {
      const thief = ownerOf(state, 'thief')!;
      const amount = state.gold[owner]!;
      state.gold[owner] = 0;
      state.gold[thief]! += amount;
      log(state, { t: 'stolen', from: owner, to: thief, amount });
    }
    if (character === 'king' && state.crown !== owner) {
      state.crown = owner;
      log(state, { t: 'crown', player: owner });
    }
    state.turn = newTurn(owner, character);
    return;
  }
  endRound(state, rng);
}

function endRound(state: CitadelsState, rng: Rng) {
  if (state.murdered) {
    const victim = ownerOf(state, state.murdered);
    if (victim) {
      log(state, { t: 'murdered', player: victim, character: state.murdered });
      // 被刺杀的国王没有行动，但仍然继承王冠
      if (state.murdered === 'king' && state.crown !== victim) {
        state.crown = victim;
        log(state, { t: 'crown', player: victim });
      }
    }
  }
  if (state.completed.length > 0) finish(state);
  else startRound(state, rng);
}

export function scoreCity(state: CitadelsState, player: PlayerId): ScoreBreakdown {
  const city = state.cities[player]!;
  const districts = city.reduce((sum, c) => sum + districtScore(c), 0);

  const haunted = city.find((c) => districtOf(c).id === 'haunted_city');
  const types = new Set<DistrictType>(city.filter((c) => c !== haunted).map((c) => districtOf(c).type));
  // 鬼城可以补上缺的那一种颜色，但最后一轮才建成的不行
  const hauntedIsWild = haunted !== undefined && state.builtRound[haunted]! < state.round;
  if (haunted && !hauntedIsWild) types.add('special');
  const allTypes = types.size === DISTRICT_TYPES.length || (hauntedIsWild && types.size === DISTRICT_TYPES.length - 1);

  const complete = state.completed[0] === player ? BONUS_FIRST_COMPLETE : state.completed.includes(player) ? BONUS_COMPLETE : 0;
  const bonus = allTypes ? BONUS_ALL_TYPES : 0;
  return { districts, allTypes: bonus, complete, total: districts + bonus + complete };
}

function finish(state: CitadelsState) {
  state.phase = 'ended';
  state.turn = null;
  state.draft = null;
  state.scores = {};
  for (const p of state.players) state.scores[p] = scoreCity(state, p);
  // 平分时比城区本身的分数，再平比金币
  const ranked = state.players.slice().sort((a, b) => {
    const sa = state.scores![a]!;
    const sb = state.scores![b]!;
    return sb.total - sa.total || sb.districts - sa.districts || state.gold[b]! - state.gold[a]!;
  });
  state.winner = ranked[0]!;
}

/** 军阀摧毁这座城区要付多少金币；不能摧毁时返回原因 */
export function destroyCost(state: CitadelsState, target: PlayerId, card: CardId): number | string {
  const city = state.cities[target];
  if (!city || !city.includes(card)) return '那里没有这座城区';
  const def = districtOf(card);
  if (def.id === 'keep') return '要塞不会被摧毁';
  if (city.length >= CITY_SIZE) return '已经建成的城市不能再被摧毁';
  if (state.characters[target]!.includes('bishop') && state.murdered !== 'bishop') return '主教的城区受到庇护';
  const wall = def.id !== 'great_wall' && has(state, target, 'great_wall') ? 1 : 0;
  return def.cost - 1 + wall;
}

function incomeFor(state: CitadelsState, turn: TurnState): number {
  const type = CHARACTER[turn.character].income;
  if (!type) return 0;
  return state.cities[turn.player]!.filter((c) => {
    const def = districtOf(c);
    return def.type === type || def.id === 'school_of_magic';
  }).length;
}

function afterAction(state: CitadelsState, turn: TurnState) {
  turn.actionTaken = true;
  if (turn.character === 'merchant') gain(state, turn.player, 1, 'merchant');
  if (turn.character === 'architect') {
    const cards = drawCards(state, 2);
    state.hands[turn.player]!.push(...cards);
    if (cards.length) log(state, { t: 'draw', player: turn.player, count: cards.length, why: 'architect' });
  }
}

function reduce(prev: CitadelsState, player: PlayerId, action: CitadelsAction, rng: Rng): CitadelsState {
  if (!prev.players.includes(player)) throw new GameError('你不在这局游戏中');
  if (!action || typeof action !== 'object') throw new GameError('无效的操作');
  if (prev.phase === 'ended') throw new GameError('这一局已经结束');
  const state: CitadelsState = structuredClone(prev);

  // 选角
  if (action.type === 'pick' || action.type === 'discard') {
    const draft = state.draft;
    if (state.phase !== 'draft' || !draft) throw new GameError('现在不是选角色的时候');
    const step = draft.steps[draft.index]!;
    if (step.player !== player) throw new GameError('还没轮到你选角色');
    if (step.kind !== action.type) throw new GameError(step.kind === 'pick' ? '先选一个角色' : '先盖弃一个角色');
    const at = draft.pool.indexOf(action.character);
    if (at < 0) throw new GameError('这个角色不在可选范围里');
    draft.pool.splice(at, 1);
    if (action.type === 'pick') state.characters[player]!.push(action.character);
    else draft.faceDown.push(action.character);
    advanceDraft(state, rng);
    return state;
  }

  if (state.phase !== 'turns') throw new GameError('现在不能这样做');

  // 墓地：轮到墓地的主人做决定，其他人都要等
  if (state.pendingGraveyard) {
    const pending = state.pendingGraveyard;
    if (action.type !== 'graveyard' || player !== pending.owner) throw new GameError('等墓地的主人决定');
    if (action.take) {
      if (state.gold[player]! < 1) throw new GameError('金币不够');
      state.gold[player]! -= 1;
      state.hands[player]!.push(pending.card);
      log(state, { t: 'graveyard', player, card: pending.card });
    } else {
      toBottom(state, [pending.card]);
    }
    state.pendingGraveyard = null;
    return state;
  }

  const turn = state.turn;
  if (!turn || turn.player !== player) throw new GameError('还没轮到你');
  const hand = state.hands[player]!;
  const city = state.cities[player]!;
  const power = (who: CharacterId) => {
    if (turn.character !== who) throw new GameError(`只有${CHARACTER[who].name}可以这样做`);
    if (turn.powerUsed) throw new GameError('这一回合已经用过技能了');
  };

  switch (action.type) {
    case 'take_gold': {
      if (turn.actionTaken) throw new GameError('这一回合已经执行过行动了');
      gain(state, player, ACTION_GOLD, 'action');
      afterAction(state, turn);
      return state;
    }
    case 'draw': {
      if (turn.actionTaken || turn.drawn) throw new GameError('这一回合已经执行过行动了');
      const cards = drawCards(state, has(state, player, 'observatory') ? 3 : 2);
      // 图书馆：抽到的两张都留下；同时有天文台时是抽三留二（官方 FAQ）
      const keep = has(state, player, 'library') ? 2 : 1;
      if (cards.length <= keep) {
        hand.push(...cards);
        if (cards.length) log(state, { t: 'draw', player, count: cards.length, why: 'action' });
        afterAction(state, turn);
      } else {
        turn.drawn = cards;
        turn.keepCount = keep;
      }
      return state;
    }
    case 'keep': {
      if (!turn.drawn) throw new GameError('现在没有需要挑选的牌');
      const chosen = [...new Set(Array.isArray(action.cards) ? action.cards : [])];
      if (chosen.length !== turn.keepCount || chosen.some((c) => !turn.drawn!.includes(c))) {
        throw new GameError(`从抽到的牌里留下 ${turn.keepCount} 张`);
      }
      hand.push(...chosen);
      toBottom(
        state,
        turn.drawn.filter((c) => !chosen.includes(c)),
      );
      turn.drawn = null;
      log(state, { t: 'draw', player, count: chosen.length, why: 'action' });
      afterAction(state, turn);
      return state;
    }
    case 'build': {
      if (!turn.actionTaken) throw new GameError('先拿金币或抽牌，然后才能建造');
      if (turn.builds >= turn.buildLimit) throw new GameError(`这一回合最多建造 ${turn.buildLimit} 座城区`);
      const at = hand.indexOf(action.card);
      if (at < 0) throw new GameError('这张牌不在你手里');
      const def = districtOf(action.card);
      if (city.some((c) => districtOf(c).id === def.id)) throw new GameError(`你的城里已经有${def.name}了`);
      if (state.gold[player]! < def.cost) throw new GameError(`金币不够，${def.name}要 ${def.cost} 枚`);
      state.gold[player]! -= def.cost;
      hand.splice(at, 1);
      city.push(action.card);
      state.builtRound[action.card] = state.round;
      turn.builds += 1;
      log(state, { t: 'build', player, card: action.card });
      if (city.length >= CITY_SIZE && !state.completed.includes(player)) {
        state.completed.push(player);
        log(state, { t: 'complete', player, first: state.completed.length === 1 });
      }
      return state;
    }
    case 'income': {
      if (!CHARACTER[turn.character].income) throw new GameError('这个角色没有城区收入');
      if (turn.incomeTaken) throw new GameError('这一回合已经收过城区收入了');
      turn.incomeTaken = true;
      gain(state, player, incomeFor(state, turn), 'income');
      return state;
    }
    case 'murder': {
      power('assassin');
      const target = CHARACTER[action.character];
      if (!target || target.id === 'assassin') throw new GameError('选一个别的角色');
      turn.powerUsed = true;
      state.murdered = target.id;
      log(state, { t: 'murder', character: target.id });
      return state;
    }
    case 'rob': {
      power('thief');
      const target = CHARACTER[action.character];
      if (!target || target.id === 'thief' || target.id === 'assassin') throw new GameError('不能偷刺客，也不能偷自己');
      if (state.murdered === target.id) throw new GameError('不能偷被刺杀的角色');
      turn.powerUsed = true;
      state.robbed = target.id;
      log(state, { t: 'rob', character: target.id });
      return state;
    }
    case 'swap_hand': {
      power('magician');
      if (action.target === player || !state.players.includes(action.target)) throw new GameError('选另一名玩家');
      turn.powerUsed = true;
      const theirs = state.hands[action.target]!;
      state.hands[action.target] = hand;
      state.hands[player] = theirs;
      log(state, { t: 'swap', player, target: action.target });
      return state;
    }
    case 'redraw': {
      power('magician');
      const cards = [...new Set(Array.isArray(action.cards) ? action.cards : [])];
      if (cards.length === 0 || cards.some((c) => !hand.includes(c))) throw new GameError('选出要换掉的手牌');
      turn.powerUsed = true;
      state.hands[player] = hand.filter((c) => !cards.includes(c));
      toBottom(state, cards);
      const fresh = drawCards(state, cards.length);
      state.hands[player]!.push(...fresh);
      log(state, { t: 'redraw', player, count: cards.length });
      return state;
    }
    case 'destroy': {
      power('warlord');
      if (!turn.actionTaken) throw new GameError('先拿金币或抽牌');
      const cost = destroyCost(state, action.target, action.card);
      if (typeof cost === 'string') throw new GameError(cost);
      if (state.gold[player]! < cost) throw new GameError(`金币不够，摧毁它要 ${cost} 枚`);
      turn.powerUsed = true;
      state.gold[player]! -= cost;
      state.cities[action.target] = state.cities[action.target]!.filter((c) => c !== action.card);
      delete state.builtRound[action.card];
      log(state, { t: 'destroy', player, target: action.target, card: action.card, cost });
      // 墓地的主人（不能是军阀自己）可以花 1 金币买下被摧毁的城区
      const keeper = state.players.find((p) => p !== player && has(state, p, 'graveyard') && state.gold[p]! >= 1);
      if (keeper) state.pendingGraveyard = { owner: keeper, card: action.card };
      else toBottom(state, [action.card]);
      return state;
    }
    case 'laboratory': {
      if (!has(state, player, 'laboratory')) throw new GameError('你的城里没有实验室');
      if (turn.labUsed) throw new GameError('实验室每回合只能用一次');
      const at = hand.indexOf(action.card);
      if (at < 0) throw new GameError('这张牌不在你手里');
      turn.labUsed = true;
      hand.splice(at, 1);
      toBottom(state, [action.card]);
      gain(state, player, 1, 'laboratory');
      return state;
    }
    case 'smithy': {
      if (!has(state, player, 'smithy')) throw new GameError('你的城里没有铁匠铺');
      if (turn.smithyUsed) throw new GameError('铁匠铺每回合只能用一次');
      if (state.gold[player]! < 2) throw new GameError('金币不够，铁匠铺要 2 枚');
      turn.smithyUsed = true;
      state.gold[player]! -= 2;
      const cards = drawCards(state, 3);
      hand.push(...cards);
      if (cards.length) log(state, { t: 'draw', player, count: cards.length, why: 'smithy' });
      return state;
    }
    case 'end_turn': {
      if (!turn.actionTaken || turn.drawn) throw new GameError('先拿金币或抽牌，才能结束回合');
      // 忘了收的城区收入，结束回合时自动补上
      if (CHARACTER[turn.character].income && !turn.incomeTaken) {
        turn.incomeTaken = true;
        gain(state, player, incomeFor(state, turn), 'income');
      }
      callNext(state, rng);
      return state;
    }
    default:
      throw new GameError('无效的操作');
  }
}

function view(state: CitadelsState, viewer: PlayerId | null): CitadelsView {
  const ended = state.phase === 'ended';
  const inGame = viewer !== null && state.players.includes(viewer);
  const seats: Record<PlayerId, CitadelsSeat> = {};
  for (const p of state.players) {
    const revealed = state.characters[p]!.filter((c) => state.revealed.includes(c));
    seats[p] = {
      gold: state.gold[p]!,
      handCount: state.hands[p]!.length,
      city: state.cities[p]!,
      revealed,
      hidden: state.characters[p]!.length - revealed.length,
    };
  }

  let draft: CitadelsView['draft'] = null;
  if (state.draft && state.phase === 'draft') {
    const step = state.draft.steps[state.draft.index]!;
    draft = {
      faceDownCount: state.draft.faceDown.length,
      picker: step.player,
      step: step.kind,
      pool: step.player === viewer ? state.draft.pool : null,
      poolCount: state.draft.pool.length,
    };
  }

  const turn = state.turn;
  return {
    players: state.players,
    round: state.round,
    phase: state.phase,
    crown: state.crown,
    citySize: CITY_SIZE,
    deckCount: state.deck.length,
    seats,
    faceUp: state.draft?.faceUp ?? [],
    draft,
    calledRank: state.calledRank,
    turn: turn && {
      ...turn,
      drawn: turn.player === viewer ? turn.drawn : null,
      drawnCount: turn.drawn?.length ?? 0,
    },
    murdered: state.murdered,
    robbed: state.robbed,
    pendingGraveyard: state.pendingGraveyard,
    finalRound: state.completed.length > 0,
    completed: state.completed,
    log: state.log,
    scores: state.scores,
    winner: state.winner,
    characters: ended ? state.characters : null,
    me: inGame ? { id: viewer, hand: state.hands[viewer]!, characters: state.characters[viewer]! } : null,
  };
}

/** 试玩机器人：会建城、会用技能，但不做长线打算。 */
function botAction(state: CitadelsState, player: PlayerId, rng: Rng): CitadelsAction | null {
  if (state.phase === 'draft' && state.draft) {
    const step = state.draft.steps[state.draft.index]!;
    if (step.player !== player) return null;
    return { type: step.kind, character: pick(state.draft.pool, rng) };
  }
  if (state.phase !== 'turns') return null;
  if (state.pendingGraveyard) {
    return state.pendingGraveyard.owner === player ? { type: 'graveyard', take: rng() < 0.7 } : null;
  }
  const turn = state.turn;
  if (!turn || turn.player !== player) return null;
  const hand = state.hands[player]!;
  const city = state.cities[player]!;
  const gold = state.gold[player]!;
  const inCity = new Set(city.map((c) => districtOf(c).id));
  const byCost = (a: CardId, b: CardId) => districtOf(b).cost - districtOf(a).cost;
  const buildable = (budget: number) => hand.filter((c) => !inCity.has(districtOf(c).id) && districtOf(c).cost <= budget).sort(byCost);

  if (turn.drawn) {
    const ranked = turn.drawn.slice().sort((a, b) => Number(inCity.has(districtOf(a).id)) - Number(inCity.has(districtOf(b).id)) || byCost(a, b));
    return { type: 'keep', cards: ranked.slice(0, turn.keepCount) };
  }

  if (!turn.powerUsed) {
    if (turn.character === 'assassin') {
      return { type: 'murder', character: pick(CHARACTERS.filter((c) => c.id !== 'assassin'), rng).id };
    }
    if (turn.character === 'thief') {
      const targets = CHARACTERS.filter((c) => c.rank > 2 && c.id !== state.murdered);
      return { type: 'rob', character: pick(targets, rng).id };
    }
    if (turn.character === 'magician') {
      const richest = state.players.filter((p) => p !== player).sort((a, b) => state.hands[b]!.length - state.hands[a]!.length)[0]!;
      if (state.hands[richest]!.length > hand.length + 1) return { type: 'swap_hand', target: richest };
    }
  }

  if (!turn.actionTaken) {
    // 手里有马上能建或拿了钱就能建的牌就拿钱，否则抽牌
    return buildable(gold + ACTION_GOLD).length > 0 ? { type: 'take_gold' } : { type: 'draw' };
  }

  if (turn.builds < turn.buildLimit) {
    const target = buildable(gold)[0];
    if (target) return { type: 'build', card: target };
  }

  if (turn.character === 'warlord' && !turn.powerUsed && rng() < 0.6) {
    // 找城区最多的对手，拆他最便宜的一座
    const rivals = state.players.filter((p) => p !== player).sort((a, b) => state.cities[b]!.length - state.cities[a]!.length);
    for (const rival of rivals) {
      const options = state.cities[rival]!
        .map((card) => ({ card, cost: destroyCost(state, rival, card) }))
        .filter((o): o is { card: CardId; cost: number } => typeof o.cost === 'number' && o.cost <= Math.min(gold, 2))
        .sort((a, b) => a.cost - b.cost);
      if (options[0]) return { type: 'destroy', target: rival, card: options[0].card };
    }
  }

  return { type: 'end_turn' };
}

export const citadels: GameDefinition<CitadelsState, CitadelsAction, CitadelsView, CitadelsOptions> = {
  id: 'citadels',
  name: '富饶之城',
  tagline: '每一轮换一副面孔，抢在所有人之前建成你的城。2–7 人。',
  minPlayers: MIN_PLAYERS,
  maxPlayers: MAX_PLAYERS,
  defaultOptions: () => ({}),
  normalizeOptions: () => ({}),
  validateOptions: (_options, playerCount) => {
    if (playerCount < MIN_PLAYERS) return `还差 ${MIN_PLAYERS - playerCount} 人才能开局（至少 ${MIN_PLAYERS} 人）`;
    if (playerCount > MAX_PLAYERS) return `最多 ${MAX_PLAYERS} 人`;
    return null;
  },
  setup,
  reduce,
  view,
  isOver: (state) => state.phase === 'ended',
  botAction,
};

export { charactersPerPlayer };
