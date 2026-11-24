import { GameError, pick, shuffle, type GameDefinition, type PlayerId, type Rng } from '../../framework';
import {
  NIGHT_LIMIT, TARGET_SCORE, professionIds, shadowCount, siteOrder, type Faction, type Profession, type Site,
} from './rules';

export * from './rules';

type Score = Record<Faction, number>;
type Verdict = Faction | 'draw';
type Phase = 'draft' | 'night' | 'dawn' | 'ended';
type SiteResult = { site: Site; power: Score; winner: Faction | null; points: number };
type NightResult = { night: number; focus: Site; sites: SiteResult[]; earned: Score };

interface NinjaState {
  players: PlayerId[];
  shadows: PlayerId[];
  night: number;
  phase: Phase;
  focus: Site;
  offers: Record<PlayerId, Profession[]>;
  drafted: Partial<Record<PlayerId, Profession | null>>;
  visits: Partial<Record<PlayerId, Site | null>>;
  scores: Score;
  history: NightResult[];
  winner: Verdict | null;
}

export interface NinjaView {
  night: number;
  phase: Phase;
  focus: Site;
  faction: Faction | null;
  offers: Profession[];
  profession: Profession | null;
  target: Site | null;
  waiting: PlayerId[];
  scores: Score;
  history: NightResult[];
  winner: Verdict | null;
  revealedShadows: PlayerId[] | null;
}

type Action =
  | { type: 'draft'; night: number; profession: Profession }
  | { type: 'visit'; night: number; site: Site }
  | { type: 'settle_offline'; night: number; phase: 'draft' | 'night' }
  | { type: 'next_night'; night: number };

const zero = (): Score => ({ guard: 0, shadow: 0 });
const opponent = (faction: Faction): Faction => faction === 'guard' ? 'shadow' : 'guard';

function factionOf(state: NinjaState, player: PlayerId): Faction {
  return state.shadows.includes(player) ? 'shadow' : 'guard';
}

function secretOffers(players: PlayerId[], rng: Rng): NinjaState['offers'] {
  return Object.fromEntries(players.map((player) => [player, shuffle(professionIds, rng).slice(0, 3)]));
}

function waitingPlayers(state: NinjaState): PlayerId[] {
  if (state.phase === 'draft') return state.players.filter((player) => !Object.hasOwn(state.drafted, player));
  if (state.phase === 'night') return state.players.filter((player) => state.drafted[player] && !Object.hasOwn(state.visits, player));
  return [];
}

function settle(state: NinjaState): NinjaState {
  const powers = { gate: zero(), court: zero(), tower: zero() };
  const mists = { gate: zero(), court: zero(), tower: zero() };
  const visitors = { gate: zero(), court: zero(), tower: zero() };

  for (const player of state.players) {
    const site = state.visits[player];
    if (site) visitors[site][factionOf(state, player)]++;
  }

  for (const player of state.players) {
    const site = state.visits[player];
    const profession = state.drafted[player];
    if (!site || !profession) continue;
    const faction = factionOf(state, player);
    const power = powers[site];
    const joined = visitors[site][faction] > 1;

    switch (profession) {
      case 'keeper':
        power[faction] += 2;
        break;
      case 'pathfinder': {
        const next = siteOrder[(siteOrder.indexOf(site) + 1) % siteOrder.length];
        power[faction]++;
        powers[next][faction]++;
        break;
      }
      case 'mist':
        power[faction]++;
        mists[site][opponent(faction)]++;
        break;
      case 'loner':
        power[faction] += joined ? 1 : 2;
        break;
      case 'stargazer':
        power[faction] += site === state.focus ? 3 : 1;
        break;
      case 'seal':
        power[faction] += joined ? 2 : 1;
        break;
    }
  }

  if (state.players.length % 2 === 1 && visitors[state.focus].shadow > 0) powers[state.focus].shadow++;

  const earned = zero();
  const sites = siteOrder.map((site): SiteResult => {
    const power = {
      guard: Math.max(0, powers[site].guard - mists[site].guard),
      shadow: Math.max(0, powers[site].shadow - mists[site].shadow),
    };
    const winner = power.guard === power.shadow ? null : power.guard > power.shadow ? 'guard' : 'shadow';
    const points = winner ? site === state.focus ? 2 : 1 : 0;
    if (winner) earned[winner] += points;
    return { site, power, winner, points };
  });
  const scores = { guard: state.scores.guard + earned.guard, shadow: state.scores.shadow + earned.shadow };
  const leader = scores.guard === scores.shadow ? null : scores.guard > scores.shadow ? 'guard' : 'shadow';
  const winner = state.night === NIGHT_LIMIT ? leader ?? 'draw' :
    leader && scores[leader] >= TARGET_SCORE ? leader : null;
  return {
    ...state,
    scores,
    history: [...state.history, { night: state.night, focus: state.focus, sites, earned }],
    phase: winner ? 'ended' : 'dawn',
    winner,
  };
}

