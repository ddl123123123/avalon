import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import type { ClientMessage, ServerMessage } from '@tabletop/shared';
import { AccountStore, BROWSER_SESSION_IDLE_MS, SESSION_IDLE_MS, SESSION_MAX_MS, SESSION_REFRESH_MS } from './accounts';
import { createAuthHandler, SESSION_COOKIE } from './auth-http';
import { Stats } from './stats';
import { openPglite } from './db';
import { RoomManager, type Connection } from './rooms';

async function freshStore(now?: () => number) {
  const db = await openPglite();
  return { db, store: new AccountStore(db, now) };
}

test('账号：注册、登录、用户名不区分大小写、密码只存散列', async () => {
  const { db, store } = await freshStore();
  const user = await store.register('Merlin_01', 'correct horse', '梅林');
  assert.equal(user.displayName, '梅林');
  await assert.rejects(store.register('merlin_01', 'another pass', '别人'), /已经有人用了/);
  await assert.rejects(store.register('ab', 'long enough', 'x'), /3–20 位/);
  await assert.rejects(store.register('shortpw', '1234567', 'x'), /至少 8 位/);

  assert.deepEqual(await store.authenticate('MERLIN_01', 'correct horse'), user);
  assert.equal(await store.authenticate('merlin_01', 'wrong password'), null);
  assert.equal(await store.authenticate('nobody', 'correct horse'), null);

  await store.changePassword(user.id, 'correct horse', 'battery staple');
  assert.equal(await store.authenticate('merlin_01', 'correct horse'), null);
  assert.deepEqual(await store.authenticate('merlin_01', 'battery staple'), user);

  const { rows } = await db.query<{ password_hash: string }>('SELECT password_hash FROM users');
  assert.match(rows[0]!.password_hash, /^scrypt\$/);
  assert.equal((await store.setAdmin('MERLIN_01', true))?.isAdmin, true);
  assert.equal((await store.getUser(user.id))?.isAdmin, true);
  await db.close();
});

test('会话：滑动续期、闲置过期、最长寿命、注销其他设备', async () => {
  let now = Date.parse('2026-01-01T00:00:00Z');
  const { db, store } = await freshStore(() => now);
  const user = await store.register('arthur', 'excalibur!', '亚瑟');

  const { token } = await store.createSession(user.id, true);
  assert.equal((await store.resolveSession(token))?.refreshed, false);
  assert.equal(await store.resolveSession('not-a-token'), null);

  now += SESSION_REFRESH_MS;
  assert.equal((await store.resolveSession(token))?.refreshed, true);
  // 每天用一次就一直顺延，但到了最长寿命必须重新输入密码
  let days = 1;
  while (await store.resolveSession(token)) {
    now += SESSION_REFRESH_MS;
    days++;
  }
  assert.equal(days, SESSION_MAX_MS / SESSION_REFRESH_MS);

  // 30 天不用就过期
  const idle = (await store.createSession(user.id, true)).token;
  now += SESSION_IDLE_MS + 1;
  assert.equal(await store.resolveSession(idle), null);

  // 不勾「记住我」：闲置 12 小时过期
  const short = (await store.createSession(user.id, false)).token;
  now += BROWSER_SESSION_IDLE_MS - 1;
  assert.ok(await store.resolveSession(short));
  now += BROWSER_SESSION_IDLE_MS + 1;
  assert.equal(await store.resolveSession(short), null);

  const a = await store.createSession(user.id, true);
  const b = await store.createSession(user.id, true);
  const c = await store.createSession(user.id, false);
  assert.equal(await store.countSessions(user.id), 3);
  const revoked = await store.revokeOtherSessions(user.id, a.session.tokenHash);
  assert.deepEqual(revoked.sort(), [b.session.tokenHash, c.session.tokenHash].sort());
  assert.ok(await store.resolveSession(a.token));
  assert.equal(await store.resolveSession(b.token), null);
  await db.close();
});

function connection(account: Connection['account']) {
  const inbox: ServerMessage[] = [];
  const conn: Connection = { identity: null, account, send: (message) => inbox.push(message) };
  return { conn, inbox, last: <T extends ServerMessage['type']>(type: T) =>
    inbox.filter((m): m is Extract<ServerMessage, { type: T }> => m.type === type).at(-1) };
}

