import { GameError, pick, shuffle, type GameDefinition, type PlayerId, type Rng } from '../../framework';
import {
  NIGHT_LIMIT, REQUIRED_MERIT, QUEEN_CHANCE, professionIds, ranks, shadowCount, siteOrder,
  type Faction, type Profession, type Rank, type Site,
} from './rules';

export * from './rules';

type Score = Record<Faction, number>;
type Verdict = Faction | 'draw';
type Phase = 'draft' | 'night' | 'dawn' | 'ended';
type SiteResult = { site: Site; power: Score; winner: Faction | null; merit: number };
type NightResult = { night: number; focus: Site; sites: SiteResult[] };
type Final = { winner: Verdict; queen: PlayerId | null; rank: Rank | null };

interface NinjaState {
  players: PlayerId[];
  shadows: PlayerId[];
  ranks: Record<PlayerId, Rank>;
  queen: PlayerId | null;
  merit: Record<PlayerId, number>;
  night: number;
  phase: Phase;
  focus: Site;
  offers: Record<PlayerId, Profession[]>;
  drafted: Partial<Record<PlayerId, Profession | null>>;
  visits: Partial<Record<PlayerId, Site | null>>;
  history: NightResult[];
  final: Final | null;
}

export interface NinjaView {
  night: number;
  phase: Phase;
  focus: Site;
  faction: Faction | null;
  rank: Rank | null;
  merit: number;
  hasQueen: boolean;
  offers: Profession[];
  profession: Profession | null;
  target: Site | null;
  waiting: PlayerId[];
  history: NightResult[];
  final: (Final & { seats: { id: PlayerId; faction: Faction; rank: Rank; merit: number }[] }) | null;
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

function resolveCourt(state: NinjaState, merit: NinjaState['merit']): Final {
  if (state.queen) return { winner: factionOf(state, state.queen), queen: state.queen, rank: null };

  for (const rank of ranks) {
    const eligible = state.players.filter((player) => state.ranks[player] === rank && (merit[player] ?? 0) >= REQUIRED_MERIT);
    if (eligible.length === 1) return { winner: factionOf(state, eligible[0]), queen: null, rank };
  }
  return { winner: 'draw', queen: null, rank: null };
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

  const sites = siteOrder.map((site): SiteResult => {
    const power = {
      guard: Math.max(0, powers[site].guard - mists[site].guard),
      shadow: Math.max(0, powers[site].shadow - mists[site].shadow),
    };
    const winner = power.guard === power.shadow ? null : power.guard > power.shadow ? 'guard' : 'shadow';
    const merit = winner ? site === state.focus ? 2 : 1 : 0;
    return { site, power, winner, merit };
  });
  const merit = { ...state.merit };
  for (const player of state.players) {
    const result = sites.find(({ site }) => state.visits[player] === site);
    if (result?.winner === factionOf(state, player)) merit[player] = (merit[player] ?? 0) + result.merit;
  }
  const final = state.night === NIGHT_LIMIT ? resolveCourt(state, merit) : null;
  return {
    ...state,
    merit,
    history: [...state.history, { night: state.night, focus: state.focus, sites }],
    phase: final ? 'ended' : 'dawn',
    final,
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
  name: '宫门夜令',
  tagline: '忠臣与反贼暗中争夺宫城',
  minPlayers: 4,
  maxPlayers: 10,
  playerCountOptions: { defaultCount: 4, recommendedOptions: () => ({}) },
  defaultOptions: () => ({}),
  normalizeOptions: () => ({}),
  validateOptions: (_, count) => count >= 4 && count <= 10 ? null : '需要 4 到 10 人才能开局',
  setup(players, _, rng) {
    const shuffled = shuffle(players, rng);
    const shadows = shuffled.slice(0, shadowCount(players.length));
    const guards = shuffled.slice(shadows.length);
    const ranksByPlayer = Object.fromEntries([shadows, guards].flatMap((faction) => {
      const shuffledRanks = shuffle(ranks, rng);
      return faction.map((player, index) => [player, shuffledRanks[index]]);
    }));
    return {
      players,
      shadows,
      ranks: ranksByPlayer,
      queen: rng() < QUEEN_CHANCE ? pick(players, rng) : null,
      merit: {},
      night: 1,
      phase: 'draft',
      focus: pick(siteOrder, rng),
      offers: secretOffers(players, rng),
      drafted: {},
      visits: {},
      history: [],
      final: null,
    };
  },
  reduce(state, player, action, rng, context) {
    if (state.final || !state.players.includes(player)) throw new GameError('你无法在这局行动');
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
      rank: member ? state.ranks[member] : null,
      merit: member ? state.merit[member] ?? 0 : 0,
      hasQueen: member !== null && state.queen === member,
      offers: member && state.phase === 'draft' && !Object.hasOwn(state.drafted, member) ? state.offers[member] : [],
      profession: member ? state.drafted[member] ?? null : null,
      target: member ? state.visits[member] ?? null : null,
      waiting: waitingPlayers(state),
      history: state.history,
      final: state.final ? {
        ...state.final,
        seats: state.players.map((id) => ({ id, faction: factionOf(state, id), rank: state.ranks[id], merit: state.merit[id] ?? 0 })),
      } : null,
    };
  },
  isOver: (state) => state.final !== null,
  botAction(state, player, rng) {
    if (!waitingPlayers(state).includes(player)) return null;
    if (state.phase === 'draft') return { type: 'draft', night: state.night, profession: pick(state.offers[player], rng) };
    const mainChance = state.drafted[player] === 'stargazer' ? 0.75 : 0.5;
    const site = rng() < mainChance ? state.focus : pick(siteOrder.filter((place) => place !== state.focus), rng);
    return { type: 'visit', night: state.night, site };
  },
};
