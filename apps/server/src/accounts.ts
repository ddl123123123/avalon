import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from 'node:crypto';
import { GameError, NAME_MAX_LENGTH, type AccountUser } from '@tabletop/shared';
import type { Database } from './db';

/**
 * 账号与登录会话，存在 Postgres 的 users / sessions 表里（见 db.ts）。
 *
 * - 密码用 scrypt 加盐散列，只存散列。
 * - 浏览器拿到的会话令牌是 32 字节随机数，数据库里只存它的 SHA-256，库泄露了也不能拿来登录。
 * - 「记住我」的会话 30 天不用才过期，每天用到时顺延；最长 180 天后必须重新输入密码。
 *   不勾「记住我」的会话随浏览器关闭失效，服务器这边闲置 12 小时也作废。
 */

export const SESSION_IDLE_MS = 30 * 24 * 3600_000;
export const SESSION_MAX_MS = 180 * 24 * 3600_000;
export const BROWSER_SESSION_IDLE_MS = 12 * 3600_000;
/** 距离上次顺延超过这么久，才再顺延一次（同时重发 Cookie），避免每个请求都写库 */
export const SESSION_REFRESH_MS = 24 * 3600_000;

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 32 } as const;
const USERNAME = /^[A-Za-z0-9_]{3,20}$/;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

