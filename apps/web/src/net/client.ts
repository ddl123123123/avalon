import { useSyncExternalStore } from 'react';
import type { ClientMessage, RoomSnapshot, ServerMessage } from '@tabletop/shared';
import { navigate } from './route';

/**
 * 与房间服务器的连接。整个应用只有一条 WebSocket，状态放在一个小 store 里。
 *
 * 调试多人时可以在地址后加 ?as=名字，同一个浏览器的不同标签页就会被当成不同的玩家。
 */

const alias = new URLSearchParams(location.search).get('as');
const scoped = (key: string) => (alias ? `${key}:${alias}` : key);

function stored(key: string): string | null {
  try {
    return localStorage.getItem(scoped(key));
  } catch {
    return null;
  }
}
function store(key: string, value: string) {
  try {
    localStorage.setItem(scoped(key), value);
  } catch {
    /* 隐私模式下可能写不进去，不影响本次会话 */
  }
}

function loadClientId(): string {
  let id = stored('tabletop.clientId');
  if (!id) {
    // 手机通过局域网 HTTP 打开时，仍可用安全随机数生成重连标识。
    id = crypto.randomUUID?.() ?? Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
      byte.toString(16).padStart(2, '0'),
    ).join('');
    store('tabletop.clientId', id);
  }
  return id;
}

const clientId = loadClientId();

export interface Notice {
  id: number;
  text: string;
}

export interface RecentRoom {
  code: string;
  gameId: string;
  lastJoinedAt: number;
}

const RECENT_ROOM_KEY = 'tabletop.recentRooms';

function loadRecentRooms(): RecentRoom[] {
  try {
    const raw = stored(RECENT_ROOM_KEY);
    if (!raw) return [];
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value
      .filter(
        (room): room is RecentRoom =>
          room !== null &&
          typeof room === 'object' &&
          typeof room.code === 'string' &&
          /^\d{4,8}$/.test(room.code) &&
          typeof room.gameId === 'string' &&
          room.gameId.length > 0 &&
          typeof room.lastJoinedAt === 'number' &&
          Number.isFinite(room.lastJoinedAt),
      )
      .slice(0, 8);
  } catch {
    return [];
  }
}

export interface NetState {
  link: 'connecting' | 'online' | 'offline';
  playerId: string | null;
  /** 服务器记得我上次所在的房间（还没回去） */
  lastRoomCode: string | null;
  /** 本机最近进入过的房间，用于从首页重新加入 */
  recentRooms: RecentRoom[];
  room: RoomSnapshot | null;
  /** 正在尝试进入的房间 */
  joining: string | null;
  notice: Notice | null;
}

let state: NetState = {
  link: 'connecting',
  playerId: null,
  lastRoomCode: null,
  recentRooms: loadRecentRooms(),
  room: null,
  joining: null,
  notice: null,
};
const listeners = new Set<() => void>();
function set(patch: Partial<NetState>) {
  state = { ...state, ...patch };
  listeners.forEach((fn) => fn());
}

function rememberRoom(code: string, gameId: string): RecentRoom[] {
  const recentRooms = [{ code, gameId, lastJoinedAt: Date.now() }, ...state.recentRooms.filter((room) => room.code !== code)].slice(0, 8);
  store(RECENT_ROOM_KEY, JSON.stringify(recentRooms));
  return recentRooms;
}

export function forgetRecentRoom(code: string) {
  const recentRooms = state.recentRooms.filter((room) => room.code !== code);
  store(RECENT_ROOM_KEY, JSON.stringify(recentRooms));
  set({ recentRooms });
}

let socket: WebSocket | null = null;
let retry = 0;
let noticeId = 0;
/** 断线重连后要回到的房间 */
let intent: { code: string; name: string } | null = null;

export function notify(text: string) {
  set({ notice: { id: ++noticeId, text } });
}
export function dismissNotice() {
  set({ notice: null });
}

function raw(msg: ClientMessage) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(msg));
  else notify('还没连上服务器，稍等一下');
}

function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}/ws`);
  socket = ws;
  set({ link: retry === 0 ? 'connecting' : 'offline' });

  ws.onopen = () => {
    retry = 0;
    ws.send(JSON.stringify({ type: 'hello', clientId } satisfies ClientMessage));
  };
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data) as ServerMessage;
    switch (msg.type) {
      case 'welcome':
        set({ link: 'online', playerId: msg.playerId, lastRoomCode: msg.roomCode });
        if (intent) {
          set({ joining: intent.code });
          ws.send(JSON.stringify({ type: 'join_room', ...intent } satisfies ClientMessage));
        }
        break;
      case 'room':
        intent = { code: msg.room.code, name: getName() };
        set({
          room: msg.room,
          joining: null,
          lastRoomCode: msg.room.code,
          recentRooms: state.room?.code === msg.room.code ? state.recentRooms : rememberRoom(msg.room.code, msg.room.gameId),
        });
        break;
      case 'left':
        intent = null;
        set({ room: null, joining: null, lastRoomCode: null });
        navigate('/');
        if (msg.reason) notify(msg.reason);
        break;
      case 'error':
        // 进房失败（房间不存在、已开局……）：放弃这次意图，回到未入房状态
        if (state.joining) {
          intent = null;
          set({ joining: null, room: null });
        }
        notify(msg.message);
        break;
    }
  };
  ws.onclose = () => {
    if (socket !== ws) return;
    socket = null;
    set({ link: 'offline' });
    retry += 1;
    setTimeout(connect, Math.min(4000, 400 * 2 ** Math.min(retry, 4)));
  };
  ws.onerror = () => ws.close();
}
connect();

// 手机切回前台时立刻重连，而不是等退避计时
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && !socket) {
    retry = 0;
    connect();
  }
});

export function getName(): string {
  return stored('tabletop.name') ?? '';
}
export function setName(name: string) {
  store('tabletop.name', name.trim());
}

export const net = {
  createRoom(name: string, gameId: string) {
    setName(name);
    raw({ type: 'create_room', name, gameId });
  },
  joinRoom(code: string, name: string) {
    setName(name);
    intent = { code, name };
    set({ joining: code });
    raw({ type: 'join_room', code, name });
  },
  leaveRoom() {
    intent = null;
    raw({ type: 'leave_room' });
  },
  chooseSeat: (seatIndex: number) => raw({ type: 'choose_seat', seatIndex }),
  setOptions: (options: unknown) => raw({ type: 'set_options', options }),
  setPlayerCount: (playerCount: number) => raw({ type: 'set_player_count', playerCount }),
  addBot: () => raw({ type: 'add_bot' }),
  kick: (playerId: string) => raw({ type: 'kick', playerId }),
  startGame: () => raw({ type: 'start_game' }),
  act: (action: unknown) => raw({ type: 'game_action', action }),
  backToLobby: () => raw({ type: 'back_to_lobby' }),
};

export function useNet(): NetState {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => state,
  );
}
