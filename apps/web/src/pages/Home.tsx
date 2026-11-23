import { AnimatePresence, motion } from 'framer-motion';
import { useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { NAME_MAX_LENGTH } from '@tabletop/shared';
import { SplitText } from '../fx/SplitText';
import { GAME_CLIENTS } from '../games/registry';
import { forgetRecentRoom, getName, net, notify, setName, useNet } from '../net/client';
import { navigate, roomPath } from '../net/route';

const GAMES = Object.values(GAME_CLIENTS);
const GAME_KEY = 'tabletop.game';

function rememberedGame(): string {
  try {
    const id = localStorage.getItem(GAME_KEY);
    if (id && GAME_CLIENTS[id]) return id;
  } catch {
    /* 读不到就用第一款 */
  }
  return GAMES[0]!.id;
}

export function Home() {
  const { room, lastRoomCode, recentRooms } = useNet();
  const [gameId, setGameId] = useState(rememberedGame);
  const [name, setNameInput] = useState(getName);
  const [code, setCode] = useState('');
  const nameRef = useRef<HTMLInputElement>(null);
  const resumeCode = room?.code ?? lastRoomCode;
  const game = GAME_CLIENTS[gameId]!;
  const resume = (roomCode: string) => navigate(roomPath(roomCode));

  const choose = (id: string) => {
    setGameId(id);
    try {
      localStorage.setItem(GAME_KEY, id);
    } catch {
      /* 只是记不住上次的选择 */
    }
  };

  const requireName = (): string | null => {
    const trimmed = name.trim();
    if (trimmed) return trimmed;
    notify('先起个名字，同桌的人要靠它认出你');
    nameRef.current?.focus();
    return null;
  };

  const create = () => {
    const who = requireName();
    if (who) net.createRoom(who, game.id);
  };

  const join = (e: FormEvent) => {
    e.preventDefault();
    const who = requireName();
    if (!who) return;
    if (!/^\d{4,8}$/.test(code)) return notify('房间号是 4 位数字，问问房主');
    setName(who);
    navigate(roomPath(code));
  };

  return (
    <main className="home">
      <header className="home-masthead">
        <div className="home-brand">
          <span className="home-brand-mark" aria-hidden="true">✦</span>
          <span className="home-brand-copy">
            <small>THE ROUND TABLE</small>
            <strong>桌游厅</strong>
          </span>
        </div>
        <div className="home-masthead-note">
          <span>多人联机</span>
          <i aria-hidden="true" />
          <span>策略 · 合作 · 推理</span>
        </div>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <div className="hero-kicker">
            <span className="hero-kicker-mark" aria-hidden="true" />
            <span>选一款桌游，开一张新桌</span>
            <span className="hero-kicker-index">GAME ROOM / 01</span>
          </div>
          <div className="game-tabs" role="group" aria-label="选择桌游">
            {GAMES.map((g) => (
              <button key={g.id} type="button" className="game-tab" aria-pressed={g.id === game.id} onClick={() => choose(g.id)}>
                <span className="game-tab-icon">{g.icon}</span>
                {g.name}
              </button>
            ))}
          </div>

          <h1 className="hero-title" style={{ '--chars': [...game.name].length } as CSSProperties}>
            <SplitText key={game.id} text={game.name} delay={0.1} stagger={0.12} />
          </h1>
          <AnimatePresence mode="wait">
            <motion.p
              key={game.id}
              className="hero-lede"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              {game.hero.lede}
            </motion.p>
          </AnimatePresence>

          <div className="entry">
            <label className="field">
              你的名字
              <input
                ref={nameRef}
                className="input"
                value={name}
                maxLength={NAME_MAX_LENGTH}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder="同桌的人会看到这个名字"
                autoComplete="nickname"
              />
            </label>
            <div className="entry-actions">
              <button type="button" className="btn btn-primary" onClick={create}>
                开一间{game.name}的房
              </button>
              <div className="entry-or">已经有房间号</div>
              <form className="entry-join" onSubmit={join}>
                <input
                  className="input"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
                  placeholder="房间号"
                  inputMode="numeric"
                  aria-label="房间号"
                />
                <button type="submit" className="btn btn-ghost">
                  加入房间
                </button>
              </form>
            </div>
          </div>
          {resumeCode && !recentRooms.some((recent) => recent.code === resumeCode) && (
            <button type="button" className="link resume" onClick={() => navigate(roomPath(resumeCode))}>
              回到房间 {resumeCode}
            </button>
          )}
          {recentRooms.length > 0 && (
            <section className="recent-rooms" aria-label="最近进入的房间">
              <header>
                <div>
                  <p>ROOM HISTORY</p>
                  <h2>最近进入的房间</h2>
                </div>
                <span>保存在本机</span>
              </header>
              <ul>
                {recentRooms.map((recent) => (
                  <li key={recent.code}>
                    <button type="button" className="recent-room-entry" onClick={() => resume(recent.code)}>
                      <span className="recent-room-main">
                        <strong>{recent.code}</strong>
                        <small>{GAME_CLIENTS[recent.gameId]?.name ?? '桌游房间'} · {new Date(recent.lastJoinedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</small>
                      </span>
                      <span className="recent-room-rejoin">重新加入 <span aria-hidden="true">↗</span></span>
                    </button>
                    <button type="button" className="recent-room-remove" onClick={() => forgetRecentRoom(recent.code)} aria-label={`从历史中移除房间 ${recent.code}`} title="移除记录">
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <div className="hero-window">
          <div className="rays" aria-hidden="true" />
          <div className="hero-window-stamp" aria-hidden="true">
            <span>TABLETOP ARCHIVE</span>
            <strong>{String(GAMES.indexOf(game) + 1).padStart(2, '0')}</strong>
          </div>
          <AnimatePresence mode="wait">
            <motion.div
              key={game.id}
              className="hero-art"
              initial={{ opacity: 0, scale: 0.94, filter: 'blur(14px)' }}
              animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
              exit={{ opacity: 0, scale: 1.04, filter: 'blur(14px)' }}
              transition={{ duration: 0.45, ease: [0.2, 0.7, 0.2, 1] }}
            >
              <game.hero.Art />
            </motion.div>
          </AnimatePresence>
        </div>
      </section>

      <section className="howto">
        <div>
          <h2>一局怎么进行</h2>
          <p className="howto-note">{game.hero.note}</p>
        </div>
        <ol className="steps">
          {game.hero.steps.map((step) => (
            <li key={step.title}>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </li>
          ))}
        </ol>
        <div className="wins">
          {game.hero.goals.map((goal) => (
            <div key={goal.title} className={`win win-${goal.tone}`}>
              <strong>{goal.title}</strong>
              {goal.text}
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
