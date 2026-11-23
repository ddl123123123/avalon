import { motion } from 'framer-motion';
import { Avalon, type RoomSnapshot } from '@tabletop/shared';
import { Crest } from '../../art/Crest';
import { SplitText } from '../../fx/SplitText';
import { Tilt } from '../../fx/Tilt';
import { net } from '../../net/client';
import { RoleFace } from './art';

const REASONS: Record<Avalon.WinReason, string> = {
  quests_failed: '三次任务被破坏，卡美洛陷落了。',
  rejects: '圆桌连续五次谈不拢，邪恶方不战而胜。',
  assassinated: '三次任务都完成了，但刺客认出了梅林。',
  merlin_safe: '三次任务完成，梅林也没有暴露。',
};

/** 结算：公开所有人的身份。 */
export function EndScreen({
  room,
  view,
  onHistory,
}: {
  room: RoomSnapshot;
  view: Avalon.AvalonView;
  onHistory: () => void;
}) {
  const winner = view.winner!;
  const isHost = room.hostId === room.you;
  const host = room.players.find((p) => p.id === room.hostId);
  const won = view.me ? view.me.alignment === winner : null;
  // 胜方排在前面
  const order = [...room.players].sort((a, b) => {
    const rank = (id: string) => (Avalon.ROLES[view.roles![id]!].alignment === winner ? 0 : 1);
    return rank(a.id) - rank(b.id);
  });

  return (
    <div className={`end end-${winner}`}>
      <div className="end-head">
        <h1 className="end-title">
          <SplitText text={winner === 'good' ? '正义方获胜' : '邪恶方获胜'} stagger={0.08} />
        </h1>
        <p className="end-reason">{REASONS[view.winReason!]}</p>
        {won !== null && <p className={`end-mine tone-${winner}`}>{won ? '你在获胜的一方' : '这一局你输了'}</p>}
      </div>

      <div className="end-grid">
        {order.map((p, i) => {
          const role = view.roles![p.id]!;
          return (
            <motion.div
              key={p.id}
              className="end-player"
              initial={{ opacity: 0, y: 40, rotateY: 90 }}
              animate={{ opacity: 1, y: 0, rotateY: 0 }}
              transition={{ delay: 0.5 + i * 0.12, type: 'spring', stiffness: 140, damping: 16 }}
            >
              <Tilt className="end-card" max={10}>
                <RoleFace role={role} />
              </Tilt>
              <div className="end-name">
                <span className="end-seat-number">{p.seatIndex + 1} 号</span>
                <span className="end-crest">
                  <Crest seed={p.id} />
                </span>
                {p.name}
                {p.id === room.you && <span className="seat-you">你</span>}
              </div>
              {view.assassinTarget === p.id && <div className="end-tag">被刺客指认</div>}
            </motion.div>
          );
        })}
      </div>

      <div className="end-actions">
        {isHost ? (
          <button type="button" className="btn btn-primary" onClick={net.backToLobby}>
            回到大厅，再来一局
          </button>
        ) : (
          <p className="lobby-waiting">等 {host?.name ?? '房主'} 开下一局</p>
        )}
        <button type="button" className="btn btn-ghost" onClick={onHistory}>
          复盘任务记录
        </button>
      </div>
    </div>
  );
}
