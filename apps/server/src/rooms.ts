import { randomBytes, randomInt } from 'node:crypto';
import { setTimeout as wait } from 'node:timers/promises';
import {
  Avalon,
  GameError,
  NAME_MAX_LENGTH,
  SevenSins,
  getGame,
  type ClientMessage,
  type GameDefinition,
  type PlayerId,
  type RoomPlayer,
  type RoomSnapshot,
  type RoomStatus,
  type ServerMessage,
} from '@tabletop/shared';
import { answerAvalonAssistant } from './deepseek';
import {
  askAvalonBot, botModelDirectory, decisionToken, localBotModel, modelFor, needsAvalonModel, rememberAction, speechEditorFor,
  type BotMemory,
} from './avalon-bot';

/** 一条到客户端的连接。服务端不关心底层是不是 WebSocket。 */
export interface Connection {
  send(message: ServerMessage): void;
  /** 浏览器保存的私密标识，用来在刷新和断线后认回同一个人 */
  clientId: string | null;
}

interface Member {
  id: PlayerId;
  seatIndex: number;
  /** 机器人没有 clientId */
  clientId: string | null;
  name: string;
  isBot: boolean;
  avalonProfile?: string;
  polishRequest?: AbortController;
  connection: Connection | null;
  /** 大厅里断线后的清理定时器 */
  dropTimer: NodeJS.Timeout | null;
}

interface Room {
  code: string;
  game: GameDefinition;
  hostId: PlayerId;
  members: Member[];
  status: RoomStatus;
  options: unknown;
  targetPlayers: number | null;
  defaultAvalonProfile?: string;
  state: unknown | null;
  gameSeq: number;
  botTimers: Map<PlayerId, NodeJS.Timeout>;
  speechTimer?: NodeJS.Timeout;
  avalonAgents?: {
    memory: Map<PlayerId, BotMemory>;
    running: Map<PlayerId, AbortController>;
    requests: number;
  };
  aiRequestTimes: Map<PlayerId, number>;
  aiRequestHistory: number[];
  emptyTimer: NodeJS.Timeout | null;
}

/** 大厅里掉线后座位保留多久。要够房主切到聊天软件发完邀请链接再回来。 */
const LOBBY_DROP_MS = 3 * 60_000;
const EMPTY_ROOM_MS = 10 * 60_000;
const AI_PLAYER_COOLDOWN_MS = 6_000;
const AI_ROOM_WINDOW_MS = 10 * 60_000;
const AI_ROOM_REQUEST_LIMIT = 60;
const AI_FEATURES = new Set(['team-comparison', 'role-coach', 'speech-prep', 'speech-polish', 'speech-summary', 'rules-qa', 'post-game-review']);
/** 机器人行动间隔的倍率。调试时设 BOT_PACE=0.1 可以让机器人快十倍。 */
const BOT_PACE = Math.max(0, Number(process.env.BOT_PACE ?? 1) || 1);
const AVALON_BOT_SPEECH_MS = 10_000;
const BOT_NAMES = ['高文', '兰斯洛特', '加拉哈德', '特里斯坦', '凯', '贝狄威尔', '格尼薇儿', '伊莲', '鲍斯'];

const newId = () => randomBytes(6).toString('base64url');

function cleanName(raw: unknown): string {
  const name = typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim() : '';
  if (!name) throw new GameError('先起个名字');
  return [...name].slice(0, NAME_MAX_LENGTH).join('');
}

export class RoomManager {
  private rooms = new Map<string, Room>();
  private readonly botModels = botModelDirectory(process.env);
  private botModelInFlight = 0;
  private botModelCalls: number[] = [];
  /** clientId → 所在房间号 */
  private seats = new Map<string, string>();
  /** clientId → 对外公开的玩家 id（公开 id 不能反推出 clientId） */
  private publicIds = new Map<string, PlayerId>();

  private publicId(clientId: string): PlayerId {
    let id = this.publicIds.get(clientId);
    if (!id) {
      id = newId();
      this.publicIds.set(clientId, id);
    }
    return id;
  }

