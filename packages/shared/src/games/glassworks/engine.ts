import { GameError, pick, shuffle, type GameDefinition, type PlayerId, type Rng } from '../../framework';
import {
  COMMISSIONS,
  GALLERY_SIZE,
  GOLD_SUPPLY,
  HAND_LIMIT,
  HEAT_DISCOUNT,
  HUES,
  MAX_PLAYERS,
  MIN_PLAYERS,
  PANELS,
  PIECES,
  SKETCH_LIMIT,
  SPECTRUM_BONUS,
  TAKE_LIMIT,
  TARGET_POINTS,
  TIERS,
  TRIPTYCH_BONUS,
  commissionCount,
  commissionOf,
  panelOf,
  piecesPerHue,
  rackSize,
  type GlassworksOptions,
  type Hue,
  type Piece,
  type Tier,
} from './rules';

export interface Sketch {
  id: string;
  /** 从画廊里拿的图稿所有人都见过；从牌堆顶摸的只有自己知道 */
  open: boolean;
}

export interface ScoreBreakdown {
  panels: number;
  commissions: number;
  /** 光谱：五种炉色每凑齐一套 */
  spectrum: number;
  /** 联窗：同一种炉色的小窗、花窗、玫瑰窗每凑齐一组 */
  triptych: number;
  total: number;
}

export type GlassLogEvent =
  | { t: 'take'; player: PlayerId; pieces: Hue[] }
  | { t: 'sketch'; player: PlayerId; panel: string | null; tier: Tier; gold: boolean }
  | { t: 'build'; player: PlayerId; panel: string; fromSketch: boolean; /** 趁余温省下的料 */ saved?: number }
  | { t: 'discard'; player: PlayerId; count: number }
  | { t: 'commission'; player: PlayerId; commission: string }
  | { t: 'final'; player: PlayerId }
  | { t: 'pass'; player: PlayerId };

export type GlassLogEntry = GlassLogEvent & { seq: number };

export interface GlassworksState {
  players: PlayerId[];
  startPlayer: PlayerId;
  turn: PlayerId;
  round: number;
  /** 布袋里每种颜色还剩几块 */
  bag: Record<Hue, number>;
  /** 供应里的金箔 */
  gold: number;
  /** 晾架，下标 0 在最左 */
  rack: Hue[];
  /** 与 rack 一一对应的编号，只为了让界面能把同一块料认出来做动画 */
  rackIds: number[];
  pieceSeq: number;
  decks: Record<Tier, string[]>;
  gallery: Record<Tier, (string | null)[]>;
  commissions: string[];
  glass: Record<PlayerId, Record<Piece, number>>;
  panels: Record<PlayerId, string[]>;
  sketches: Record<PlayerId, Sketch[]>;
  claimed: Record<PlayerId, string[]>;
  /** 余温：这位玩家上一回合烧制过，炉子还热着 */
  hot: Record<PlayerId, boolean>;
  /** 当前玩家还要放回几块料才能结束回合 */
  mustDiscard: number;
  /** 连续跳过的人数；所有人都只能跳过时牌局结束 */
  passes: number;
  finalRound: boolean;
  phase: 'play' | 'ended';
  log: GlassLogEntry[];
  logSeq: number;
  scores: Record<PlayerId, ScoreBreakdown> | null;
  winner: PlayerId | null;
}

export type GlassworksAction =
  /** 从晾架的 from 位置起，取相邻的 count 块 */
  | { type: 'take'; from: number; count: number }
  /** slot 为画廊里的位置；-1 表示摸牌堆顶 */
  | { type: 'sketch'; tier: Tier; slot: number }
  | { type: 'build'; panel: string }
  | { type: 'discard'; pieces: Piece[] }
  | { type: 'pass' };

