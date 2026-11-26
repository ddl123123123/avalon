import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, type WebSocket } from 'ws';
import { GAME_MESSAGE_BYTES, type ClientMessage, type ServerMessage } from '@tabletop/shared';
import { AccountStore, type ResolvedSession } from './accounts';
import { createAdminHandler } from './admin-http';
import { createAuthHandler, sameOrigin, sessionFromRequest } from './auth-http';
import { openDatabase } from './db';
import { RoomManager, type Connection } from './rooms';
import { Stats } from './stats';

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
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

/** 线上是共用 Postgres 实例里的 tabletop 库（DATABASE_URL）；本地没配就用 .data/pglite（见 db.ts） */
const db = await openDatabase();
const accounts = new AccountStore(db);
const stats = new Stats(db);
await stats.closeInterrupted();

const rooms = new RoomManager(stats);

/** 当前所有的 WebSocket 连接，按会话找得到，注销会话时要把它们踢下线 */
const sockets = new Map<WebSocket, Connection & { sessionHash: string | null }>();

const handleAuth = createAuthHandler(accounts, {
  revoked(tokenHashes) {
    const revoked = new Set(tokenHashes);
    for (const [socket, conn] of sockets) {
      if (!conn.sessionHash || !revoked.has(conn.sessionHash)) continue;
      rooms.dropAccount(conn);
      // 4001：登录态失效。客户端收到后重新确认身份再连
      socket.close(4001, 'session revoked');
    }
  },
  profileChanged(user) {
    for (const conn of sockets.values()) if (conn.account?.id === user.id) conn.account = user;
    rooms.renameAccount(user);
  },
});

const handleAdmin = createAdminHandler({
  accounts,
  stats,
  db,
  live: () => {
    const { rooms: count, playing, online, onlineMembers } = rooms.stats();
    return { rooms: count, playing, online, onlineMembers };
  },
});

const http = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (url.pathname === '/healthz') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, ...rooms.stats() }));
    return;
  }
  if (url.pathname.startsWith('/api/auth/')) {
    void handleAuth(req, res, url.pathname);
    return;
  }
  if (url.pathname.startsWith('/api/admin/')) {
    void handleAdmin(req, res, url);
    return;
  }
  if (url.pathname.startsWith('/api/')) {
    res.writeHead(404, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(JSON.stringify({ error: '没有这个接口' }));
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

const wss = new WebSocketServer({ noServer: true, maxPayload: GAME_MESSAGE_BYTES });

// 握手时凭 Cookie 认账号（要查库，所以先查完再完成升级）。
// 跨站页面发起的连接一律当游客，防止借用别人的登录态（CSWSH）
http.on('upgrade', (req, socket, head) => {
  if (new URL(req.url ?? '/', 'http://localhost').pathname !== '/ws') {
    socket.destroy();
    return;
  }
  socket.on('error', () => socket.destroy());
  const lookup = sameOrigin(req) ? sessionFromRequest(accounts, req) : Promise.resolve(null);
  lookup
    .catch((err) => {
      // 数据库暂时连不上：先当游客放进来，不耽误开局
      console.error('[ws] session lookup failed', err instanceof Error ? err.message : err);
      return null;
    })
    .then((session) => {
      if (socket.destroyed) return;
      wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req, session));
    });
});

wss.on('connection', (socket: WebSocket, _req: unknown, session: ResolvedSession | null) => {
  const conn: Connection & { alive: boolean; sessionHash: string | null } = {
    identity: null,
    account: session?.user ?? null,
    sessionHash: session?.session.tokenHash ?? null,
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
  sockets.set(socket, conn);
  socket.on('close', () => {
    clearInterval(heartbeat);
    sockets.delete(socket);
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
