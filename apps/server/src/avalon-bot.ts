import { Avalon, type PlayerId, type RoomPlayer } from '@tabletop/shared';
import { avalonBotSystem } from './avalon-skills';

export interface BotModelProfile {
  id: string;
  label: string;
  model: string;
  endpoint: string;
  key?: string;
  disableThinking: boolean;
}

export interface BotModelDirectory {
  profiles: Map<string, BotModelProfile>;
  roles: Partial<Record<Avalon.Role, string>>;
}

const defaultProfile = 'deepseek';
export const localBotModel = 'local';

function json(raw: string | undefined): unknown {
  try { return raw ? JSON.parse(raw) : null; } catch { return null; }
}

function endpointFor(base: unknown): string | null {
  if (typeof base !== 'string' || !base.trim()) return null;
  try {
    const endpoint = new URL(`${base.trim().replace(/\/+$/, '')}/chat/completions`);
    return ['https:', 'http:'].includes(endpoint.protocol) && !endpoint.username && !endpoint.password &&
      !endpoint.search && !endpoint.hash ? endpoint.toString() : null;
  } catch { return null; }
}

export function botModelDirectory(env: NodeJS.ProcessEnv): BotModelDirectory {
  const profiles = new Map<string, BotModelProfile>();
  const key = env.DEEPSEEK_API_KEY?.trim();
  const endpoint = endpointFor(env.DEEPSEEK_BASE_URL?.trim() || 'https://api.deepseek.com');
  if (key && endpoint) {
    const model = env.DEEPSEEK_MODEL?.trim() || 'deepseek-flash';
    profiles.set(defaultProfile, {
      id: defaultProfile, label: `DeepSeek · ${model}`, model, endpoint, key,
      disableThinking: model === 'deepseek-flash' || model === 'deepseek-v4-pro',
    });
  }
  const additional = json(env.AVALON_BOT_MODELS);
  const secrets = json(env.AVALON_BOT_API_KEYS);
  if (Array.isArray(additional)) {
    for (const value of additional.slice(0, 24)) {
      if (!value || typeof value !== 'object') continue;
      const { id, label, model, baseUrl, apiKeyEnv, disableThinking } = value as Record<string, unknown>;
      if (typeof id !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,39}$/.test(id) || id === defaultProfile ||
          id === localBotModel || profiles.has(id) || typeof label !== 'string' || !label.trim() ||
          typeof model !== 'string' || !model.trim()) continue;
      const url = endpointFor(baseUrl);
      if (!url) continue;
      if (apiKeyEnv != null && (typeof apiKeyEnv !== 'string' || !/^[A-Z][A-Z0-9_]*$/.test(apiKeyEnv))) continue;
      const savedKey = typeof apiKeyEnv === 'string' && secrets && typeof secrets === 'object'
        ? (secrets as Record<string, unknown>)[apiKeyEnv] : undefined;
      const profileKey = typeof apiKeyEnv === 'string'
        ? env[apiKeyEnv]?.trim() || (typeof savedKey === 'string' ? savedKey.trim() : undefined) : undefined;
      if (apiKeyEnv && !profileKey) continue;
      profiles.set(id, { id, label: label.trim().slice(0, 64), model: model.trim(), endpoint: url,
        key: profileKey, disableThinking: disableThinking === true });
    }
  }
  const requested = json(env.AVALON_BOT_ROLE_MODELS);
  const roles: BotModelDirectory['roles'] = {};
  if (requested && typeof requested === 'object') {
    for (const role of Object.keys(Avalon.ROLES) as Avalon.Role[]) {
      const id = (requested as Record<string, unknown>)[role];
      if (typeof id === 'string' && (id === localBotModel || profiles.has(id))) roles[role] = id;
    }
  }
  return { profiles, roles };
}

export function modelFor(directory: BotModelDirectory, role: Avalon.Role, override?: string) {
  const selected = override ?? directory.roles[role];
  return selected ? directory.profiles.get(selected) : speechEditorFor(directory);
}

export function speechEditorFor(directory: BotModelDirectory) {
  return directory.profiles.get(defaultProfile) ?? directory.profiles.values().next().value;
}