export interface GlassworksSeat {
  glass: Record<Piece, number>;
  panels: string[];
  /** 每种炉色的数量 */
  kilns: Record<Hue, number>;
  sketches: { id: string | null; tier: Tier; open: boolean }[];
  claimed: string[];
  /** 炉子还热着：下一次行动若是烧制花窗或玫瑰窗，可以少付料 */
  hot: boolean;
  /** 每种炉色里已经有哪几档窗片（凑联窗用），下标 0–2 对应小窗、花窗、玫瑰窗 */
  tiers: Record<Hue, [number, number, number]>;
  score: ScoreBreakdown;
}

export interface GlassworksView {
  players: PlayerId[];
  startPlayer: PlayerId;
  turn: PlayerId;
  round: number;
  phase: 'play' | 'ended';
  finalRound: boolean;
  target: number;
  bag: Record<Hue, number>;
  gold: number;
  rack: Hue[];
  rackIds: number[];
  rackSize: number;
  deckCounts: Record<Tier, number>;
  gallery: Record<Tier, (string | null)[]>;
  commissions: string[];
  seats: Record<PlayerId, GlassworksSeat>;
  mustDiscard: number;
  log: GlassLogEntry[];
  scores: Record<PlayerId, ScoreBreakdown> | null;
  winner: PlayerId | null;
  me: { id: PlayerId } | null;
}

const LOG_LIMIT = 60;
function log(state: GlassworksState, event: GlassLogEvent) {
  state.log.push({ ...event, seq: ++state.logSeq } as GlassLogEntry);
  if (state.log.length > LOG_LIMIT) state.log.splice(0, state.log.length - LOG_LIMIT);
}

const zeroHues = (): Record<Hue, number> => ({ blue: 0, red: 0, green: 0, amber: 0, violet: 0 });

export function kilnsOf(panels: string[]): Record<Hue, number> {
  const kilns = zeroHues();
  for (const id of panels) kilns[panelOf(id).hue] += 1;
  return kilns;
}

/** 每种炉色里各档窗片的数量 */
export function tiersOf(panels: string[]): Record<Hue, [number, number, number]> {
  const tiers = Object.fromEntries(HUES.map((h) => [h, [0, 0, 0]])) as Record<Hue, [number, number, number]>;
  for (const id of panels) {
    const def = panelOf(id);
    tiers[def.hue][def.tier - 1]! += 1;
  }
  return tiers;
}

export function scoreOf(panels: string[], claimed: string[]): ScoreBreakdown {
  const panelPoints = panels.reduce((sum, id) => sum + panelOf(id).points, 0);
  const commissions = claimed.reduce((sum, id) => sum + commissionOf(id).points, 0);
  const kilns = kilnsOf(panels);
  const tiers = tiersOf(panels);
  const spectrum = Math.min(...HUES.map((h) => kilns[h])) * SPECTRUM_BONUS;
  const triptych = HUES.reduce((sum, h) => sum + Math.min(...tiers[h]), 0) * TRIPTYCH_BONUS;
  return { panels: panelPoints, commissions, spectrum, triptych, total: panelPoints + commissions + spectrum + triptych };
}

/** 扣掉炉色（和余温）之后，每种颜色实际要付几块 */
function owedFor(glass: Record<Piece, number>, kilns: Record<Hue, number>, panel: string, hot: boolean): Record<Hue, number> {
  const def = panelOf(panel);
  const owed = zeroHues();
  for (const hue of HUES) owed[hue] = Math.max(0, (def.cost[hue] ?? 0) - kilns[hue]);
  // 余温省下的料：先省手里缺的（等于省金箔），都不缺就省手里最紧的那种颜色
  for (let i = 0; hot && i < HEAT_DISCOUNT[def.tier]; i++) {
    const hue = HUES.filter((h) => owed[h] > 0).sort((a, b) => glass[a] - owed[a] - (glass[b] - owed[b]))[0];
    if (hue) owed[hue] -= 1;
  }
  return owed;
}

/**
 * 烧制这块窗片要付出哪些料：先扣炉色，炉子还热着（hot）再少付 1 块，
 * 然后用同色料，不够的用金箔补。付不起时返回 null。
 */