  private find(conn: Connection): { room: Room; member: Member } | null {
    if (!conn.clientId) return null;
    const code = this.seats.get(conn.clientId);
    const room = code ? this.rooms.get(code) : undefined;
    const member = room?.members.find((m) => m.clientId === conn.clientId);
    return room && member ? { room, member } : null;
  }

  handle(conn: Connection, msg: ClientMessage) {
    try {
      this.dispatch(conn, msg);
    } catch (err) {
      if (err instanceof GameError) conn.send({ type: 'error', message: err.message });
      else {
        console.error('[room] unexpected error', err);
        conn.send({ type: 'error', message: '服务器出了点问题，请重试' });
      }
    }
  }

  private dispatch(conn: Connection, msg: ClientMessage) {
    if (msg.type === 'hello') {
      if (typeof msg.clientId !== 'string' || msg.clientId.length < 16 || msg.clientId.length > 64) {
        throw new GameError('无效的客户端标识');
      }
      conn.clientId = msg.clientId;
      const seat = this.find(conn);
      // 只告知上次所在的房间，由客户端决定是否回去（发 join_room），避免新开的标签页抢走座位
      conn.send({ type: 'welcome', playerId: this.publicId(msg.clientId), roomCode: seat?.room.code ?? null });
      return;
    }
    if (!conn.clientId) throw new GameError('连接尚未就绪，请稍后再试');

    switch (msg.type) {
      case 'create_room':
        return this.createRoom(conn, msg.name, msg.gameId, msg.options);
      case 'join_room':
        return this.joinRoom(conn, msg.code, msg.name);
    }

    const seat = this.find(conn);
    if (!seat || seat.member.connection !== conn) throw new GameError('你不在任何房间里');
    const { room, member } = seat;
    const hostOnly = () => {
      if (room.hostId !== member.id) throw new GameError('只有房主可以这样做');
    };
    const lobbyOnly = () => {
      if (room.status !== 'lobby') throw new GameError('对局进行中，不能修改');
    };

    switch (msg.type) {
      case 'leave_room':
        return this.leave(room, member);
      case 'choose_seat': {
        lobbyOnly();
        const capacity = room.targetPlayers ?? room.game.maxPlayers;
        if (!Number.isInteger(msg.seatIndex) || msg.seatIndex < 0 || msg.seatIndex >= capacity) {
          throw new GameError('请选择有效座位');
        }
        const occupant = room.members.find((candidate) => candidate.seatIndex === msg.seatIndex);
        if (occupant && occupant !== member) throw new GameError('这个座位已经有人了');
        member.seatIndex = msg.seatIndex;
        return this.broadcast(room);
      }
      case 'set_options': {
        hostOnly();
        lobbyOnly();
        // 客户端只发改动的那几项，合并到现有选项上；这样连续快速切换两项不会互相覆盖
        const options = room.game.normalizeOptions({
          ...(room.options as object),
          ...(msg.options && typeof msg.options === 'object' ? msg.options : {}),
        });
        if (room.targetPlayers !== null) {
          const blocker = room.game.validateOptions(options, room.targetPlayers);
          if (blocker) throw new GameError(blocker);
        }
        room.options = options;
        return this.broadcast(room);
      }
      case 'set_player_count': {
        hostOnly();
        lobbyOnly();
        const config = room.game.playerCountOptions;
        const count = msg.playerCount;
        if (!config) throw new GameError('这款桌游不能设置固定人数');
        if (!Number.isInteger(count) || count < room.game.minPlayers || count > room.game.maxPlayers) {
          throw new GameError(`请选择 ${room.game.minPlayers}–${room.game.maxPlayers} 人`);
        }
        if (count === room.targetPlayers) return;
        const humans = room.members.filter((m) => !m.isBot).length;
        if (count < humans) throw new GameError(`已有 ${humans} 位真人入座，人数不能设得更少`);
        const options = room.game.normalizeOptions({
          ...(room.options as object),
          ...config.recommendedOptions(count),
        });
        const excess = Math.max(0, room.members.length - count);
        // 缩小房间时先移除座位号最大的机器人，保留真人玩家。
        const bots = room.members.filter((m) => m.isBot).sort((a, b) => b.seatIndex - a.seatIndex).slice(0, excess);
        for (const bot of bots) this.remove(room, bot, null);
        room.targetPlayers = count;
        // 缩小人数后保持座位顺序，并把现有玩家排进新的座位范围。
        [...room.members].sort((a, b) => a.seatIndex - b.seatIndex).forEach((m, index) => { m.seatIndex = index; });
        room.options = options;
        return this.broadcast(room);
      }
      case 'add_bot': {
        hostOnly();
        lobbyOnly();
        if (!room.game.botAction) throw new GameError('这款桌游还不支持机器人');
        if (room.members.length >= (room.targetPlayers ?? room.game.maxPlayers)) throw new GameError('房间已满');
        const used = new Set(room.members.map((m) => m.name));
        const name = BOT_NAMES.find((n) => !used.has(n)) ?? `骑士${room.members.length + 1}`;
        room.members.push({ id: newId(), seatIndex: this.firstFreeSeat(room), clientId: null, name, isBot: true, avalonProfile: room.defaultAvalonProfile, connection: null, dropTimer: null });
        return this.broadcast(room);
      }
      case 'set_avalon_bot_model':
      case 'set_avalon_bot_models': {
        hostOnly();
        lobbyOnly();
        if (room.game.id !== Avalon.avalon.id) throw new GameError('当前桌游没有阿瓦隆模型设置');
        const bots = room.members.filter((m) => m.isBot && (msg.type === 'set_avalon_bot_models' || m.id === msg.playerId));
        if (!bots.length) throw new GameError('请选择有效的机器人座位');
        if (msg.profile !== null && msg.profile !== localBotModel && !this.botModels.profiles.has(msg.profile)) {
          throw new GameError('请选择服务器已配置的模型');
        }
        const profile = msg.profile ?? undefined;
        for (const bot of bots) bot.avalonProfile = profile;
        if (msg.type === 'set_avalon_bot_models') room.defaultAvalonProfile = profile;
        return this.broadcast(room);
      }
      case 'kick': {
        hostOnly();
        lobbyOnly();
        const target = room.members.find((m) => m.id === msg.playerId);
        if (!target || target.id === member.id) throw new GameError('找不到这位玩家');
        this.remove(room, target, '你被房主请出了房间');
        return this.broadcast(room);
      }
      case 'start_game': {
        hostOnly();
        lobbyOnly();
        const blocker = this.startBlocker(room);
        if (blocker) throw new GameError(blocker);
        // 隐藏身份游戏开局时由服务器提供安全随机数。
        const rng = room.game.id === Avalon.avalon.id || room.game.id === SevenSins.sevenSins.id
          ? () => randomInt(2 ** 46) / 2 ** 46
          : Math.random;
        room.state = room.game.setup(
          [...room.members].sort((a, b) => a.seatIndex - b.seatIndex).map((m) => m.id),
          room.options,
          rng,
        );
        if (room.game.id === Avalon.avalon.id && room.members.some((m) => m.isBot)) {
          (room.state as Avalon.AvalonState).speechMode = 'text';
          room.avalonAgents = { memory: new Map(), running: new Map(), requests: 0 };
        }
        room.status = 'playing';
        room.gameSeq += 1;
        this.broadcast(room);
        return this.scheduleBots(room);
      }
      case 'game_action': {
        if (room.status !== 'playing') throw new GameError('对局还没开始');
        this.applyAction(room, member.id, msg.action);
        return;
      }
      case 'avalon_assistant':
        return this.requestAvalonAssistant(conn, room, member, msg);
      case 'back_to_lobby': {
        hostOnly();
        if (room.status !== 'ended') throw new GameError('这一局还没结束');
        this.clearBotTimers(room);
        room.avalonAgents = undefined;
        room.status = 'lobby';
        room.state = null;
        for (const m of room.members.filter((m) => !m.isBot && !m.connection)) this.remove(room, m, null);
        return this.broadcast(room);
      }
      default:
        throw new GameError('无法识别的请求');
    }
  }

