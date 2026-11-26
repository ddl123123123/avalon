import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { AdminDay, AdminOverview, AdminUserList } from '@tabletop/shared';
import { GAME_CLIENTS } from '../../games/registry';
import { openAccountSheet, useAccount } from '../../net/account';
import { navigate } from '../../net/route';
import { DayChart, Legend } from './DayChart';
import '../../styles/admin.css';

/** 管理页：用户数据与趋势。只读；接口在服务端校验管理员身份。 */

const RANGES = [7, 30, 90, 180] as const;
const PAGE = 50;

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path, { credentials: 'same-origin', cache: 'no-store' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `请求失败（${res.status}）`);
  return data as T;
}

const num = (n: number) => n.toLocaleString('zh-CN');
const pct = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)}%` : '—');
function when(ms: number | null): string {
  if (ms === null) return '—';
  const diff = Date.now() - ms;
  if (diff < 60_000) return '刚刚';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 24 * 3600_000) return `${Math.floor(diff / 3600_000)} 小时前`;
  if (diff < 30 * 24 * 3600_000) return `${Math.floor(diff / (24 * 3600_000))} 天前`;
  return new Date(ms).toLocaleDateString('zh-CN');
}
const date = (ms: number) => new Date(ms).toLocaleDateString('zh-CN', { year: 'numeric', month: 'numeric', day: 'numeric' });
const gameName = (id: string) => GAME_CLIENTS[id]?.name ?? id;

export function AdminPage() {
  const { user, status } = useAccount();

  if (status === 'checking' && !user) return <Shell><p className="admin-muted">正在确认登录状态…</p></Shell>;
  if (!user) {
    return (
      <Shell>
        <div className="admin-gate">
          <h2>请先登录管理员账号</h2>
          <button type="button" className="btn btn-primary btn-small" onClick={() => openAccountSheet('login')}>登录</button>
        </div>
      </Shell>
    );
  }
  if (!user.isAdmin) {
    return (
      <Shell>
        <div className="admin-gate">
          <h2>这个账号没有管理权限</h2>
          <p className="admin-muted">管理员要在服务器上授予，见 docs/deploy.md「管理页」。</p>
        </div>
      </Shell>
    );
  }
  return <Dashboard />;
}

function Shell({ children, actions }: { children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <main className="admin">
      <header className="admin-head">
        <div>
          <button type="button" className="link" onClick={() => navigate('/')}>← 桌游厅</button>
          <h1>运营数据</h1>
        </div>
        {actions}
      </header>
      {children}
    </main>
  );
}

function Dashboard() {
  const [days, setDays] = useState<(typeof RANGES)[number]>(30);
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setOverview(await getJson<AdminOverview>(`/api/admin/overview?days=${days}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    void load();
  }, [load]);

  // 每分钟刷新一次在线人数等实时数字
  useEffect(() => {
    const timer = setInterval(() => document.visibilityState === 'visible' && void load(), 60_000);
    return () => clearInterval(timer);
  }, [load]);

  const actions = (
    <div className="admin-filters" role="group" aria-label="时间范围">
      {RANGES.map((d) => (
        <button key={d} type="button" className="admin-range" aria-pressed={days === d} onClick={() => setDays(d)}>
          近 {d} 天
        </button>
      ))}
      <button type="button" className="admin-range" onClick={() => void load()} disabled={loading}>刷新</button>
    </div>
  );

  return (
    <Shell actions={actions}>
      {error && <p className="account-error" role="alert">{error}</p>}
      {overview && (
        <div className={loading ? 'admin-body is-loading' : 'admin-body'}>
          <Tiles overview={overview} />
          <div className="admin-grid">
            <ActiveChart rows={overview.series} days={overview.days} />
            <UsersChart rows={overview.series} days={overview.days} />
            <GamesChart rows={overview.series} days={overview.days} />
            <ByGame overview={overview} />
          </div>
          <DayTable rows={overview.series} />
          <p className="admin-footnote">
            按北京时间切日 · 数据库 {overview.database === 'postgres' ? 'Postgres' : 'PGlite（本地开发）'} ·
            更新于 {new Date(overview.generatedAt).toLocaleTimeString('zh-CN')}
          </p>
        </div>
      )}
      {!overview && !error && <p className="admin-muted">正在加载…</p>}
      <Users />
    </Shell>
  );
}

