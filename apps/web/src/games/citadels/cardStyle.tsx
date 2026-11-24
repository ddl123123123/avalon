import { useSyncExternalStore } from 'react';
import { isPigUnlocked, usePigUnlocked } from '../pigEdition';

const KEY = 'citadels.cardStyle';
const PIG_KEY = 'citadels.pigEdition';
type ClassicStyle = 'blue-gold' | 'starry-night';
type CardStyle = ClassicStyle | 'pig';
const listeners = new Set<() => void>();

function readStyle(): ClassicStyle {
  try {
    return localStorage.getItem(KEY) === 'starry-night' ? 'starry-night' : 'blue-gold';
  } catch {
    return 'blue-gold';
  }
}

function readPigEdition() {
  try {
    return localStorage.getItem(PIG_KEY) === 'pig';
  } catch {
    return false;
  }
}

let classicStyle = readStyle();
let pigEdition = readPigEdition();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === KEY || event.key === PIG_KEY || event.key === null) {
      classicStyle = readStyle();
      pigEdition = readPigEdition();
      emit();
    }
  });
}

function useCardStyle() {
  const unlocked = usePigUnlocked();
  return useSyncExternalStore(subscribe, () => unlocked && pigEdition ? 'pig' : classicStyle, () => 'blue-gold');
}

const STYLES = [
  { id: 'blue-gold', name: '蓝金徽章' },
  { id: 'starry-night', name: '星夜典藏' },
  { id: 'pig', name: '小猪版' },
] as const;

export function useCitadelsPigTheme() {
  return useCardStyle() === 'pig';
}

function saveEdition() {
  try {
    localStorage.setItem(KEY, classicStyle);
    localStorage.setItem(PIG_KEY, pigEdition ? 'pig' : 'classic');
  } catch {
    // 无法保存时仍可在当前页面使用。
  }
  emit();
}

function setCardStyle(next: CardStyle) {
  if (next === 'pig') {
    if (!isPigUnlocked()) return;
    pigEdition = true;
  } else {
    classicStyle = next;
    pigEdition = false;
  }
  saveEdition();
}

export function setCitadelsPigEdition(active: boolean) {
  setCardStyle(active ? 'pig' : classicStyle);
}

export function useCitadelsCardArt(asset: string): string {
  return `${import.meta.env.BASE_URL}citadels-cards/${useCardStyle()}/${asset}.webp`;
}

export function CitadelsLobbyCardStyles() {
  const selected = useCardStyle();
  const unlocked = usePigUnlocked();
  return (
    <div className="ct-lobby-card-style" role="group" aria-label="卡牌画风">
      <span>卡牌画风</span>
      {STYLES.filter(({ id }) => unlocked || id !== 'pig').map(({ id, name }) => (
        <button key={id} type="button" aria-pressed={selected === id} onClick={() => setCardStyle(id)}>
          {name}
        </button>
      ))}
    </div>
  );
}

export function CitadelsCardStylePicker() {
  const selected = useCardStyle();
  const unlocked = usePigUnlocked();
  const styles = STYLES.filter(({ id }) => unlocked || id !== 'pig');
  return (
    <select
      className="ct-card-style"
      aria-label="卡牌画风"
      value={selected}
      onChange={(event) => {
        const next = styles.find(({ id }) => id === event.target.value);
        if (next) setCardStyle(next.id);
      }}
    >
      {styles.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
    </select>
  );
}
