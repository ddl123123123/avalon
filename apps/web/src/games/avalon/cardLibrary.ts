import { useSyncExternalStore } from 'react';
import type { Avalon } from '@tabletop/shared';

export type AvalonCardStyle = 'style-1' | 'style-2';

export const AVALON_CARD_STYLES: { id: AvalonCardStyle; name: string; description: string }[] = [
  { id: 'style-1', name: '风格一 · 蓝金徽章', description: '低多边形插画与金色线框' },
  { id: 'style-2', name: '风格二 · 星夜典藏', description: '写实奇幻插画与细致卡框' },
];

interface CardAsset {
  src: string;
}

/** 小图使用压缩版本，翻牌时使用高清原图。 */
export function getAvalonCardAsset(style: AvalonCardStyle, role: Avalon.Role, thumbnail = false): CardAsset {
  if (thumbnail) {
    return { src: `${import.meta.env.BASE_URL}avalon-card-thumbnails/${style}/${role}.webp` };
  }
  const directory = style === 'style-1' ? 'avalon-characters-style-1' : 'avalon-characters';
  return { src: `${import.meta.env.BASE_URL}${directory}/${role}.webp` };
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