export type BotAction = Avalon.AvalonAction;
type Decision = Extract<BotAction, { type: 'draft_team' | 'propose_team' | 'finish_speech' | 'vote' | 'quest' | 'lady' | 'assassinate' }>;
export interface BotMemory {
  actions: Record<string, unknown>[];
  note: string;
}

export function needsAvalonModel(action: BotAction): action is Decision {
  return action.type !== 'confirm_role' && action.type !== 'start_discussion' &&
    action.type !== 'timeout_speech' && action.type !== 'submit_speech';
}

export function decisionToken(view: Avalon.AvalonView, actionType: BotAction['type']) {
  return [view.phase, view.questIndex, view.rejectCount, view.leader, view.discussion?.turn, actionType].join(':');
}

function getSeats(players: RoomPlayer[]) {
  const numbers = new Map(players.map((player) => [player.id, player.seatIndex + 1]));
  const ids = new Map(players.map((player) => [player.seatIndex + 1, player.id]));
  return { seat: (id: PlayerId | null | undefined) => id == null ? null : numbers.get(id) ?? null, ids };
}

export function rememberAction(memory: BotMemory, view: Avalon.AvalonView, action: BotAction, players: RoomPlayer[]) {
  const { seat } = getSeats(players);
  const info = 'team' in action ? { team: action.team.map(seat) } :
    'target' in action ? { target: seat(action.target) } :
    'approve' in action ? { approve: action.approve } :
    'success' in action ? { success: action.success } : {};
  memory.actions.push({ quest: view.questIndex + 1, attempt: view.rejectCount + 1, action: action.type, ...info });
}

function targets(type: 'lady' | 'assassinate', view: Avalon.AvalonView) {
  return type === 'assassinate' ? view.me!.assassinationTargets
    : view.players.filter((player) => player !== view.me!.id && !view.lady?.pastHolders.includes(player));
}

function instructions(view: Avalon.AvalonView, action: Decision, players: RoomPlayer[]) {
  const { seat } = getSeats(players);
  switch (action.type) {
    case 'draft_team':
    case 'propose_team': return { action: action.type, fields: { team: '座位号数组' }, size: view.questSizes[view.questIndex] };
    case 'finish_speech': return { action: 'text_speech', fields: { speech: '全桌可见的一段中文发言' } };
    case 'vote': return { action: 'vote', fields: { approve: '布尔值，是否赞成' } };
    case 'quest': return { action: 'quest', fields: { success: '布尔值，true 成功，false 失败' },
      permitted: view.me?.alignment === 'good' ? [true] : [true, false] };
    case 'lady':
    case 'assassinate': return { action: action.type, fields: { target: '一个座位号' }, permitted: targets(action.type, view).map(seat) };
  }
}

export function makeBotContext(view: Avalon.AvalonView, players: RoomPlayer[], memory: BotMemory, action: Decision) {
  const { seat } = getSeats(players);
  const me = view.me!;
  const speechBudget = Math.min(640, Math.max(90, Math.floor(24_000 / Math.max(1, view.speeches.length))));
  return {
    instruction: instructions(view, action, players),
    self: {
      seat: seat(me.id), role: Avalon.ROLES[me.role].name, alignment: me.alignment,
      sightings: Object.entries(me.sightings).map(([id, sighting]) => ({
        seat: seat(id),
        clue: sighting === 'evil' ? '确认邪恶' : view.roleSet.includes('morgana') ? '梅林或莫甘娜，未区分' : '梅林',
        knownRole: me.knownRoles[id] ? Avalon.ROLES[me.knownRoles[id]].name : undefined,
      })),
      ladyResults: Object.entries(me.ladyResults).map(([id, alignment]) => ({ seat: seat(id), alignment })),
    },
    table: {
      seats: players.map(({ seatIndex, isBot }) => ({ seat: seatIndex + 1, bot: isBot })),
      roles: view.roleSet.map((role) => Avalon.ROLES[role].name), quest: view.questIndex + 1,
      attempt: view.rejectCount + 1, rejects: view.rejectCount, questSizes: view.questSizes,
      failsRequired: view.failsRequired, leader: seat(view.leader), team: view.team.map(seat),
      preselectedTeam: view.discussion?.preselectedTeam ?? false,
      speechOrder: view.discussion?.order.map(seat),
      proposals: view.proposals.map(({ questIndex, attempt, leader, team, votes, approved }) => ({
        quest: questIndex + 1, attempt, leader: seat(leader), team: team.map(seat), approved,
        votes: Object.entries(votes).map(([player, approve]) => ({ seat: seat(player), approve })),
      })),
      quests: view.quests.map(({ questIndex, leader, team, fails, success }) => ({
        quest: questIndex + 1, leader: seat(leader), team: team.map(seat), fails, success,
      })),
      speeches: view.speeches.map(({ questIndex, attempt, player, text, result }) => ({
        quest: questIndex + 1, attempt, seat: seat(player), result,
        text: text.length <= speechBudget ? text : `${text.slice(0, speechBudget - 40)}…${text.slice(-32)}`,
      })),
      ladyInspections: view.lady?.inspections.map(({ by, target, afterQuest }) => ({
        by: seat(by), target: seat(target), afterQuest: afterQuest + 1,
      })),
    },
    memory,
  };
}

