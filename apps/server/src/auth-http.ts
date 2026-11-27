import type { IncomingMessage, ServerResponse } from 'node:http';
import { GameError, type AccountUser } from '@tabletop/shared';
import type { Stats } from './stats';
import type { AccountStore, ResolvedSession, Session } from './accounts';

/**
 * /api/auth/* 的 HTTP 接口。
 *
 * 登录态放在 HttpOnly + SameSite=Lax 的 Cookie 里：页面脚本读不到令牌，XSS 偷不走；
 * 浏览器连 /ws 时会自动带上，服务器在握手时就认出账号。
 * 写操作只收同源的 JSON 请求（校验 Origin），挡住跨站伪造。
 */

export const SESSION_COOKIE = 'tt_session';
const BODY_LIMIT = 4 * 1024;

/** 登录失败的限流：同一 IP 或同一用户名 10 分钟内失败太多次就先挡一会儿 */
const FAIL_WINDOW_MS = 10 * 60_000;
const FAIL_LIMIT_IP = 20;
const FAIL_LIMIT_USER = 8;
/** 注册：同一 IP 每小时最多注册几个号 */
const REGISTER_WINDOW_MS = 3600_000;
const REGISTER_LIMIT_IP = 10;

export interface AuthHooks {
  /** 这些会话被注销了：断开用它们登录的连接 */
  revoked(tokenHashes: string[]): void;
  /** 账号资料变了（昵称） */
  profileChanged(user: AccountUser): void;
}

export function parseCookies(header: string | undefined): Map<string, string> {
  const cookies = new Map<string, string>();
  for (const part of (header ?? '').split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const key = part.slice(0, eq).trim();
    if (!key || cookies.has(key)) continue;
    try {
      cookies.set(key, decodeURIComponent(part.slice(eq + 1).trim()));
    } catch {
      /* 坏掉的 Cookie 直接忽略 */
    }
  }
  return cookies;
}

/** 反代（Nginx）后面看协议要靠 X-Forwarded-Proto */
export function isSecureRequest(req: IncomingMessage): boolean {
  const forwarded = req.headers['x-forwarded-proto'];
  const proto = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim();
  return proto === 'https' || Boolean((req.socket as { encrypted?: boolean }).encrypted);
}

export function clientIp(req: IncomingMessage): string {
  const real = req.headers['x-real-ip'];
  return (Array.isArray(real) ? real[0] : real) ?? req.socket.remoteAddress ?? 'unknown';
}

/** Origin 缺省（同源 GET、部分老浏览器）放行；有就必须和 Host 一致 */
export function sameOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

export function sessionFromRequest(store: AccountStore, req: IncomingMessage): Promise<ResolvedSession | null> {
  return store.resolveSession(parseCookies(req.headers.cookie).get(SESSION_COOKIE));
}