export function paymentFor(
  glass: Record<Piece, number>,
  kilns: Record<Hue, number>,
  panel: string,
  hot = false,
): Record<Piece, number> | null {
  const owed = owedFor(glass, kilns, panel, hot);
  const pay: Record<Piece, number> = { ...zeroHues(), gold: 0 };
  for (const hue of HUES) {
    pay[hue] = Math.min(owed[hue], glass[hue]);
    pay.gold += owed[hue] - pay[hue];
  }
  return pay.gold <= glass.gold ? pay : null;
}

/** 烧这块窗片还差哪些料（已经扣掉炉色、余温和手里的同色料；金箔另算） */
export function missingFor(
  glass: Record<Piece, number>,
  kilns: Record<Hue, number>,
  panel: string,
  hot = false,
): { total: number; byHue: Record<Hue, number> } {
  const owed = owedFor(glass, kilns, panel, hot);
  const byHue = zeroHues();
  let total = -glass.gold;
  for (const hue of HUES) {
    byHue[hue] = Math.max(0, owed[hue] - glass[hue]);
    total += byHue[hue];
  }
  return { total: Math.max(0, total), byHue };
}

const handSize = (glass: Record<Piece, number>) => PIECES.reduce((sum, p) => sum + glass[p], 0);
const bagTotal = (state: GlassworksState) => HUES.reduce((sum, h) => sum + state.bag[h], 0);

/** 从布袋里随机摸一块料；摸到每种颜色的概率与袋中数量成正比。袋子空了返回 null */
function drawFromBag(state: GlassworksState, rng: Rng): Hue | null {
  const total = bagTotal(state);
  if (total === 0) return null;
  let roll = Math.floor(rng() * total);
  for (const hue of HUES) {
    if (roll < state.bag[hue]) {
      state.bag[hue] -= 1;
      return hue;
    }
    roll -= state.bag[hue];
  }
  return null;
}

function refillRack(state: GlassworksState, rng: Rng) {
  const size = rackSize(state.players.length);
  while (state.rack.length < size) {
    const hue = drawFromBag(state, rng);
    if (!hue) return;
    state.rack.push(hue);
    state.rackIds.push(++state.pieceSeq);
  }
}

function refillGallery(state: GlassworksState) {
  for (const tier of TIERS) {
    const row = state.gallery[tier];
    for (let i = 0; i < row.length; i++) {
      if (row[i] === null) row[i] = state.decks[tier].shift() ?? null;
    }
  }
}

function setup(players: PlayerId[], _options: GlassworksOptions, rng: Rng): GlassworksState {
  const n = players.length;
  const first = pick(players, rng);
  const state: GlassworksState = {
    players: players.slice(),
    startPlayer: first,
    turn: first,
    round: 1,
    bag: Object.fromEntries(HUES.map((h) => [h, piecesPerHue(n)])) as Record<Hue, number>,
    gold: GOLD_SUPPLY,
    rack: [],
    rackIds: [],
    pieceSeq: 0,
    decks: { 1: [], 2: [], 3: [] },
    gallery: { 1: [], 2: [], 3: [] },
    commissions: shuffle(
      COMMISSIONS.map((c) => c.id),
      rng,
    ).slice(0, commissionCount(n)),
    glass: {},
    panels: {},
    sketches: {},
    claimed: {},
    hot: {},
    mustDiscard: 0,
    passes: 0,
    finalRound: false,
    phase: 'play',
    log: [],
    logSeq: 0,
    scores: null,
    winner: null,
  };
  for (const tier of TIERS) {
    state.decks[tier] = shuffle(
      PANELS.filter((p) => p.tier === tier).map((p) => p.id),
      rng,
    );
    state.gallery[tier] = Array<string | null>(GALLERY_SIZE).fill(null);
  }
  for (const p of players) {
    state.glass[p] = { ...zeroHues(), gold: 0 };
    state.panels[p] = [];
    state.sketches[p] = [];
    state.claimed[p] = [];
    state.hot[p] = false;
  }
  refillGallery(state);
  refillRack(state, rng);
  return state;
}

