import { useSyncExternalStore } from 'react';
import type { Avalon } from '@tabletop/shared';

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
    merlin: { src: '/avalon-cards/style-1-merlin-morgana.png', side: 'left' },
    morgana: { src: '/avalon-cards/style-1-merlin-morgana.png', side: 'right' },
    percival: { src: '/avalon-cards/style-1-percival-servant.png', side: 'left' },
    servant: { src: '/avalon-cards/style-1-percival-servant.png', side: 'right' },
    oberon: { src: '/avalon-cards/style-1-oberon-minion.png', side: 'left' },
    minion: { src: '/avalon-cards/style-1-oberon-minion.png', side: 'right' },
    assassin: { src: '/avalon-cards/style-1-assassin-mordred.png', side: 'left' },
    mordred: { src: '/avalon-cards/style-1-assassin-mordred.png', side: 'right' },
  },
  'style-2': {
    merlin: { src: '/avalon-cards/style-2-merlin.png' },
    morgana: { src: '/avalon-cards/style-2-morgana.png' },
    percival: { src: '/avalon-cards/style-2-percival-assassin.png', side: 'left' },
    assassin: { src: '/avalon-cards/style-2-percival-assassin.png', side: 'right' },
    servant: { src: '/avalon-cards/style-2-servant-mordred.png', side: 'left' },
    mordred: { src: '/avalon-cards/style-2-servant-mordred.png', side: 'right' },
    oberon: { src: '/avalon-cards/style-2-oberon-minion.png', side: 'left' },
    minion: { src: '/avalon-cards/style-2-oberon-minion.png', side: 'right' },
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
