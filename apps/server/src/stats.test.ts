import assert from 'node:assert/strict';
import test from 'node:test';
import type { ServerMessage } from '@tabletop/shared';
import { AccountStore } from './accounts';
import { openPglite } from './db';
import { RoomManager, type Connection } from './rooms';
import { Stats } from './stats';

const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

test('统计：日活、开局记录、按天趋势和用户列表', async () => {
  let now = Date.parse('2026-11-20T10:00:00+08:00');
  const db = await openPglite();
  const accounts = new AccountStore(db, () => now);
  const stats = new Stats(db, () => now);
  const rooms = new RoomManager(stats);

  const alice = await accounts.register('alice', 'password-1', '爱丽丝');
  now += 24 * 3600_000; // 11-21
  const bob = await accounts.register('bob', 'password-2', '鲍勃');
  await accounts.authenticate('alice', 'password-1');

  const inbox: ServerMessage[] = [];
  const conn = (account: Connection['account']): Connection => ({ identity: null, account, send: (m) => inbox.push(m) });
  const host = conn(alice);
  rooms.handle(host, { type: 'hello', clientId: 'alice-browser-client-id' });
  rooms.handle(host, { type: 'hello', clientId: 'alice-browser-client-id' }); // 重连不重复计数
  rooms.handle(conn(null), { type: 'hello', clientId: 'some-guest-client-id-1' });
  rooms.handle(host, { type: 'create_room', name: '', gameId: 'avalon' });
  for (let i = 0; i < 4; i++) rooms.handle(host, { type: 'add_bot' });
  rooms.handle(host, { type: 'start_game' });
  await settle();

  // 进行中的对局在服务重启后记为中断
  await stats.closeInterrupted();
  const users = await stats.users({});
  assert.deepEqual(users.users.map((u) => [u.username, u.games]), [['bob', 0], ['alice', 1]]);
  assert.equal(users.total, 2);
  assert.equal((await stats.users({ q: '鲍' })).users[0]?.id, bob.id);
  assert.equal((await stats.users({ q: '%' })).total, 0, 'LIKE 通配符要转义');

  const overview = await stats.overview(7);
  assert.equal(overview.series.length, 7);
  assert.equal(overview.series.at(-1)!.day, '2026-11-21');
  const [d20, d21] = overview.series.slice(-2);
  assert.deepEqual([d20!.newUsers, d20!.totalUsers], [1, 1]);
  assert.deepEqual([d21!.newUsers, d21!.totalUsers, d21!.logins], [1, 2, 1]);
  assert.deepEqual([d21!.activeMembers, d21!.activeGuests], [1, 1]);
  assert.deepEqual([d21!.games, d21!.finishedGames, d21!.seats], [1, 0, 1]);
  assert.deepEqual(overview.byGame, [{ gameId: 'avalon', games: 1, finished: 0, humans: 1, registered: 1, bots: 4 }]);
  assert.equal(overview.totals.users, 2);
  assert.equal(rooms.stats().playing, 1);
  await db.close();
});

test('个人主页保留历史对局数，按账号统计已结算的身份和胜场', async () => {
  const db = await openPglite();
  try {
    const accounts = new AccountStore(db);
    const stats = new Stats(db);
    const alice = await accounts.register('alice', 'password-1', '爱丽丝');
    const bob = await accounts.register('bob', 'password-2', '鲍勃');
    const start = () => stats.gameStarted({
      roomCode: '1234', gameId: 'avalon',
      players: [{ userId: alice.id, isBot: false }, { userId: bob.id, isBot: false }],
    });
    await stats.gameEnded(start(), 'finished');
    await stats.gameEnded(start(), 'abandoned');
    const current = start();
    await stats.gameEnded(current, 'finished', [{ role: 'morgana', won: true }, { role: 'merlin', won: false }]);
    await stats.gameEnded(current, 'finished', [{ role: 'servant', won: false }, { role: 'assassin', won: true }]);
    assert.deepEqual(await stats.playerProfile(alice.id), {
      games: [{ gameId: 'avalon', played: 3, finished: 2 }],
      avalonRoles: [{ role: 'morgana', played: 1, wins: 1 }],
    });
    assert.deepEqual((await stats.playerProfile(bob.id)).avalonRoles, [{ role: 'merlin', played: 1, wins: 0 }]);
  } finally {
    await db.close();
  }
});