  private createRoom(conn: Connection, rawName: unknown, gameId: unknown, requestedOptions?: unknown) {
    const name = cleanName(rawName);
    const game = typeof gameId === 'string' ? getGame(gameId) : undefined;
    if (!game) throw new GameError('这款桌游还没上线');
    const existing = this.find(conn);
    if (existing) this.leave(existing.room, existing.member);

    let code = '';
    for (let digits = 4; !code; digits++) {
      for (let attempt = 0; attempt < 20 && !code; attempt++) {
        const candidate = String(randomInt(10 ** digits)).padStart(digits, '0');
        if (!this.rooms.has(candidate)) code = candidate;
      }
    }
    const id = this.publicId(conn.clientId!);
    const config = game.playerCountOptions;
    const defaults = config
      ? game.normalizeOptions({ ...game.defaultOptions(), ...config.recommendedOptions(config.defaultCount) })
      : game.defaultOptions();
    const options = game.normalizeOptions({
      ...(defaults as object),
      ...(requestedOptions && typeof requestedOptions === 'object' ? requestedOptions as object : {}),
    });
    const blocker = config ? game.validateOptions(options, config.defaultCount) : null;
    if (blocker) throw new GameError(blocker);
    const room: Room = {
      code,
      game,
      hostId: id,
      members: [{ id, seatIndex: 0, clientId: conn.clientId, name, isBot: false, connection: conn, dropTimer: null }],
      status: 'lobby',
      options,
      targetPlayers: config?.defaultCount ?? null,
      state: null,
      gameSeq: 0,
      botTimers: new Map(),
      aiRequestTimes: new Map(),
      aiRequestHistory: [],
      emptyTimer: null,
    };
    this.rooms.set(code, room);
    this.seats.set(conn.clientId!, code);
    this.broadcast(room);
  }

