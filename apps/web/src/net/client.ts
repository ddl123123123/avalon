import { useSyncExternalStore } from 'react';
import {
  GAME_MESSAGE_BYTES, type AccountUser, type ClientMessage, type RoomSnapshot, type SeatSummary, type ServerMessage,
} from '@tabletop/shared';
import { navigate } from './route';

/**
 * 与房间服务器的连接。整个应用只有一条 WebSocket，状态放在一个小 store 里。
 *
 * 调试多人时可以在地址后加 ?as=名字，同一个浏览器的不同标签页就会被当成不同的玩家。
 */

const alias = new URLSearchParams(location.search).get('as');
/** ?as= 调试标签页一律当游客，不然同一个浏览器里的账号 Cookie 会让它们互相顶掉 */
export const debugAlias = alias;
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
      .sort((a, b) => b.lastJoinedAt - a.lastJoinedAt);
  } catch {
    return [];
  }
}

export interface NetState {
  link: 'connecting' | 'online' | 'offline';
  playerId: string | null;
  /** 当前这条连接被服务器认成的账号；游客为 null */
  account: AccountUser | null;
  /** 这个身份在服务器上还占着座位的房间（登录后换设备也能看到） */
  seats: SeatSummary[];
  /** 服务器记得我上次所在的房间（还没回去） */
  lastRoomCode: string | null;
  /** 本机最近进入过的房间，用于从首页重新加入 */
  recentRooms: RecentRoom[];
  room: RoomSnapshot | null;
  /** 正在尝试进入的房间 */
  joining: string | null;
  notice: Notice | null;
  assistantResult: { requestId: string; content: string; privateAnalysis?: string } | null;
  assistantError: { requestId: string; message: string } | null;
}

let serverClockOffset = 0;
let state: NetState = {
  link: 'connecting',
  playerId: null,
  account: null,
  seats: [],
  lastRoomCode: null,
  recentRooms: loadRecentRooms(),
  room: null,
  joining: null,
  notice: null,
  assistantResult: null,
  assistantError: null,
};
const listeners = new Set<() => void>();
function set(patch: Partial<NetState>) {
  state = { ...state, ...patch };
  listeners.forEach((fn) => fn());
}

