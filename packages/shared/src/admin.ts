/** 管理页（/admin）的接口数据。只有 isAdmin 的账号能拿到。 */

export interface AdminDay {
  /** 北京时间日期 YYYY-MM-DD */
  day: string;
  newUsers: number;
  /** 当天结束时的累计注册数 */
  totalUsers: number;
  /** 当天输密码登录过的人数（不含靠 Cookie 自动登录的） */
  logins: number;
  /** 当天连上来的登录用户 / 游客浏览器 */
  activeMembers: number;
  activeGuests: number;
  games: number;
  finishedGames: number;
  /** 当天开局的真人座位数 */
  seats: number;
}

export interface AdminGameRow {
  gameId: string;
  games: number;
  finished: number;
  humans: number;
  registered: number;
  bots: number;
}

export interface AdminOverview {
  generatedAt: number;
  days: number;
  database: 'postgres' | 'pglite';
  totals: {
    users: number;
    newUsers7d: number;
    activeUsers7d: number;
    games: number;
    games7d: number;
    finishedGames: number;
    activeSessions: number;
  };
  /** 现在内存里的房间 */
  live: {
    rooms: number;
    playing: number;
    online: number;
    onlineMembers: number;
  };
  series: AdminDay[];
  byGame: AdminGameRow[];
}

export interface AdminUser {
  id: string;
  username: string;
  displayName: string;
  isAdmin: boolean;
  createdAt: number;
  lastSeenAt: number | null;
  games: number;
  lastGameAt: number | null;
  activeSessions: number;
}

export interface AdminUserList {
  total: number;
  offset: number;
  limit: number;
  users: AdminUser[];
}
