import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { NAME_MAX_LENGTH } from '@tabletop/shared';
import { account, AccountError, closeAccountSheet, openAccountSheet, useAccount, useAccountSheet } from '../net/account';
import { debugAlias, getName, notify } from '../net/client';
import { navigate } from '../net/route';
import { ResponsiveSheet } from '../ui/ResponsiveSheet';

const PASSWORD_MIN = 8;

/** 提交中禁用按钮，失败时把服务器的原话显示在表单里 */
function useSubmit() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (task: () => Promise<void>, done?: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await task();
      if (done) notify(done);
    } catch (err) {
      setError(err instanceof AccountError ? err.message : '出了点问题，请重试');
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run, setError };
}

/** 登录、注册和账号管理面板。由 App 在 AnimatePresence 里按 useAccountSheet().open 挂载 */
export function AccountSheet() {
  const { mode } = useAccountSheet();
  const { user } = useAccount();
  return (
    <ResponsiveSheet label={user ? '我的账号' : '登录桌游厅'} onClose={closeAccountSheet} className="account-drawer">
      <header className="drawer-head">
        <h2>{user ? '我的账号' : '账号'}</h2>
        <button type="button" className="btn btn-ghost btn-small" onClick={closeAccountSheet}>
          关闭
        </button>
      </header>
      {user ? <Profile /> : <SignIn initialMode={mode} />}
    </ResponsiveSheet>
  );
}

function SignIn({ initialMode }: { initialMode: 'login' | 'register' }) {
  const [mode, setMode] = useState(initialMode);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState(getName);
  const [remember, setRemember] = useState(true);
  const { busy, error, run, setError } = useSubmit();
  useEffect(() => setError(null), [mode, setError]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (mode === 'register' && password.length < PASSWORD_MIN) return setError(`密码至少 ${PASSWORD_MIN} 位`);
    void run(async () => {
      if (mode === 'login') await account.login({ username, password, remember });
      else await account.register({ username, password, displayName, remember });
      closeAccountSheet();
    }, mode === 'login' ? '已登录' : '注册成功，已登录');
  };

  return (
    <div className="account-body">
      <p className="account-lede">
        不注册也能玩。登录后，进行中的对局跟着账号走：换手机、换电脑、清了浏览器缓存，登录同一个账号就能回到原来的座位。
      </p>
      <div className="account-tabs" role="tablist" aria-label="登录或注册">
        {(['login', 'register'] as const).map((m) => (
          <button key={m} type="button" role="tab" aria-selected={mode === m} className="account-tab" onClick={() => setMode(m)}>
            {m === 'login' ? '登录' : '注册'}
          </button>
        ))}
      </div>
      <form className="account-form" onSubmit={submit}>
        <label className="field">
          用户名
          <input
            className="input"
            name="username"
            value={username}
            onChange={(e) => setUsername(e.target.value.trim())}
            autoComplete="username"
            autoCapitalize="off"
            spellCheck={false}
            maxLength={20}
            placeholder={mode === 'register' ? '3–20 位英文字母、数字或下划线' : undefined}
            required
          />
        </label>
        {mode === 'register' && (
          <label className="field">
            昵称
            <input
              className="input"
              name="nickname"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              autoComplete="nickname"
              maxLength={NAME_MAX_LENGTH}
              placeholder="同桌的人会看到这个名字"
              required
            />
          </label>
        )}
        <label className="field">
          密码
          <input
            className="input"
            type="password"
            name="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            minLength={mode === 'register' ? PASSWORD_MIN : undefined}
            maxLength={128}
            placeholder={mode === 'register' ? `至少 ${PASSWORD_MIN} 位` : undefined}
            required
          />
        </label>
        <label className="account-remember">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          <span>
            在这台设备上保持登录
            <small>{remember ? '30 天内用过就一直有效；公共电脑上请取消勾选' : '关闭浏览器后自动退出'}</small>
          </span>
        </label>
        {error && <p className="account-error" role="alert">{error}</p>}
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? '请稍候…' : mode === 'login' ? '登录' : '注册并登录'}
        </button>
      </form>
    </div>
  );
}

