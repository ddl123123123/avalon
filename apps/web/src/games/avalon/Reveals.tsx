import { motion } from 'framer-motion';
import { useEffect, useState, type ReactNode } from 'react';
import { Avalon, type RoomPlayer } from '@tabletop/shared';
import { Crest } from '../../art/Crest';
import { Tilt } from '../../fx/Tilt';
import { CardBack, QuestCard, RoleFace } from './art';

const { ROLES } = Avalon;

/** 可翻转的牌：背面朝上入场，flipped 后翻到正面。 */
export function FlipCard({ flipped, front, className = '' }: { flipped: boolean; front: ReactNode; className?: string }) {
  return (
    <div className={`flip ${className}`}>
      <motion.div
        className="flip-inner"
        initial={false}
        animate={{ rotateY: flipped ? 180 : 0 }}
        transition={{ duration: 0.7, ease: [0.3, 0.1, 0.2, 1] }}
      >
        <div className="flip-face flip-back">
          <CardBack />
        </div>
        <div className="flip-face flip-front">{front}</div>
      </motion.div>
    </div>
  );
}

function Overlay({ children, tone = 'plain', onClose }: { children: ReactNode; tone?: 'plain' | 'good' | 'evil'; onClose?: () => void }) {
  useEffect(() => {
    if (!onClose) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <motion.div
      className={`overlay overlay-${tone}`}
      role="dialog"
      aria-modal="true"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="overlay-body">{children}</div>
    </motion.div>
  );
}

/** 我在夜晚得知的信息，写成一句话。 */
export function sightingText(me: NonNullable<Avalon.AvalonView['me']>, nameOf: (id: string) => string): string | null {
  const ids = Object.keys(me.sightings);
  const names = ids.map(nameOf).join('、');
  if (me.role === 'merlin') return ids.length ? `你看到的邪恶方：${names}` : '这一局你没有看到任何邪恶方';
  if (me.role === 'percival') return ids.length > 1 ? `梅林就在这两人之中：${names}` : `梅林是 ${names}`;
  if (me.alignment === 'evil' && me.role !== 'oberon') return ids.length ? `你的同伴：${names}` : '这一局你没有认识的同伴';
  return null;
}

/** 身份牌：开局时自动翻开，之后可以随时再看。 */
export function RoleReveal({
  me,
  nameOf,
  intro,
  onClose,
}: {
  me: NonNullable<Avalon.AvalonView['me']>;
  nameOf: (id: string) => string;
  intro: boolean;
  onClose: () => void;
}) {
  const [flipped, setFlipped] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setFlipped(true), intro ? 1100 : 250);
    return () => clearTimeout(t);
  }, [intro]);
  const info = ROLES[me.role];
  const seen = sightingText(me, nameOf);

  return (
    <Overlay tone={flipped ? me.alignment : 'plain'} onClose={onClose}>
      <p className="overlay-kicker">{intro ? '夜幕降临，看清你的身份' : '你的身份'}</p>
      <motion.div
        initial={intro ? { y: 80, opacity: 0, scale: 0.8 } : { scale: 0.92, opacity: 0 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 120, damping: 16 }}
      >
        <Tilt className="role-card-big" max={12}>
          <FlipCard flipped={flipped} front={<RoleFace role={me.role} />} />
        </Tilt>
      </motion.div>
      <motion.div className="overlay-text" initial={{ opacity: 0, y: 10 }} animate={flipped ? { opacity: 1, y: 0 } : {}} transition={{ delay: 0.55 }}>
        <p className={`overlay-title tone-${me.alignment}`}>
          {info.name}，{me.alignment === 'good' ? '正义方' : '邪恶方'}
        </p>
        <p>{info.ability}</p>
        {seen && <p className="overlay-seen">{seen}</p>}
        <button type="button" className="btn btn-primary" onClick={onClose}>
          {intro ? '记住了' : '收起'}
        </button>
      </motion.div>
    </Overlay>
  );
}

/** 任务牌逐张翻开。成功的先翻，失败的留到最后。 */
export function QuestReveal({
  quest,
  required,
  onDone,
}: {
  quest: Avalon.QuestRecord;
  required: number;
  onDone: () => void;
}) {
  const total = quest.team.length;
  const cards = Array.from({ length: total }, (_, i) => i < total - quest.fails);
  const [flipped, setFlipped] = useState(0);
  const done = flipped >= total;

  useEffect(() => {
    if (done) return;
    // 最后一张多等一会儿
    const wait = flipped === 0 ? 1300 : flipped === total - 1 ? 1250 : 700;
    const t = setTimeout(() => setFlipped((n) => n + 1), wait);
    return () => clearTimeout(t);
  }, [flipped, done, total]);

  useEffect(() => {
    if (!done) return;
    const t = setTimeout(onDone, 3600);
    return () => clearTimeout(t);
  }, [done, onDone]);

  const detail =
    quest.fails === 0
      ? '全部是成功牌'
      : quest.success
        ? `出现了 ${quest.fails} 张失败，但这次要 ${required} 张才算失败`
        : `出现了 ${quest.fails} 张失败`;

  return (
    <Overlay tone={done ? (quest.success ? 'good' : 'evil') : 'plain'} onClose={onDone}>
      <p className="overlay-kicker">第 {quest.questIndex + 1} 次任务，翻牌</p>
      <div className="quest-reveal-cards">
        {cards.map((success, i) => (
          <motion.div
            key={i}
            className="quest-reveal-card"
            initial={{ y: 140, opacity: 0, rotate: (i - (total - 1) / 2) * 14 }}
            animate={{ y: 0, opacity: 1, rotate: (i - (total - 1) / 2) * 3 }}
            transition={{ delay: 0.12 * i, type: 'spring', stiffness: 140, damping: 16 }}
          >
            <FlipCard flipped={i < flipped} front={<QuestCard success={success} />} />
          </motion.div>
        ))}
      </div>
      <div className="overlay-text">
        {done ? (
          <>
            <motion.p
              className={`stamp tone-${quest.success ? 'good' : 'evil'}`}
              initial={{ scale: 2.4, opacity: 0, rotate: -8 }}
              animate={{ scale: 1, opacity: 1, rotate: -3 }}
              transition={{ type: 'spring', stiffness: 300, damping: 15 }}
            >
              {quest.success ? '任务成功' : '任务失败'}
            </motion.p>
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}>
              {detail}
            </motion.p>
            <button type="button" className="btn btn-ghost btn-small" onClick={onDone}>
              继续
            </button>
          </>
        ) : (
          <p className="overlay-wait">
            {flipped} / {total}
          </p>
        )}
      </div>
    </Overlay>
  );
}

