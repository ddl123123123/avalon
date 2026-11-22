import { useSyncExternalStore } from 'react';

/** 两个页面用不着路由库：/ 是大厅，/room/<房间号> 是房间。 */
export type Route = { page: 'home' } | { page: 'room'; code: string };

function parse(): Route {
  const m = location.pathname.match(/^\/room\/(\d{4,8})\/?$/);
  return m ? { page: 'room', code: m[1]! } : { page: 'home' };
}

let current = parse();
const listeners = new Set<() => void>();
function sync() {
  current = parse();
  listeners.forEach((fn) => fn());
}
window.addEventListener('popstate', sync);

export function navigate(path: string, replace = false) {
  // 保留 ?as= 之类的调试参数
  const url = path + location.search;
  if (location.pathname === path) return;
  if (replace) history.replaceState(null, '', url);
  else history.pushState(null, '', url);
  sync();
}

export function useRoute(): Route {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => current,
  );
}

export const roomPath = (code: string) => `/room/${code}`;
export const roomUrl = (code: string) => `${location.origin}${roomPath(code)}`;
