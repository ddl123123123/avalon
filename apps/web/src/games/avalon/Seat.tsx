import { AnimatePresence, motion } from 'framer-motion';
import type { RoomPlayer } from '@tabletop/shared';
import { Crest } from '../../art/Crest';
import { Crown } from '../../art/glass';
import { LadyToken, TeamMark, VoteToken } from './art';

export interface SeatProps {
  player: RoomPlayer;
  seatNumber: number;
  isMe: boolean;
  isLeader: boolean;
  onTeam: boolean;
  hasLady: boolean;
  /** 已经投票 / 出牌（内容保密） */
  acted: boolean;
  /** 公开的投票结果；null 表示不展示 */
  vote: boolean | null;
  /** 投票币翻开的先后顺序 */
  order: number;
  /** 座位下方的小字：我知道的关于这个人的信息 */
  note: { text: string; tone: 'good' | 'evil' | 'plain' } | null;
  pickable: boolean;
  picked: boolean;
  onPick?: () => void;
}

export function Seat(p: SeatProps) {
  const classes = [
    'seat',
    p.isMe && 'seat-me',
    p.onTeam && 'seat-on-team',
    p.picked && 'seat-picked',
    p.pickable && 'seat-pickable',
    !p.player.connected && 'seat-offline',
    p.note && `seat-tone-${p.note.tone}`,
  ]
    .filter(Boolean)
    .join(' ');

  const body = (
    <>
      <div className="seat-crest">
        <Crest seed={p.player.id} />
        <span className="seat-number" aria-label={`座位 ${p.seatNumber}`}>{p.seatNumber}</span>
        <AnimatePresence>
          {p.isLeader && (
            <motion.span
              key="crown"
              className="seat-crown"
              layoutId="crown"
              initial={{ opacity: 0, y: -14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ type: 'spring', stiffness: 220, damping: 22 }}
            >
              <Crown />
            </motion.span>
          )}
          {p.onTeam && (
            <motion.span
              key="team"
              className="seat-team"
              initial={{ scale: 0, rotate: -40 }}
              animate={{ scale: 1, rotate: 0 }}
              exit={{ scale: 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 18 }}
            >
              <TeamMark />
            </motion.span>
          )}
          {p.hasLady && (
            <motion.span key="lady" className="seat-lady" layoutId="lady" transition={{ type: 'spring', stiffness: 200, damping: 24 }}>
              <LadyToken />
            </motion.span>
          )}
          {p.acted && p.vote === null && (
            <motion.span key="acted" className="seat-acted" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} />
          )}
          {p.vote !== null && (
            <motion.span
              key="vote"
              className="seat-vote"
              initial={{ rotateY: 90, scale: 0.6, opacity: 0 }}
              animate={{ rotateY: 0, scale: 1, opacity: 1 }}
              exit={{ scale: 0.4, opacity: 0, transition: { duration: 0.25 } }}
              transition={{ delay: 0.25 + p.order * 0.11, type: 'spring', stiffness: 260, damping: 16 }}
            >
              <VoteToken approve={p.vote} />
            </motion.span>
          )}
        </AnimatePresence>
      </div>
      <div className="seat-name">
        {p.player.name}
        {p.isMe && <span className="seat-you">你</span>}
      </div>
      <div className="seat-note">{!p.player.connected ? '掉线了' : (p.note?.text ?? '')}</div>
    </>
  );

  if (p.pickable) {
    return (
      <button type="button" className={classes} aria-pressed={p.picked} onClick={p.onPick}>
        {body}
      </button>
    );
  }
  return <div className={classes}>{body}</div>;
}
