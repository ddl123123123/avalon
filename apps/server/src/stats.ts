import { createHash } from 'node:crypto';
import type { AdminOverview, AdminUserList } from '@tabletop/shared';
import { dayOf, TIME_ZONE, type Database } from './db';

/** 房间服务往统计里写的东西。写失败只记日志，绝不影响对局。 */
export interface GameRecorder {
  /** 一条连接认出了身份（每人每天只记一次） */
  visit(identity: string, userId: string | null): void;
  gameStarted(info: { roomCode: string; gameId: string; players: { userId: string | null; isBot: boolean }[] }): Promise<number | null>;
  gameEnded(record: Promise<number | null>, status: 'finished' | 'abandoned'): void;
}

const DAY_MS = 24 * 3600_000;

/** 某个北京时间日期的零点 */
const startOfDay = (day: string) => new Date(`${day}T00:00:00+08:00`);

export class Stats implements GameRecorder {
  /** 今天已经记过的访客，免得每次重连都写库 */
  private seenToday = { day: '', visitors: new Set<string>() };

  constructor(private db: Database, private now: () => number = Date.now) {}

  private log(what: string) {
    return (err: unknown) => console.error(`[stats] ${what} failed`, err instanceof Error ? err.message : err);
  }

  /** 服务重启时内存里的房间全没了，上次没结束的对局记为中断 */
  async closeInterrupted() {
    await this.db.query("UPDATE games SET status = 'abandoned', ended_at = $1 WHERE status = 'playing'", [new Date(this.now())]);
  }

  visit(identity: string, userId: string | null) {
    const day = dayOf(this.now());
    if (this.seenToday.day !== day) this.seenToday = { day, visitors: new Set() };
    // 游客的身份键里有浏览器保存的私密标识，只存它的散列
    const visitor = createHash('sha256').update(identity).digest('base64url').slice(0, 22);
    if (this.seenToday.visitors.has(visitor)) return;
    this.seenToday.visitors.add(visitor);
    void (async () => {
      await this.db.query(
        'INSERT INTO daily_visitors (day, visitor, user_id) VALUES ($1, $2, $3) ON CONFLICT (day, visitor) DO NOTHING',
        [day, visitor, userId],
      );
      if (userId) await this.db.query('UPDATE users SET last_seen_at = $2 WHERE id = $1', [userId, new Date(this.now())]);
    })().catch(this.log('visit'));
  }

  gameStarted(info: Parameters<GameRecorder['gameStarted']>[0]): Promise<number | null> {
    const humans = info.players.filter((p) => !p.isBot);
    return this.db.transaction(async (tx) => {
      const { rows } = await tx.query<{ id: string }>(
        `INSERT INTO games (room_code, game_id, status, started_at, humans, bots, registered)
         VALUES ($1, $2, 'playing', $3, $4, $5, $6) RETURNING id`,
        [info.roomCode, info.gameId, new Date(this.now()), humans.length, info.players.length - humans.length,
          humans.filter((p) => p.userId).length],
      );
      const id = Number(rows[0]!.id);
      for (const [seat, player] of info.players.entries()) {
        await tx.query('INSERT INTO game_players (game_id, seat, user_id, is_bot) VALUES ($1, $2, $3, $4)', [id, seat, player.userId, player.isBot]);
      }
      return id;
    }).catch((err) => {
      this.log('gameStarted')(err);
      return null;
    });
  }

  gameEnded(record: Promise<number | null>, status: 'finished' | 'abandoned') {
    void record.then(async (id) => {
      if (id === null) return;
      await this.db.query("UPDATE games SET status = $2, ended_at = $3 WHERE id = $1 AND status = 'playing'", [id, status, new Date(this.now())]);
    }).catch(this.log('gameEnded'));
  }

