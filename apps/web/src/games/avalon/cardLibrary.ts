import { useSyncExternalStore } from 'react';
import type { Avalon } from '@tabletop/shared';
import { isPigUnlocked, usePigUnlocked } from '../pigEdition';

type ClassicStyle = 'style-1' | 'style-2';
export type AvalonCardStyle = ClassicStyle | 'pig';

export const AVALON_CARD_STYLES: { id: AvalonCardStyle; name: string; description: string }[] = [
  { id: 'style-1', name: '风格一 · 蓝金徽章', description: '低多边形插画与金色线框' },
  { id: 'style-2', name: '风格二 · 星夜典藏', description: '写实奇幻插画与细致卡框' },
  { id: 'pig', name: '小猪版', description: '童话小猪绘本插画' },
];

export const AVALON_CARD_BACK = `${import.meta.env.BASE_URL}avalon-card-back.webp`;
export const avalonPigArt = (name: string) => `${import.meta.env.BASE_URL}avalon-pig/${name}.webp`;

interface CardAsset {
  src: string;
}

/** 小图使用压缩版本，翻牌时使用高清原图。 */
export function getAvalonCardAsset(style: AvalonCardStyle, role: Avalon.Role, thumbnail = false): CardAsset {
  if (style === 'pig') return { src: avalonPigArt(thumbnail ? `thumbs/${role}` : role) };
  if (thumbnail) {
    return { src: `${import.meta.env.BASE_URL}avalon-card-thumbnails/${style}/${role}.webp` };
  }
  const directory = style === 'style-1' ? 'avalon-characters-style-1' : 'avalon-characters';
  return { src: `${import.meta.env.BASE_URL}${directory}/${role}.webp` };
}

const STORAGE_KEY = 'avalon.cardStyle';
const PIG_KEY = 'avalon.pigEdition';
const subscribers = new Set<() => void>();

function readStyle(): ClassicStyle {
  if (typeof window === 'undefined') return 'style-1';
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'style-2' ? 'style-2' : 'style-1';
  } catch {
    return 'style-1';
  }
}

function readPigEdition() {
  try {
    return localStorage.getItem(PIG_KEY) === 'pig';
  } catch {
    return false;
  }
}

let currentStyle = readStyle();
let pigEdition = readPigEdition();

function emit() {
  for (const subscriber of subscribers) subscriber();
}

function subscribe(listener: () => void) {
  subscribers.add(listener);
  return () => {
    subscribers.delete(listener);
  };
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY || event.key === PIG_KEY || event.key === null) {
      currentStyle = readStyle();
      pigEdition = readPigEdition();
      emit();
    }
  });
}

export function useAvalonCardStyle(): AvalonCardStyle {
  const unlocked = usePigUnlocked();
  return useSyncExternalStore(subscribe, () => unlocked && pigEdition ? 'pig' : currentStyle, () => 'style-1');
}

export function setAvalonCardStyle(style: AvalonCardStyle) {
  if (style === 'pig' && !isPigUnlocked()) return;
  pigEdition = style === 'pig';
  if (style !== 'pig') currentStyle = style;
  try {
    window.localStorage.setItem(STORAGE_KEY, currentStyle);
    window.localStorage.setItem(PIG_KEY, pigEdition ? 'pig' : 'classic');
  } catch {
    // 本次页面仍可使用选择结果；隐私模式可能不允许持久化。
  }
  emit();
}

export function setAvalonPigEdition(active: boolean) {
  setAvalonCardStyle(active ? 'pig' : currentStyle);
}
