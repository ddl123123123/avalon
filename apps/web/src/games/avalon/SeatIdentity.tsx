import type { PlayerId, RoomPlayer } from '@tabletop/shared';

export function SeatIdentity({ player }: { player?: Pick<RoomPlayer, 'seatIndex' | 'name'> }) {
  if (!player) return <span>未知玩家</span>;
  const number = player.seatIndex + 1;
  return (
    <span className="av-seat-identity" title={`${number}号 ${player.name}`}>
      <span className="av-seat-number">{number}号</span>
      <span className="av-seat-handle">{player.name}</span>
    </span>
  );
}

export function TeamRoster({ players, team, label, size }: {
  players: RoomPlayer[];
  team: PlayerId[];
  label: string;
  size?: number;
}) {
  return (
    <div className="av-team-roster">
      <p className="av-team-label">{label}{size !== undefined && <span> {team.length} / {size}</span>}</p>
      {team.length ? (
        <ul aria-label={label}>
          {team.map((id) => <li key={id}><SeatIdentity player={players.find((player) => player.id === id)} /></li>)}
        </ul>
      ) : <p className="av-team-empty">尚未选人</p>}
    </div>
  );
}