function finish(state: GlassworksState) {
  state.phase = 'ended';
  state.scores = {};
  for (const p of state.players) state.scores[p] = scoreOf(state.panels[p]!, state.claimed[p]!);
  // 平分：窗片更少者胜，再平则手里玻璃料更多者胜
  const ranked = state.players.slice().sort(
    (a, b) =>
      state.scores![b]!.total - state.scores![a]!.total ||
      state.panels[a]!.length - state.panels[b]!.length ||
      handSize(state.glass[b]!) - handSize(state.glass[a]!),
  );
  state.winner = ranked[0]!;
}

/** 行动做完之后的收尾。手里料太多时先停下，等玩家放回多余的。 */
function endTurn(state: GlassworksState, rng: Rng) {
  const player = state.turn;
  const excess = handSize(state.glass[player]!) - HAND_LIMIT;
  if (excess > 0) {
    state.mustDiscard = excess;
    return;
  }
  state.mustDiscard = 0;

  // 一回合最多承接一张委托，取声望最高的
  const kilns = kilnsOf(state.panels[player]!);
  const eligible = state.commissions
    .filter((id) => HUES.every((h) => kilns[h] >= (commissionOf(id).need[h] ?? 0)))
    .sort((a, b) => commissionOf(b).points - commissionOf(a).points);
  if (eligible[0]) {
    state.commissions = state.commissions.filter((id) => id !== eligible[0]);
    state.claimed[player]!.push(eligible[0]);
    log(state, { t: 'commission', player, commission: eligible[0] });
  }

  refillGallery(state);
  refillRack(state, rng);

  if (!state.finalRound && scoreOf(state.panels[player]!, state.claimed[player]!).total >= TARGET_POINTS) {
    state.finalRound = true;
    log(state, { t: 'final', player });
  }

  const next = state.players[(state.players.indexOf(player) + 1) % state.players.length]!;
  if (next === state.startPlayer) {
    // 所有人行动次数相同时才结算
    if (state.finalRound) return finish(state);
    state.round += 1;
  }
  if (state.passes >= state.players.length) return finish(state);
  state.turn = next;
}

function findPanel(state: GlassworksState, player: PlayerId, panel: string): { tier: Tier; slot: number } | { sketch: number } | null {
  const at = state.sketches[player]!.findIndex((s) => s.id === panel);
  if (at >= 0) return { sketch: at };
  for (const tier of TIERS) {
    const slot = state.gallery[tier].indexOf(panel);
    if (slot >= 0) return { tier, slot };
  }
  return null;
}

