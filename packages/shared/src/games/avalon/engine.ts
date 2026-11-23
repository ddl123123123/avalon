import { GameError, pick, shuffle, type GameDefinition, type PlayerId, type Rng } from '../../framework';
import {
  LADY_AFTER_QUESTS,
  MAX_PLAYERS,
  MAX_REJECTS,
  MIN_PLAYERS,
  QUESTS_TO_WIN,
  ROLES,
  TEAM_SIZES,
  buildRoleDeck,
  defaultOptions,
  failsRequired,
  normalizeOptions,
  recommendedOptions,
  validateOptions,
  type Alignment,
  type AvalonOptions,
  type Role,
} from './rules';

export type AvalonPhase = 'team' | 'vote' | 'quest' | 'lady' | 'assassin' | 'ended';

export type WinReason =
  /** 三次任务失败 */
  | 'quests_failed'
  /** 连续五次组队被否决 */
  | 'rejects'
  /** 刺客刺中梅林 */
  | 'assassinated'
  /** 刺客认错了人 */
  | 'merlin_safe';

export interface ProposalRecord {
  questIndex: number;
  /** 本轮任务中的第几次组队，从 1 开始 */
  attempt: number;
  leader: PlayerId;
  team: PlayerId[];
  votes: Record<PlayerId, boolean>;
  approved: boolean;
}

export interface QuestRecord {
  questIndex: number;
  leader: PlayerId;
  team: PlayerId[];
  fails: number;
  success: boolean;
}

export interface LadyInspection {
  by: PlayerId;
  target: PlayerId;
  afterQuest: number;
}

export interface AvalonState {
  players: PlayerId[];
  roles: Record<PlayerId, Role>;
  options: AvalonOptions;
  phase: AvalonPhase;
  questIndex: number;
  leaderIndex: number;
  /** 当前任务已经被否决的组队次数 */
  rejectCount: number;
  team: PlayerId[];
  votes: Record<PlayerId, boolean>;
  questCards: Record<PlayerId, boolean>;
  proposals: ProposalRecord[];
  quests: QuestRecord[];
  lady: null | {
    holder: PlayerId;
    /** 曾经持有过湖中仙女的人，不能再被查验 */
    pastHolders: PlayerId[];
    inspections: LadyInspection[];
  };
  assassinTarget: PlayerId | null;
  winner: Alignment | null;
  winReason: WinReason | null;
}

export type AvalonAction =
  /** 队长调整候选队员，所有人实时可见 */
  | { type: 'draft_team'; team: PlayerId[] }
  /** 队长确定队伍，进入投票 */
  | { type: 'propose_team'; team: PlayerId[] }
  | { type: 'vote'; approve: boolean }
  | { type: 'quest'; success: boolean }
  | { type: 'lady'; target: PlayerId }
  | { type: 'assassinate'; target: PlayerId };

/** 我凭身份在夜晚得知的信息 */
export type Sighting =
  /** 梅林看到的邪恶方 / 邪恶方看到的同伴 */
  | 'evil'
  /** 派西维尔看到的梅林（或莫甘娜） */
  | 'merlin';

export interface AvalonView {
  players: PlayerId[];
  options: AvalonOptions;
  /** 本局在场的角色（公开信息，不含归属） */
  roleSet: Role[];
  phase: AvalonPhase;
  questIndex: number;
  leader: PlayerId;
  rejectCount: number;
  questSizes: number[];
  failsRequired: number[];
  team: PlayerId[];
  /** 已经投票 / 已经出任务牌的人（看不到内容） */
  voted: PlayerId[];
  played: PlayerId[];
  proposals: ProposalRecord[];
  quests: QuestRecord[];
  lady: null | {
    holder: PlayerId;
    pastHolders: PlayerId[];
    inspections: LadyInspection[];
  };
  /** 刺杀阶段公开刺客身份 */
  assassin: PlayerId | null;
  assassinTarget: PlayerId | null;
  winner: Alignment | null;
  winReason: WinReason | null;
  /** 游戏结束后公开全部身份 */
  roles: Record<PlayerId, Role> | null;
  me: null | {
    id: PlayerId;
    role: Role;
    alignment: Alignment;
    sightings: Record<PlayerId, Sighting>;
    /** 邪恶方已知同伴的具体角色；只下发给认识邪恶队友的玩家。 */
    knownRoles: Record<PlayerId, Role>;
    myVote: boolean | null;
    myQuestCard: boolean | null;
    /** 我用湖中仙女查验到的阵营 */
    ladyResults: Record<PlayerId, Alignment>;
  };
}

