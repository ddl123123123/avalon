import type { ReactNode } from 'react';
import type { RoomSnapshot } from '@tabletop/shared';
import { net } from '../../net/client';

export function PartyTable({ room, name, theme, children }: {
  room: RoomSnapshot;
  name: string;
  theme: 'ninja' | 'truth' | 'lighthouse' | 'street';
  children: ReactNode;
}) {
  return (
    <main className={`party-table party-${theme}`}>
      <header className="room-bar party-room-bar">
        <button type="button" className="link" onClick={net.leaveRoom}>离开房间</button>
        <div className="room-code"><span>房间号</span><strong>{room.code}</strong></div>
      </header>
      <div className="party-content">
        <h1>{name}</h1>
        {children}
        {room.status === 'ended' && (
          <div className="party-actions">
            {room.you === room.hostId
              ? <button type="button" className="btn btn-primary" onClick={net.backToLobby}>返回大厅</button>
              : <p>等待房主返回大厅</p>}
          </div>
        )}
      </div>
    </main>
  );
}
