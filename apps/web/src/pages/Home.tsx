import { useRef, useState, type FormEvent } from 'react';
import { NAME_MAX_LENGTH } from '@tabletop/shared';
import { RoseWindow } from '../art/RoseWindow';
import { SplitText } from '../fx/SplitText';
import { Tilt } from '../fx/Tilt';
import { GAME_CLIENTS } from '../games/registry';
import { getName, net, notify, setName, useNet } from '../net/client';
import { navigate, roomPath } from '../net/route';

export function Home() {
  const { room, lastRoomCode } = useNet();
  const [name, setNameInput] = useState(getName);
  const [code, setCode] = useState('');
  const nameRef = useRef<HTMLInputElement>(null);
  const resumeCode = room?.code ?? lastRoomCode;

  const requireName = (): string | null => {
    const trimmed = name.trim();
    if (trimmed) return trimmed;
    notify('先起个名字，同桌的人要靠它认出你');
    nameRef.current?.focus();
    return null;
  };

  const create = () => {
    const who = requireName();
    if (who) net.createRoom(who, 'avalon');
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
      <section className="hero">
        <div className="hero-copy">
          <h1 className="hero-title">
            <SplitText text="阿瓦隆" delay={0.15} stagger={0.14} />
          </h1>
          <p className="hero-lede">
            亚瑟王的圆桌旁，混进了莫德雷德的爪牙。五次任务，三次定胜负。听每个人怎么说，看每一票怎么投，找出谁在说谎。
          </p>

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
                开一间房
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
          {resumeCode && (
            <button type="button" className="link resume" onClick={() => navigate(roomPath(resumeCode))}>
              回到房间 {resumeCode}
            </button>
          )}
        </div>

        <div className="hero-window">
          <div className="rays" aria-hidden="true" />
          <RoseWindow />
        </div>
      </section>

      <section className="howto">
        <div>
          <h2>一局怎么进行</h2>
          <p className="howto-note">5 到 10 人，一局约半小时。身份由系统秘密发放，建议开着语音一起玩。</p>
        </div>
        <ol className="steps">
          <li>
            <h3>组队</h3>
            <p>队长挑选出任务的队员。人选可以商量，但决定权在队长手里。</p>
          </li>
          <li>
            <h3>投票</h3>
            <p>所有人同时表态，过半赞成才能出发。否决则换下一位队长，连续五次否决邪恶方直接获胜。</p>
          </li>
          <li>
            <h3>做任务</h3>
            <p>队员暗中出牌。正义方只能出成功，邪恶方可以出失败。只要混进一张失败，任务就毁了。</p>
          </li>
        </ol>
        <div className="wins">
          <div className="win win-good">
            <strong>正义方</strong>
            完成三次任务，并且不让刺客认出梅林。
          </div>
          <div className="win win-evil">
            <strong>邪恶方</strong>
            破坏三次任务，或在最后一刻刺中梅林。
          </div>
        </div>
      </section>

      <section className="shelf">
        <h2>桌游柜</h2>
        <div className="shelf-row">
          {Object.values(GAME_CLIENTS).map((game) => (
            <Tilt key={game.id} className="panel game-tile" max={6}>
              <div className="game-tile-icon">{game.icon}</div>
              <div>
                <h3>{game.name}</h3>
                <p>{game.tagline}</p>
              </div>
            </Tilt>
          ))}
          <div className="game-tile game-tile-empty">下一款桌游还在路上。这张桌子留给它。</div>
        </div>
      </section>
    </main>
  );
}