function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="admin-tile">
      <span className="admin-tile-label">{label}</span>
      <strong className="admin-tile-value">{value}</strong>
      {note && <span className="admin-tile-note">{note}</span>}
    </div>
  );
}

function Tiles({ overview }: { overview: AdminOverview }) {
  const { totals, live } = overview;
  return (
    <section className="admin-tiles" aria-label="关键数字">
      <Tile label="注册用户" value={num(totals.users)} note={`近 7 天新增 ${num(totals.newUsers7d)}`} />
      <Tile label="近 7 天活跃账号" value={num(totals.activeUsers7d)} note={`占注册用户 ${pct(totals.activeUsers7d, totals.users)}`} />
      <Tile label="近 7 天开局" value={num(totals.games7d)} note={`累计 ${num(totals.games)} 局，打完 ${pct(totals.finishedGames, totals.games)}`} />
      <Tile label="现在在线" value={num(live.online)} note={`${live.onlineMembers} 人已登录 · ${live.playing}/${live.rooms} 间房在对局`} />
      <Tile label="有效登录会话" value={num(totals.activeSessions)} note="各设备上保持登录的浏览器" />
    </section>
  );
}

function Card({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="admin-card">
      <header>
        <h2>{title}</h2>
        {sub && <p>{sub}</p>}
      </header>
      {children}
    </section>
  );
}

function ActiveChart({ rows, days }: { rows: AdminDay[]; days: number }) {
  const series = [
    { key: 'members', label: '登录用户', color: 'var(--viz-1)', value: (r: AdminDay) => r.activeMembers },
    { key: 'guests', label: '游客', color: 'var(--viz-2)', value: (r: AdminDay) => r.activeGuests },
  ];
  return (
    <Card title="每日活跃" sub={`近 ${days} 天每天连上来的人：登录用户按账号计，游客按浏览器计`}>
      <Legend items={series} />
      <DayChart rows={rows} series={series} mode="stack" label="每日活跃人数，按登录用户和游客堆叠"
        extra={(r) => <div className="viz-tooltip-extra">合计 {num(r.activeMembers + r.activeGuests)}</div>} />
    </Card>
  );
}

function UsersChart({ rows, days }: { rows: AdminDay[]; days: number }) {
  const series = [{ key: 'total', label: '累计注册', color: 'var(--viz-1)', value: (r: AdminDay) => r.totalUsers }];
  const added = rows.reduce((sum, r) => sum + r.newUsers, 0);
  return (
    <Card title="注册用户" sub={`累计注册数，近 ${days} 天新增 ${num(added)}`}>
      <DayChart rows={rows} series={series} mode="line" label="累计注册用户数"
        extra={(r) => <div className="viz-tooltip-extra">当天新增 {num(r.newUsers)} · 输密码登录 {num(r.logins)} 人</div>} />
    </Card>
  );
}

function GamesChart({ rows, days }: { rows: AdminDay[]; days: number }) {
  const series = [{ key: 'games', label: '开局', color: 'var(--viz-1)', value: (r: AdminDay) => r.games }];
  const total = rows.reduce((sum, r) => sum + r.games, 0);
  return (
    <Card title="每日开局" sub={`近 ${days} 天共 ${num(total)} 局`}>
      <DayChart rows={rows} series={series} mode="stack" label="每日开局数"
        extra={(r) => <div className="viz-tooltip-extra">打完 {num(r.finishedGames)} 局 · 真人座位 {num(r.seats)}</div>} />
    </Card>
  );
}

