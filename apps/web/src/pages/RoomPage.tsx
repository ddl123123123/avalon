import { useEffect, useRef, useState, type FormEvent } from 'react';
import { NAME_MAX_LENGTH } from '@tabletop/shared';
import { GAME_CLIENTS } from '../games/registry';
import { openAccountSheet } from '../net/account';
import { getName, net, notify, useNet } from '../net/client';
import { navigate } from '../net/route';
import { Lobby } from './Lobby';

export function RoomPage({ code }: { code: string }) {
  const { room, joining, link, account } = useNet();
  const [name, setName] = useState(getName);
  /** 以哪个身份自动尝试过进房：登录后换了身份要再试一次，这样才能回到账号名下的座位 */
  const autoJoinedAs = useRef<string | null>(null);

  // 带着名字（或登录着）直接打开房间链接：自动入座
  useEffect(() => {
    if (link !== 'online' || room?.code === code) return;
    const who = account ? `u:${account.id}` : 'guest';
    if (autoJoinedAs.current === who) return;
    autoJoinedAs.current = who;
    if (getName()) net.joinRoom(code, getName());
  }, [link, room, code, account]);

  if (room && room.code === code) {
    const game = GAME_CLIENTS[room.gameId];
    if (!game) return <Gate title="这款桌游需要更新页面后才能玩" />;
    if (room.status === 'lobby') return <Lobby room={room} game={game} />;
    return <game.Board room={room} />;
  }

  if (joining || link === 'connecting') return <Gate title={`正在进入房间 ${code}…`} />;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (account) return net.joinRoom(code, account.displayName);
    if (!name.trim()) return notify('先起个名字，同桌的人要靠它认出你');
    net.joinRoom(code, name.trim());
  };

  return (
    <Gate title={`加入房间 ${code}`}>
      <form className="gate-form" onSubmit={submit}>
        {account ? (
          <p className="gate-identity">以 <strong>{account.displayName}</strong>（@{account.username}）的身份加入</p>
        ) : <label className="field">
          你的名字
          <input
            className="input"
            value={name}
            maxLength={NAME_MAX_LENGTH}
            onChange={(e) => setName(e.target.value)}
            placeholder="同桌的人会看到这个名字"
            autoFocus
          />
        </label>}
        <button type="submit" className="btn btn-primary">
          加入房间
        </button>
      </form>
      {!account && (
        <p className="gate-account">
          在别的设备上用账号玩过这一局？
          <button type="button" className="link" onClick={() => openAccountSheet('login')}>登录</button>
          后会自动回到原来的座位。
        </p>
      )}
      <button type="button" className="link" onClick={() => navigate('/')}>
        回到首页
      </button>
    </Gate>
  );
}

function Gate({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <main className="gate">
      <div className="panel gate-card">
        <h1>{title}</h1>
        {children}
      </div>
    </main>
  );
}