  private joinRoom(conn: Connection, rawCode: unknown, rawName: unknown) {
    const code = typeof rawCode === 'string' ? rawCode.trim() : '';
    const room = this.rooms.get(code);
    if (!room) throw new GameError(`没有找到房间 ${code || ''}，检查一下房间号`.replace('  ', ' '));

    const already = room.members.find((m) => m.clientId === conn.clientId);
    if (already) {
      const elsewhere = this.find(conn);
      if (elsewhere && elsewhere.room !== room) this.leave(elsewhere.room, elsewhere.member);
      if (typeof rawName === 'string' && rawName.trim() && room.status === 'lobby') already.name = cleanName(rawName);
      return this.attach(room, already, conn);
    }
    const name = cleanName(rawName);
    if (room.status !== 'lobby') throw new GameError('这个房间的对局已经开始，等下一局再加入');
    if (room.members.length >= (room.targetPlayers ?? room.game.maxPlayers)) throw new GameError('房间已满');

    const elsewhere = this.find(conn);
    if (elsewhere) this.leave(elsewhere.room, elsewhere.member);
    room.members.push({
      id: this.publicId(conn.clientId!),
      seatIndex: this.firstFreeSeat(room),
      clientId: conn.clientId,
      name,
      isBot: false,
      connection: conn,
      dropTimer: null,
    });
    this.seats.set(conn.clientId!, room.code);
    this.touch(room);
    this.broadcast(room);
  }

  private attach(room: Room, member: Member, conn: Connection) {
    if (member.connection && member.connection !== conn) {
      this.cancelPolish(member);
      member.connection.send({ type: 'left', reason: '你在另一个窗口打开了这个房间' });
      member.connection.clientId = null;
    }
    member.connection = conn;
    if (member.clientId) this.seats.set(member.clientId, room.code);
    if (member.dropTimer) clearTimeout(member.dropTimer);
    member.dropTimer = null;
    this.touch(room);
    this.broadcast(room);
  }

  private firstFreeSeat(room: Room): number {
    const occupied = new Set(room.members.map((member) => member.seatIndex));
    const capacity = room.targetPlayers ?? room.game.maxPlayers;
    for (let seatIndex = 0; seatIndex < capacity; seatIndex++) {
      if (!occupied.has(seatIndex)) return seatIndex;
    }
    throw new GameError('房间已满');
  }

