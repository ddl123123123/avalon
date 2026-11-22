import { motion } from 'framer-motion';
import { useReducedMotion } from './motion';

/** 标题逐字浮现：先模糊下沉，再依次归位。 */
export function SplitText({
  text,
  className,
  delay = 0,
  stagger = 0.09,
}: {
  text: string;
  className?: string;
  delay?: number;
  stagger?: number;
}) {
  const reduced = useReducedMotion();
  return (
    <span className={className} aria-label={text}>
      {[...text].map((ch, i) => (
        <motion.span
          key={i}
          aria-hidden="true"
          style={{ display: 'inline-block', whiteSpace: 'pre' }}
          initial={reduced ? false : { opacity: 0, y: '0.35em', filter: 'blur(12px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ duration: 0.9, delay: delay + i * stagger, ease: [0.2, 0.7, 0.2, 1] }}
        >
          {ch}
        </motion.span>
      ))}
    </span>
  );
}