/** 湖中仙女的查验结果，只有持有者看得到。 */
export function LadyReveal({
  target,
  alignment,
  onDone,
}: {
  target: RoomPlayer;
  alignment: Avalon.Alignment;
  onDone: () => void;
}) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShown(true), 1200);
    return () => clearTimeout(t);
  }, []);
  return (
    <Overlay tone={shown ? alignment : 'plain'} onClose={onDone}>
      <p className="overlay-kicker">湖中仙女映出了 {target.name} 的阵营</p>
      <motion.div className="lady-target" animate={shown ? { scale: 1 } : { scale: [1, 1.05, 1] }} transition={{ repeat: shown ? 0 : Infinity, duration: 1.2 }}>
        <Crest seed={target.id} />
      </motion.div>
      <div className="overlay-text">
        {shown && (
          <motion.p
            className={`stamp tone-${alignment}`}
            initial={{ scale: 2.2, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 16 }}
          >
            {alignment === 'good' ? '正义方' : '邪恶方'}
          </motion.p>
        )}
        <p>只有你看得到这个结果。说不说、怎么说，由你决定。湖中仙女现在交到了 {target.name} 手上。</p>
        <button type="button" className="btn btn-primary" onClick={onDone}>
          知道了
        </button>
      </div>
    </Overlay>
  );
}

/** 刺杀：匕首落下，翻开被刺者的身份。 */
export function AssassinReveal({
  assassin,
  target,
  targetRole,
  onDone,
}: {
  assassin: RoomPlayer;
  target: RoomPlayer;
  targetRole: Avalon.Role;
  onDone: () => void;
}) {
  const [flipped, setFlipped] = useState(false);
  const hit = targetRole === 'merlin';
  useEffect(() => {
    const t1 = setTimeout(() => setFlipped(true), 1900);
    const t2 = setTimeout(onDone, 6200);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [onDone]);

  return (
    <Overlay tone={flipped ? (hit ? 'evil' : 'good') : 'plain'} onClose={onDone}>
      <p className="overlay-kicker">
        刺客 {assassin.name} 把匕首指向了 {target.name}
      </p>
      <div className="assassin-stage">
        <FlipCard flipped={flipped} front={<RoleFace role={targetRole} />} />
        <motion.svg
          className="assassin-dagger"
          viewBox="0 0 100 100"
          initial={{ y: -260, x: 90, rotate: 28, opacity: 0 }}
          animate={{ y: [-260, -260, 0], x: [90, 90, 0], opacity: [0, 1, 1], rotate: 28 }}
          transition={{ duration: 1.5, times: [0, 0.35, 1], ease: [0.6, 0, 0.9, 0.4] }}
          aria-hidden="true"
        >
          <g fill="#e9e4d4" stroke="#05081a" strokeWidth="3" strokeLinejoin="round">
            <path d="M50 96L41 44H59Z" />
            <path d="M28 36H72V46H28Z" fill="#e0b04a" />
            <path d="M45 16H55V36H45Z" fill="#7c1429" />
            <circle cx="50" cy="12" r="7" fill="#e0b04a" />
          </g>
        </motion.svg>
      </div>
      <div className="overlay-text">
        {flipped && (
          <>
            <motion.p
              className={`stamp tone-${hit ? 'evil' : 'good'}`}
              initial={{ scale: 2.2, opacity: 0, rotate: -6 }}
              animate={{ scale: 1, opacity: 1, rotate: -3 }}
              transition={{ delay: 0.7, type: 'spring', stiffness: 300, damping: 15 }}
            >
              {hit ? '梅林倒下了' : '刺错了人'}
            </motion.p>
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.1 }}>
              {hit ? `${target.name} 正是梅林。邪恶方反败为胜。` : `${target.name} 是${ROLES[targetRole].name}。梅林躲过了这一刀。`}
            </motion.p>
          </>
        )}
        <button type="button" className="btn btn-ghost btn-small" onClick={onDone}>
          继续
        </button>
      </div>
    </Overlay>
  );
}
