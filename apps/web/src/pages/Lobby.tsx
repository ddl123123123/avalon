import { motion } from 'framer-motion';
import { useState } from 'react';
import type { RoomPlayer, RoomSnapshot } from '@tabletop/shared';
import { getGame } from '@tabletop/shared';
import { Crest } from '../art/Crest';
import { TableSurface } from '../art/glass';
import type { GameClient } from '../games/registry';
import { net } from '../net/client';
import { roomUrl } from '../net/route';
import { RoundTable } from '../ui/RoundTable';

type Seat = RoomPlayer | null;

export function Lobby({ room, game }: { room: RoomSnapshot; game: GameClient }) {
  const def = getGame(room.gameId)!;
  const isHost = room.hostId === room.you;
  const [copied, setCopied] = useState(false);
  const count = room.players.length;
  // 人不够时把空位也画出来，一眼看出还差几个
  const seats: Seat[] = [...room.players, ...Array<Seat>(Math.max(0, def.minPlayers - count)).fill(null)];
  const meIndex = room.players.findIndex((p) => p.id === room.you);
  const host = room.players.find((p) => p.id === room.hostId);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(roomUrl(room.code));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt('复制这个链接发给朋友', roomUrl(room.code));
    }
  };

  return (
    <main className="lobby">
      <header className="room-bar">
        <button type="button" className="link" onClick={net.leaveRoom}>
          离开房间
        </button>
        <div className="room-code">
          <span>房间号</span>
          <strong>{room.code}</strong>
        </div>
        <button type="button" className="btn btn-ghost btn-small" onClick={copy}>
          {copied ? '链接已复制' : '复制邀请链接'}
        </button>
      </header>

      <div className="lobby-body">
        <RoundTable
          className="lobby-table"
          seats={seats}
          meIndex={meIndex}
          seatKey={(s, i) => s?.id ?? `empty-${i}`}
          surface={<TableSurface seats={seats.length} />}
          center={
            <div className="lobby-center">
              <div className="lobby-count">
                {count}
                <small> / {def.maxPlayers}</small>
              </div>
              <p>{count < def.minPlayers ? `还差 ${def.minPlayers - count} 人开局` : '人齐了，可以开局'}</p>
            </div>
          }
          renderSeat={(seat) =>
            seat ? (
              <motion.div
                className={`seat ${seat.connected ? '' : 'seat-offline'}`}
                initial={{ opacity: 0, scale: 0.6, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ type: 'spring', stiffness: 260, damping: 20 }}
              >
                <div className="seat-crest">
                  <Crest seed={seat.id} />
                </div>
                <div className="seat-name">
                  {seat.name}
                  {seat.id === room.you && <span className="seat-you">你</span>}
                </div>
                <div className="seat-note">
                  {seat.id === room.hostId ? '房主' : seat.isBot ? '机器人' : seat.connected ? '' : '掉线了'}
                </div>
                {isHost && seat.id !== room.you && (
                  <button type="button" className="seat-kick" onClick={() => net.kick(seat.id)} aria-label={`请 ${seat.name} 离开`}>
                    ×
                  </button>
                )}
              </motion.div>
            ) : (
              <div className="seat seat-empty">
                <div className="seat-crest seat-crest-empty" />
                <div className="seat-name">空位</div>
              </div>
            )
          }
        />

        <aside className="panel lobby-side">
          <h1>{game.name}</h1>
          <game.Options options={room.options} playerCount={count} editable={isHost} onChange={net.setOptions} />
          <div className="lobby-actions">
            {isHost ? (
              <>
                <button type="button" className="btn btn-primary" disabled={room.startBlocker !== null} onClick={net.startGame}>
                  开始游戏
                </button>
                {room.startBlocker && <p className="lobby-blocker">{room.startBlocker}</p>}
                <button type="button" className="btn btn-ghost btn-small" disabled={count >= def.maxPlayers} onClick={net.addBot}>
                  添加机器人凑人数
                </button>
              </>
            ) : (
              <p className="lobby-waiting">等 {host?.name ?? '房主'} 开始游戏</p>
            )}
          </div>
        </aside>
      </div>
    </main>
  );
}