  /** 管理页总览：累计数字 + 最近 days 天按天的趋势 + 各桌游的对局 */
  async overview(days: number): Promise<Omit<AdminOverview, 'live' | 'database'>> {
    const today = dayOf(this.now());
    const firstDay = dayOf(startOfDay(today).getTime() - (days - 1) * DAY_MS);
    const since = startOfDay(firstDay);
    const weekAgo = new Date(this.now() - 7 * DAY_MS);

    const [totals, series, byGame] = await Promise.all([
      this.db.query<{
        users: number; users_before: number; new_users_7d: number; active_users_7d: number;
        games: number; games_7d: number; finished: number; sessions: number;
      }>(
        `SELECT
           (SELECT count(*)::int FROM users) AS users,
           (SELECT count(*)::int FROM users WHERE created_at < $1) AS users_before,
           (SELECT count(*)::int FROM users WHERE created_at >= $2) AS new_users_7d,
           (SELECT count(*)::int FROM users WHERE last_seen_at >= $2) AS active_users_7d,
           (SELECT count(*)::int FROM games) AS games,
           (SELECT count(*)::int FROM games WHERE started_at >= $2) AS games_7d,
           (SELECT count(*)::int FROM games WHERE status = 'finished') AS finished,
           (SELECT count(*)::int FROM sessions WHERE expires_at > $3) AS sessions`,
        [since, weekAgo, new Date(this.now())],
      ),
      this.db.query<{
        day: string; new_users: number; logins: number; members: number; guests: number;
        games: number; finished: number; seats: number;
      }>(
        `WITH days AS (SELECT generate_series($1::date, $2::date, interval '1 day')::date AS day),
         reg AS (SELECT (created_at AT TIME ZONE $3)::date AS day, count(*)::int AS n FROM users WHERE created_at >= $4 GROUP BY 1),
         logins AS (SELECT (at AT TIME ZONE $3)::date AS day, count(DISTINCT user_id)::int AS n
                    FROM auth_events WHERE kind = 'login' AND at >= $4 GROUP BY 1),
         visits AS (SELECT day, count(*) FILTER (WHERE user_id IS NOT NULL)::int AS members,
                           count(*) FILTER (WHERE user_id IS NULL)::int AS guests
                    FROM daily_visitors WHERE day >= $1::date GROUP BY 1),
         g AS (SELECT (started_at AT TIME ZONE $3)::date AS day, count(*)::int AS games,
                      count(*) FILTER (WHERE status = 'finished')::int AS finished, sum(humans)::int AS seats
               FROM games WHERE started_at >= $4 GROUP BY 1)
         SELECT to_char(days.day, 'YYYY-MM-DD') AS day,
                coalesce(reg.n, 0) AS new_users, coalesce(logins.n, 0) AS logins,
                coalesce(visits.members, 0) AS members, coalesce(visits.guests, 0) AS guests,
                coalesce(g.games, 0) AS games, coalesce(g.finished, 0) AS finished, coalesce(g.seats, 0) AS seats
         FROM days
         LEFT JOIN reg ON reg.day = days.day
         LEFT JOIN logins ON logins.day = days.day
         LEFT JOIN visits ON visits.day = days.day
         LEFT JOIN g ON g.day = days.day
         ORDER BY days.day`,
        [firstDay, today, TIME_ZONE, since],
      ),
      this.db.query<{ game_id: string; games: number; finished: number; humans: number; registered: number; bots: number }>(
        `SELECT game_id, count(*)::int AS games, count(*) FILTER (WHERE status = 'finished')::int AS finished,
                coalesce(sum(humans), 0)::int AS humans, coalesce(sum(registered), 0)::int AS registered,
                coalesce(sum(bots), 0)::int AS bots
         FROM games WHERE started_at >= $1 GROUP BY game_id ORDER BY games DESC`,
        [since],
      ),
    ]);

    const t = totals.rows[0]!;
    let cumulative = t.users_before;
    return {
      generatedAt: this.now(),
      days,
      totals: {
        users: t.users,
        newUsers7d: t.new_users_7d,
        activeUsers7d: t.active_users_7d,
        games: t.games,
        games7d: t.games_7d,
        finishedGames: t.finished,
        activeSessions: t.sessions,
      },
      series: series.rows.map((row) => {
        cumulative += row.new_users;
        return {
          day: row.day,
          newUsers: row.new_users,
          totalUsers: cumulative,
          logins: row.logins,
          activeMembers: row.members,
          activeGuests: row.guests,
          games: row.games,
          finishedGames: row.finished,
          seats: row.seats,
        };
      }),
      byGame: byGame.rows.map((row) => ({
        gameId: row.game_id,
        games: row.games,
        finished: row.finished,
        humans: row.humans,
        registered: row.registered,
        bots: row.bots,
      })),
    };
  }

  async users(input: { q?: string; offset?: number; limit?: number }): Promise<AdminUserList> {
    const q = (input.q ?? '').trim().slice(0, 40).toLowerCase();
    const limit = Math.min(100, Math.max(1, input.limit ?? 50));
    const offset = Math.max(0, input.offset ?? 0);
    const pattern = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const where = q ? 'WHERE lower(u.username) LIKE $1 OR lower(u.display_name) LIKE $1' : 'WHERE $1::text IS NOT NULL';
    const [list, count] = await Promise.all([
      this.db.query<{
        id: string; username: string; display_name: string; is_admin: boolean; created_at: Date; last_seen_at: Date | null;
        games: number; last_game_at: Date | null; sessions: number;
      }>(
        `SELECT u.id, u.username, u.display_name, u.is_admin, u.created_at, u.last_seen_at,
                (SELECT count(*)::int FROM game_players p WHERE p.user_id = u.id) AS games,
                (SELECT max(g.started_at) FROM game_players p JOIN games g ON g.id = p.game_id WHERE p.user_id = u.id) AS last_game_at,
                (SELECT count(*)::int FROM sessions s WHERE s.user_id = u.id AND s.expires_at > $4) AS sessions
         FROM users u ${where}
         ORDER BY u.created_at DESC
         LIMIT $2 OFFSET $3`,
        [pattern, limit, offset, new Date(this.now())],
      ),
      this.db.query<{ n: number }>(`SELECT count(*)::int AS n FROM users u ${where}`, [pattern]),
    ]);
    const ms = (d: Date | null) => (d ? d.getTime() : null);
    return {
      total: count.rows[0]?.n ?? 0,
      offset,
      limit,
      users: list.rows.map((row) => ({
        id: row.id,
        username: row.username,
        displayName: row.display_name,
        isAdmin: row.is_admin,
        createdAt: row.created_at.getTime(),
        lastSeenAt: ms(row.last_seen_at),
        games: row.games,
        lastGameAt: ms(row.last_game_at),
        activeSessions: row.sessions,
      })),
    };
  }
}