function advance(state: NinjaState): NinjaState {
  if (waitingPlayers(state).length > 0) return state;
  if (state.phase === 'draft') {
    const next = { ...state, phase: 'night' as const };
    return waitingPlayers(next).length > 0 ? next : settle(next);
  }
  return settle(state);
}

export const ninjaNight: GameDefinition<NinjaState, Action, NinjaView, Record<string, never>> = {
  id: 'ninja-night',
  name: '忍者之夜：密令',
  tagline: '暗选职业，夜夺三处阵眼',
  minPlayers: 4,
  maxPlayers: 8,
  playerCountOptions: { defaultCount: 4, recommendedOptions: () => ({}) },
  defaultOptions: () => ({}),
  normalizeOptions: () => ({}),
  validateOptions: (_, count) => count >= 4 && count <= 8 ? null : '需要 4 到 8 人才能开局',
  setup: (players, _, rng) => ({
    players,
    shadows: shuffle(players, rng).slice(0, shadowCount(players.length)),
    night: 1,
    phase: 'draft',
    focus: pick(siteOrder, rng),
    offers: secretOffers(players, rng),
    drafted: {},
    visits: {},
    scores: zero(),
    history: [],
    winner: null,
  }),
  reduce(state, player, action, rng, context) {
    if (state.winner || !state.players.includes(player)) throw new GameError('你无法在这局行动');
    if (!action || action.night !== state.night) throw new GameError('当前夜晚已更新');

    switch (action.type) {
      case 'draft':
        if (state.phase !== 'draft' || Object.hasOwn(state.drafted, player)) throw new GameError('现在不能再选职业');
        if (!state.offers[player].includes(action.profession)) throw new GameError('请选择这夜发给你的职业');
        return advance({ ...state, drafted: { ...state.drafted, [player]: action.profession } });
      case 'visit':
        if (state.phase !== 'night' || !state.drafted[player] || Object.hasOwn(state.visits, player)) {
          throw new GameError('现在不能再选阵眼');
        }
        if (!siteOrder.includes(action.site)) throw new GameError('请选择有效的阵眼');
        return advance({ ...state, visits: { ...state.visits, [player]: action.site } });
      case 'settle_offline': {
        if (state.phase !== action.phase || (state.phase !== 'draft' && state.phase !== 'night')) {
          throw new GameError('当前阶段已更新');
        }
        const waiting = waitingPlayers(state);
        if (context?.hostId !== player || !waiting.length || waiting.some((id) => !context.offlinePlayers.includes(id))) {
          throw new GameError('请等在线玩家提交后再跳过离线座位');
        }
        const skipped = Object.fromEntries(waiting.map((id) => [id, null]));
        return advance(state.phase === 'draft'
          ? { ...state, drafted: { ...state.drafted, ...skipped } }
          : { ...state, visits: { ...state.visits, ...skipped } });
      }
      case 'next_night':
        if (state.phase !== 'dawn' || context?.hostId !== player) throw new GameError('请等房主开启下一夜');
        return {
          ...state,
          night: state.night + 1,
          phase: 'draft',
          focus: pick(siteOrder.filter((site) => site !== state.focus), rng),
          offers: secretOffers(state.players, rng),
          drafted: {},
          visits: {},
        };
      default:
        throw new GameError('无法识别的行动');
    }
  },
  view(state, viewer) {
    const member = viewer !== null && state.players.includes(viewer) ? viewer : null;
    return {
      night: state.night,
      phase: state.phase,
      focus: state.focus,
      faction: member ? factionOf(state, member) : null,
      offers: member && state.phase === 'draft' && !Object.hasOwn(state.drafted, member) ? state.offers[member] : [],
      profession: member ? state.drafted[member] ?? null : null,
      target: member ? state.visits[member] ?? null : null,
      waiting: waitingPlayers(state),
      scores: state.scores,
      history: state.history,
      winner: state.winner,
      revealedShadows: state.winner ? state.shadows : null,
    };
  },
  isOver: (state) => state.winner !== null,
  botAction(state, player, rng) {
    if (!waitingPlayers(state).includes(player)) return null;
    if (state.phase === 'draft') return { type: 'draft', night: state.night, profession: pick(state.offers[player], rng) };
    const mainChance = state.drafted[player] === 'stargazer' ? 0.75 : 0.5;
    const site = rng() < mainChance ? state.focus : pick(siteOrder.filter((place) => place !== state.focus), rng);
    return { type: 'visit', night: state.night, site };
  },
};
