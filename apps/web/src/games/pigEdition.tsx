import { useState, useSyncExternalStore, type FormEvent } from 'react';

const KEY = 'tabletop.pigEditionUnlocked';
const listeners = new Set<() => void>();

function readUnlock() {
  try {
    return localStorage.getItem(KEY) === 'yes';
  } catch {
    return false;
  }
}

let unlocked = readUnlock();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function emit() {
  for (const listener of listeners) listener();
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === KEY || event.key === null) {
      unlocked = readUnlock();
      emit();
    }
  });
}

export function isPigUnlocked() {
  return unlocked;
}

export function usePigUnlocked() {
  return useSyncExternalStore(subscribe, isPigUnlocked, () => false);
}

function grantPigEdition() {
  unlocked = true;
  try {
    localStorage.setItem(KEY, 'yes');
  } catch {
    // 无法保存时仍可在当前页面使用。
  }
  emit();
}

export function PigEditionSwitch({ active, gameName, onChange }: {
  active: boolean;
  gameName: string;
  onChange: (active: boolean) => void;
}) {
  const unlocked = usePigUnlocked();
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);
  const unlock = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (password.trim() !== '呼噜噜') {
      setError(true);
      return;
    }
    grantPigEdition();
    onChange(true);
    setPassword('');
    setError(false);
  };

  if (unlocked) {
    return (
      <div className="ct-edition" role="group" aria-label={`${gameName}版本`}>
        <span>版本</span>
        <button type="button" aria-pressed={!active} onClick={() => onChange(false)}>原版</button>
        <button type="button" aria-pressed={active} onClick={() => onChange(true)}>小猪版</button>
      </div>
    );
  }
  return (
    <details className="ct-edition-unlock">
      <summary>切换版本 · 解锁小猪版</summary>
      <form onSubmit={unlock} className="ct-edition-form">
        <label className="ct-edition-question" htmlFor="pig-edition-answer">小猪小猪</label>
        <input
          className="input"
          id="pig-edition-answer"
          type="password"
          aria-invalid={error}
          placeholder="输入回答"
          autoComplete="off"
          required
          maxLength={24}
          value={password}
          onChange={(event) => { setPassword(event.target.value); setError(false); }}
        />
        <button type="submit" className="btn btn-ghost btn-small">解锁</button>
        {error && <p role="alert">口令不正确，请再试一次。</p>}
      </form>
    </details>
  );
}