function reduce(prev: GlassworksState, player: PlayerId, action: GlassworksAction, rng: Rng): GlassworksState {
  if (!prev.players.includes(player)) throw new GameError('你不在这局游戏中');
  if (!action || typeof action !== 'object') throw new GameError('无效的操作');
  if (prev.phase === 'ended') throw new GameError('这一局已经结束');
  if (prev.turn !== player) throw new GameError('还没轮到你');
  const state: GlassworksState = structuredClone(prev);
  const glass = state.glass[player]!;
  // 编号只是给界面用的；万一和晾架对不上（比如测试里直接改了晾架），重新编一遍
  if (state.rackIds.length !== state.rack.length) state.rackIds = state.rack.map(() => ++state.pieceSeq);

  if (state.mustDiscard > 0) {
    if (action.type !== 'discard') throw new GameError(`手里的料太多了，先放回 ${state.mustDiscard} 块`);
    const pieces = Array.isArray(action.pieces) ? action.pieces : [];
    if (pieces.length !== state.mustDiscard) throw new GameError(`需要放回 ${state.mustDiscard} 块`);
    for (const piece of pieces) {
      if (!PIECES.includes(piece) || glass[piece] <= 0) throw new GameError('你手里没有这块料');
      glass[piece] -= 1;
      if (piece === 'gold') state.gold += 1;
      else state.bag[piece] += 1;
    }
    log(state, { t: 'discard', player, count: pieces.length });
    endTurn(state, rng);
    return state;
  }

  switch (action.type) {
    case 'take': {
      const { from, count } = action;
      if (!Number.isInteger(from) || !Number.isInteger(count) || count < 1 || count > TAKE_LIMIT) {
        throw new GameError(`一次取相邻的 1 到 ${TAKE_LIMIT} 块`);
      }
      if (from < 0 || from + count > state.rack.length) throw new GameError('晾架上没有这些料');
      const pieces = state.rack.splice(from, count);
      state.rackIds.splice(from, count);
      for (const hue of pieces) glass[hue] += 1;
      state.hot[player] = false;
      state.passes = 0;
      log(state, { t: 'take', player, pieces });
      break;
    }
    case 'sketch': {
      if (!TIERS.includes(action.tier)) throw new GameError('没有这一档窗片');
      if (state.sketches[player]!.length >= SKETCH_LIMIT) throw new GameError(`手里最多留 ${SKETCH_LIMIT} 张图稿`);
      let id: string | null;
      let open = true;
      if (action.slot === -1) {
        id = state.decks[action.tier].shift() ?? null;
        open = false;
        if (!id) throw new GameError('这一档的牌堆已经空了');
      } else {
        id = state.gallery[action.tier][action.slot] ?? null;
        if (!id) throw new GameError('画廊的这个位置是空的');
        state.gallery[action.tier][action.slot] = null;
      }
      state.sketches[player]!.push({ id, open });
      const gold = state.gold > 0;
      if (gold) {
        state.gold -= 1;
        glass.gold += 1;
      }
      state.hot[player] = false;
      state.passes = 0;
      log(state, { t: 'sketch', player, panel: open ? id : null, tier: action.tier, gold });
      break;
    }
    case 'build': {
      const where = typeof action.panel === 'string' ? findPanel(state, player, action.panel) : null;
      if (!where) throw new GameError('这块窗片不在画廊里，也不在你的图稿里');
      const kilns = kilnsOf(state.panels[player]!);
      const pay = paymentFor(glass, kilns, action.panel, state.hot[player]);
      if (!pay) throw new GameError('玻璃料不够');
      // 余温实际省下了几块（炉色已经够用时省不到）
      const cold = paymentFor({ ...glass, gold: 99 }, kilns, action.panel)!;
      const saved = PIECES.reduce((sum, piece) => sum + cold[piece] - pay[piece], 0);
      for (const piece of PIECES) {
        glass[piece] -= pay[piece];
        if (piece === 'gold') state.gold += pay.gold;
        else state.bag[piece] += pay[piece];
      }
      if ('sketch' in where) state.sketches[player]!.splice(where.sketch, 1);
      else state.gallery[where.tier][where.slot] = null;
      state.panels[player]!.push(action.panel);
      state.hot[player] = true;
      state.passes = 0;
      log(state, { t: 'build', player, panel: action.panel, fromSketch: 'sketch' in where, ...(saved > 0 ? { saved } : {}) });
      break;
    }
    case 'pass': {
      if (state.rack.length > 0) throw new GameError('晾架上还有料，不能跳过');
      state.passes += 1;
      state.hot[player] = false;
      log(state, { t: 'pass', player });
      break;
    }
    case 'discard':
      throw new GameError('现在不需要放回玻璃料');
    default:
      throw new GameError('无效的操作');
  }
  endTurn(state, rng);
  return state;
}