function ByGame({ overview }: { overview: AdminOverview }) {
  const rows = overview.byGame;
  const max = Math.max(1, ...rows.map((r) => r.games));
  return (
    <Card title="各桌游" sub={`近 ${overview.days} 天的开局数`}>
      {rows.length === 0 ? <p className="admin-muted">这段时间还没有开局</p> : (
        <table className="admin-bars">
          <thead>
            <tr><th>桌游</th><th>开局</th><th>打完</th><th>平均真人</th><th>登录玩家</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.gameId}>
                <th scope="row">{gameName(r.gameId)}</th>
                <td>
                  <span className="admin-bar-cell">
                    <span className="admin-bar" style={{ width: `${(r.games / max) * 100}%` }} />
                    <span className="admin-bar-value">{num(r.games)}</span>
                  </span>
                </td>
                <td>{pct(r.finished, r.games)}</td>
                <td>{r.games ? (r.humans / r.games).toFixed(1) : '—'}</td>
                <td>{pct(r.registered, r.humans)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

function DayTable({ rows }: { rows: AdminDay[] }) {
  return (
    <details className="admin-card admin-daytable">
      <summary>按天的数据表</summary>
      <div className="admin-scroll">
        <table className="admin-table">
          <thead>
            <tr>
              <th>日期</th><th>新注册</th><th>累计注册</th><th>密码登录</th><th>活跃登录用户</th><th>活跃游客</th><th>开局</th><th>打完</th><th>真人座位</th>
            </tr>
          </thead>
          <tbody>
            {[...rows].reverse().map((r) => (
              <tr key={r.day}>
                <td>{r.day}</td><td>{num(r.newUsers)}</td><td>{num(r.totalUsers)}</td><td>{num(r.logins)}</td>
                <td>{num(r.activeMembers)}</td><td>{num(r.activeGuests)}</td><td>{num(r.games)}</td>
                <td>{num(r.finishedGames)}</td><td>{num(r.seats)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function Users() {
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [offset, setOffset] = useState(0);
  const [list, setList] = useState<AdminUserList | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getJson<AdminUserList>(`/api/admin/users?q=${encodeURIComponent(query)}&offset=${offset}&limit=${PAGE}`).then(
      (data) => !cancelled && setList(data),
      (err: unknown) => !cancelled && setError(err instanceof Error ? err.message : '加载失败'),
    );
    return () => {
      cancelled = true;
    };
  }, [query, offset]);

  const search = (e: FormEvent) => {
    e.preventDefault();
    setOffset(0);
    setQuery(q.trim());
  };

  return (
    <section className="admin-card admin-users">
      <header className="admin-users-head">
        <div>
          <h2>用户</h2>
          <p>{list ? `共 ${num(list.total)} 个${query ? `匹配「${query}」的` : ''}账号，按注册时间倒序` : '正在加载…'}</p>
        </div>
        <form onSubmit={search} className="admin-search">
          <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜用户名或昵称" aria-label="搜索用户" />
          <button type="submit" className="btn btn-ghost btn-small">搜索</button>
        </form>
      </header>
      {error && <p className="account-error" role="alert">{error}</p>}
      {list && (
        <div className="admin-scroll">
          <table className="admin-table">
            <thead>
              <tr><th>昵称</th><th>用户名</th><th>注册</th><th>最近活跃</th><th>对局</th><th>最近对局</th><th>登录设备</th></tr>
            </thead>
            <tbody>
              {list.users.map((u) => (
                <tr key={u.id}>
                  <td>
                    {u.displayName}
                    {u.isAdmin && <span className="admin-badge">管理员</span>}
                  </td>
                  <td className="admin-mono">@{u.username}</td>
                  <td>{date(u.createdAt)}</td>
                  <td>{when(u.lastSeenAt)}</td>
                  <td>{num(u.games)}</td>
                  <td>{when(u.lastGameAt)}</td>
                  <td>{u.activeSessions}</td>
                </tr>
              ))}
              {list.users.length === 0 && (
                <tr><td colSpan={7} className="admin-muted">没有找到账号</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      {list && list.total > PAGE && (
        <div className="admin-pager">
          <button type="button" className="btn btn-ghost btn-small" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>上一页</button>
          <span>{offset + 1}–{Math.min(offset + PAGE, list.total)} / {num(list.total)}</span>
          <button type="button" className="btn btn-ghost btn-small" disabled={offset + PAGE >= list.total} onClick={() => setOffset(offset + PAGE)}>下一页</button>
        </div>
      )}
    </section>
  );
}
