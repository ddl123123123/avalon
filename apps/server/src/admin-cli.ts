/**
 * 管理员授权。管理员只能在服务器上授予，不能靠注册某个用户名得到。
 *
 *   线上：docker exec tabletop-tabletop-1 node --import tsx src/admin-cli.ts grant <用户名>
 *   本地：pnpm --filter @tabletop/server admin grant <用户名>
 *
 * 子命令：grant <用户名> | revoke <用户名> | list
 */
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { AccountStore } from './accounts';
import { openDatabase } from './db';

const LOCAL_ENV_FILE = fileURLToPath(new URL('../../../.env', import.meta.url));
if (process.env.NODE_ENV !== 'production' && existsSync(LOCAL_ENV_FILE)) process.loadEnvFile(LOCAL_ENV_FILE);

const [command, username] = process.argv.slice(2);
const db = await openDatabase();
try {
  if ((command === 'grant' || command === 'revoke') && username) {
    const user = await new AccountStore(db).setAdmin(username, command === 'grant');
    if (!user) {
      console.error(`没有用户名为 ${username} 的账号（先在网页上注册）`);
      process.exitCode = 1;
    } else {
      console.log(`${command === 'grant' ? '已授予' : '已撤销'}管理员：${user.username}（${user.displayName}）`);
    }
  } else if (command === 'list') {
    const { rows } = await db.query<{ username: string; display_name: string }>(
      'SELECT username, display_name FROM users WHERE is_admin ORDER BY username',
    );
    console.log(rows.length ? rows.map((r) => `${r.username}\t${r.display_name}`).join('\n') : '还没有管理员');
  } else {
    console.error('用法：admin-cli.ts grant <用户名> | revoke <用户名> | list');
    process.exitCode = 2;
  }
} finally {
  await db.close();
}