function rememberRoom(code: string, gameId: string): RecentRoom[] {
  const recentRooms = [{ code, gameId, lastJoinedAt: Date.now() }, ...state.recentRooms.filter((room) => room.code !== code)];
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
/** 服务器以「登录态失效」关闭连接时通知账号模块（见 account.ts） */
let onSessionRevoked: (() => void) | null = null;
export function handleSessionRevoked(fn: () => void) {
  onSessionRevoked = fn;
}
let noticeId = 0;
let pendingPolish: { id: string; finish: (result: { content: string } | { message: string }) => void } | null = null;
/** 断线重连后要回到的房间 */
let intent: { code: string; name: string } | null = null;

export function notify(text: string) {
  set({ notice: { id: ++noticeId, text } });
}
export function dismissNotice() {
  set({ notice: null });
}

function raw(msg: ClientMessage): boolean {
  if (socket?.readyState === WebSocket.OPEN) {
    const data = JSON.stringify(msg);
    if (new TextEncoder().encode(data).byteLength > GAME_MESSAGE_BYTES) {
      notify('这段内容超出单次传输容量，请缩短后重试');
      return false;
    }
    socket.send(data);
    return true;
  }
  notify('还没连上服务器，稍等一下');
  return false;
}

function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}/ws`);
  socket = ws;
  set({ link: retry === 0 ? 'connecting' : 'offline' });

  ws.onopen = () => {
    retry = 0;
    ws.send(JSON.stringify({ type: 'hello', clientId, ...(alias ? { guest: true } : {}) } satisfies ClientMessage));
  };
  ws.onmessage = (ev) => {
    // 已经换掉的旧连接（登录后重连）上迟到的消息一律不理
    if (socket !== ws) return;
    const msg = JSON.parse(ev.data) as ServerMessage;
    switch (msg.type) {
      case 'welcome':
        set({ link: 'online', playerId: msg.playerId, lastRoomCode: msg.roomCode, account: msg.account, seats: msg.seats ?? [] });
        if (intent) {
          set({ joining: intent.code });
          ws.send(JSON.stringify({ type: 'join_room', ...intent } satisfies ClientMessage));
        }
        break;
      case 'room':
        serverClockOffset = msg.room.serverTime === undefined ? 0 : msg.room.serverTime - Date.now();
        if (state.room?.code !== msg.room.code || state.room?.gameSeq !== msg.room.gameSeq || msg.room.status !== 'playing') {
          pendingPolish?.finish({ message: '原发言轮次已结束。' });
        }
        intent = { code: msg.room.code, name: getName() };
        set({
          room: msg.room,
          joining: null,
          lastRoomCode: msg.room.code,
          recentRooms: state.room?.code === msg.room.code ? state.recentRooms : rememberRoom(msg.room.code, msg.room.gameId),
        });
        break;
      case 'avalon_assistant_result':
        if (pendingPolish?.id === msg.requestId) pendingPolish.finish({ content: msg.content });
        else set({ assistantResult: { requestId: msg.requestId, content: msg.content, privateAnalysis: msg.privateAnalysis } });
        break;
      case 'avalon_assistant_error':
        if (pendingPolish?.id === msg.requestId) pendingPolish.finish({ message: msg.message });
        else set({ assistantError: { requestId: msg.requestId, message: msg.message } });
        break;
      case 'left': {
        pendingPolish?.finish({ message: '已离开当前对局。' });
        intent = null;
        // 大厅里离开就是让出座位；对局中离开座位还在，账号换设备也能回去
        const gone = state.room && state.room.status === 'lobby' ? state.room.code : null;
        set({ room: null, joining: null, lastRoomCode: null, seats: state.seats.filter((seat) => seat.code !== gone) });
        navigate('/');
        if (msg.reason) notify(msg.reason);
        break;
      }
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
  ws.onclose = (ev) => {
    if (socket !== ws) return;
    socket = null;
    if (ev.code === 4001) onSessionRevoked?.();
    pendingPolish?.finish({ message: '连接已断开，原稿仍可继续编辑。' });
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

/**
 * 换了身份（登录、注册、退出）之后重连：服务器只在握手时看 Cookie。
 * 人在房间里的话，重连后会凭 intent 自动回到原来的座位。
 */
export function reconnect() {
  const old = socket;
  socket = null;
  pendingPolish?.finish({ message: '连接已切换，原稿仍可继续编辑。' });
  old?.close();
  retry = 0;
  connect();
}

export function getName(): string {
  return state.account?.displayName ?? stored('tabletop.name') ?? '';
}
export function setName(name: string) {
  store('tabletop.name', name.trim());
}

export const net = {
  serverNow: () => Date.now() + serverClockOffset,
  createRoom(name: string, gameId: string, options?: unknown) {
    // 登录后入座用账号昵称，不覆盖游客时用的名字
    if (!state.account) setName(name);
    raw({ type: 'create_room', name, gameId, options });
  },
  joinRoom(code: string, name: string) {
    if (!state.account) setName(name);
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
  setAvalonBotModel: (playerId: string, profile: string | null) => raw({ type: 'set_avalon_bot_model', playerId, profile }),
  setAvalonBotModels: (profile: string | null) => raw({ type: 'set_avalon_bot_models', profile }),
  kick: (playerId: string) => raw({ type: 'kick', playerId }),
  startGame: () => raw({ type: 'start_game' }),
  act: (action: unknown) => raw({ type: 'game_action', action }),
  askAvalonAssistant(input: Omit<Extract<ClientMessage, { type: 'avalon_assistant' }>, 'type'>) {
    set({ assistantResult: null, assistantError: null });
    return raw({ type: 'avalon_assistant', ...input });
  },
  polishAvalonSpeech(draft: { gameSeq: number; turn: string; text: string }): Promise<string> {
    if (pendingPolish) return Promise.reject(new Error('上一条发言还在润色。'));
    const id = `polish-${crypto.randomUUID?.() ?? crypto.getRandomValues(new Uint32Array(4)).join('-')}`;
    return new Promise((resolve, reject) => {
      const finish = (result: { content: string } | { message: string }) => {
        clearTimeout(timer);
        pendingPolish = null;
        if ('message' in result) reject(new Error(result.message));
        else resolve(result.content);
      };
      const timer = window.setTimeout(() => finish({ message: '润色超时，你仍可以发送原文。' }), 20_000);
      pendingPolish = { id, finish };
      if (!raw({ type: 'avalon_assistant', feature: 'speech-polish', requestId: id, draft })) {
        finish({ message: '未能发起润色，你仍可以发送原文。' });
      }
    });
  },
  backToLobby: () => raw({ type: 'back_to_lobby' }),
};

export function getNetState(): NetState {
  return state;
}

export function subscribeNet(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useNet(): NetState {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => state,
  );
}
