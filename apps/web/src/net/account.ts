import { useSyncExternalStore } from 'react';
import type { AccountUser } from '@tabletop/shared';
import { debugAlias, getNetState, handleSessionRevoked, reconnect, subscribeNet } from './client';

/**
 * 账号登录态。
 *
 * 浏览器里的持久化策略：
 * - 登录令牌只放在服务器下发的 HttpOnly Cookie 里，页面脚本读不到，localStorage 里没有令牌。
 * - 「记住我」是 30 天不用才过期的长期 Cookie，每天用到时服务器顺延；不勾就是关掉浏览器即失效的会话 Cookie。
 * - localStorage 只缓存昵称这类公开资料，打开页面时先按缓存显示，再向服务器确认；确认失败就清掉。
 * - 同一浏览器的多个标签页通过 BroadcastChannel 同步：一个标签页登录或退出，其他标签页跟着切换身份。
 * - 页面回到前台、离上次确认超过 15 分钟时再确认一次，顺带让服务器顺延有效期。
 */

export interface SessionInfo {
  persistent: boolean;
  expiresAt: number;
  /** 同一账号还在其他设备（浏览器）上登录着的会话数 */
  otherDevices: number;
}

export interface AccountState {
  /** checking：正在向服务器确认（可能已有缓存的 user） */
  status: 'checking' | 'guest' | 'user';
  user: AccountUser | null;
  session: SessionInfo | null;
}

const CACHE_KEY = 'tabletop.account';
const RECHECK_MS = 15 * 60_000;

function readCache(): AccountUser | null {
  if (debugAlias) return null;
  try {
    const value: unknown = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null');
    if (value && typeof value === 'object' && typeof (value as AccountUser).id === 'string' &&
        typeof (value as AccountUser).username === 'string' && typeof (value as AccountUser).displayName === 'string') {
      return value as AccountUser;
    }
  } catch {
    /* 缓存坏了就当没有 */
  }
  return null;
}

function writeCache(user: AccountUser | null) {
  try {
    if (user) localStorage.setItem(CACHE_KEY, JSON.stringify({ id: user.id, username: user.username, displayName: user.displayName }));
    else localStorage.removeItem(CACHE_KEY);
  } catch {
    /* 隐私模式下写不进去：只是下次打开页面时先显示成游客 */
  }
}

let state: AccountState = { status: debugAlias ? 'guest' : 'checking', user: readCache(), session: null };
let checkedAt = 0;
const listeners = new Set<() => void>();
function set(next: AccountState) {
  state = next;
  writeCache(next.user);
  listeners.forEach((fn) => fn());
  reconcile();
}

/**
 * 服务器只在 WebSocket 握手时看 Cookie。登录态和这条连接认出的身份对不上时（刚登录、刚退出、
 * 别的标签页换了账号），重连一次让服务器重新认人。同一种不一致只重连一次，避免来回打转。
 */
let lastFix = '';
function reconcile() {
  const net = getNetState();
  if (state.status === 'checking' || net.link !== 'online') return;
  const want = state.user?.id ?? null;
  const have = net.account?.id ?? null;
  if (want === have) {
    lastFix = '';
    return;
  }
  const key = `${have}->${want}`;
  if (key === lastFix) return;
  lastFix = key;
  reconnect();
}

const channel = typeof BroadcastChannel === 'function' && !debugAlias ? new BroadcastChannel('tabletop-account') : null;

export class AccountError extends Error {}

async function call(path: string, body?: unknown): Promise<{ user: AccountUser | null; session?: SessionInfo }> {
  let res: Response;
  try {
    res = await fetch(`/api/auth/${path}`, body === undefined
      ? { credentials: 'same-origin', cache: 'no-store' }
      : { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  } catch {
    throw new AccountError('连不上服务器，检查一下网络');
  }
  const data = await res.json().catch(() => ({})) as { user?: AccountUser | null; session?: SessionInfo; error?: string };
  if (!res.ok) {
    if (res.status === 401 && path !== 'login') apply(null, null, true);
    throw new AccountError(data.error ?? '出了点问题，请重试');
  }
  return { user: data.user ?? null, session: data.session };
}

/** 更新本地状态。身份变了就重连 WebSocket，并告诉其他标签页 */
function apply(user: AccountUser | null, session: SessionInfo | null | undefined, announce: boolean) {
  checkedAt = Date.now();
  set({ status: user ? 'user' : 'guest', user, session: session ?? null });
  if (announce) channel?.postMessage('changed');
}

/** 向服务器确认当前登录态 */
export async function refreshAccount(): Promise<void> {
  if (debugAlias) return;
  try {
    const { user, session } = await call('me');
    apply(user, session, false);
  } catch {
    // 网络问题：保留缓存的身份，下次再确认
    if (state.status === 'checking') set({ ...state, status: state.user ? 'user' : 'guest' });
  }
}

export const account = {
  async register(input: { username: string; password: string; displayName: string; remember: boolean }) {
    const { user, session } = await call('register', input);
    apply(user, session, true);
  },
  async login(input: { username: string; password: string; remember: boolean }) {
    const { user, session } = await call('login', input);
    apply(user, session, true);
  },
  async logout() {
    try {
      await call('logout', {});
    } finally {
      apply(null, null, true);
    }
  },
  async logoutOthers() {
    const { user, session } = await call('logout-others', {});
    apply(user, session, false);
  },
  async updateProfile(displayName: string) {
    const { user, session } = await call('profile', { displayName });
    apply(user, session, true);
  },
  async changePassword(currentPassword: string, newPassword: string) {
    const { user, session } = await call('password', { currentPassword, newPassword });
    apply(user, session, false);
  },
};

if (!debugAlias) {
  void refreshAccount();
  subscribeNet(reconcile);
  channel?.addEventListener('message', () => void refreshAccount());
  // 服务器注销了本机会话（在别的设备上「退出其他设备」或改了密码）
  handleSessionRevoked(() => void refreshAccount());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - checkedAt > RECHECK_MS) void refreshAccount();
  });
}

/** 登录/账号面板开着没有。首页右上角和房间入口页都能打开它 */
let sheet: { open: boolean; mode: 'login' | 'register' } = { open: false, mode: 'login' };
const sheetListeners = new Set<() => void>();
export function openAccountSheet(mode: 'login' | 'register' = 'login') {
  sheet = { open: true, mode };
  sheetListeners.forEach((fn) => fn());
}
export function closeAccountSheet() {
  sheet = { ...sheet, open: false };
  sheetListeners.forEach((fn) => fn());
}
export function useAccountSheet() {
  return useSyncExternalStore(
    (fn) => {
      sheetListeners.add(fn);
      return () => sheetListeners.delete(fn);
    },
    () => sheet,
  );
}

export function useAccount(): AccountState {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => state,
  );
}
