import { useState, type ComponentPropsWithoutRef } from 'react';
import { motion } from 'framer-motion';
import { useReducedMotion } from '../fx/motion';

type ImageProps = Omit<
  ComponentPropsWithoutRef<typeof motion.img>,
  'src' | 'onLoad' | 'initial' | 'animate' | 'transition' | 'whileHover' | 'whileTap'
> & {
  src: string;
  revealDuration?: number;
};

export function DecodedImage(props: ImageProps) {
  return <ImageWithDecode key={props.src} {...props} />;
}

function ImageWithDecode({ style, revealDuration, ...props }: ImageProps) {
  const [decoded, setDecoded] = useState(false);
  const reducedMotion = useReducedMotion();
  const interactive = !reducedMotion && revealDuration === undefined;
  const hidden = { opacity: 0, scale: reducedMotion ? 1 : 1.035 };

  return (
    <motion.img
      {...props}
      style={decoded ? style : { ...style, visibility: 'hidden' }}
      initial={hidden}
      animate={decoded ? { opacity: 1, scale: 1 } : hidden}
      transition={reducedMotion ? { duration: 0 } : revealDuration === undefined
        ? { type: 'spring', stiffness: 190, damping: 24 }
        : { type: 'tween', duration: revealDuration, ease: [0.45, 0, 0.3, 1] }}
      whileHover={interactive ? { scale: 1.02 } : undefined}
      whileTap={interactive ? { scale: 0.99 } : undefined}
      onLoad={async ({ currentTarget: img }) => {
        try {
          await img.decode?.();
          if (img.isConnected) setDecoded(true);
        } catch {
          // 解码失败时继续显示容器的底图。
        }
      }}
    />
  );
}
