import { motion } from 'framer-motion';
import { useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { Avalon, Citadels, NAME_MAX_LENGTH } from '@tabletop/shared';
import { DecodedImage } from '../art/DecodedImage';
import avalonHero from '../assets/avalon/home-duel-v2.webp';
import { Tilt } from '../fx/Tilt';
import { useReducedMotion } from '../fx/motion';
import { SplitText } from '../fx/SplitText';
import { AvalonRoleGuide } from '../games/avalon/RoleGuide';
import { avalonPigArt, setAvalonPigEdition, useAvalonCardStyle } from '../games/avalon/cardLibrary';
import { setCitadelsPigEdition, useCitadelsPigTheme } from '../games/citadels/cardStyle';
import { PigEditionSwitch } from '../games/pigEdition';
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
  const reducedMotion = useReducedMotion();
  const { room, lastRoomCode, recentRooms } = useNet();
  const [gameId, setGameId] = useState(rememberedGame);
  const [name, setNameInput] = useState(getName);
  const [code, setCode] = useState('');
  const [showAllRooms, setShowAllRooms] = useState(false);
  const visibleRooms = showAllRooms ? recentRooms : recentRooms.slice(0, 3);
  const nameRef = useRef<HTMLInputElement>(null);
  const resumeCode = room?.code ?? lastRoomCode;
  const game = GAME_CLIENTS[gameId]!;
  const isAvalon = game.id === Avalon.avalon.id;
  const isCitadels = game.id === Citadels.citadels.id;
  const citadelsPig = useCitadelsPigTheme();
  const avalonPig = useAvalonCardStyle() === 'pig';
  const pigTheme = isAvalon ? avalonPig : isCitadels && citadelsPig;
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
    <main className={`home${pigTheme ? ' ct-pig-theme' : ''}`}>
      <header className="home-masthead">
        <div className="home-brand">
          <span className="home-brand-mark" aria-hidden="true">{pigTheme ? '🐷' : '✦'}</span>
          <span className="home-brand-copy">
            <small>THE ROUND TABLE</small>
            <strong>桌游厅</strong>
          </span>
        </div>
        {isAvalon || isCitadels ? (
          <PigEditionSwitch
            key={game.id}
            gameName={game.name}
            active={pigTheme}
            onChange={isAvalon ? setAvalonPigEdition : setCitadelsPigEdition}
          />
        ) : (
          <div className="home-masthead-note">
            <span>多人联机</span>
            <i aria-hidden="true" />
            <span>策略 · 合作 · 推理</span>
          </div>
        )}
      </header>

      <section className={isAvalon ? 'hero hero-avalon' : 'hero'} data-game={game.id}>
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
          <p className="hero-lede">{game.hero.lede}</p>

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
              <ul id="recent-room-list">
                {visibleRooms.map((recent) => (
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
              {recentRooms.length > 3 && (
                <button
                  type="button"
                  className="btn btn-ghost btn-small recent-rooms-toggle"
                  aria-controls="recent-room-list"
                  aria-expanded={showAllRooms}
                  onClick={() => setShowAllRooms((expanded) => !expanded)}
                >
                  {showAllRooms ? '收起历史记录' : `展开全部 ${recentRooms.length} 条记录`}
                </button>
              )}
            </section>
          )}
        </div>

        <div className={isAvalon ? 'hero-window hero-window-avalon' : 'hero-window'}>
          {!isAvalon && (
            <div className="hero-window-stamp" aria-hidden="true">
              <span>TABLETOP ARCHIVE</span>
              <strong>{String(GAMES.indexOf(game) + 1).padStart(2, '0')}</strong>
            </div>
          )}
          <motion.div
            key={pigTheme ? `${game.id}-pig` : game.id}
            className="hero-art"
            initial={reducedMotion || isAvalon ? false : { opacity: 0, y: 26, scale: 0.94, rotate: 1.2 }}
            animate={{ opacity: 1, y: 0, scale: 1, rotate: 0 }}
            transition={reducedMotion ? { duration: 0 } : {
              opacity: { duration: 0.62, ease: [0.22, 1, 0.36, 1] },
              y: { type: 'spring', stiffness: 82, damping: 17, mass: 0.85 },
              scale: { type: 'spring', stiffness: 96, damping: 18, mass: 0.8 },
              rotate: { duration: 0.78, ease: [0.22, 1, 0.36, 1] },
            }}
            whileHover={reducedMotion ? undefined : {
              y: -4,
              scale: 1.014,
              transition: { type: 'spring', stiffness: 230, damping: 19 },
            }}
            whileTap={reducedMotion ? undefined : {
              y: 2,
              scale: 0.987,
              transition: { type: 'spring', stiffness: 300, damping: 20 },
            }}
          >
            <Tilt className="hero-art-tilt" max={3} glare={false}>
              {pigTheme ? (
                <div className="ct-pig-hero" role="img" aria-label={`${game.name}小猪版卡牌`}>
                  {(isAvalon ? ['percival', 'merlin', 'morgana'] : ['merchant', 'king', 'military']).map((asset) => (
                    <img key={asset} src={isAvalon ? avalonPigArt(asset) : `${import.meta.env.BASE_URL}citadels-cards/pig/${asset}.webp`} width={300} height={420} alt="" />
                  ))}
                </div>
              ) : isAvalon ? (
                <div className="avalon-hero-portrait">
                  <DecodedImage
                    src={avalonHero}
                    revealDuration={1.5}
                    {...{ fetchpriority: 'high' }}
                    width={1254}
                    height={1254}
                    alt="蓝袍与红袍的两位角色隔着金框相对"
                  />
                </div>
              ) : <game.hero.Art />}
            </Tilt>
          </motion.div>
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
        {game.hero.goals.length > 0 && (
          <div className="wins">
            {game.hero.goals.map((goal) => (
              <div key={goal.title} className={`win win-${goal.tone}`}>
                <strong>{goal.title}</strong>
                {goal.text}
              </div>
            ))}
          </div>
        )}
      </section>

      {isAvalon && <AvalonRoleGuide />}
    </main>
  );
}
