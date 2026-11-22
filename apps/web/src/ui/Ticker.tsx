import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';

/**
 * 把对局里新发生的事件一条一条播报出来；积压多了就加快。与具体桌游无关：
 * 只要事件带递增的 seq，再告诉它怎么把事件写成一句话。
 */
export function Ticker<E extends { seq: number }>({
  log,
  describe,
  tone,
}: {
  log: E[];
  describe: (event: E) => string;
  tone?: (event: E) => 'plain' | 'gilt' | 'danger';
}) {
  const lastSeq = log.at(-1)?.seq ?? 0;
  // 刚进入页面时不重播历史，直接从最近一条开始
  const [cursor, setCursor] = useState(lastSeq);
  const shownAt = useRef(0);

  useEffect(() => {
    if (cursor > lastSeq) {
      setCursor(lastSeq);
      return;
    }
    const next = log.find((e) => e.seq > cursor);
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
  }, [cursor, lastSeq, log]);

  const shown = log.find((e) => e.seq === cursor) ?? log.at(-1) ?? null;

  return (
    <div className="announcer" aria-live="polite">
      <AnimatePresence mode="wait">
        {shown && (
          <motion.p
            key={shown.seq}
            className={`announce announce-${tone ? tone(shown) : 'plain'}`}
            initial={{ opacity: 0, y: 12, filter: 'blur(6px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.22 }}
          >
            {describe(shown)}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
