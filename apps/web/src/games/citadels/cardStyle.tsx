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

const STYLES = [
  { id: 'blue-gold', name: '蓝金徽章' },
  { id: 'starry-night', name: '星夜典藏' },
] as const;

function setCardStyle(next: CardStyle) {
  if (style === next) return;
  style = next;
  try {
    localStorage.setItem(KEY, style);
  } catch {
    // 仍可在当前页面切换。
  }
  emit();
}

export function useCitadelsCardArt(asset: string): string {
  return `${import.meta.env.BASE_URL}citadels-cards/${useCardStyle()}/${asset}.webp`;
}

export function CitadelsLobbyCardStyles() {
  const selected = useCardStyle();
  return (
    <div className="ct-lobby-card-style" role="group" aria-label="卡牌画风">
      <span>卡牌画风</span>
      {STYLES.map(({ id, name }) => (
        <button key={id} type="button" aria-pressed={selected === id} onClick={() => setCardStyle(id)}>
          {name}
        </button>
      ))}
    </div>
  );
}

export function CitadelsCardStylePicker() {
  const selected = useCardStyle();
  return (
    <select
      className="ct-card-style"
      aria-label="卡牌画风"
      value={selected}
      onChange={(event) => setCardStyle(event.target.value === 'starry-night' ? 'starry-night' : 'blue-gold')}
    >
      {STYLES.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
    </select>
  );
}