function view(state: GlassworksState, viewer: PlayerId | null): GlassworksView {
  const ended = state.phase === 'ended';
  const seats: Record<PlayerId, GlassworksSeat> = {};
  for (const p of state.players) {
    seats[p] = {
      glass: state.glass[p]!,
      panels: state.panels[p]!,
      kilns: kilnsOf(state.panels[p]!),
      // 别人从牌堆顶摸的图稿看不到内容
      sketches: state.sketches[p]!.map((s) => ({
        id: s.open || p === viewer || ended ? s.id : null,
        tier: panelOf(s.id).tier,
        open: s.open,
      })),
      claimed: state.claimed[p]!,
      hot: state.hot[p] === true,
      tiers: tiersOf(state.panels[p]!),
      score: scoreOf(state.panels[p]!, state.claimed[p]!),
    };
  }
  return {
    players: state.players,
    startPlayer: state.startPlayer,
    turn: state.turn,
    round: state.round,
    phase: state.phase,
    finalRound: state.finalRound,
    target: TARGET_POINTS,
    bag: state.bag,
    gold: state.gold,
    rack: state.rack,
    rackIds: state.rackIds,
    rackSize: rackSize(state.players.length),
    deckCounts: { 1: state.decks[1].length, 2: state.decks[2].length, 3: state.decks[3].length },
    gallery: state.gallery,
    commissions: state.commissions,
    seats,
    mustDiscard: state.mustDiscard,
    log: state.log,
    scores: state.scores,
    winner: state.winner,
    me: viewer !== null && state.players.includes(viewer) ? { id: viewer } : null,
  };
}

/* ---------- 试玩机器人 ---------- */

/**
 * 机器人的两种打法：
 * - sprawl「铺摊子」：什么便宜烧什么，靠炉色和光谱慢慢攒分；
 * - climb「攀高枝」：先搭九个炉色，之后只盯着能加分的窗片（带声望的，或者能凑成光谱、联窗的）。
 */
export type BotStyle = 'sprawl' | 'climb';

/** 同一个机器人整局用同一种打法，由它的 id 决定 */
function styleOf(player: PlayerId): BotStyle {
  let h = 0;
  for (let i = 0; i < player.length; i++) h = (h * 31 + player.charCodeAt(i)) >>> 0;
  return h % 2 === 0 ? 'climb' : 'sprawl';
}

