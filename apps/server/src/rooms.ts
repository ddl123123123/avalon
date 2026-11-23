import { randomBytes, randomInt } from 'node:crypto';
import {
  GameError,
  NAME_MAX_LENGTH,
  getGame,
  type ClientMessage,
  type GameDefinition,
  type PlayerId,
  type RoomSnapshot,
  type RoomStatus,
  type ServerMessage,
} from '@tabletop/shared';

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
  state: unknown | null;
  gameSeq: number;
  botTimers: Map<PlayerId, NodeJS.Timeout>;
  emptyTimer: NodeJS.Timeout | null;
}

/** 大厅里掉线后座位保留多久。要够房主切到聊天软件发完邀请链接再回来。 */
const LOBBY_DROP_MS = 3 * 60_000;
const EMPTY_ROOM_MS = 10 * 60_000;
/** 机器人行动间隔的倍率。调试时设 BOT_PACE=0.1 可以让机器人快十倍。 */
const BOT_PACE = Math.max(0, Number(process.env.BOT_PACE ?? 1) || 1);
const BOT_NAMES = ['高文', '兰斯洛特', '加拉哈德', '特里斯坦', '凯', '贝狄威尔', '格尼薇儿', '伊莲', '鲍斯'];

const newId = () => randomBytes(6).toString('base64url');

function cleanName(raw: unknown): string {
  const name = typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim() : '';
  if (!name) throw new GameError('先起个名字');
  return [...name].slice(0, NAME_MAX_LENGTH).join('');
}

export class RoomManager {
  private rooms = new Map<string, Room>();
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
        return this.createRoom(conn, msg.name, msg.gameId);
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
        room.members.push({ id: newId(), seatIndex: this.firstFreeSeat(room), clientId: null, name, isBot: true, connection: null, dropTimer: null });
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
        room.state = room.game.setup(
          [...room.members].sort((a, b) => a.seatIndex - b.seatIndex).map((m) => m.id),
          room.options,
          Math.random,
        );
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
      case 'back_to_lobby': {
        hostOnly();
        if (room.status !== 'ended') throw new GameError('这一局还没结束');
        this.clearBotTimers(room);
        room.status = 'lobby';
        room.state = null;
        for (const m of room.members.filter((m) => !m.isBot && !m.connection)) this.remove(room, m, null);
        return this.broadcast(room);
      }
      default:
        throw new GameError('无法识别的请求');
    }
  }

  private createRoom(conn: Connection, rawName: unknown, gameId: unknown) {
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
    const room: Room = {
      code,
      game,
      hostId: id,
      members: [{ id, seatIndex: 0, clientId: conn.clientId, name, isBot: false, connection: conn, dropTimer: null }],
      status: 'lobby',
      options: config
        ? game.normalizeOptions({ ...game.defaultOptions(), ...config.recommendedOptions(config.defaultCount) })
        : game.defaultOptions(),
      targetPlayers: config?.defaultCount ?? null,
      state: null,
      gameSeq: 0,
      botTimers: new Map(),
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
      member.connection.send({ type: 'left', reason: '你在另一个窗口打开了这个房间' });
      member.connection.clientId = null;
    }
    member.connection = conn;
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
    room.state = room.game.reduce(room.state, playerId, action, Math.random);
    if (room.game.isOver(room.state)) {
      room.status = 'ended';
      this.clearBotTimers(room);
    }
    this.broadcast(room);
    this.scheduleBots(room);
  }

  private clearBotTimers(room: Room) {
    for (const t of room.botTimers.values()) clearTimeout(t);
    room.botTimers.clear();
  }

  /** 机器人像真人一样隔一小会儿再行动 */
  private scheduleBots(room: Room) {
    const game = room.game;
    if (room.status !== 'playing' || !game.botAction) return;
    for (const bot of room.members.filter((m) => m.isBot)) {
      if (room.botTimers.has(bot.id)) continue;
      if (game.botAction(room.state, bot.id, Math.random) === null) continue;
      const delay = (900 + Math.random() * 1600) * BOT_PACE;
      room.botTimers.set(
        bot.id,
        setTimeout(() => {
          room.botTimers.delete(bot.id);
          if (room.status !== 'playing') return;
          const action = game.botAction!(room.state, bot.id, Math.random);
          if (action === null) return;
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
      players: [...room.members].sort((a, b) => a.seatIndex - b.seatIndex).map((m) => ({
        id: m.id,
        name: m.name,
        connected: m.isBot || m.connection !== null,
        isBot: m.isBot,
        seatIndex: m.seatIndex,
      })),
      status: room.status,
      options: room.options,
      targetPlayers: room.targetPlayers,
      startBlocker: room.status === 'lobby' ? this.startBlocker(room) : null,
      gameSeq: room.gameSeq,
      view: room.state === null ? null : room.game.view(room.state, viewer.id),
      you: viewer.id,
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