const alignmentOf = (role: Role): Alignment => ROLES[role].alignment;

function sightingsFor(state: AvalonState, viewer: PlayerId): Record<PlayerId, Sighting> {
  const role = state.roles[viewer]!;
  const seen: Record<PlayerId, Sighting> = {};
  for (const other of state.players) {
    if (other === viewer) continue;
    const otherRole = state.roles[other]!;
    if (role === 'merlin') {
      if (alignmentOf(otherRole) === 'evil' && otherRole !== 'mordred') seen[other] = 'evil';
    } else if (role === 'percival') {
      if (otherRole === 'merlin' || otherRole === 'morgana') seen[other] = 'merlin';
    } else if (alignmentOf(role) === 'evil' && role !== 'oberon') {
      if (alignmentOf(otherRole) === 'evil' && otherRole !== 'oberon') seen[other] = 'evil';
    }
  }
  return seen;
}

function knownRolesFor(state: AvalonState, viewer: PlayerId): Record<PlayerId, Role> {
  const role = state.roles[viewer]!;
  const known: Record<PlayerId, Role> = {};
  if (alignmentOf(role) !== 'evil' || role === 'oberon') return known;
  for (const [id, sighting] of Object.entries(sightingsFor(state, viewer))) {
    if (sighting === 'evil') known[id] = state.roles[id]!;
  }
  return known;
}

function setup(players: PlayerId[], options: AvalonOptions, rng: Rng): AvalonState {
  const deck = shuffle(buildRoleDeck(players.length, options), rng);
  const roles: Record<PlayerId, Role> = {};
  players.forEach((id, i) => (roles[id] = deck[i]!));
  const leaderIndex = Math.floor(rng() * players.length);
  // 湖中仙女从首任队长右手边的玩家开始（队长顺时针传递，即向左）
  const ladyStart = players[(leaderIndex - 1 + players.length) % players.length]!;
  return {
    players: players.slice(),
    roles,
    options: { ...options },
    phase: 'team',
    questIndex: 0,
    leaderIndex,
    rejectCount: 0,
    team: [],
    votes: {},
    questCards: {},
    proposals: [],
    quests: [],
    lady: options.ladyOfTheLake ? { holder: ladyStart, pastHolders: [ladyStart], inspections: [] } : null,
    assassinTarget: null,
    winner: null,
    winReason: null,
  };
}

function checkTeam(state: AvalonState, team: unknown, requireFull: boolean): PlayerId[] {
  if (!Array.isArray(team)) throw new GameError('队伍格式不正确');
  const size = TEAM_SIZES[state.players.length]![state.questIndex]!;
  const unique = [...new Set(team as PlayerId[])];
  if (unique.length !== team.length) throw new GameError('队员不能重复');
  if (unique.some((id) => !state.players.includes(id))) throw new GameError('队员必须是本局玩家');
  if (unique.length > size) throw new GameError(`这次任务只需要 ${size} 名队员`);
  if (requireFull && unique.length !== size) throw new GameError(`这次任务需要 ${size} 名队员`);
  return unique;
}

function nextLeader(state: AvalonState) {
  state.leaderIndex = (state.leaderIndex + 1) % state.players.length;
}

function finish(state: AvalonState, winner: Alignment, reason: WinReason) {
  state.phase = 'ended';
  state.winner = winner;
  state.winReason = reason;
}

function startTeamPhase(state: AvalonState) {
  state.phase = 'team';
  state.team = [];
  state.votes = {};
  state.questCards = {};
}

function resolveVote(state: AvalonState) {
  const approvals = Object.values(state.votes).filter(Boolean).length;
  // 需要严格过半；平票视为否决
  const approved = approvals * 2 > state.players.length;
  state.proposals.push({
    questIndex: state.questIndex,
    attempt: state.rejectCount + 1,
    leader: state.players[state.leaderIndex]!,
    team: state.team.slice(),
    votes: { ...state.votes },
    approved,
  });
  if (approved) {
    state.phase = 'quest';
    state.questCards = {};
    return;
  }
  state.rejectCount += 1;
  if (state.rejectCount >= MAX_REJECTS) {
    finish(state, 'evil', 'rejects');
    return;
  }
  nextLeader(state);
  startTeamPhase(state);
}