  /** 连接断开（关页面、断网）。座位先保留，方便重连。 */
  disconnect(conn: Connection) {
    const seat = this.find(conn);
    if (!seat || seat.member.connection !== conn) return;
    const { room, member } = seat;
    this.cancelPolish(member);
    member.connection = null;
    if (room.status === 'lobby') {
      member.dropTimer = setTimeout(() => {
        if (member.connection || room.status !== 'lobby') return;
        this.remove(room, member, null);
        this.broadcast(room);
      }, LOBBY_DROP_MS);
    }
    this.passHostIfNeeded(room);
    this.touch(room);
    this.broadcast(room);
  }

  private leave(room: Room, member: Member) {
    const conn = member.connection;
    this.cancelPolish(member);
    if (room.status === 'lobby') {
      this.remove(room, member, null);
    } else {
      // 对局中离开只是离线，座位保留，凭房间号可以回来
      member.connection = null;
      if (member.clientId) this.seats.delete(member.clientId);
      this.passHostIfNeeded(room);
      this.touch(room);
    }
    conn?.send({ type: 'left', reason: null });
    this.broadcast(room);
  }

  private remove(room: Room, member: Member, reason: string | null) {
    this.cancelPolish(member);
    room.members = room.members.filter((m) => m !== member);
    if (member.dropTimer) clearTimeout(member.dropTimer);
    if (member.clientId && this.seats.get(member.clientId) === room.code) this.seats.delete(member.clientId);
    if (reason !== null) member.connection?.send({ type: 'left', reason });
    member.connection = null;
    this.passHostIfNeeded(room);
    this.touch(room);
  }

  private passHostIfNeeded(room: Room) {
    const host = room.members.find((m) => m.id === room.hostId);
    if (host?.connection) return;
    const next = room.members.find((m) => !m.isBot && m.connection);
    if (next) room.hostId = next.id;
  }

  /** 没有真人在线的房间，过一段时间后回收 */
  private touch(room: Room) {
    const anyoneOnline = room.members.some((m) => m.connection);
    if (anyoneOnline) {
      if (room.emptyTimer) clearTimeout(room.emptyTimer);
      room.emptyTimer = null;
      return;
    }
    if (room.emptyTimer) return;
    const humans = room.members.filter((m) => !m.isBot).length;
    room.emptyTimer = setTimeout(() => this.destroy(room), humans === 0 ? 0 : EMPTY_ROOM_MS);
  }

  private destroy(room: Room) {
    this.clearBotTimers(room);
    for (const m of room.members) {
      if (m.dropTimer) clearTimeout(m.dropTimer);
      if (m.clientId && this.seats.get(m.clientId) === room.code) this.seats.delete(m.clientId);
    }
    this.rooms.delete(room.code);
  }

  private applyAction(room: Room, playerId: PlayerId, action: unknown) {
    const timedAction = room.game.id === Avalon.avalon.id && action && typeof action === 'object'
      ? { ...(action as Record<string, unknown>), now: Date.now() }
      : action;
    const next = room.game.reduce(room.state, playerId, timedAction, Math.random, {
      hostId: room.hostId,
      offlinePlayers: room.members.filter((m) => !m.isBot && !m.connection).map((m) => m.id),
    });
    if (next === room.state && room.game.id === Avalon.avalon.id) return;
    room.state = next;
    this.afterAction(room);
  }

  private afterAction(room: Room) {
    if (room.game.isOver(room.state)) {
      room.status = 'ended';
      this.clearBotTimers(room);
    }
    this.broadcast(room);
    this.scheduleSpeechTimer(room);
    this.scheduleBots(room);
  }

  private scheduleSpeechTimer(room: Room) {
    if (room.speechTimer) clearTimeout(room.speechTimer);
    room.speechTimer = undefined;
    if (room.game.id !== Avalon.avalon.id || room.status !== 'playing') return;
    const state = room.state as Avalon.AvalonState;
    const discussion = state.discussion;
    if (!discussion) return;
    const player = discussion.order[discussion.currentIndex];
    room.speechTimer = setTimeout(() => {
      room.speechTimer = undefined;
      if (room.status !== 'playing' || !this.rooms.has(room.code)) return;
      this.applyAction(room, player, { type: 'timeout_speech' } satisfies Avalon.AvalonAction);
    }, Math.max(1, discussion.deadline - Date.now() + 10));
  }

