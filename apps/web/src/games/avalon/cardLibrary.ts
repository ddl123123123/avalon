import { useSyncExternalStore } from 'react';
import type { Avalon } from '@tabletop/shared';
import badgeMerlinMorgana from '../../assets/avalon/style-1-merlin-morgana.webp';
import badgePercivalServant from '../../assets/avalon/style-1-percival-servant.webp';
import badgeOberonMinion from '../../assets/avalon/style-1-oberon-minion.webp';
import badgeAssassinMordred from '../../assets/avalon/style-1-assassin-mordred.webp';
import nightMerlin from '../../assets/avalon/style-2-merlin.webp';
import nightMorgana from '../../assets/avalon/style-2-morgana.webp';
import nightPercivalAssassin from '../../assets/avalon/style-2-percival-assassin.webp';
import nightServantMordred from '../../assets/avalon/style-2-servant-mordred.webp';
import nightOberonMinion from '../../assets/avalon/style-2-oberon-minion.webp';

export type AvalonCardStyle = 'style-1' | 'style-2';

export const AVALON_CARD_STYLES: { id: AvalonCardStyle; name: string; description: string }[] = [
  { id: 'style-1', name: '风格一 · 蓝金徽章', description: '低多边形插画与金色线框' },
  { id: 'style-2', name: '风格二 · 星夜典藏', description: '写实奇幻插画与细致卡框' },
];

interface CardAsset {
  src: string;
  side?: 'left' | 'right';
}

const assets: Record<AvalonCardStyle, Record<Avalon.Role, CardAsset>> = {
  'style-1': {
    merlin: { src: badgeMerlinMorgana, side: 'left' },
    morgana: { src: badgeMerlinMorgana, side: 'right' },
    percival: { src: badgePercivalServant, side: 'left' },
    servant: { src: badgePercivalServant, side: 'right' },
    oberon: { src: badgeOberonMinion, side: 'left' },
    minion: { src: badgeOberonMinion, side: 'right' },
    assassin: { src: badgeAssassinMordred, side: 'left' },
    mordred: { src: badgeAssassinMordred, side: 'right' },
  },
  'style-2': {
    merlin: { src: nightMerlin },
    morgana: { src: nightMorgana },
    percival: { src: nightPercivalAssassin, side: 'left' },
    assassin: { src: nightPercivalAssassin, side: 'right' },
    servant: { src: nightServantMordred, side: 'left' },
    mordred: { src: nightServantMordred, side: 'right' },
    oberon: { src: nightOberonMinion, side: 'left' },
    minion: { src: nightOberonMinion, side: 'right' },
  },
};

export function getAvalonCardAsset(style: AvalonCardStyle, role: Avalon.Role): CardAsset {
  return assets[style][role];
}

const STORAGE_KEY = 'avalon.cardStyle';
const subscribers = new Set<() => void>();

function readStyle(): AvalonCardStyle {
  if (typeof window === 'undefined') return 'style-1';
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'style-2' ? 'style-2' : 'style-1';
  } catch {
    return 'style-1';
  }
}

let currentStyle = readStyle();

function emit() {
  for (const subscriber of subscribers) subscriber();
}

function subscribe(listener: () => void) {
  subscribers.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY) return;
    currentStyle = event.newValue === 'style-2' ? 'style-2' : 'style-1';
    emit();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    subscribers.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

export function useAvalonCardStyle(): AvalonCardStyle {
  return useSyncExternalStore(subscribe, () => currentStyle, () => 'style-1');
}

export function setAvalonCardStyle(style: AvalonCardStyle) {
  if (currentStyle === style) return;
  currentStyle = style;
  try {
    window.localStorage.setItem(STORAGE_KEY, style);
  } catch {
    // 本次页面仍可使用选择结果；隐私模式可能不允许持久化。
  }
  emit();
}
