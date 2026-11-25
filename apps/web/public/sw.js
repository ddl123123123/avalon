const offlinePage = `<!doctype html>
<html lang="zh-CN">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#090b10">
<title>桌游厅 · 网络已断开</title>
<style>
  body { color: #e8e1d3; background: #090b10; font: 16px/1.6 system-ui, sans-serif;
    margin: 0; padding: max(24px, env(safe-area-inset-top)) 24px max(24px, env(safe-area-inset-bottom)); }
  a { color: #d6c49b; display: inline-grid; align-items: center; min-height: 44px; }
</style>
<h1>网络已断开</h1>
<p>连上网络后即可回到桌游厅。</p>
<a href="/">重新加载</a>
</html>`;

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return;

  event.respondWith(fetch(event.request).catch(() => new Response(offlinePage, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })));
});