function resolveQuest(state: AvalonState) {
  const fails = Object.values(state.questCards).filter((ok) => !ok).length;
  const success = fails < failsRequired(state.players.length, state.questIndex);
  const finishedQuest = state.questIndex;
  state.quests.push({
    questIndex: finishedQuest,
    leader: state.players[state.leaderIndex]!,
    team: state.team.slice(),
    fails,
    success,
  });
  const won = state.quests.filter((q) => q.success).length;
  const lost = state.quests.length - won;
  if (lost >= QUESTS_TO_WIN) {
    finish(state, 'evil', 'quests_failed');
    return;
  }
  if (won >= QUESTS_TO_WIN) {
    // 正义方完成三次任务，邪恶方还有最后一次机会：刺杀梅林
    state.phase = 'assassin';
    state.team = [];
    return;
  }
  state.questIndex += 1;
  state.rejectCount = 0;
  nextLeader(state);
  startTeamPhase(state);
  if (state.lady && LADY_AFTER_QUESTS.includes(finishedQuest) && ladyTargets(state).length > 0) {
    state.phase = 'lady';
  }
}

function ladyTargets(state: AvalonState): PlayerId[] {
  if (!state.lady) return [];
  const past = state.lady.pastHolders;
  return state.players.filter((id) => !past.includes(id));
}

function reduce(prev: AvalonState, player: PlayerId, action: AvalonAction, _rng: Rng): AvalonState {
  if (!prev.players.includes(player)) throw new GameError('你不在这局游戏中');
  if (!action || typeof action !== 'object') throw new GameError('无效的操作');
  const state: AvalonState = structuredClone(prev);
  const leader = state.players[state.leaderIndex]!;

  switch (action.type) {
    case 'draft_team': {
      if (state.phase !== 'team') throw new GameError('现在不是组队阶段');
      if (player !== leader) throw new GameError('只有队长可以挑选队员');
      state.team = checkTeam(state, action.team, false);
      return state;
    }
    case 'propose_team': {
      if (state.phase !== 'team') throw new GameError('现在不是组队阶段');
      if (player !== leader) throw new GameError('只有队长可以提交队伍');
      state.team = checkTeam(state, action.team, true);
      state.votes = {};
      state.phase = 'vote';
      return state;
    }
    case 'vote': {
      if (state.phase !== 'vote') throw new GameError('现在不是投票阶段');
      if (typeof action.approve !== 'boolean') throw new GameError('无效的投票');
      if (player in state.votes) throw new GameError('你已经投过票了');
      state.votes[player] = action.approve;
      if (Object.keys(state.votes).length === state.players.length) resolveVote(state);
      return state;
    }
    case 'quest': {
      if (state.phase !== 'quest') throw new GameError('现在不是任务阶段');
      if (!state.team.includes(player)) throw new GameError('你不在这次任务的队伍里');
      if (typeof action.success !== 'boolean') throw new GameError('无效的任务牌');
      if (player in state.questCards) throw new GameError('你已经出过任务牌了');
      if (!action.success && alignmentOf(state.roles[player]!) === 'good') {
        throw new GameError('正义方只能出「成功」');
      }
      state.questCards[player] = action.success;
      if (Object.keys(state.questCards).length === state.team.length) resolveQuest(state);
      return state;
    }
    case 'lady': {
      if (state.phase !== 'lady' || !state.lady) throw new GameError('现在不能使用湖中仙女');
      if (player !== state.lady.holder) throw new GameError('湖中仙女不在你手上');
      if (!ladyTargets(state).includes(action.target)) {
        throw new GameError('不能查验自己，也不能查验持有过湖中仙女的人');
      }
      state.lady.inspections.push({ by: player, target: action.target, afterQuest: state.questIndex - 1 });
      state.lady.holder = action.target;
      state.lady.pastHolders.push(action.target);
      state.phase = 'team';
      return state;
    }
    case 'assassinate': {
      if (state.phase !== 'assassin') throw new GameError('现在不是刺杀阶段');
      if (state.roles[player] !== 'assassin') throw new GameError('只有刺客可以动手');
      const targetRole = state.roles[action.target];
      if (!targetRole) throw new GameError('目标必须是本局玩家');
      if (alignmentOf(targetRole) === 'evil' && targetRole !== 'oberon') {
        throw new GameError('不能刺杀你认识的同伴');
      }
      if (action.target === player) throw new GameError('不能刺杀自己');
      state.assassinTarget = action.target;
      if (targetRole === 'merlin') finish(state, 'evil', 'assassinated');
      else finish(state, 'good', 'merlin_safe');
      return state;
    }
    default:
      throw new GameError('无效的操作');
  }
}

