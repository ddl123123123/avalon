import { GameError, pick, shuffle, type GameDefinition, type PlayerId } from '../../framework';
import {
  ROUND_LIMIT, caches, channelName, channels, crews, forecasts, parts, routeName, routes, sites,
  type Channel, type Crew, type Forecast, type Part, type Reading, type Route, type Site,
} from './rules';

export * from './rules';

type PartStatus = 'missing' | 'recovered' | 'installed';
type Outcome = 'rescued' | 'storm' | 'abandoned';
type Order =
  | { kind: 'move'; to: Site }
  | { kind: 'fit'; part: Part }
  | { kind: 'send'; channel: Channel }
  | { kind: 'listen' | 'guide' | 'salvage' | 'wait' };
type Choice = { label: string; detail: string; order: Order };
type RoundLog = { round: number; forecast: string; events: string[] };

interface GreyTideState {
  crew: Record<Crew, PlayerId>;
  positions: Record<Crew, Site>;
  parts: Record<Part, PartStatus>;
  signal: Channel;
  readingOrder: Reading[];
  heard: number;
  weather: Forecast[];
  round: number;
  plans: Partial<Record<Crew, Order>>;
  history: RoundLog[];
  outcome: Outcome | null;
}

export interface GreyTideView {
  crew: GreyTideState['crew'];
  positions: GreyTideState['positions'];
  parts: GreyTideState['parts'];
  round: number;
  forecast: Forecast;
  readings: { field: Reading; value: string }[];
  history: RoundLog[];
  outcome: Outcome | null;
  revealedChannel: Channel | null;
  ready: Crew[];
  yourCrew: Crew | null;
  yourPlan: Choice | null;
  choices: Choice[];
}

type Action = { type: 'plan'; round: number; order: unknown } | { type: 'end'; round: number };
const crewOrder = ['signal', 'mechanic'] as const;
const partIds = ['bracket', 'wire'] as const;
const channelIds = Object.keys(channels) as Channel[];
const routeIds = Object.keys(routes) as Route[];

function crewOf(state: GreyTideState, player: PlayerId | null) {
  return crewOrder.find((crew) => state.crew[crew] === player) ?? null;
}

function currentForecast(state: GreyTideState) {
  return state.weather[state.round - 1];
}

function choicesFor(state: GreyTideState, crew: Crew): Choice[] {
  const site = state.positions[crew];
  const closure = currentForecast(state).closure;
  const available: Choice[] = [];
  const cachedPart = caches[site];

  if (crew === 'signal' && site === 'radio') {
    if (state.heard < state.readingOrder.length) {
      available.push({ label: '监听求救信号', detail: '解读一条航向或闪灯线索。', order: { kind: 'listen' } });
    }
    if (closure) {
      available.push({
        label: '指引搭档过封路',
        detail: `本轮搭档可通过 ${routeName(closure)}。需要对方选择对应的移动。`,
        order: { kind: 'guide' },
      });
    }
    const statuses = Object.values(state.parts);
    if (state.heard > 0 && statuses.includes('installed') && !statuses.includes('missing')) {
      for (const channel of channelIds) {
        available.push({
          label: `发信号 · ${channelName(channel)}`,
          detail: '灯塔必须在发信前修好。发错信号会额外跳过一轮潮况。',
          order: { kind: 'send', channel },
        });
      }
    }
  }

  if (cachedPart && state.parts[cachedPart] === 'missing') {
    available.push({
      label: `收集${parts[cachedPart]}`,
      detail: '放入共用工具箱，搭档也可以使用。',
      order: { kind: 'salvage' },
    });
  }
  if (crew === 'mechanic' && site === 'lamp') {
    for (const part of partIds) {
      if (state.parts[part] === 'recovered') {
        available.push({ label: `装好${parts[part]}`, detail: '两件部件都装好后，灯塔就能引航。', order: { kind: 'fit', part } });
      }
    }
  }

  for (const route of routeIds) {
    const [a, b] = routes[route];
    const to = a === site ? b : b === site ? a : null;
    if (!to) continue;
    if (route === closure && crew === 'signal') continue;
    const detail = route === closure
      ? '此路封闭。只有信号员本轮指引时才能通过。'
      : '沿开放通道移动。';
    available.push({ label: `前往${sites[to]}`, detail, order: { kind: 'move', to } });
  }

  available.push({ label: '原地等待', detail: '给搭档留出行动时间。', order: { kind: 'wait' } });
  return available;
}

function sameOrder(order: Order, raw: unknown) {
  if (!raw || typeof raw !== 'object') return false;
  const input = raw as Record<string, unknown>;
  if (input.kind !== order.kind) return false;
  switch (order.kind) {
    case 'move': return input.to === order.to;
    case 'fit': return input.part === order.part;
    case 'send': return input.channel === order.channel;
    default: return true;
  }
}

