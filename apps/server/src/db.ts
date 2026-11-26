import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

/**
 * 桌游厅的数据库：线上是和塔罗共用的 Postgres 实例里单独的 tabletop 库（DATABASE_URL），
 * 本地开发和测试没有 DATABASE_URL 时用 PGlite（进程内的 Postgres），SQL 完全一样。
 */

export interface Sql {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

export interface Database extends Sql {
  transaction<T>(fn: (tx: Sql) => Promise<T>): Promise<T>;
  close(): Promise<void>;
  /** 给 /healthz 和管理页看的：postgres 还是 pglite */
  readonly kind: 'postgres' | 'pglite';
}

/** 按顺序执行，执行过的记在 schema_migrations 里。只能往后加，不要改已经上线的条目。 */
const MIGRATIONS: string[] = [
  `
  CREATE TABLE users (
    id text PRIMARY KEY,
    username text NOT NULL,
    display_name text NOT NULL,
    password_hash text NOT NULL,
    is_admin boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL,
    last_seen_at timestamptz
  );
  CREATE UNIQUE INDEX users_username_key ON users (lower(username));
  CREATE INDEX users_created ON users (created_at);

  CREATE TABLE sessions (
    token_hash text PRIMARY KEY,
    user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL,
    refreshed_at timestamptz NOT NULL,
    expires_at timestamptz NOT NULL,
    persistent boolean NOT NULL
  );
  CREATE INDEX sessions_user ON sessions (user_id);
  CREATE INDEX sessions_expiry ON sessions (expires_at);

  -- 注册和每次输密码登录各记一条，用来看登录趋势
  CREATE TABLE auth_events (
    id bigserial PRIMARY KEY,
    user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind text NOT NULL CHECK (kind IN ('register', 'login')),
    at timestamptz NOT NULL
  );
  CREATE INDEX auth_events_at ON auth_events (at);

  -- 每天每个访客一行（游客按浏览器、登录用户按账号），算日活
  CREATE TABLE daily_visitors (
    day date NOT NULL,
    visitor text NOT NULL,
    user_id text REFERENCES users(id) ON DELETE SET NULL,
    PRIMARY KEY (day, visitor)
  );

  CREATE TABLE games (
    id bigserial PRIMARY KEY,
    room_code text NOT NULL,
    game_id text NOT NULL,
    status text NOT NULL CHECK (status IN ('playing', 'finished', 'abandoned')),
    started_at timestamptz NOT NULL,
    ended_at timestamptz,
    humans int NOT NULL,
    bots int NOT NULL,
    registered int NOT NULL
  );
  CREATE INDEX games_started ON games (started_at);

  CREATE TABLE game_players (
    game_id bigint NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    seat int NOT NULL,
    user_id text REFERENCES users(id) ON DELETE SET NULL,
    is_bot boolean NOT NULL,
    PRIMARY KEY (game_id, seat)
  );
  CREATE INDEX game_players_user ON game_players (user_id);
  `,
];

export async function migrate(db: Database) {
  await db.query('CREATE TABLE IF NOT EXISTS schema_migrations (version int PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  const { rows } = await db.query<{ version: number }>('SELECT version FROM schema_migrations');
  const done = new Set(rows.map((row) => Number(row.version)));
  for (const [index, sql] of MIGRATIONS.entries()) {
    const version = index + 1;
    if (done.has(version)) continue;
    await db.transaction(async (tx) => {
      // 多个进程同时启动时，只让一个执行迁移
      await tx.query('LOCK TABLE schema_migrations IN EXCLUSIVE MODE');
      const again = await tx.query('SELECT 1 FROM schema_migrations WHERE version = $1', [version]);
      if (again.rows.length) return;
      for (const statement of splitStatements(sql)) await tx.query(statement);
      await tx.query('INSERT INTO schema_migrations (version) VALUES ($1)', [version]);
    });
    console.log(`[db] migrated to v${version}`);
  }
}

/** 迁移脚本里没有函数体、字符串里也没有分号，按分号切开即可（pg 的参数化查询一次只能执行一条） */
function splitStatements(sql: string): string[] {
  return sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean);
}

function fromPool(pool: pg.Pool): Database {
  return {
    kind: 'postgres',
    query: (text, params) => pool.query(text, params as unknown[]) as never,
    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn({ query: (text, params) => client.query(text, params as unknown[]) as never });
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}

/** PGlite：dataDir 为空时只在内存里（测试用） */
export async function openPglite(dataDir?: string): Promise<Database> {
  const { PGlite } = await import('@electric-sql/pglite');
  if (dataDir) mkdirSync(dataDir, { recursive: true });
  const lite = new PGlite(dataDir);
  await lite.waitReady;
  const db: Database = {
    kind: 'pglite',
    query: (text, params) => lite.query(text, params) as never,
    transaction: (fn) => lite.transaction((tx) => fn({ query: (text, params) => tx.query(text, params) as never })),
    close: () => lite.close(),
  };
  await migrate(db);
  return db;
}

export async function openDatabase(env: NodeJS.ProcessEnv = process.env): Promise<Database> {
  const url = env.DATABASE_URL?.trim();
  if (url) {
    const pool = new pg.Pool({ connectionString: url, max: 5, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 5_000 });
    // 数据库重启时空闲连接会报错；不处理的话整个进程会退出
    pool.on('error', (err) => console.error('[db] idle client error', err.message));
    const db = fromPool(pool);
    await migrate(db);
    return db;
  }
  if (env.NODE_ENV === 'production') throw new Error('生产环境必须设置 DATABASE_URL');
  const dir = resolve(env.TABLETOP_DATA_DIR ?? fileURLToPath(new URL('../../../.data/pglite', import.meta.url)));
  console.log(`[db] 没有 DATABASE_URL，使用本地 PGlite：${dir}`);
  return openPglite(dir);
}

/** 统计按北京时间切日 */
export const TIME_ZONE = 'Asia/Shanghai';
const dayFormat = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });
export const dayOf = (ms: number) => dayFormat.format(ms);