export function chooseAction(state: GlassworksState, player: PlayerId, rng: Rng, style: BotStyle): GlassworksAction | null {
  if (state.phase !== 'play' || state.turn !== player) return null;
  const glass = state.glass[player]!;
  const kilns = kilnsOf(state.panels[player]!);
  const mine = state.sketches[player]!.map((s) => s.id);
  const built = state.panels[player]!;
  const engine = built.length;
  const scoreNow = scoreOf(built, []).total;
  /** 烧成这块能多几分：窗片自己的声望，加上它凑成的光谱、联窗 */
  const gainOf = (id: string) => scoreOf([...built, id], []).total - scoreNow;
  // 攀高枝：炉色够用之后不再看不加分的小窗
  const picky = style === 'climb' && engine >= 9;
  const visible = [...mine, ...TIERS.flatMap((t) => state.gallery[t].filter((id): id is string => id !== null))].filter(
    (id) => !picky || gainOf(id) > 0 || mine.includes(id),
  );

  // 委托还缺哪些炉色：朝着它们走的窗片更值钱
  const wanted = zeroHues();
  for (const id of state.commissions) {
    for (const hue of HUES) if ((commissionOf(id).need[hue] ?? 0) > kilns[hue]) wanted[hue] += 1;
  }
  const worth = (id: string) => {
    const def = panelOf(id);
    const scarce = kilns[def.hue] === Math.min(...HUES.map((h) => kilns[h])) ? 0.6 : 0;
    if (picky) return gainOf(id) * 3 + 0.5 + Math.min(1.2, wanted[def.hue] * 0.4);
    return gainOf(id) * 2.2 + 1.4 + Math.min(1.2, wanted[def.hue] * 0.4) + scarce;
  };

  if (state.mustDiscard > 0) {
    const target = visible.slice().sort((a, b) => worth(b) / (1 + missingFor(glass, kilns, b).total) - worth(a) / (1 + missingFor(glass, kilns, a).total))[0];
    const keep = target ? panelOf(target).cost : {};
    const spare: Piece[] = [];
    const left = { ...glass };
    while (spare.length < state.mustDiscard) {
      // 先放回对目标没用的、手里最多的那种
      const choice = HUES.filter((h) => left[h] > 0).sort(
        (a, b) => left[b] - Math.max(0, (keep[b] ?? 0) - kilns[b]) - (left[a] - Math.max(0, (keep[a] ?? 0) - kilns[a])),
      )[0];
      const piece: Piece = choice ?? 'gold';
      left[piece] -= 1;
      spare.push(piece);
    }
    return { type: 'discard', pieces: spare };
  }

  // 炉子还热着时，这一回合接着烧可以少付 1 块；去取料的话余温就没了，所以后面算缺口时不算它
  const affordable = visible.filter((id) => paymentFor(glass, kilns, id, state.hot[player]) !== null).sort((a, b) => worth(b) - worth(a));
  if (affordable[0]) return { type: 'build', panel: affordable[0] };

  const ranked = visible
    .map((id) => ({ id, miss: missingFor(glass, kilns, id) }))
    .sort((a, b) => worth(b.id) / (1 + b.miss.total) - worth(a.id) / (1 + a.miss.total) || (rng() < 0.5 ? -1 : 1));

  // 在晾架上找一段最值得拿的料：眼下目标要用的最值钱，其次是后面几个目标要用的；
  // 手里还宽裕时，多拿一块暂时用不上的也比空着手强
  const held = PIECES.reduce((sum, p) => sum + glass[p], 0);
  const later = zeroHues();
  for (const r of ranked.slice(1, 4)) for (const hue of HUES) later[hue] = Math.max(later[hue], r.miss.byHue[hue]);
  const target = ranked[0];
  if (target && state.rack.length > 0) {
    let best: { from: number; count: number; value: number; useful: number } | null = null;
    for (let from = 0; from < state.rack.length; from++) {
      for (let count = 1; count <= TAKE_LIMIT && from + count <= state.rack.length; count++) {
        const need = { ...target.miss.byHue };
        const soon = { ...later };
        let value = 0;
        let useful = 0;
        for (const hue of state.rack.slice(from, from + count)) {
          if (need[hue] > 0) {
            need[hue] -= 1;
            value += 2;
            useful += 1;
          } else if (soon[hue] > 0) {
            soon[hue] -= 1;
            value += 1;
          } else {
            value += 0.3;
          }
        }
        // 拿了就得放回去的料不算数
        value -= Math.max(0, held + count - HAND_LIMIT) * 2.5;
        if (!best || value > best.value) best = { from, count, value, useful };
      }
    }
    // 一块有用的都没有、图稿又没满时，不如去描样拿金箔
    if (best && (best.useful > 0 || best.value >= 1.6 || mine.length >= SKETCH_LIMIT)) {
      return { type: 'take', from: best.from, count: best.count };
    }
  }

  // 晾架帮不上忙：把最想要的窗片收作图稿，顺便拿一片金箔
  const top = ranked.find((r) => !mine.includes(r.id));
  if (top && mine.length < SKETCH_LIMIT) {
    const def = panelOf(top.id);
    return { type: 'sketch', tier: def.tier, slot: state.gallery[def.tier].indexOf(top.id) };
  }
  if (state.rack.length > 0) return { type: 'take', from: Math.floor(rng() * state.rack.length), count: 1 };
  return { type: 'pass' };
}

function botAction(state: GlassworksState, player: PlayerId, rng: Rng): GlassworksAction | null {
  return chooseAction(state, player, rng, styleOf(player));
}

export const glassworks: GameDefinition<GlassworksState, GlassworksAction, GlassworksView, GlassworksOptions> = {
  id: 'glassworks',
  name: '琉璃工坊',
  tagline: '取料、烧窗、承接委托。用炉色搭起你的彩窗作坊。2–4 人。',
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