function scrypt(password: string, salt: Buffer, keylen: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scryptCb(password, salt, keylen, options, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const { N, r, p, keylen } = SCRYPT;
  const key = await scrypt(password, salt, keylen, { N, r, p, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${N}$${r}$${p}$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64url');
  const key = await scrypt(password, Buffer.from(salt, 'base64url'), expected.length, {
    N: Number(n), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024,
  });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** 用户名不存在时也算一遍散列，让「用户名错」和「密码错」耗时一样，不能借此探测谁注册过 */
let dummyHash: Promise<string> | null = null;

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export function cleanUsername(raw: unknown): string {
  const username = typeof raw === 'string' ? raw.trim() : '';
  if (!USERNAME.test(username)) throw new GameError('用户名要 3–20 位，只能用英文字母、数字和下划线');
  return username;
}

export function cleanDisplayName(raw: unknown): string {
  const name = typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim() : '';
  if (!name) throw new GameError('起个昵称，同桌的人会看到它');
  return [...name].slice(0, NAME_MAX_LENGTH).join('');
}

export function checkPassword(raw: unknown): string {
  const password = typeof raw === 'string' ? raw : '';
  if (password.length < PASSWORD_MIN) throw new GameError(`密码至少 ${PASSWORD_MIN} 位`);
  if (password.length > PASSWORD_MAX) throw new GameError(`密码最多 ${PASSWORD_MAX} 位`);
  return password;
}

interface UserRow {
  id: string;
  username: string;
  display_name: string;
  password_hash: string;
  is_admin: boolean;
}

interface SessionRow {
  user_id: string;
  created_at: Date;
  refreshed_at: Date;
  expires_at: Date;
  persistent: boolean;
}

export interface Session {
  tokenHash: string;
  userId: string;
  persistent: boolean;
  expiresAt: number;
}

export interface ResolvedSession {
  user: AccountUser;
  session: Session;
  /** 这次顺延了有效期，调用方应重发 Cookie */
  refreshed: boolean;
}

const toUser = (row: UserRow): AccountUser => ({
  id: row.id,
  username: row.username,
  displayName: row.display_name,
  ...(row.is_admin ? { isAdmin: true } : {}),
});

const USER_COLUMNS = 'id, username, display_name, password_hash, is_admin';

export class AccountStore {
  constructor(private db: Database, private now: () => number = Date.now) {}

  private async userRow(where: 'id' | 'username', value: string): Promise<UserRow | null> {
    const column = where === 'id' ? 'id' : 'lower(username)';
    const { rows } = await this.db.query<UserRow>(
      `SELECT ${USER_COLUMNS} FROM users WHERE ${column} = $1`,
      [where === 'id' ? value : value.toLowerCase()],
    );
    return rows[0] ?? null;
  }

  async getUser(id: string): Promise<AccountUser | null> {
    const row = await this.userRow('id', id);
    return row ? toUser(row) : null;
  }

  async register(rawUsername: unknown, rawPassword: unknown, rawDisplayName: unknown): Promise<AccountUser> {
    const username = cleanUsername(rawUsername);
    const displayName = cleanDisplayName(rawDisplayName);
    const password = checkPassword(rawPassword);
    if (await this.userRow('username', username)) throw new GameError('这个用户名已经有人用了');
    const passwordHash = await hashPassword(password);
    const id = randomBytes(9).toString('base64url');
    const at = new Date(this.now());
    try {
      await this.db.transaction(async (tx) => {
        await tx.query(
          'INSERT INTO users (id, username, display_name, password_hash, created_at, last_seen_at) VALUES ($1, $2, $3, $4, $5, $5)',
          [id, username, displayName, passwordHash, at],
        );
        await tx.query("INSERT INTO auth_events (user_id, kind, at) VALUES ($1, 'register', $2)", [id, at]);
      });
    } catch (err) {
      // 两个人同时抢同一个用户名：散列期间被别人注册了
      if ((err as { code?: string }).code === '23505') throw new GameError('这个用户名已经有人用了');
      throw err;
    }
    return { id, username, displayName };
  }

  /** 用户名或密码不对都返回 null，不区分是哪一个 */
  async authenticate(rawUsername: unknown, rawPassword: unknown): Promise<AccountUser | null> {
    const username = typeof rawUsername === 'string' ? rawUsername.trim() : '';
    const password = typeof rawPassword === 'string' ? rawPassword : '';
    const row = username && username.length <= 20 && password.length <= PASSWORD_MAX ? await this.userRow('username', username) : null;
    if (!row) {
      dummyHash ??= hashPassword(randomBytes(12).toString('hex'));
      await verifyPassword(password, await dummyHash);
      return null;
    }
    if (!(await verifyPassword(password, row.password_hash))) return null;
    const at = new Date(this.now());
    await this.db.query("INSERT INTO auth_events (user_id, kind, at) VALUES ($1, 'login', $2)", [row.id, at]);
    await this.db.query('UPDATE users SET last_seen_at = $2 WHERE id = $1', [row.id, at]);
    return toUser(row);
  }

  async changePassword(userId: string, rawCurrent: unknown, rawNext: unknown): Promise<void> {
    const row = await this.userRow('id', userId);
    if (!row) throw new GameError('账号不存在');
    const current = typeof rawCurrent === 'string' ? rawCurrent : '';
    if (!(await verifyPassword(current, row.password_hash))) throw new GameError('当前密码不对');
    const next = checkPassword(rawNext);
    await this.db.query('UPDATE users SET password_hash = $2 WHERE id = $1', [userId, await hashPassword(next)]);
  }

  async updateDisplayName(userId: string, rawDisplayName: unknown): Promise<AccountUser> {
    const displayName = cleanDisplayName(rawDisplayName);
    await this.db.query('UPDATE users SET display_name = $2 WHERE id = $1', [userId, displayName]);
    const user = await this.getUser(userId);
    if (!user) throw new GameError('账号不存在');
    return user;
  }

  /** 管理员只能用命令行授予（见 admin-cli.ts），不能靠注册某个用户名得到 */
  async setAdmin(username: string, isAdmin: boolean): Promise<AccountUser | null> {
    const { rows } = await this.db.query<UserRow>(
      `UPDATE users SET is_admin = $2 WHERE lower(username) = $1 RETURNING ${USER_COLUMNS}`,
      [username.toLowerCase(), isAdmin],
    );
    return rows[0] ? toUser(rows[0]) : null;
  }

  /** 新建会话，返回只交给浏览器一次的明文令牌 */
  async createSession(userId: string, persistent: boolean): Promise<{ token: string; session: Session }> {
    const token = randomBytes(32).toString('base64url');
    const now = this.now();
    const expiresAt = now + (persistent ? SESSION_IDLE_MS : BROWSER_SESSION_IDLE_MS);
    const tokenHash = hashToken(token);
    await this.db.query(
      'INSERT INTO sessions (token_hash, user_id, created_at, refreshed_at, expires_at, persistent) VALUES ($1, $2, $3, $3, $4, $5)',
      [tokenHash, userId, new Date(now), new Date(expiresAt), persistent],
    );
    return { token, session: { tokenHash, userId, persistent, expiresAt } };
  }

  /** 查会话；过期的顺手删掉。到了该顺延的时候顺延有效期。 */
  async resolveSession(token: string | null | undefined): Promise<ResolvedSession | null> {
    if (!token || token.length > 128) return null;
    const tokenHash = hashToken(token);
    const { rows } = await this.db.query<SessionRow>(
      'SELECT user_id, created_at, refreshed_at, expires_at, persistent FROM sessions WHERE token_hash = $1',
      [tokenHash],
    );
    const row = rows[0];
    if (!row) return null;
    const now = this.now();
    const createdAt = row.created_at.getTime();
    if (row.expires_at.getTime() <= now || now - createdAt >= SESSION_MAX_MS) {
      await this.revokeSession(tokenHash);
      return null;
    }
    const user = await this.getUser(row.user_id);
    if (!user) return null;
    let expiresAt = row.expires_at.getTime();
    let refreshed = false;
    const idle = row.persistent ? SESSION_IDLE_MS : BROWSER_SESSION_IDLE_MS;
    // 浏览器会话闲置期短，按小时顺延；长期会话按天顺延
    const refreshEvery = row.persistent ? SESSION_REFRESH_MS : Math.min(SESSION_REFRESH_MS, idle / 12);
    if (now - row.refreshed_at.getTime() >= refreshEvery) {
      expiresAt = Math.min(now + idle, createdAt + SESSION_MAX_MS);
      await this.db.query('UPDATE sessions SET refreshed_at = $2, expires_at = $3 WHERE token_hash = $1', [tokenHash, new Date(now), new Date(expiresAt)]);
      await this.db.query('UPDATE users SET last_seen_at = $2 WHERE id = $1', [row.user_id, new Date(now)]);
      refreshed = true;
    }
    return { user, session: { tokenHash, userId: row.user_id, persistent: row.persistent, expiresAt }, refreshed };
  }

  async revokeSession(tokenHash: string) {
    await this.db.query('DELETE FROM sessions WHERE token_hash = $1', [tokenHash]);
  }

  /** 退出该账号的其他会话，返回被退出的会话 */
  async revokeOtherSessions(userId: string, keepTokenHash: string | null): Promise<string[]> {
    const { rows } = await this.db.query<{ token_hash: string }>(
      'DELETE FROM sessions WHERE user_id = $1 AND token_hash <> $2 RETURNING token_hash',
      [userId, keepTokenHash ?? ''],
    );
    return rows.map((row) => row.token_hash);
  }

  async countSessions(userId: string): Promise<number> {
    const { rows } = await this.db.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM sessions WHERE user_id = $1 AND expires_at > $2',
      [userId, new Date(this.now())],
    );
    return rows[0]?.n ?? 0;
  }

  async pruneExpired() {
    const now = this.now();
    await this.db.query('DELETE FROM sessions WHERE expires_at <= $1 OR created_at <= $2', [new Date(now), new Date(now - SESSION_MAX_MS)]);
  }
}