test('房间：登录后换一台设备，回到已经开始的对局里原来的座位', async () => {
  const rooms = new RoomManager();
  const account = { id: 'acct-1', username: 'gawain', displayName: '高文' };
  const send = (conn: Connection, msg: ClientMessage) => rooms.handle(conn, msg);

  // 先以游客身份开房、开局
  const laptop = connection(null);
  send(laptop.conn, { type: 'hello', clientId: 'laptop-guest-client-id' });
  send(laptop.conn, { type: 'create_room', name: '游客', gameId: 'avalon' });
  for (let i = 0; i < 4; i++) send(laptop.conn, { type: 'add_bot' });
  const room = laptop.last('room')!.room;
  const myId = room.you;

  // 在同一个浏览器里登录：游客的座位归到账号名下
  const laptopAuthed = connection(account);
  send(laptopAuthed.conn, { type: 'hello', clientId: 'laptop-guest-client-id' });
  const welcome = laptopAuthed.last('welcome')!;
  assert.equal(welcome.account?.id, account.id);
  assert.equal(welcome.roomCode, room.code);
  assert.equal(welcome.playerId, myId);
  send(laptopAuthed.conn, { type: 'join_room', code: room.code, name: 'ignored' });
  send(laptopAuthed.conn, { type: 'start_game' });
  assert.equal(laptopAuthed.last('room')!.room.status, 'playing');
  rooms.disconnect(laptopAuthed.conn);

  // 换到手机，用同一个账号登录：认出原来的座位，可以继续这局
  const phone = connection(account);
  send(phone.conn, { type: 'hello', clientId: 'phone-guest-client-id-0000' });
  const phoneWelcome = phone.last('welcome')!;
  assert.equal(phoneWelcome.playerId, myId);
  assert.deepEqual(phoneWelcome.seats, [{ code: room.code, gameId: 'avalon', status: 'playing' }]);
  send(phone.conn, { type: 'join_room', code: room.code, name: '' });
  const resumed = phone.last('room')!.room;
  assert.equal(resumed.you, myId);
  assert.equal(resumed.status, 'playing');
  assert.ok(resumed.view, '能看到自己视角的对局');
  assert.equal(phone.last('error'), undefined);

  // 别人（另一个游客）进不了已经开始的对局
  const stranger = connection(null);
  send(stranger.conn, { type: 'hello', clientId: 'stranger-guest-client-id' });
  send(stranger.conn, { type: 'join_room', code: room.code, name: '路人' });
  assert.match(stranger.last('error')!.message, /已经开始/);

  // 两台设备同时开着：后打开的接管座位，先前那台收到提示
  const tablet = connection(account);
  send(tablet.conn, { type: 'hello', clientId: 'tablet-guest-client-id-000' });
  send(tablet.conn, { type: 'join_room', code: room.code, name: '' });
  assert.match(phone.last('left')!.reason!, /另一个窗口或设备/);
  assert.equal(tablet.last('room')!.room.you, myId);
});

test('房间：账号入座时用账号昵称，改昵称同步到大厅', () => {
  const rooms = new RoomManager();
  const account = { id: 'acct-2', username: 'kay', displayName: '凯' };
  const c = connection(account);
  rooms.handle(c.conn, { type: 'hello', clientId: 'kay-guest-client-id-00000' });
  rooms.handle(c.conn, { type: 'create_room', name: '随便填的', gameId: 'avalon' });
  assert.equal(c.last('room')!.room.players[0].name, '凯');
  rooms.renameAccount({ ...account, displayName: '凯爵士' });
  assert.equal(c.last('room')!.room.players[0].name, '凯爵士');
});

async function withServer(fn: (base: string) => Promise<void>) {
  const { db, store } = await freshStore();
  const revoked: string[][] = [];
  const handle = createAuthHandler(store, { revoked: (hashes) => revoked.push(hashes), profileChanged() {} }, new Stats(db));
  const server: Server = createServer((req, res) => void handle(req, res, new URL(req.url!, 'http://x').pathname));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    await fn(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  } finally {
    server.close();
    await db.close();
  }
}

test('HTTP：HttpOnly Cookie、记住我、跨站请求、退出登录', () => withServer(async (base) => {
  const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    fetch(`${base}/api/auth/${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
  const cookieOf = (res: Response) => res.headers.get('set-cookie') ?? '';

  const reg = await post('register', { username: 'percival', password: 'holy grail', displayName: '派西维尔', remember: true });
  assert.equal(reg.status, 201);
  const setCookie = cookieOf(reg);
  assert.match(setCookie, new RegExp(`^${SESSION_COOKIE}=[\\w-]{43};`));
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Lax/);
  assert.match(setCookie, /Max-Age=\d{7}/, '记住我：长期 Cookie');
  assert.equal(reg.headers.get('cache-control'), 'no-store');
  const cookie = setCookie.split(';')[0];

  const me = await (await fetch(`${base}/api/auth/me`, { headers: { cookie } })).json();
  assert.equal(me.user.username, 'percival');
  assert.equal(me.session.persistent, true);
  const profile = await fetch(`${base}/api/auth/stats`, { headers: { cookie } });
  assert.equal(profile.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await profile.json(), { games: [], avalonRoles: [] });
  assert.equal((await fetch(`${base}/api/auth/stats`)).status, 401);

  const shortLogin = await post('login', { username: 'Percival', password: 'holy grail', remember: false });
  assert.equal(shortLogin.status, 200);
  assert.doesNotMatch(cookieOf(shortLogin), /Max-Age/, '不记住：浏览器会话 Cookie');

  assert.equal((await post('login', { username: 'percival', password: 'nope nope' })).status, 401);
  assert.equal((await post('login', { username: 'percival', password: 'holy grail' }, { origin: 'https://evil.example' })).status, 403);

  const logout = await post('logout', {}, { cookie });
  assert.match(cookieOf(logout), /Max-Age=0/);
  const after = await (await fetch(`${base}/api/auth/me`, { headers: { cookie } })).json();
  assert.equal(after.user, null);
}));

test('HTTP：连续输错密码会被限流', () => withServer(async (base) => {
  const login = (password: string) => fetch(`${base}/api/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'lancelot', password }),
  });
  const statuses: number[] = [];
  for (let i = 0; i < 10; i++) statuses.push((await login(`wrong-${i}-pass`)).status);
  assert.deepEqual(statuses.slice(0, 8), Array(8).fill(401));
  assert.equal(statuses.at(-1), 429);
}));
