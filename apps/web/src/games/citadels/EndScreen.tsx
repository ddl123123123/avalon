import { motion } from 'framer-motion';
import { Citadels, type RoomSnapshot } from '@tabletop/shared';
import { Crest } from '../../art/Crest';
import { Crown } from '../../art/glass';
import { SplitText } from '../../fx/SplitText';
import { net } from '../../net/client';
import { Coin, DistrictCard } from './art';

const { CHARACTER } = Citadels;

/** 结算：按总分排名，列出每个人的得分构成和城市。 */
export function EndScreen({ room, view, onCard }: { room: RoomSnapshot; view: Citadels.CitadelsView; onCard: (card: string) => void }) {
  const scores = view.scores!;
  const isHost = room.hostId === room.you;
  const host = room.players.find((p) => p.id === room.hostId);
  const winner = room.players.find((p) => p.id === view.winner);
  const ranked = [...room.players].sort((a, b) => (a.id === view.winner ? -1 : b.id === view.winner ? 1 : scores[b.id]!.total - scores[a.id]!.total));

  return (
    <div className="end ct-end">
      <div className="end-head">
        <h1 className="end-title ct-end-title">
          <SplitText text={`${winner?.name ?? '？'} 的城最富饶`} stagger={0.06} />
        </h1>
        <p className="end-reason">{view.winner === room.you ? '你赢了这一局。' : `${winner?.name ?? ''} 以 ${scores[view.winner!]!.total} 分获胜。`}</p>
      </div>

      <ol className="ct-ranking">
        {ranked.map((p, i) => {
          const s = scores[p.id]!;
          const seat = view.seats[p.id]!;
          const parts = [`城区 ${s.districts}`, s.allTypes ? `五色齐全 +${s.allTypes}` : '', s.complete ? `${view.completed[0] === p.id ? '率先建成' : '建成'} +${s.complete}` : ''].filter(Boolean);
          return (
            <motion.li
              key={p.id}
              className={`ct-rank ${p.id === view.winner ? 'is-winner' : ''}`}
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.4 + i * 0.14, type: 'spring', stiffness: 160, damping: 20 }}
            >
              <div className="ct-rank-who">
                <span className="ct-rank-crest">
                  <Crest seed={p.id} />
                  {p.id === view.winner && (
                    <span className="city-crown">
                      <Crown />
                    </span>
                  )}
                </span>
                <div>
                  <div className="ct-rank-name">
                    {p.name}
                    {p.id === room.you && <span className="seat-you">你</span>}
                  </div>
                  <div className="ct-rank-parts">{parts.join('，')}</div>
                  <div className="ct-rank-parts">
                    最后一轮是{(view.characters?.[p.id] ?? []).map((c) => CHARACTER[c].name).join('和') || '无'}，剩 {seat.gold}
                    <Coin className="inline-coin" />
                  </div>
                </div>
              </div>
              <div className="ct-rank-city">
                {seat.city.map((card) => (
                  <button key={card} type="button" className="tile" onClick={() => onCard(card)} title={Citadels.districtOf(card).name}>
                    <DistrictCard card={card} compact />
                  </button>
                ))}
              </div>
              <div className="ct-rank-total">
                {s.total}
                <small>分</small>
              </div>
            </motion.li>
          );
        })}
      </ol>

      <div className="end-actions">
        {isHost ? (
          <button type="button" className="btn btn-primary" onClick={net.backToLobby}>
            回到大厅，再来一局
          </button>
        ) : (
          <p className="lobby-waiting">等 {host?.name ?? '房主'} 开下一局</p>
        )}
      </div>
    </div>
  );
}