function view(state: AvalonState, viewer: PlayerId | null): AvalonView {
  const ended = state.phase === 'ended';
  const count = state.players.length;
  const inGame = viewer !== null && state.players.includes(viewer);
  const assassin = state.players.find((id) => state.roles[id] === 'assassin') ?? null;

  let me: AvalonView['me'] = null;
  if (inGame) {
    const role = state.roles[viewer]!;
    const ladyResults: Record<PlayerId, Alignment> = {};
    for (const insp of state.lady?.inspections ?? []) {
      if (insp.by === viewer) ladyResults[insp.target] = alignmentOf(state.roles[insp.target]!);
    }
    me = {
      id: viewer,
      role,
      alignment: alignmentOf(role),
      sightings: sightingsFor(state, viewer),
      knownRoles: knownRolesFor(state, viewer),
      myVote: viewer in state.votes ? state.votes[viewer]! : null,
      myQuestCard: viewer in state.questCards ? state.questCards[viewer]! : null,
      ladyResults,
    };
  }

  return {
    players: state.players,
    options: state.options,
    roleSet: Object.values(state.roles).sort(),
    phase: state.phase,
    questIndex: state.questIndex,
    leader: state.players[state.leaderIndex]!,
    rejectCount: state.rejectCount,
    questSizes: TEAM_SIZES[count]!.slice(),
    failsRequired: TEAM_SIZES[count]!.map((_, i) => failsRequired(count, i)),
    team: state.team,
    voted: state.phase === 'vote' ? Object.keys(state.votes) : [],
    played: state.phase === 'quest' ? Object.keys(state.questCards) : [],
    proposals: state.proposals,
    quests: state.quests,
    lady: state.lady,
    assassin: state.phase === 'assassin' || ended ? assassin : null,
    assassinTarget: state.assassinTarget,
    winner: state.winner,
    winReason: state.winReason,
    roles: ended ? state.roles : null,
    me,
  };
}

/** 简单的试玩机器人：不追求聪明，只保证牌局能合乎规则地推进。 */
function botAction(state: AvalonState, player: PlayerId, rng: Rng): AvalonAction | null {
  const role = state.roles[player];
  if (!role) return null;
  const evil = alignmentOf(role) === 'evil';
  const known = sightingsFor(state, player);

  switch (state.phase) {
    case 'team': {
      if (state.players[state.leaderIndex] !== player) return null;
      const size = TEAM_SIZES[state.players.length]![state.questIndex]!;
      const others = shuffle(
        state.players.filter((id) => id !== player),
        rng,
      );
      // 正义方尽量避开自己知道的邪恶方
      const preferred = evil ? others : [...others.filter((id) => known[id] !== 'evil'), ...others.filter((id) => known[id] === 'evil')];
      return { type: 'propose_team', team: [player, ...preferred.slice(0, size - 1)] };
    }
    case 'vote': {
      if (player in state.votes) return null;
      if (state.rejectCount === MAX_REJECTS - 1) return { type: 'vote', approve: !evil || rng() < 0.5 };
      const hasKnownEvil = state.team.some((id) => known[id] === 'evil' || (evil && id === player));
      if (evil) return { type: 'vote', approve: hasKnownEvil ? rng() < 0.85 : rng() < 0.35 };
      if (role === 'merlin' && hasKnownEvil) return { type: 'vote', approve: rng() < 0.15 };
      return { type: 'vote', approve: state.team.includes(player) ? rng() < 0.85 : rng() < 0.55 };
    }
    case 'quest': {
      if (!state.team.includes(player) || player in state.questCards) return null;
      return { type: 'quest', success: !evil || rng() < 0.15 };
    }
    case 'lady': {
      if (state.lady?.holder !== player) return null;
      const targets = ladyTargets(state);
      return targets.length ? { type: 'lady', target: pick(targets, rng) } : null;
    }
    case 'assassin': {
      if (role !== 'assassin') return null;
      const targets = state.players.filter((id) => id !== player && known[id] !== 'evil');
      return { type: 'assassinate', target: pick(targets, rng) };
    }
    default:
      return null;
  }
}

export const avalon: GameDefinition<AvalonState, AvalonAction, AvalonView, AvalonOptions> = {
  id: 'avalon',
  name: '阿瓦隆',
  tagline: '圆桌之上，忠奸难辨。5–10 人的阵营推理。',
  minPlayers: MIN_PLAYERS,
  maxPlayers: MAX_PLAYERS,
  playerCountOptions: { defaultCount: MIN_PLAYERS, recommendedOptions },
  defaultOptions,
  normalizeOptions,
  validateOptions,
  setup,
  reduce,
  view,
  isOver: (state) => state.phase === 'ended',
  botAction,
};