export function decodeAvalonBotReply(content: string, view: Avalon.AvalonView, players: RoomPlayer[], decision: Decision) {
  const parsed = json(content.trim().replace(/^```(?:json)?\s*|\s*```$/gi, ''));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const reply = parsed as Record<string, unknown>;
  const { ids } = getSeats(players);
  const idFor = (seat: unknown) => typeof seat === 'number' ? ids.get(seat) : undefined;
  let action: BotAction | undefined;
  switch (decision.type) {
    case 'draft_team':
    case 'propose_team': {
      if (!Array.isArray(reply.team)) return null;
      const team = reply.team.map(idFor);
      if (team.length !== view.questSizes[view.questIndex] || new Set(team).size !== team.length ||
          team.some((id) => !id || !view.players.includes(id))) return null;
      action = { type: decision.type, team: team as PlayerId[] };
      break;
    }
    case 'finish_speech': {
      if (!view.discussion || typeof reply.speech !== 'string' || !reply.speech.trim()) return null;
      action = { type: 'submit_speech', turn: view.discussion.turn, text: reply.speech.trim().slice(0, 480) };
      break;
    }
    case 'vote':
      if (typeof reply.approve !== 'boolean') return null;
      action = { type: 'vote', approve: reply.approve };
      break;
    case 'quest':
      if (typeof reply.success !== 'boolean' || (reply.success === false && view.me?.alignment !== 'evil')) return null;
      action = { type: 'quest', success: reply.success };
      break;
    case 'lady':
    case 'assassinate': {
      const target = idFor(reply.target);
      if (!target || !targets(decision.type, view).includes(target)) return null;
      action = { type: decision.type, target };
      break;
    }
  }
  if (!action) return null;
  return { action, note: typeof reply.memory === 'string' ? reply.memory.trim().slice(0, 900) : '' };
}

export async function askAvalonBot(
  profile: BotModelProfile, view: Avalon.AvalonView, players: RoomPlayer[], memory: BotMemory,
  action: Decision, signal: AbortSignal,
) {
  if (!view.me) return null;
  const response = await fetch(profile.endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(profile.key ? { authorization: `Bearer ${profile.key}` } : {}) },
    body: JSON.stringify({
      model: profile.model,
      ...(profile.disableThinking ? { thinking: { type: 'disabled' } } : {}),
      messages: [
        { role: 'system', content: avalonBotSystem(view.me.role, view.me.alignment, view.options.botDifficulty) },
        { role: 'user', content: JSON.stringify(makeBotContext(view, players, memory, action)) },
      ],
      max_tokens: 900, stream: false,
    }),
    signal,
    redirect: 'error',
  });
  if (!response.ok) return null;
  const body = await response.json() as { choices?: { message?: { content?: unknown } }[] };
  const content = body.choices?.[0]?.message?.content;
  return typeof content === 'string' ? decodeAvalonBotReply(content, view, players, action) : null;
}