  private requestAvalonAssistant(
    conn: Connection,
    room: Room,
    member: Member,
    msg: Extract<ClientMessage, { type: 'avalon_assistant' }>,
  ) {
    const requestId = typeof msg.requestId === 'string' && /^[\w-]{1,64}$/.test(msg.requestId) ? msg.requestId : null;
    if (!requestId) {
      conn.send({ type: 'error', message: '助手请求编号无效，请重试' });
      return;
    }
    const fail = (message: string) => conn.send({ type: 'avalon_assistant_error', requestId, message });
    if (!AI_FEATURES.has(msg.feature)) return fail('无法识别这项助手功能。');
    if (room.game.id !== Avalon.avalon.id) return fail('AI 助手目前只支持阿瓦隆。');
    if (!room.state || (room.status !== 'playing' && room.status !== 'ended')) return fail('请在阿瓦隆对局开始后使用助手。');
    if (member.isBot) return fail('机器人不能使用 AI 助手。');
    if (msg.feature === 'post-game-review' && room.status !== 'ended') return fail('赛后复盘会在对局结束后开放。');
    if (msg.feature === 'rules-qa' && !(typeof msg.question === 'string' && msg.question.trim())) return fail('先写下你想问的规则问题。');

    // GameDefinition.view 会按当前玩家过滤身份信息；绝不把原始状态或其他人的隐藏身份交给模型。
    const view = room.game.view(room.state, member.id) as Avalon.AvalonView;
    let draft: string | undefined;
    const editor = msg.feature === 'speech-polish' ? speechEditorFor(this.botModels) : undefined;
    if (msg.feature === 'speech-polish') {
      if (!editor) return fail('服务端尚未配置润色模型。');
      if (member.polishRequest) return fail('上一条发言还在润色。');
      const source = msg.draft;
      if (!source || source.gameSeq !== room.gameSeq || view.speechMode !== 'text' ||
          view.discussion?.currentSpeaker !== member.id || source.turn !== view.discussion.turn || Date.now() >= view.discussion.deadline) {
        return fail('当前文字发言轮次已更新。');
      }
      if (typeof source.text !== 'string' || !source.text.trim()) return fail('请先输入发言原文。');
      draft = source.text.trim();
    }
    let speech: { round: number; text: string } | undefined;
    if (msg.feature === 'speech-summary') {
      const entry = msg.speech;
      if (!entry || !Number.isInteger(entry.round) || entry.round < 1 || entry.round > view.questIndex + 1 ||
          typeof entry.text !== 'string' || !entry.text.trim() || entry.text.length > 2600) {
        return fail('请选择已开始的任务轮次，并输入 1 至 2600 字发言。');
      }
      speech = { round: entry.round, text: entry.text.trim() };
    }
    if (msg.feature === 'team-comparison' && view.team.length === 0) return fail('目前没有待分析的队伍，等队长选出候选队伍后再试。');

    const now = Date.now();
    const lastRequest = room.aiRequestTimes.get(member.id) ?? 0;
    if (now - lastRequest < AI_PLAYER_COOLDOWN_MS) return fail('请稍等几秒再发起下一次分析。');
    room.aiRequestHistory = room.aiRequestHistory.filter((time) => now - time < AI_ROOM_WINDOW_MS);
    if (room.aiRequestHistory.length >= AI_ROOM_REQUEST_LIMIT) return fail('本房间的助手调用较多，请稍后再试。');
    room.aiRequestTimes.set(member.id, now);
    room.aiRequestHistory.push(now);

    if (msg.feature === 'speech-polish') {
      const controller = new AbortController();
      member.polishRequest = controller;
      const reply = (message: ServerMessage) => {
        if (member.polishRequest !== controller) return;
        member.polishRequest = undefined;
        if (member.connection === conn) conn.send(message);
      };
      void answerAvalonAssistant({ feature: msg.feature, draft: draft!, profile: editor!, signal: controller.signal }).then(
        (content) => reply({ type: 'avalon_assistant_result', requestId, content }),
        (error: unknown) => reply({ type: 'avalon_assistant_error', requestId, message: error instanceof Error ? error.message : 'AI 润色暂时不可用。' }),
      );
      return;
    }

    const players: RoomPlayer[] = room.members.map((player) => ({
      id: player.id,
      name: player.name,
      connected: player.isBot || player.connection !== null,
      isBot: player.isBot,
      seatIndex: player.seatIndex,
    }));

    void answerAvalonAssistant({
      feature: msg.feature,
      view,
      players,
      question: typeof msg.question === 'string' ? msg.question.slice(0, 600) : undefined,
      privateNotes: typeof msg.privateNotes === 'string' ? msg.privateNotes.slice(0, 2600) : undefined,
      speech,
    }).then(
      (content) => {
        if (member.connection === conn) conn.send({ type: 'avalon_assistant_result', requestId, content });
      },
      (error: unknown) => {
        const message = error instanceof Error ? error.message : 'AI 分析失败，请稍后重试。';
        if (member.connection === conn) conn.send({ type: 'avalon_assistant_error', requestId, message });
      },
    );
  }

