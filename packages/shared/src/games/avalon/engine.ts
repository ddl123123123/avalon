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
  type SpeechSeconds,
} from './rules';

export type AvalonPhase = 'identity' | 'team' | 'discussion' | 'vote' | 'quest' | 'lady' | 'assassin' | 'ended';

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

export interface SpeechRecord {
  questIndex: number;
  attempt: number;
  player: PlayerId;
  text: string;
  result: 'spoken' | 'passed' | 'timed_out' | 'unavailable';
}

export interface AvalonState {
  players: PlayerId[];
  roles: Record<PlayerId, Role>;
  options: AvalonOptions;
  phase: AvalonPhase;
  questIndex: number;
  leaderIndex: number;
  confirmedRoles: PlayerId[];
  leaderOrder: PlayerId[];
  /** 队长本轮已完成讨论，正在提交最终队伍。 */
  discussionComplete: boolean;
  speechMode: 'voice' | 'text';
  speeches: SpeechRecord[];
  discussion: null | {
    order: PlayerId[];
    currentIndex: number;
    deadline: number;
    preselectedTeam: boolean;
    leaderFirst: boolean;
    direction: 'left' | 'right';
    timerSeconds: SpeechSeconds;
  };
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
  | { type: 'confirm_role' }
  /** 队长调整候选队员，所有人实时可见 */
  | { type: 'draft_team'; team: PlayerId[] }
  /** 队长设置预选队伍和发言顺序，开始本轮讨论 */
  | { type: 'start_discussion'; preselectedTeam: boolean; leaderFirst: boolean; direction: 'left' | 'right'; now?: number }
  /** 当前发言者提前结束自己的发言 */
  | { type: 'finish_speech'; now?: number }
  | { type: 'submit_speech'; turn: string; text: string; now?: number }
  /** 倒计时结束后自动进入下一位；任何玩家都可触发 */
  | { type: 'timeout_speech'; now?: number }
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
  leader: PlayerId | null;
  confirmedRoles: PlayerId[];
  discussionComplete: boolean;
  speechMode: AvalonState['speechMode'];
  speeches: SpeechRecord[];
  discussion: null | {
    order: PlayerId[];
    currentIndex: number;
    currentSpeaker: PlayerId;
    turn: string;
    deadline: number;
    preselectedTeam: boolean;
    leaderFirst: boolean;
    direction: 'left' | 'right';
    timerSeconds: SpeechSeconds;
  };
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
  return {
    players: players.slice(),
    roles,
    options: { ...options },
    phase: 'identity',
    questIndex: 0,
    leaderIndex: -1,
    confirmedRoles: [],
    leaderOrder: [],
    discussionComplete: false,
    speechMode: 'voice',
    speeches: [],
    discussion: null,
    rejectCount: 0,
    team: [],
    votes: {},
    questCards: {},
    proposals: [],
    quests: [],
    lady: null,
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
  const order = state.leaderOrder ?? state.players;
  const current = order.indexOf(state.players[state.leaderIndex]!);
  state.leaderIndex = state.players.indexOf(order[(current + 1) % order.length]!);
}

function finish(state: AvalonState, winner: Alignment, reason: WinReason) {
  state.phase = 'ended';
  state.winner = winner;
  state.winReason = reason;
}

function startTeamPhase(state: AvalonState) {
  state.phase = 'team';
  state.discussionComplete = false;
  state.discussion = null;
  state.team = [];
  state.votes = {};
  state.questCards = {};
}

function advanceDiscussion(state: AvalonState, now: number) {
  const discussion = state.discussion!;
  const nextIndex = discussion.currentIndex + 1;
  if (nextIndex >= discussion.order.length) {
    state.phase = 'team';
    state.discussion = null;
    state.discussionComplete = true;
    return;
  }
  state.discussion = {
    ...discussion,
    currentIndex: nextIndex,
    deadline: now + discussion.timerSeconds * 1000,
  };
}

export function speechTurn(state: Pick<AvalonState, 'questIndex' | 'rejectCount' | 'discussion'>) {
  return `${state.questIndex}:${state.rejectCount}:${state.discussion?.currentIndex ?? -1}`;
}

function recordSpeech(state: AvalonState, result: SpeechRecord['result'], text = '') {
  if (state.speechMode !== 'text' || !state.discussion) return;
  state.speeches = [...state.speeches, {
    questIndex: state.questIndex, attempt: state.rejectCount + 1,
    player: state.discussion.order[state.discussion.currentIndex], result, text,
  }];
}

/** 由房间后台在模型不可用时结束该机器人当前的文字轮次。 */
export function skipUnavailableSpeech(prev: AvalonState, player: PlayerId, turn: string, now: number): AvalonState {
  if (prev.speechMode !== 'text' || prev.phase !== 'discussion' || !prev.discussion ||
      prev.discussion.order[prev.discussion.currentIndex] !== player || speechTurn(prev) !== turn) return prev;
  const next = { ...prev };
  recordSpeech(next, 'unavailable');
  advanceDiscussion(next, now);
  return next;
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

function reduce(prev: AvalonState, player: PlayerId, action: AvalonAction, rng: Rng): AvalonState {
  if (!prev.players.includes(player)) throw new GameError('你不在这局游戏中');
  if (!action || typeof action !== 'object') throw new GameError('无效的操作');
  if (action.type === 'confirm_role') {
    if (prev.phase !== 'identity' || prev.confirmedRoles.includes(player)) return prev;
    const state = structuredClone(prev);
    state.confirmedRoles.push(player);
    if (state.confirmedRoles.length === state.players.length) {
      state.leaderOrder = shuffle(state.players, rng);
      state.leaderIndex = state.players.indexOf(state.leaderOrder[0]!);
      if (state.options.ladyOfTheLake) {
        // 湖中仙女仍按实际座位发给首任队长右手边的玩家。
        const holder = state.players[(state.leaderIndex - 1 + state.players.length) % state.players.length]!;
        state.lady = { holder, pastHolders: [holder], inspections: [] };
      }
      startTeamPhase(state);
    }
    return state;
  }
  if (prev.phase === 'identity') throw new GameError('请等待所有玩家确认身份');
  const state: AvalonState = structuredClone({ ...prev, speeches: [] });
  state.speeches = prev.speeches;
  const leader = state.players[state.leaderIndex]!;

  switch (action.type) {
    case 'draft_team': {
      if (state.phase !== 'team') throw new GameError('现在不是组队阶段');
      if (player !== leader) throw new GameError('只有队长可以挑选队员');
      state.team = checkTeam(state, action.team, false);
      return state;
    }
    case 'start_discussion': {
      if (state.phase !== 'team' || state.discussionComplete) throw new GameError('现在不能开始讨论');
      if (player !== leader) throw new GameError('只有队长可以设置发言顺序');
      if (typeof action.preselectedTeam !== 'boolean' || typeof action.leaderFirst !== 'boolean') {
        throw new GameError('发言设置不正确');
      }
      if (action.direction !== 'left' && action.direction !== 'right') throw new GameError('请选择发言方向');
      const preselected = action.preselectedTeam ? checkTeam(state, state.team, true) : [];
      const direction = action.direction;
      const step = direction === 'left' ? 1 : -1;
      const others = Array.from({ length: state.players.length - 1 }, (_, i) => {
        const index = (state.leaderIndex + step * (i + 1) + state.players.length) % state.players.length;
        return state.players[index]!;
      });
      const order = action.leaderFirst ? [leader, ...others] : [...others, leader];
      const now = typeof action.now === 'number' && Number.isFinite(action.now) ? action.now : Date.now();
      state.team = preselected;
      state.discussionComplete = false;
      state.discussion = {
        order,
        currentIndex: 0,
        deadline: now + state.options.speechSeconds * 1000,
        preselectedTeam: action.preselectedTeam,
        leaderFirst: action.leaderFirst,
        direction,
        timerSeconds: state.options.speechSeconds,
      };
      state.phase = 'discussion';
      return state;
    }
    case 'finish_speech': {
      if (state.phase !== 'discussion' || !state.discussion) return state;
      if (state.discussion.order[state.discussion.currentIndex] !== player) {
        throw new GameError('现在还没轮到你发言');
      }
      const now = typeof action.now === 'number' && Number.isFinite(action.now) ? action.now : Date.now();
      recordSpeech(state, now >= state.discussion.deadline ? 'timed_out' : 'passed');
      advanceDiscussion(state, now);
      return state;
    }
    case 'submit_speech': {
      if (state.speechMode !== 'text' || state.phase !== 'discussion' || !state.discussion ||
          state.discussion.order[state.discussion.currentIndex] !== player || action.turn !== speechTurn(state)) {
        throw new GameError('当前文字发言轮次已更新');
      }
      const text = typeof action.text === 'string' ? action.text.trim() : '';
      if (!text) throw new GameError('请先输入发言，或选择跳过');
      const now = typeof action.now === 'number' && Number.isFinite(action.now) ? action.now : Date.now();
      if (now >= state.discussion.deadline) throw new GameError('你的发言时间已结束');
      recordSpeech(state, 'spoken', text);
      advanceDiscussion(state, now);
      return state;
    }
    case 'timeout_speech': {
      if (state.phase !== 'discussion' || !state.discussion) return state;
      const now = typeof action.now === 'number' && Number.isFinite(action.now) ? action.now : Date.now();
      if (now < state.discussion.deadline) return prev;
      recordSpeech(state, 'timed_out');
      advanceDiscussion(state, now);
      return state;
    }
    case 'propose_team': {
      if (state.phase !== 'team') throw new GameError('现在不是组队阶段');
      if (player !== leader) throw new GameError('只有队长可以提交队伍');
      if (state.speechMode === 'text' && !state.discussionComplete) throw new GameError('请先完成本轮文字讨论');
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
    leader: state.players[state.leaderIndex] ?? null,
    confirmedRoles: state.confirmedRoles ?? [],
    discussionComplete: state.discussionComplete,
    speechMode: state.speechMode,
    speeches: state.speeches,
    discussion: state.discussion
      ? {
          ...state.discussion,
          currentSpeaker: state.discussion.order[state.discussion.currentIndex]!,
          turn: speechTurn(state),
        }
      : null,
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
    case 'identity':
      return state.confirmedRoles.includes(player) ? null : { type: 'confirm_role' };
    case 'team': {
      if (state.players[state.leaderIndex] !== player) return null;
      if (state.discussionComplete) return { type: 'propose_team', team: state.team };
      const size = TEAM_SIZES[state.players.length]![state.questIndex]!;
      if (state.team.length === size) {
        return { type: 'start_discussion', preselectedTeam: true, leaderFirst: true, direction: 'left' };
      }
      const others = shuffle(
        state.players.filter((id) => id !== player),
        rng,
      );
      // 正义方尽量避开自己知道的邪恶方
      const preferred = evil ? others : [...others.filter((id) => known[id] !== 'evil'), ...others.filter((id) => known[id] === 'evil')];
      return { type: 'draft_team', team: [player, ...preferred.slice(0, size - 1)] };
    }
    case 'discussion':
      return state.discussion?.order[state.discussion.currentIndex] === player ? { type: 'finish_speech' } : null;
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
