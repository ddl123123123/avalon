import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, type WebSocket } from 'ws';
import type { ClientMessage, ServerMessage } from '@tabletop/shared';
import { RoomManager, type Connection } from './rooms';

const PORT = Number(process.env.SERVER_PORT ?? process.env.PORT ?? 8790);
/** 生产环境下由同一个端口提供前端构建产物（pnpm build 之后） */
const WEB_DIST = resolve(fileURLToPath(new URL('../../web/dist', import.meta.url)));

// 开发时读取仓库根目录的 .env；生产环境只使用容器显式注入的变量。
const LOCAL_ENV_FILE = fileURLToPath(new URL('../../../.env', import.meta.url));
if (process.env.NODE_ENV !== 'production' && existsSync(LOCAL_ENV_FILE)) process.loadEnvFile(LOCAL_ENV_FILE);

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

const rooms = new RoomManager();

const http = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (url.pathname === '/healthz') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, ...rooms.stats() }));
    return;
  }
  if (!existsSync(WEB_DIST)) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('前端还没有构建。开发时请访问 Vite 的地址，或先运行 pnpm build。');
    return;
  }
  let pathname = '/';
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    /* 畸形的转义序列：当作首页处理 */
  }
  const requested = normalize(join(WEB_DIST, pathname));
  // 只允许读取构建目录里面的文件
  const isFile = requested.startsWith(WEB_DIST + sep) && existsSync(requested) && statSync(requested).isFile();
  // 单页应用：找不到的路径一律回落到 index.html
  const file = isFile ? requested : join(WEB_DIST, 'index.html');
  res.writeHead(200, {
    'content-type': MIME[extname(file)] ?? 'application/octet-stream',
    'cache-control': file.includes(`${join(WEB_DIST, 'assets')}`) ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  createReadStream(file).pipe(res);
});

const wss = new WebSocketServer({ server: http, path: '/ws', maxPayload: 16 * 1024 });

wss.on('connection', (socket: WebSocket) => {
  const conn: Connection & { alive: boolean } = {
    clientId: null,
    alive: true,
    send(message: ServerMessage) {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
    },
  };
  socket.on('pong', () => (conn.alive = true));
  socket.on('message', (data) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(String(data));
    } catch {
      return;
    }
    if (!msg || typeof msg !== 'object' || typeof (msg as { type?: unknown }).type !== 'string') return;
    rooms.handle(conn, msg);
  });
  socket.on('close', () => {
    clearInterval(heartbeat);
    rooms.disconnect(conn);
  });
  socket.on('error', () => socket.terminate());

  // 及时发现悄悄断掉的连接（手机切后台、网络切换）
  const heartbeat = setInterval(() => {
    if (!conn.alive) return socket.terminate();
    conn.alive = false;
    socket.ping();
  }, 15_000);
});

http.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`);
});
