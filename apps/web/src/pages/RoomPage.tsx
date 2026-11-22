import { useEffect, useRef, useState, type FormEvent } from 'react';
import { NAME_MAX_LENGTH } from '@tabletop/shared';
import { GAME_CLIENTS } from '../games/registry';
import { getName, net, notify, useNet } from '../net/client';
import { navigate } from '../net/route';
import { Lobby } from './Lobby';

export function RoomPage({ code }: { code: string }) {
  const { room, joining, link } = useNet();
  const [name, setName] = useState(getName);
  const autoJoined = useRef(false);

  // 带着名字直接打开房间链接：自动入座
  useEffect(() => {
    if (link !== 'online' || autoJoined.current || room?.code === code) return;
    autoJoined.current = true;
    if (getName()) net.joinRoom(code, getName());
  }, [link, room, code]);

  if (room && room.code === code) {
    const game = GAME_CLIENTS[room.gameId];
    if (!game) return <Gate title="这款桌游需要更新页面后才能玩" />;
    if (room.status === 'lobby') return <Lobby room={room} game={game} />;
    return <game.Board room={room} />;
  }

  if (joining || link === 'connecting') return <Gate title={`正在进入房间 ${code}…`} />;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return notify('先起个名字，同桌的人要靠它认出你');
    net.joinRoom(code, name.trim());
  };

  return (
    <Gate title={`加入房间 ${code}`}>
      <form className="gate-form" onSubmit={submit}>
        <label className="field">
          你的名字
          <input
            className="input"
            value={name}
            maxLength={NAME_MAX_LENGTH}
            onChange={(e) => setName(e.target.value)}
            placeholder="同桌的人会看到这个名字"
            autoFocus
          />
        </label>
        <button type="submit" className="btn btn-primary">
          加入房间
        </button>
      </form>
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
