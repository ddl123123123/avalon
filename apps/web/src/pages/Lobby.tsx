import { motion } from 'framer-motion';
import { useState } from 'react';
import type { RoomPlayer, RoomSnapshot } from '@tabletop/shared';
import { Avalon, Citadels, getGame } from '@tabletop/shared';
import { TableSurface } from '../art/glass';
import { useAvalonCardStyle } from '../games/avalon/cardLibrary';
import { AvalonBotSettings } from '../games/avalon/BotSettings';
import { useCitadelsPigTheme } from '../games/citadels/cardStyle';
import type { GameClient } from '../games/registry';
import { net } from '../net/client';
import { roomUrl } from '../net/route';
import { RoundTable } from '../ui/RoundTable';

type Seat = RoomPlayer | null;

export function Lobby({ room, game }: { room: RoomSnapshot; game: GameClient }) {
  const def = getGame(room.gameId)!;
  const citadelsPig = useCitadelsPigTheme();
  const avalonPig = useAvalonCardStyle() === 'pig';
  const pigTheme = room.gameId === Avalon.avalon.id ? avalonPig : room.gameId === Citadels.citadels.id && citadelsPig;
  const isHost = room.hostId === room.you;
  const [copied, setCopied] = useState(false);
  const count = room.players.length;
  const target = room.targetPlayers;
  const required = target ?? def.minPlayers;
  const capacity = target ?? def.maxPlayers;
  const humanCount = room.players.filter((p) => !p.isBot).length;
  // 保留空座原编号；玩家可以点击空位更换自己的座位。
  const seats: Seat[] = Array.from({ length: capacity }, (_, seatIndex) => room.players.find((p) => p.seatIndex === seatIndex) ?? null);
  const meIndex = room.players.find((p) => p.id === room.you)?.seatIndex ?? 0;
  const host = room.players.find((p) => p.id === room.hostId);
  const showTitleInHeader = Boolean(game.LobbyCardStyles);
  const gameHeading = (
    <div className={`lobby-game-heading${showTitleInHeader ? ' lobby-game-heading-top' : ''}`}>
      <span className="lobby-heading-seal" aria-hidden="true">{pigTheme ? '🐷' : '✦'}</span>
      <div>
        <p>本局桌游 · GAME SELECTED</p>
        <h1>{game.name}</h1>
      </div>
    </div>
  );

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
    <main className={`lobby${target == null ? '' : ' lobby-targeted'}${pigTheme ? ' ct-pig-theme' : ''}`}>
      <header className="room-bar lobby-room-bar">
        <button type="button" className="lobby-exit" onClick={net.leaveRoom}>
          <span aria-hidden="true">‹</span>
          <span>离开房间</span>
        </button>

        <div className="lobby-brand">
          <span className="lobby-brand-mark" aria-hidden="true">{pigTheme ? '🐷' : '✦'}</span>
          <span>
            <small>THE ROUND TABLE</small>
            <strong>集结大厅</strong>
          </span>
        </div>

        <div className="lobby-room-meta">
          <div className="room-code">
            <span>房间号</span>
            <strong>{room.code}</strong>
          </div>
          <span className="lobby-room-divider" aria-hidden="true" />
          <span className={`lobby-room-state ${count >= required ? 'is-ready' : ''}`} aria-live="polite">
            <i aria-hidden="true" />
            {count >= required ? '队伍已齐' : `还需 ${required - count} 人`}
          </span>
          <span className="lobby-room-players">{count} / {capacity} 人</span>
        </div>

        <button type="button" className="btn btn-ghost btn-small" onClick={copy}>
          {copied ? '链接已复制' : '复制邀请链接'}
        </button>
        {showTitleInHeader && gameHeading}
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
              <span className="lobby-center-kicker">PLAYERS / 座位</span>
              <div className="lobby-count">
                {count}
                <small> / {capacity}</small>
              </div>
              <p>{count < required ? `还差 ${required - count} 人开局` : '人齐了，可以开局'}</p>
              <small className="lobby-seat-hint">点击空位选择座位</small>
            </div>
          }
          renderSeat={(seat, seatIndex) =>
            seat ? (
              <motion.div
                className={`seat ${seat.connected ? '' : 'seat-offline'} ${seat.id === room.you ? 'seat-me' : ''}`}
                initial={{ opacity: 0, scale: 0.6, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ type: 'spring', stiffness: 260, damping: 20 }}
              >
                <div className="seat-avatar" role="img" aria-label={`${seatIndex + 1} 号玩家`}>
                  <span className="seat-avatar-number">{seatIndex + 1}</span>
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
              <motion.button
                type="button"
                className="seat seat-empty seat-open"
                onClick={() => net.chooseSeat(seatIndex)}
                aria-label={`选择 ${seatIndex + 1} 号座位`}
                whileHover={{ scale: 1.045, y: -3 }}
                whileTap={{ scale: 0.96 }}
                transition={{ type: 'spring', stiffness: 320, damping: 20 }}
              >
                <div className="seat-avatar seat-avatar-empty">
                  <span className="seat-avatar-number">{seatIndex + 1}</span>
                </div>
                <div className="seat-name">空位</div>
              </motion.button>
            )
          }
        />

        <aside className="panel lobby-side">
          {game.LobbyCardStyles ? <game.LobbyCardStyles /> : gameHeading}
          {target != null && isHost && (
            <fieldset className="lobby-size">
              <legend>本局人数</legend>
              <div className="lobby-size-buttons">
                {Array.from({ length: def.maxPlayers - def.minPlayers + 1 }, (_, i) => def.minPlayers + i).map((size) => (
                  <button
                    key={size}
                    type="button"
                    className="lobby-size-button"
                    aria-pressed={target === size}
                    disabled={size < humanCount}
                    onClick={() => net.setPlayerCount(size)}
                  >
                    {size} 人
                  </button>
                ))}
              </div>
              {humanCount > def.minPlayers && <p>已入座 {humanCount} 位真人</p>}
            </fieldset>
          )}
          <game.Options options={room.options} playerCount={target ?? count} players={room.players}
            editable={isHost} onChange={net.setOptions} />
          {room.gameId === Avalon.avalon.id && <AvalonBotSettings room={room} />}
          <div className="lobby-actions">
            {isHost ? (
              <>
                <button type="button" className="btn btn-primary" disabled={room.startBlocker !== null} onClick={net.startGame}>
                  开始游戏
                </button>
                {room.startBlocker && <p className="lobby-blocker">{room.startBlocker}</p>}
                {def.botAction && (
                  <button type="button" className="btn btn-ghost btn-small" disabled={count >= capacity} onClick={net.addBot}>
                    添加机器人凑人数
                  </button>
                )}
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