  private clearBotTimers(room: Room) {
    for (const t of room.botTimers.values()) clearTimeout(t);
    room.botTimers.clear();
    if (room.speechTimer) clearTimeout(room.speechTimer);
    room.speechTimer = undefined;
    for (const controller of room.avalonAgents?.running.values() ?? []) controller.abort();
    room.avalonAgents?.running.clear();
    for (const member of room.members) this.cancelPolish(member);
  }

  private cancelPolish(member: Member) {
    member.polishRequest?.abort();
    member.polishRequest = undefined;
  }

  private playerViews(room: Room): RoomPlayer[] {
    return [...room.members].sort((a, b) => a.seatIndex - b.seatIndex).map((m) => ({
      id: m.id, name: m.name, connected: m.isBot || m.connection !== null, isBot: m.isBot, seatIndex: m.seatIndex,
    }));
  }

  private async runAvalonBot(room: Room, bot: Member, action: Avalon.AvalonAction) {
    const session = room.avalonAgents;
    const view = room.game.view(room.state, bot.id) as Avalon.AvalonView;
    if (!session || !view.me) return;
    const players = this.playerViews(room);
    const memory = session.memory.get(bot.id) ?? { actions: [], note: '' };
    session.memory.set(bot.id, memory);
    const token = decisionToken(view, action.type);
    const model = modelFor(this.botModels, view.me.role, bot.avalonProfile);
    const ts = Date.now();
    this.botModelCalls = this.botModelCalls.filter((time) => ts - time < 60_000);

    const controller = new AbortController();
    session.running.set(bot.id, controller);
    let reply: Awaited<ReturnType<typeof askAvalonBot>> = null;
    try {
      if (model && needsAvalonModel(action) && session.requests < 600 &&
          this.botModelInFlight < 12 && this.botModelCalls.length < 180) {
        session.requests++;
        this.botModelInFlight++;
        this.botModelCalls.push(ts);
        try {
          reply = await askAvalonBot(model, view, players, memory, action,
            AbortSignal.any([controller.signal, AbortSignal.timeout(12_000)]));
        } catch {
          // 断线、超时或模型格式异常，按游戏规则继续。
        } finally {
          this.botModelInFlight--;
        }
      }
      if (reply?.action.type === 'submit_speech' && view.discussion) {
        const { deadline, timerSeconds } = view.discussion;
        // 生成和等待并行计时，从该座位开始发言时算约十秒。
        const publishAt = Math.min(deadline - 100, deadline - timerSeconds * 1000 + AVALON_BOT_SPEECH_MS * BOT_PACE);
        const remaining = publishAt - Date.now();
        if (remaining > 0) await wait(remaining, undefined, { signal: controller.signal });
      }
    } catch (error) {
      if (!controller.signal.aborted) throw error;
      return;
    } finally {
      session.running.delete(bot.id);
    }
    if (controller.signal.aborted || !this.rooms.has(room.code) || room.status !== 'playing' || room.avalonAgents !== session) return;
    const fallback = room.game.botAction?.(room.state, bot.id, Math.random) as Avalon.AvalonAction | null;
    const latest = room.game.view(room.state, bot.id) as Avalon.AvalonView;
    if (!fallback || decisionToken(latest, fallback.type) !== token) {
      this.scheduleBots(room);
      return;
    }
    if (reply) {
      try {
        this.applyAction(room, bot.id, reply.action);
        if (reply.note) memory.note = reply.note;
        rememberAction(memory, latest, reply.action, players);
        return;
      } catch (error) {
        if (!(error instanceof GameError)) throw error;
      }
    }
    if (fallback.type === 'finish_speech' && latest.discussion) {
      const next = Avalon.skipUnavailableSpeech(room.state as Avalon.AvalonState, bot.id, latest.discussion.turn, Date.now());
      if (next !== room.state) {
        room.state = next;
        rememberAction(memory, latest, fallback, players);
        this.afterAction(room);
      }
      return;
    }
    this.applyAction(room, bot.id, fallback);
    rememberAction(memory, latest, fallback, players);
  }