function sessionCookie(req: IncomingMessage, token: string, session: Session | null): string {
  const parts = [`${SESSION_COOKIE}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Lax'];
  if (isSecureRequest(req)) parts.push('Secure');
  if (!session) parts.push('Max-Age=0');
  // 「记住我」：给 Cookie 一个和服务器端一致的寿命；否则是浏览器会话 Cookie，关掉浏览器就没了
  else if (session.persistent) parts.push(`Max-Age=${Math.max(0, Math.floor((session.expiresAt - Date.now()) / 1000))}`);
  return parts.join('; ');
}

export function send(res: ServerResponse, status: number, body: unknown, cookie?: string) {
  const headers: Record<string, string> = {
    'content-type': 'application/json; charset=utf-8',
    // 带登录态的响应不能被任何缓存留住
    'cache-control': 'no-store',
  };
  if (cookie) headers['set-cookie'] = cookie;
  res.writeHead(status, headers);
  res.end(JSON.stringify(body));
}

function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    if (!String(req.headers['content-type'] ?? '').startsWith('application/json')) {
      reject(new GameError('请求格式不对'));
      return;
    }
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > BODY_LIMIT) {
        reject(new GameError('请求太大了'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
        resolve(value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {});
      } catch {
        reject(new GameError('请求格式不对'));
      }
    });
    req.on('error', reject);
  });
}

class Throttle {
  private hits = new Map<string, number[]>();
  constructor(private windowMs: number, private limit: number) {}
  blocked(key: string, now = Date.now()): boolean {
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (recent.length) this.hits.set(key, recent);
    else this.hits.delete(key);
    return recent.length >= this.limit;
  }
  hit(key: string, now = Date.now()) {
    this.hits.set(key, [...(this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs), now]);
  }
  clear(key: string) {
    this.hits.delete(key);
  }
  sweep(now = Date.now()) {
    for (const key of [...this.hits.keys()]) this.blocked(key, now);
  }
}

export function createAuthHandler(store: AccountStore, hooks: AuthHooks, stats: Pick<Stats, 'playerProfile'>) {
  const ipFailures = new Throttle(FAIL_WINDOW_MS, FAIL_LIMIT_IP);
  const userFailures = new Throttle(FAIL_WINDOW_MS, FAIL_LIMIT_USER);
  const registrations = new Throttle(REGISTER_WINDOW_MS, REGISTER_LIMIT_IP);
  const sweep = setInterval(() => {
    ipFailures.sweep();
    userFailures.sweep();
    registrations.sweep();
    store.pruneExpired().catch((err) => console.error('[auth] prune failed', err));
  }, 10 * 60_000);
  sweep.unref();

  const me = async (resolved: ResolvedSession) => ({
    user: resolved.user,
    session: {
      persistent: resolved.session.persistent,
      expiresAt: resolved.session.expiresAt,
      otherDevices: Math.max(0, (await store.countSessions(resolved.user.id)) - 1),
    },
  });

  const issue = async (req: IncomingMessage, res: ServerResponse, user: AccountUser, remember: boolean, status = 200) => {
    // 登录时替换掉浏览器里旧的会话，避免一个浏览器攒下一堆会话
    const previous = await sessionFromRequest(store, req);
    if (previous) await store.revokeSession(previous.session.tokenHash);
    const { token, session } = await store.createSession(user.id, remember);
    send(res, status, await me({ user, session, refreshed: true }), sessionCookie(req, token, session));
  };

  return async function handleAuth(req: IncomingMessage, res: ServerResponse, pathname: string): Promise<void> {
    const route = pathname.slice('/api/auth/'.length);
    const method = req.method ?? 'GET';
    try {
      if (method !== 'GET' && !sameOrigin(req)) return send(res, 403, { error: '请从桌游厅页面操作' });

      if (route === 'me' && method === 'GET') {
        const resolved = await sessionFromRequest(store, req);
        if (!resolved) {
          // 浏览器带着失效的令牌：顺手清掉，下次就不再带了
          const stale = parseCookies(req.headers.cookie).has(SESSION_COOKIE);
          return send(res, 200, { user: null }, stale ? sessionCookie(req, '', null) : undefined);
        }
        // 顺延了有效期就重发 Cookie，让浏览器那边的过期时间跟着往后挪
        const cookie = resolved.refreshed && resolved.session.persistent
          ? sessionCookie(req, parseCookies(req.headers.cookie).get(SESSION_COOKIE)!, resolved.session)
          : undefined;
        return send(res, 200, await me(resolved), cookie);
      }

      if (route === 'register' && method === 'POST') {
        const ip = clientIp(req);
        if (registrations.blocked(ip)) return send(res, 429, { error: '注册太频繁了，过一会儿再试' });
        const body = await readJson(req);
        const user = await store.register(body.username, body.password, body.displayName);
        registrations.hit(ip);
        return await issue(req, res, user, body.remember !== false, 201);
      }

      if (route === 'login' && method === 'POST') {
        const ip = clientIp(req);
        const body = await readJson(req);
        const userKey = typeof body.username === 'string' ? body.username.trim().toLowerCase().slice(0, 40) : '';
        if (ipFailures.blocked(ip) || userFailures.blocked(userKey)) {
          return send(res, 429, { error: '尝试次数太多了，10 分钟后再试' });
        }
        const user = await store.authenticate(body.username, body.password);
        if (!user) {
          ipFailures.hit(ip);
          userFailures.hit(userKey);
          return send(res, 401, { error: '用户名或密码不对' });
        }
        userFailures.clear(userKey);
        return await issue(req, res, user, body.remember !== false);
      }

      if (route === 'logout' && method === 'POST') {
        const resolved = await sessionFromRequest(store, req);
        if (resolved) {
          await store.revokeSession(resolved.session.tokenHash);
          hooks.revoked([resolved.session.tokenHash]);
        }
        return send(res, 200, { user: null }, sessionCookie(req, '', null));
      }

      // 以下接口要求已登录
      const resolved = await sessionFromRequest(store, req);
      if (!resolved) return send(res, 401, { error: '登录已过期，请重新登录' }, sessionCookie(req, '', null));

      if (route === 'stats' && method === 'GET') {
        return send(res, 200, await stats.playerProfile(resolved.user.id));
      }

      if (route === 'logout-others' && method === 'POST') {
        hooks.revoked(await store.revokeOtherSessions(resolved.user.id, resolved.session.tokenHash));
        return send(res, 200, await me(resolved));
      }

      if (route === 'profile' && method === 'POST') {
        const body = await readJson(req);
        const user = await store.updateDisplayName(resolved.user.id, body.displayName);
        hooks.profileChanged(user);
        return send(res, 200, await me({ ...resolved, user }));
      }

      if (route === 'password' && method === 'POST') {
        const body = await readJson(req);
        await store.changePassword(resolved.user.id, body.currentPassword, body.newPassword);
        // 改密码后其他设备全部下线，本机保持登录
        hooks.revoked(await store.revokeOtherSessions(resolved.user.id, resolved.session.tokenHash));
        return send(res, 200, await me(resolved));
      }

      return send(res, 404, { error: '没有这个接口' });
    } catch (err) {
      if (err instanceof GameError) return send(res, 400, { error: err.message });
      console.error('[auth] unexpected error', err);
      return send(res, 500, { error: '服务器出了点问题，请重试' });
    }
  };
}
