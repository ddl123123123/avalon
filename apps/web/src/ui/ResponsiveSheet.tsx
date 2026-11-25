import { motion, useDragControls, useReducedMotion } from 'framer-motion';
import { useEffect, useRef, useSyncExternalStore, type ReactNode } from 'react';

const narrow = window.matchMedia('(max-width: 767px)');
const subscribe = (listener: () => void) => {
  narrow.addEventListener('change', listener);
  return () => narrow.removeEventListener('change', listener);
};

export function ResponsiveSheet({
  label,
  children,
  onClose,
  className = '',
  tone = 'plain',
  centered = false,
  closeOnBackdrop = !centered,
}: {
  label: string;
  children: ReactNode;
  onClose?: () => void;
  className?: string;
  tone?: 'plain' | 'good' | 'evil';
  centered?: boolean;
  closeOnBackdrop?: boolean;
}) {
  const mobile = useSyncExternalStore(subscribe, () => narrow.matches);
  const reduced = useReducedMotion();
  const controls = useDragControls();
  const panel = useRef<HTMLElement>(null);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    const opener = document.activeElement;
    const element = panel.current;
    element?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close.current?.();
      if (event.key !== 'Tab' || !element) return;
      const targets = [...element.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex="0"]',
      )].filter((target) => target.getClientRects().length > 0);
      const edge = event.shiftKey ? targets[0] : targets.at(-1);
      const next = event.shiftKey ? targets.at(-1) : targets[0];
      if (!element.contains(document.activeElement) || document.activeElement === edge || !targets.length ||
          (event.shiftKey && document.activeElement === element)) {
        event.preventDefault();
        (next ?? element).focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (opener instanceof HTMLElement && opener.isConnected && element?.contains(document.activeElement)) {
        opener.focus({ preventScroll: true });
      }
    };
  }, []);

  const slide = mobile ? { y: '100%' } : { x: '100%' };

  return (
    <motion.div className={`responsive-sheet ${centered ? `overlay overlay-${tone}` : 'drawer-scrim'}`}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={(event) => { if (closeOnBackdrop && event.target === event.currentTarget) onClose?.(); }}>
      <motion.section ref={panel} className={`responsive-sheet-panel ${centered ? 'overlay-body' : 'drawer'} ${className}`}
        role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}
        onClick={(event) => {
          if (!mobile && centered && closeOnBackdrop && event.target === event.currentTarget) onClose?.();
        }}
        initial={reduced || (centered && !mobile) ? false : slide}
        animate={{ x: 0, y: 0 }}
        exit={reduced || (centered && !mobile) ? undefined : slide}
        transition={{ type: 'spring', stiffness: 310, damping: 34 }}
        drag={mobile && onClose ? 'y' : false} dragListener={false} dragControls={controls}
        dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: 0.8 }} dragMomentum={false}
        onDragEnd={(_, { offset, velocity }) => {
          if (offset.y >= 80 || (offset.y >= 24 && velocity.y > 500)) onClose?.();
        }}>
        {mobile && onClose && (
          <div className="responsive-sheet-grip" aria-hidden="true" onPointerDown={(event) => controls.start(event)}>
            <span />
          </div>
        )}
        {children}
      </motion.section>
    </motion.div>
  );
}