  /** 机器人像真人一样隔一小会儿再行动 */
  private scheduleBots(room: Room) {
    const game = room.game;
    if (room.status !== 'playing' || !game.botAction) return;
    for (const bot of room.members.filter((m) => m.isBot)) {
      if (room.botTimers.has(bot.id) || room.avalonAgents?.running.has(bot.id)) continue;
      const action = game.botAction(room.state, bot.id, Math.random);
      if (action === null) continue;
      const isTextSpeaker = room.avalonAgents && (action as Avalon.AvalonAction).type === 'finish_speech';
      const delay = isTextSpeaker ? 0 : (900 + Math.random() * 1600) * BOT_PACE;
      room.botTimers.set(
        bot.id,
        setTimeout(() => {
          room.botTimers.delete(bot.id);
          if (room.status !== 'playing') return;
          const action = game.botAction!(room.state, bot.id, Math.random);
          if (action === null) return;
          if (room.avalonAgents) {
            void this.runAvalonBot(room, bot, action as Avalon.AvalonAction).catch((error) => {
              console.error('[bot] Avalon decision failed', error);
            });
            return;
          }
          try {
            this.applyAction(room, bot.id, action);
          } catch (err) {
            console.error('[bot] action rejected', err);
          }
        }, delay),
      );
    }
  }

  private startBlocker(room: Room): string | null {
    const count = room.members.length;
    if (room.targetPlayers !== null && count < room.targetPlayers) {
      return `还差 ${room.targetPlayers - count} 人才能开局`;
    }
    if (room.targetPlayers !== null && count > room.targetPlayers) {
      return `本局设置为 ${room.targetPlayers} 人，请先调整人数`;
    }
    return room.game.validateOptions(room.options, count);
  }

  private snapshot(room: Room, viewer: Member): RoomSnapshot {
    return {
      code: room.code,
      gameId: room.game.id,
      hostId: room.hostId,
      players: this.playerViews(room),
      status: room.status,
      options: room.options,
      targetPlayers: room.targetPlayers,
      startBlocker: room.status === 'lobby' ? this.startBlocker(room) : null,
      gameSeq: room.gameSeq,
      view: room.state === null ? null : room.game.view(room.state, viewer.id),
      you: viewer.id,
      ...(room.game.id === Avalon.avalon.id && room.status === 'lobby' && viewer.id === room.hostId ? {
        avalonModels: {
          profiles: [...this.botModels.profiles.values()].map(({ id, label }) => ({ id, label })),
          seats: Object.fromEntries(room.members.filter((m) => m.isBot).map((m) => [m.id, m.avalonProfile ?? null])),
          defaultForNewBots: room.defaultAvalonProfile ?? null,
        },
      } : {}),
    };
  }

  private broadcast(room: Room) {
    if (!this.rooms.has(room.code)) return;
    for (const m of room.members) {
      m.connection?.send({ type: 'room', room: this.snapshot(room, m) });
    }
  }

  stats() {
    return { rooms: this.rooms.size };
  }
}
