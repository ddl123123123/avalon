import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AdminOverview } from '@tabletop/shared';
import type { AccountStore } from './accounts';
import { send, sessionFromRequest } from './auth-http';
import type { Database } from './db';
import type { Stats } from './stats';

/**
 * /api/admin/*：管理页的只读接口。要求登录且账号带 is_admin（用 admin-cli.ts 授予）。
 * 不是管理员一律回 404，不暴露这些接口存在。
 */
export function createAdminHandler(deps: {
  accounts: AccountStore;
  stats: Stats;
  db: Database;
  live: () => AdminOverview['live'];
}) {
  return async function handleAdmin(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
    try {
      const resolved = await sessionFromRequest(deps.accounts, req);
      if (!resolved?.user.isAdmin) return send(res, resolved ? 404 : 401, { error: resolved ? '没有这个接口' : '请先登录' });
      if (req.method !== 'GET') return send(res, 405, { error: '只读接口' });

      const route = url.pathname.slice('/api/admin/'.length);
      if (route === 'overview') {
        const days = [7, 30, 90, 180].includes(Number(url.searchParams.get('days'))) ? Number(url.searchParams.get('days')) : 30;
        const overview: AdminOverview = { ...(await deps.stats.overview(days)), live: deps.live(), database: deps.db.kind };
        return send(res, 200, overview);
      }
      if (route === 'users') {
        return send(res, 200, await deps.stats.users({
          q: url.searchParams.get('q') ?? '',
          offset: Number(url.searchParams.get('offset')) || 0,
          limit: Number(url.searchParams.get('limit')) || 50,
        }));
      }
      return send(res, 404, { error: '没有这个接口' });
    } catch (err) {
      console.error('[admin] unexpected error', err);
      return send(res, 500, { error: '服务器出了点问题，请重试' });
    }
  };
}
