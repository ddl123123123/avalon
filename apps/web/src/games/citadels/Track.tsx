import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { Citadels } from '@tabletop/shared';
import { CharacterCard } from './art';
import { describe, toneOf } from './text';

const { CHARACTERS } = Citadels;

/** 八个角色的叫号进度：谁已经亮明、轮到谁、谁被刺杀或被偷。 */
export function Track({ view, nameOf }: { view: Citadels.CitadelsView; nameOf: (id: string) => string }) {
  return (
    <ol className="track" aria-label="角色叫号顺序">
      {CHARACTERS.map((c) => {
        const owner = view.players.find((p) => view.seats[p]!.revealed.includes(c.id));
        const out = view.faceUp.includes(c.id);
        const current = view.turn?.character === c.id;
        const past = view.phase === 'turns' && c.rank <= view.calledRank && !current;
        const classes = ['track-item', current && 'is-current', past && 'is-past', out && 'is-out'].filter(Boolean).join(' ');
        return (
          <li key={c.id} className={classes} title={c.ability}>
            <span className="track-card">
              <CharacterCard character={c.id} />
              {view.murdered === c.id && <span className="track-mark track-mark-murder" title="被刺客盯上" />}
              {view.robbed === c.id && <span className="track-mark track-mark-rob" title="被盗贼盯上" />}
            </span>
            <span className="track-label">{out ? '明弃' : owner ? nameOf(owner) : past ? '无人' : c.name}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** 把新发生的事件一条一条播报出来；积压多了就加快。 */
export function Announcer({ view, nameOf }: { view: Citadels.CitadelsView; nameOf: (id: string) => string }) {
  const lastSeq = view.log.at(-1)?.seq ?? 0;
  // 刚进入页面时不重播历史，直接从最近一条开始
  const [cursor, setCursor] = useState(lastSeq);
  const shownAt = useRef(0);

  useEffect(() => {
    if (cursor > lastSeq) {
      setCursor(lastSeq);
      return;
    }
    const next = view.log.find((e) => e.seq > cursor);
    if (!next) return;
    const backlog = lastSeq - next.seq;
    // 每条至少停留一小会儿；后面排着的越多，停得越短
    const hold = backlog > 4 ? 200 : backlog > 1 ? 480 : 850;
    const wait = Math.max(0, hold - (performance.now() - shownAt.current));
    const t = setTimeout(() => {
      shownAt.current = performance.now();
      setCursor(next.seq);
    }, wait);
    return () => clearTimeout(t);
  }, [cursor, lastSeq, view.log]);

  const shown = view.log.find((e) => e.seq === cursor) ?? view.log.at(-1) ?? null;

  return (
    <div className="announcer" aria-live="polite">
      <AnimatePresence mode="wait">
        {shown && (
          <motion.p
            key={shown.seq}
            className={`announce announce-${toneOf(shown)}`}
            initial={{ opacity: 0, y: 12, filter: 'blur(6px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.22 }}
          >
            {describe(shown, nameOf)}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