function Profile() {
  const { user, session } = useAccount();
  const [section, setSection] = useState<'name' | 'password' | null>(null);
  const signOut = useSubmit();
  const others = useSubmit();
  if (!user) return null;

  const until = session?.persistent
    ? `本机保持登录，${new Date(session.expiresAt).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })}前用过就会自动续期`
    : '关闭浏览器后自动退出';

  return (
    <div className="account-body">
      <div className="account-card">
        <span className="account-avatar" aria-hidden="true">{[...user.displayName][0]}</span>
        <span>
          <strong>{user.displayName}</strong>
          <small>@{user.username}</small>
        </span>
      </div>
      <p className="account-lede">
        你在任何设备上登录这个账号，都能回到进行中的对局。{session && <><br />{until}。</>}
      </p>

      {user.isAdmin && (
        <button type="button" className="btn btn-ghost btn-small account-admin" onClick={() => {
          closeAccountSheet();
          navigate('/admin');
        }}>
          打开管理页
        </button>
      )}

      <Disclosure title="修改昵称" open={section === 'name'} onToggle={() => setSection(section === 'name' ? null : 'name')}>
        <RenameForm initial={user.displayName} onDone={() => setSection(null)} />
      </Disclosure>
      <Disclosure title="修改密码" open={section === 'password'} onToggle={() => setSection(section === 'password' ? null : 'password')}>
        <PasswordForm username={user.username} onDone={() => setSection(null)} />
      </Disclosure>

      <section className="account-devices">
        <h3>登录的设备</h3>
        <p>
          {session?.otherDevices ? `除了这台，还有 ${session.otherDevices} 个浏览器登录着这个账号。` : '目前只有这台设备登录着。'}
        </p>
        {others.error && <p className="account-error" role="alert">{others.error}</p>}
        {!!session?.otherDevices && (
          <button type="button" className="btn btn-ghost btn-small" disabled={others.busy}
            onClick={() => void others.run(() => account.logoutOthers(), '其他设备已退出登录')}>
            退出其他设备
          </button>
        )}
      </section>

      {signOut.error && <p className="account-error" role="alert">{signOut.error}</p>}
      <button type="button" className="btn btn-danger account-signout" disabled={signOut.busy}
        onClick={() => void signOut.run(async () => {
          await account.logout();
          closeAccountSheet();
        }, '已退出登录')}>
        退出登录
      </button>
    </div>
  );
}

function Disclosure({ title, open, onToggle, children }: { title: string; open: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <section className="account-section">
      <button type="button" className="account-section-toggle" aria-expanded={open} onClick={onToggle}>
        {title}
        <span aria-hidden="true">{open ? '−' : '+'}</span>
      </button>
      {open && children}
    </section>
  );
}

function RenameForm({ initial, onDone }: { initial: string; onDone: () => void }) {
  const [name, setName] = useState(initial);
  const { busy, error, run } = useSubmit();
  return (
    <form className="account-form" onSubmit={(e) => {
      e.preventDefault();
      void run(async () => {
        await account.updateProfile(name);
        onDone();
      }, '昵称已更新');
    }}>
      <label className="field">
        新昵称
        <input className="input" value={name} maxLength={NAME_MAX_LENGTH} onChange={(e) => setName(e.target.value)} autoComplete="nickname" required />
      </label>
      <p className="account-hint">还在大厅里的房间会马上换成新昵称；已经开始的对局保持原样。</p>
      {error && <p className="account-error" role="alert">{error}</p>}
      <button type="submit" className="btn btn-ghost btn-small" disabled={busy || !name.trim() || name.trim() === initial}>保存</button>
    </form>
  );
}

function PasswordForm({ username, onDone }: { username: string; onDone: () => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const { busy, error, run, setError } = useSubmit();
  return (
    <form className="account-form" onSubmit={(e) => {
      e.preventDefault();
      if (next.length < PASSWORD_MIN) return setError(`新密码至少 ${PASSWORD_MIN} 位`);
      void run(async () => {
        await account.changePassword(current, next);
        onDone();
      }, '密码已修改，其他设备需要重新登录');
    }}>
      {/* 给密码管理器认账号用 */}
      <input type="text" name="username" autoComplete="username" value={username} readOnly hidden />
      <label className="field">
        当前密码
        <input className="input" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required />
      </label>
      <label className="field">
        新密码
        <input className="input" type="password" value={next} minLength={PASSWORD_MIN} maxLength={128}
          onChange={(e) => setNext(e.target.value)} autoComplete="new-password" placeholder={`至少 ${PASSWORD_MIN} 位`} required />
      </label>
      <p className="account-hint">改完后其他设备会退出登录，这台保持登录。</p>
      {error && <p className="account-error" role="alert">{error}</p>}
      <button type="submit" className="btn btn-ghost btn-small" disabled={busy}>修改密码</button>
    </form>
  );
}

/** 首页右上角的账号入口 */
export function AccountButton() {
  const { user, status } = useAccount();
  if (debugAlias) return null;
  if (!user) {
    return (
      <button type="button" className="account-chip" onClick={() => openAccountSheet()} disabled={status === 'checking'}>
        登录 / 注册
      </button>
    );
  }
  return (
    <button type="button" className="account-chip is-user" onClick={() => openAccountSheet()} aria-label={`我的账号：${user.displayName}`}>
      <span className="account-avatar" aria-hidden="true">{[...user.displayName][0]}</span>
      <span className="account-chip-name">{user.displayName}</span>
    </button>
  );
}