function resolve(state: GreyTideState): GreyTideState {
  const plans = state.plans;
  const forecast = currentForecast(state);
  const positions = { ...state.positions };
  const stock = { ...state.parts };
  const events: string[] = [];
  let heard = state.heard;
  let advance = 1;
  let outcome: Outcome | null = null;
  const guided = plans.signal?.kind === 'guide';

  if (guided && forecast.closure) events.push(`信号员为搭档标出了绕过 ${routeName(forecast.closure)} 的路。`);

  for (const crew of crewOrder) {
    const order = plans[crew];
    if (order?.kind !== 'move') continue;
    if (forecast.closure && !guided) {
      const [a, b] = routes[forecast.closure];
      const from = positions[crew];
      if ((from === a && order.to === b) || (from === b && order.to === a)) {
        events.push(`${crews[crew]}被封路拦住，留在${sites[from]}。`);
        continue;
      }
    }
    positions[crew] = order.to;
    events.push(`${crews[crew]}抵达${sites[order.to]}。`);
  }

  for (const crew of crewOrder) {
    const order = plans[crew];
    switch (order?.kind) {
      case 'listen': {
        const field = state.readingOrder[heard++];
        events.push(`信号员截获一条线索：${channels[state.signal][field]}。`);
        break;
      }
      case 'salvage': {
        const part = caches[positions[crew]]!;
        if (stock[part] === 'missing') {
          stock[part] = 'recovered';
          events.push(`${crews[crew]}找到了${parts[part]}。`);
        } else {
          events.push(`${crews[crew]}准备收集时，${parts[part]}已由搭档取走。`);
        }
        break;
      }
      case 'fit':
        stock[order.part] = 'installed';
        events.push(`维修员装好了${parts[order.part]}。`);
        break;
      case 'wait':
        events.push(`${crews[crew]}留在${sites[positions[crew]]}等待。`);
        break;
    }
  }

  if (plans.signal?.kind === 'send') {
    const { channel } = plans.signal;
    if (!partIds.every((part) => stock[part] === 'installed')) {
      events.push('灯塔的部件还没装齐，引航信号未能发出。');
    } else if (channel === state.signal) {
      outcome = 'rescued';
      events.push(`正确的引航信号已发出：${channelName(channel)}。船只驶过了礁区。`);
    } else {
      advance += 1;
      events.push(`发出的 ${channelName(channel)} 无人回应。寻找回音耗去一轮时间。`);
    }
  }

  const nextRound = state.round + advance;
  if (!outcome && nextRound > ROUND_LIMIT) outcome = 'storm';
  return {
    ...state,
    positions,
    parts: stock,
    heard,
    plans: {},
    round: outcome ? state.round : nextRound,
    history: [...state.history, { round: state.round, forecast: forecast.name, events }],
    outcome,
  };
}

export const greyTide: GameDefinition<GreyTideState, Action, GreyTideView, Record<string, never>> = {
  id: 'grey-tide',
  name: '灰潮灯塔',
  tagline: '双人协作，在暴潮前点亮灯塔',
  minPlayers: 2,
  maxPlayers: 2,
  defaultOptions: () => ({}),
  normalizeOptions: () => ({}),
  validateOptions: (_, count) => count === 2 ? null : '等两位玩家入座后开局',
  setup: ([signal, mechanic], _, rng) => ({
    crew: { signal, mechanic },
    positions: { signal: 'radio', mechanic: 'workshop' },
    parts: { bracket: 'missing', wire: 'missing' },
    signal: pick(channelIds, rng),
    readingOrder: shuffle(['direction', 'flash'], rng),
    heard: 0,
    weather: shuffle(forecasts, rng),
    round: 1,
    plans: {},
    history: [],
    outcome: null,
  }),
  reduce(state, player, action, _rng, context) {
    const crew = crewOf(state, player);
    if (!crew || state.outcome) throw new GameError('你无法在这局行动');
    if (!action || action.round !== state.round) throw new GameError('潮况已经更新，请重新选择');
    if (action.type === 'end' && context?.hostId === player) return { ...state, outcome: 'abandoned' };
    if (action.type !== 'plan') throw new GameError('当前不能结束游戏');
    if (state.plans[crew]) throw new GameError('本轮行动已经提交');
    const choice = choicesFor(state, crew).find(({ order }) => sameOrder(order, action.order));
    if (!choice) throw new GameError('请选择一个可用的行动');
    const next = { ...state, plans: { ...state.plans, [crew]: choice.order } };
    return next.plans.signal && next.plans.mechanic ? resolve(next) : next;
  },
  view(state, player) {
    const crew = crewOf(state, player);
    const choices = crew && !state.outcome ? choicesFor(state, crew) : [];
    const plan = crew ? state.plans[crew] : null;
    return {
      crew: state.crew,
      positions: state.positions,
      parts: state.parts,
      round: state.round,
      forecast: currentForecast(state),
      readings: state.readingOrder.slice(0, state.heard).map((field) => ({ field, value: channels[state.signal][field] })),
      history: state.history,
      outcome: state.outcome,
      revealedChannel: state.outcome ? state.signal : null,
      ready: crewOrder.filter((role) => state.plans[role]),
      yourCrew: crew,
      yourPlan: plan ? choices.find(({ order }) => sameOrder(order, plan)) ?? null : null,
      choices: plan ? [] : choices,
    };
  },
  isOver: (state) => state.outcome !== null,
};
