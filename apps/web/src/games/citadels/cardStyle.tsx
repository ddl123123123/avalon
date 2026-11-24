import { useSyncExternalStore } from 'react';

const KEY = 'citadels.cardStyle';
type CardStyle = 'blue-gold' | 'starry-night';
const listeners = new Set<() => void>();

function readStyle(): CardStyle {
  try {
    return localStorage.getItem(KEY) === 'starry-night' ? 'starry-night' : 'blue-gold';
  } catch {
    return 'blue-gold';
  }
}

let style = readStyle();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === KEY || event.key === null) {
      style = readStyle();
      emit();
    }
  });
}

function useCardStyle() {
  return useSyncExternalStore(subscribe, () => style, () => 'blue-gold');
}

export function useCitadelsCardArt(asset: string): string {
  return `${import.meta.env.BASE_URL}citadels-cards/${useCardStyle()}/${asset}.webp`;
}

export function CitadelsCardStylePicker() {
  const selected = useCardStyle();
  return (
    <select
      className="ct-card-style"
      aria-label="卡牌画风"
      value={selected}
      onChange={(event) => {
        style = event.target.value === 'starry-night' ? 'starry-night' : 'blue-gold';
        try {
          localStorage.setItem(KEY, style);
        } catch {
          // 仍可在当前页面切换。
        }
        emit();
      }}
    >
      <option value="blue-gold">蓝金徽章</option>
      <option value="starry-night">星夜典藏</option>
    </select>
  );
}
