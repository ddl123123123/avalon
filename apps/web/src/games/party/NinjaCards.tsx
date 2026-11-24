import { useSyncExternalStore } from 'react';
import type { NinjaNight } from '@tabletop/shared';

export const ninjaFactions = { guard: '守夜忍', shadow: '影忍' } as const;
const factions = ['guard', 'shadow'] as const;
const styles = [
  { id: 'blue-gold', name: '蓝金徽章', description: '低多边形插画与金色线框' },
  { id: 'starry-night', name: '星夜典藏', description: '写实月夜插画与细致卡框' },
] as const;
type CardStyle = typeof styles[number]['id'];
const storageKey = 'ninja-night.cardStyle';
const listeners = new Set<() => void>();

function readStyle(): CardStyle {
  try {
    return localStorage.getItem(storageKey) === 'starry-night' ? 'starry-night' : 'blue-gold';
  } catch {
    return 'blue-gold';
  }
}

let currentStyle = readStyle();

function notify() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== storageKey && event.key !== null) return;
    currentStyle = readStyle();
    notify();
  });
}

export function useNinjaCardStyle() {
  return useSyncExternalStore<CardStyle>(subscribe, () => currentStyle, () => 'blue-gold');
}

function selectStyle(style: CardStyle) {
  if (currentStyle === style) return;
  currentStyle = style;
  try {
    localStorage.setItem(storageKey, style);
  } catch {
    // 禁用本机存储时，仍可在当前页面使用所选画风。
  }
  notify();
}

export function NinjaIdentityCard({ faction, style, thumbnail = false }: {
  faction: NinjaNight.Faction;
  style: CardStyle;
  thumbnail?: boolean;
}) {
  const directory = thumbnail ? 'ninja-cards/thumbs' : 'ninja-cards';
  return (
    <span className="ninja-card" data-faction={faction} data-style={style}>
      <img src={`${import.meta.env.BASE_URL}${directory}/${style}-${faction}.webp`}
        loading={thumbnail ? 'lazy' : undefined} decoding="async" alt="" />
      <span className="ninja-card-name">{ninjaFactions[faction]}</span>
    </span>
  );
}

export function NinjaCardStyles() {
  const selected = useNinjaCardStyle();
  return (
    <section className="ninja-card-library" aria-label="忍者身份牌画风">
      <h2>身份牌画风</h2>
      <p>只影响你在这台设备上看到的牌面。</p>
      <div className="ninja-style-options">
        {styles.map(({ id, name, description }) => (
          <button key={id} type="button" className="ninja-style-option" aria-pressed={selected === id}
            onClick={() => selectStyle(id)}>
            <span className="ninja-card-pair" aria-hidden="true">
              {factions.map((faction) => <NinjaIdentityCard key={faction} faction={faction} style={id} thumbnail />)}
            </span>
            <strong>{name}</strong>
            <small>{description}</small>
          </button>
        ))}
      </div>
    </section>
  );
}

export function NinjaCardArt() {
  const style = useNinjaCardStyle();
  return (
    <div className="party-art party-art-ninja" role="img" aria-label="守夜忍和影忍的身份牌示意">
      <div className="ninja-card-pair" aria-hidden="true">
        {factions.map((faction) => <NinjaIdentityCard key={faction} faction={faction} style={style} />)}
      </div>
    </div>
  );
}
