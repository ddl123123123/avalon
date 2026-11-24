import { useSyncExternalStore } from 'react';
import { isPigEdition } from '../pigEdition';

const KEY = 'citadels.cardStyle';
type ClassicStyle = 'blue-gold' | 'starry-night';
const listeners = new Set<() => void>();

function readStyle(): ClassicStyle {
  try {
    return localStorage.getItem(KEY) === 'starry-night' ? 'starry-night' : 'blue-gold';
  } catch {
    return 'blue-gold';
  }
}

let classicStyle = readStyle();

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
      classicStyle = readStyle();
      emit();
    }
  });
}

function useCardStyle() {
  return useSyncExternalStore(subscribe, () => isPigEdition() ? 'pig' : classicStyle, () => 'blue-gold');
}

const STYLES = [
  { id: 'blue-gold', name: '蓝金徽章' },
  { id: 'starry-night', name: '星夜典藏' },
] as const;

export function useCitadelsPigTheme() {
  return useCardStyle() === 'pig';
}

function setCardStyle(next: ClassicStyle) {
  classicStyle = next;
  try {
    localStorage.setItem(KEY, classicStyle);
  } catch {
    // 无法保存时仍可在当前页面使用。
  }
  emit();
}

export function useCitadelsCardArt(asset: string): string {
  return `${import.meta.env.BASE_URL}citadels-cards/${useCardStyle()}/${asset}.webp`;
}

export function CitadelsLobbyCardStyles() {
  const selected = useCardStyle();
  if (selected === 'pig') return null;
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
  if (selected === 'pig') return null;
  return (
    <select
      className="ct-card-style"
      aria-label="卡牌画风"
      value={selected}
      onChange={(event) => {
        const next = STYLES.find(({ id }) => id === event.target.value);
        if (next) setCardStyle(next.id);
      }}
    >
      {STYLES.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
    </select>
  );
}
