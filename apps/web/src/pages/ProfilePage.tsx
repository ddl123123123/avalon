import { useEffect, useState } from 'react';
import { Avalon, type PlayerProfileStats } from '@tabletop/shared';
import { GAME_CLIENTS } from '../games/registry';
import { openAccountSheet, refreshAccount, useAccount } from '../net/account';
import { navigate } from '../net/route';

type RecordTotal = { played: number; wins: number };
const rate = ({ wins, played }: RecordTotal) => played ? `${(wins / played * 100).toFixed(1).replace(/\.0$/, '')}%` : '—';

function sumResults(roles: PlayerProfileStats['avalonRoles']): RecordTotal {
  return roles.reduce((total, role) => ({
    played: total.played + role.played,
    wins: total.wins + role.wins,
  }), { played: 0, wins: 0 });
}

export function ProfilePage() {
  const { user, status } = useAccount();
  const signedIn = status === 'user' && user;
  return (
    <main className="player-profile">
      <nav className="player-profile-nav" aria-label="个人主页导航">
        <button type="button" className="btn btn-ghost btn-small" onClick={() => navigate('/')}>返回桌游厅</button>
        {signedIn && (
          <button type="button" className="btn btn-ghost btn-small" onClick={() => openAccountSheet()}>账号设置</button>
        )}
      </nav>
      <header className="player-profile-heading">
        {signedIn && <span className="account-avatar" aria-hidden="true">{[...user.displayName][0]}</span>}
        <div>
          <h1>个人主页</h1>
          {signedIn && <p>{user.displayName} <span>@{user.username}</span></p>}
        </div>
      </header>
      {status === 'checking' ? <p role="status">正在确认账号…</p> : signedIn ? (
        <ProfileStats key={user.id} />
      ) : (
        <section className="player-profile-card">
          <h2>登录后查看你的战绩</h2>
          <p>对局统计会跟随账号，换设备也能查看。</p>
          <button type="button" className="btn btn-primary btn-small" onClick={() => openAccountSheet()}>登录 / 注册</button>
        </section>
      )}
    </main>
  );
}

function ProfileStats() {
  const [data, setData] = useState<PlayerProfileStats | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const res = await fetch('/api/auth/stats', { signal: controller.signal });
        if (res.status === 401) void refreshAccount();
        if (!res.ok) throw new Error('读取战绩失败');
        const stats: PlayerProfileStats = await res.json();
        if (!controller.signal.aborted) setData(stats);
      } catch {
        if (!controller.signal.aborted) setError(true);
      }
    })();
    return () => controller.abort();
  }, [attempt]);

  if (error) return (
    <section className="player-profile-card">
      <p role="alert">战绩暂时读取失败。</p>
      <button type="button" className="btn btn-ghost btn-small" onClick={() => {
        setError(false);
        setAttempt((value) => value + 1);
      }}>重试</button>
    </section>
  );
  if (!data) return <p role="status">正在加载战绩…</p>;

  const played = data.games.reduce((total, game) => total + game.played, 0);
  const finished = data.games.reduce((total, game) => total + game.finished, 0);
  const avalon = sumResults(data.avalonRoles);
  const bySide = (side: Avalon.Alignment) => sumResults(data.avalonRoles.filter(({ role }) => Avalon.ROLES[role].alignment === side));
  return (
    <div className="player-profile-grid">
      <section className="player-profile-card">
        <h2>对局统计</h2>
        <dl className="player-profile-metrics">
          <div><dt>参加</dt><dd>{played}</dd></div>
          <div><dt>完成</dt><dd>{finished}</dd></div>
        </dl>
        {data.games.length ? (
          <ul className="player-profile-list">
            {data.games.map((game) => (
              <li key={game.gameId}>
                <strong>{GAME_CLIENTS[game.gameId]?.name ?? game.gameId}</strong>
                <span>完成 {game.finished} / 参加 {game.played} 局</span>
              </li>
            ))}
          </ul>
        ) : <p>还没有对局记录。登录后入座，开局就会计入统计。</p>}
      </section>
      <section className="player-profile-card">
        <h2>阿瓦隆胜率</h2>
        <dl className="player-profile-metrics">
          <div><dt>总胜率</dt><dd>{rate(avalon)}</dd></div>
          <div><dt>正义方</dt><dd>{rate(bySide('good'))}</dd></div>
          <div><dt>邪恶方</dt><dd>{rate(bySide('evil'))}</dd></div>
        </dl>
        <p>已记录胜负 {avalon.played} 局，获胜 {avalon.wins} 局。胜率按有结果的已结算对局计算。</p>
      </section>
      <section className="player-profile-card player-profile-roles">
        <h2>常用身份</h2>
        <p>按阿瓦隆已结算对局的抽中次数排序。</p>
        {data.avalonRoles.length ? (
          <ul className="player-profile-list">
            {data.avalonRoles.map((entry) => (
              <li key={entry.role}>
                <strong>{Avalon.ROLES[entry.role].name}</strong>
                <span>抽中 {entry.played} 次 · 胜率 {rate(entry)}</span>
              </li>
            ))}
          </ul>
        ) : <p>完成并结算一局阿瓦隆后，这里会显示你的身份和成绩。</p>}
      </section>
    </div>
  );
}
