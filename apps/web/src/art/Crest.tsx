import { useId, useMemo } from 'react';
import { seededRandom } from '../fx/motion';

/**
 * 每位玩家一枚纹章，由玩家 id 决定，整局不变。
 * 遵循纹章学的配色规矩：一种「色」配一种「金属」，保证远看也分得清。
 */
const COLORS = ['#c7304a', '#2f63cf', '#23856a', '#7a3fb0', '#d0662a', '#1f2a4a'];
const METALS = ['#e9c463', '#ece7da'];
const SHIELD = 'M8 6H92V54C92 82 72 100 50 108C28 100 8 82 8 54Z';

type Draw = (fill: string) => JSX.Element;
const ORDINARIES: Draw[] = [
  (f) => <rect x="36" y="0" width="28" height="112" fill={f} />,
  (f) => <rect x="0" y="34" width="100" height="26" fill={f} />,
  (f) => <path d="M-6 -4L106 108" stroke={f} strokeWidth="24" />,
  (f) => <path d="M106 -4L-6 108" stroke={f} strokeWidth="24" />,
  (f) => <path d="M2 88L50 42L98 88" stroke={f} strokeWidth="20" fill="none" />,
  (f) => (
    <>
      <rect x="40" y="0" width="20" height="112" fill={f} />
      <rect x="0" y="36" width="100" height="20" fill={f} />
    </>
  ),
  (f) => <path d="M-2 0L102 104M102 0L-2 104" stroke={f} strokeWidth="17" />,
  (f) => <rect x="50" y="0" width="50" height="112" fill={f} />,
  (f) => <rect x="0" y="52" width="100" height="60" fill={f} />,
  (f) => (
    <>
      <rect x="50" y="0" width="50" height="52" fill={f} />
      <rect x="0" y="52" width="50" height="60" fill={f} />
    </>
  ),
  (f) => <rect x="0" y="0" width="100" height="34" fill={f} />,
  (f) => <path d="M8 6H92L50 82Z" fill={f} />,
];

export function Crest({ seed, className = '' }: { seed: string; className?: string }) {
  const id = useId();
  const { field, charge, draw } = useMemo(() => {
    const rand = seededRandom(seed);
    const color = COLORS[Math.floor(rand() * COLORS.length)]!;
    const metal = METALS[Math.floor(rand() * METALS.length)]!;
    const flip = rand() < 0.5;
    return {
      field: flip ? metal : color,
      charge: flip ? color : metal,
      draw: ORDINARIES[Math.floor(rand() * ORDINARIES.length)]!,
    };
  }, [seed]);

  return (
    <svg className={`crest ${className}`} viewBox="0 0 100 112" aria-hidden="true">
      <defs>
        <clipPath id={`${id}c`}>
          <path d={SHIELD} />
        </clipPath>
        <linearGradient id={`${id}g`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.38" />
          <stop offset="0.45" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.38" />
        </linearGradient>
      </defs>
      <g clipPath={`url(#${id}c)`}>
        <rect width="100" height="112" fill={field} />
        {draw(charge)}
        <rect width="100" height="112" fill={`url(#${id}g)`} />
      </g>
      <path d={SHIELD} fill="none" stroke="#05081a" strokeWidth="6" strokeLinejoin="round" />
      <path d={SHIELD} fill="none" stroke="#e0b04a" strokeWidth="1.6" strokeLinejoin="round" opacity="0.9" />
    </svg>
  );
}
