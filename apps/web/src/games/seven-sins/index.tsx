import { useState, type CSSProperties, type FormEvent } from 'react';
import { SevenSins, type RoomSnapshot } from '@tabletop/shared';
import council from '../../assets/seven-sins-council.jpg';
import { net } from '../../net/client';
import type { GameClient } from '../registry';

const { sevenSins, SCENES, SINS, CARDS, DECREES, DECREE_INFO, MAX_SPEECH_LENGTH } = SevenSins;
type Sin = SevenSins.Sin;
type View = SevenSins.SevenSinsView;
const signed = (points: number) => points > 0 ? '+' + points : String(points);
const sinStyle = (sin: Sin) => ({ '--sin-color': SCENES[sin].color } as CSSProperties);

function CouncilArt() {
  return <img className="sins-cover" src={council} width={1050} height={1050} alt="七扇彩窗围绕着放有王冠和卡牌的议事桌" />;
}

function Rules({ showScenes = false }: { showScenes?: boolean }) {
  return (
    <details className="sins-rules">
      <summary>{showScenes ? '展开查看七幕与完整规则' : '查看规则'}</summary>
      <ol>
        <li>每人随机拿到一个秘密罪名。七个罪名始终可被选作卡牌目标，未发出的罪名也会计分。</li>
        <li>七个场景各玩一轮，顺序随机。每幕先协商，再从剩余手牌中暗出一张并选目标。每张牌全局只能用一次。</li>
        <li>每人同时暗选一项提案。当前场景对应的罪名持有者是匿名庄家，只有其提案生效。罪名缺席时由系统随机决定。</li>
        <li>正向牌指献礼、密约、庇护、造势、逆风和顺风。分数可为负数。七幕结束后公开身份，仅已发出的罪名参评，最高分并列时共同获胜。</li>
      </ol>
      <dl>{DECREES.map((decree) => <div key={decree}><dt>{DECREE_INFO[decree].name}</dt><dd>{DECREE_INFO[decree].text}</dd></div>)}</dl>
      <p>场景牌对首选目标强化 1 分，弹劾则多扣 1 分。庇护效果在扣分结算时统一抵消。</p>
      {showScenes && <dl>{SINS.map((sin) => <div key={sin}><dt>{SCENES[sin].place} · {SCENES[sin].name}</dt><dd>强化{CARDS[SCENES[sin].card].name}</dd></div>)}</dl>}
      <dl>{SevenSins.CARD_IDS.map((card) => <div key={card}><dt>{CARDS[card].name}</dt><dd>{CARDS[card].text}</dd></div>)}</dl>
    </details>
  );
}

function Options() {
  return <div className="party-lobby-copy"><p>3 至 7 人。七幕按随机顺序进行。可以用内置文字发言，也可以开语音协商。</p><Rules showScenes /></div>;
}

function PlayForm({ view }: { view: View }) {
  const [card, setCard] = useState<SevenSins.Card | null>(null);
  const [target, setTarget] = useState<Sin | ''>('');
  const [second, setSecond] = useState<Sin | ''>('');
  const [decree, setDecree] = useState<SevenSins.Decree | null>(null);
  if (!view.me) return null;
  const featured = SCENES[view.scenes[view.round]].card;
  const valid = card && target && decree && (card !== 'pact' || (second && target !== second));

  function submit(event: FormEvent) {
    event.preventDefault();
    if (card && target && decree && valid) net.act({ type: 'play', round: view.round, card, target, second: card === 'pact' ? second : undefined, decree });
  }

  return (
    <form className="sins-play" onSubmit={submit}>
      <fieldset>
        <legend>选一张手牌</legend>
        <div className="sins-hand">
          {view.me.hand.map((id) => (
            <button type="button" key={id} className="sins-card" aria-pressed={card === id} onClick={() => setCard(id)}>
              <span className="sins-card-mark" aria-hidden="true">{CARDS[id].mark}</span>
              <strong>{CARDS[id].name}{id === featured && <small>本幕强化</small>}</strong>
              <span>{CARDS[id].text}</span>
            </button>
          ))}
        </div>
      </fieldset>
      <div className="sins-targets">
        <label>首选目标
          <select value={target} onChange={(event) => setTarget(event.target.value as Sin | '')}>
            <option value="">选择罪名</option>
            {SINS.map((sin) => <option key={sin} value={sin}>{SCENES[sin].name}（{view.scores[sin]} 分）</option>)}
          </select>
        </label>
        {card === 'pact' && <label>密约的第二个目标
          <select value={second} onChange={(event) => setSecond(event.target.value as Sin | '')}>
            <option value="">选择另一个罪名</option>
            {SINS.map((sin) => <option key={sin} value={sin} disabled={sin === target}>{SCENES[sin].name}（{view.scores[sin]} 分）</option>)}
          </select>
        </label>}
      </div>
      <fieldset>
        <legend>暗选庄家提案</legend>
        <div className="sins-decrees">
          {DECREES.map((id) => (
            <button key={id} type="button" className="sins-card" aria-pressed={decree === id} onClick={() => setDecree(id)}>
              <strong>{DECREE_INFO[id].name}</strong>
              <span>{DECREE_INFO[id].text}</span>
            </button>
          ))}
        </div>
        <p className="sins-muted">所有人都要选择。只有庄家的选择会生效。</p>
      </fieldset>
      <button type="submit" className="btn btn-primary" disabled={!valid}>封存出牌</button>
    </form>
  );
}

function RoundLog({ result, nameOf }: {
  result: SevenSins.SceneResult;
  nameOf: (id: string) => string;
}) {
  const { name, place } = SCENES[result.scene];
  return (
    <div className="sins-log">
      <p><strong>{place} · {name}</strong></p>
      <p>庄家提案为<strong>「{DECREE_INFO[result.decree].name}」</strong>
        {result.decreeTarget ? `，作用于${SCENES[result.decreeTarget].name}。` : '，没有满足条件的唯一目标。'}
      </p>
      <ul className="sins-log-cards" aria-label="匿名出牌">
        {result.cards.map(({ card, target, second }, i) => <li key={i}>{CARDS[card].name} · {SCENES[target].name}{second ? `、${SCENES[second].name}` : ''}</li>)}
      </ul>
      <ul className="sins-log-points" aria-label="本幕分数变化">
        {SINS.filter((sin) => result.changes[sin] !== 0).map((sin) => <li key={sin} style={sinStyle(sin)}>{SCENES[sin].name} <strong>{signed(result.changes[sin])}</strong></li>)}
        {SINS.every((sin) => result.changes[sin] === 0) && <li>本幕没有分数变化</li>}
      </ul>
      {result.speeches.some((entry) => entry.text) && <details>
        <summary>发言记录</summary>
        <ul className="sins-speeches">{result.speeches.filter((entry) => entry.text).map((entry) => <li key={entry.player}><strong>{nameOf(entry.player)}</strong><p>{entry.text}</p></li>)}</ul>
      </details>}
    </div>
  );
}

function Debate({ view, ready, nameOf }: { view: View; ready: boolean; nameOf: (id: string) => string }) {
  const [draft, setDraft] = useState('');
  return (
    <>
      <h3>辩论</h3>
      <p className="sins-muted">{SCENES[view.scenes[view.round]].debate}</p>
      <ul className="sins-speeches" aria-live="polite">
        {view.speeches.filter((entry) => entry.text).map((entry) => (
          <li key={entry.player}><strong>{nameOf(entry.player)}</strong><p>{entry.text}</p></li>
        ))}
      </ul>
      {ready ? <p role="status">等待其他玩家结束发言。</p> : (
        <form className="sins-debate" onSubmit={(event) => {
          event.preventDefault();
          net.act({ type: 'speak', text: draft, round: view.round });
        }}>
          <label>公开发言
            <textarea value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={MAX_SPEECH_LENGTH} rows={3} placeholder="你想拉拢谁，或说服大家支持哪个罪名？" />
          </label>
          <button type="submit" className="btn btn-primary">{draft.trim() ? '发表并结束发言' : '结束发言'}</button>
        </form>
      )}
    </>
  );
}

function Board({ room }: { room: RoomSnapshot }) {
  return <Match key={room.code + '.' + room.gameSeq + '.' + room.you} room={room} />;
}

function Match({ room }: { room: RoomSnapshot }) {
  const view = room.view as View;
  const [showIdentity, setShowIdentity] = useState(false);
  const sceneId = view.scenes[view.round];
  const scene = SCENES[sceneId];
  const isHost = room.hostId === room.you;
  const nameOf = (id: string) => {
    const player = room.players.find((seat) => seat.id === id);
    return player ? `${player.seatIndex + 1} 号 · ${player.name}` : '未知座位';
  };
  const ready = view.ready.includes(room.you);
  const canFill = isHost && (view.phase === 'debate' || view.phase === 'cards') &&
    room.players.some((player) => !player.connected && !view.ready.includes(player.id));
  const latest = view.phase === 'recap' || view.phase === 'ended' ? view.history.at(-1) : undefined;
  const past = latest ? view.history.slice(0, -1) : view.history;

  return (
    <main className="sins-room" style={sinStyle(sceneId)}>
      <header className="room-bar">
        <button type="button" className="link" onClick={net.leaveRoom}>离开</button>
        <h1>七宗罪</h1>
        <div className="room-code"><span>房间号</span><strong>{room.code}</strong></div>
      </header>
      <div className="sins-layout">
        <div className="sins-main">
          <section className="sins-scene" style={{ backgroundImage: `linear-gradient(90deg, rgba(12, 10, 16, .94), rgba(12, 10, 16, .66) 68%, rgba(12, 10, 16, .36)), url("${council}")` }}>
            <p>第 {view.round + 1} / {SINS.length} 幕 · {scene.name}</p>
            <h2>{scene.place}</h2>
            <p>本幕强化 <strong>{CARDS[scene.card].name}</strong>{scene.card === 'censure' ? ' −1 分' : ' +1 分'}</p>
          </section>
          {view.me && !view.final && (
            <section className="sins-panel sins-identity" style={showIdentity ? sinStyle(view.me.sin) : undefined}>
              <div><h3>我的身份</h3><button type="button" className="btn btn-ghost btn-small" aria-expanded={showIdentity} onClick={() => setShowIdentity((shown) => !shown)}>{showIdentity ? '隐藏' : '查看'}</button></div>
              {showIdentity && <><strong>{SCENES[view.me.sin].name}</strong><p>{view.me.banker ? '本幕你是庄家。你的提案将匿名生效。' : '为你的罪名争取积分。'}</p></>}
            </section>
          )}
          <section className="sins-panel sins-stage">
            {view.phase === 'debate' && <Debate key={view.round} view={view} ready={ready} nameOf={nameOf} />}
            {view.phase === 'cards' && (
              <>
                <h3>暗中出牌</h3>
                {ready ? <p role="status">已封存，等待其他玩家出牌。</p> : <PlayForm key={view.round} view={view} />}
                {view.speeches.some((entry) => entry.text) && <details>
                  <summary>回看本幕发言</summary>
                  <ul className="sins-speeches">{view.speeches.filter((entry) => entry.text).map((entry) => <li key={entry.player}><strong>{nameOf(entry.player)}</strong><p>{entry.text}</p></li>)}</ul>
                </details>}
              </>
            )}
            {latest && <><h3>本幕结算</h3><RoundLog result={latest} nameOf={nameOf} /></>}
            {view.phase === 'recap' && (isHost
              ? <button type="button" className="btn btn-primary" onClick={() => net.act({ type: 'advance', round: view.round })}>进入下一幕</button>
              : <p role="status" className="sins-muted">等待房主开启下一幕。</p>)}
            {canFill && <button type="button" className="btn btn-ghost" onClick={() => net.act({ type: 'fill_offline', round: view.round, phase: view.phase })}>
              {view.phase === 'debate' ? '跳过离线发言' : '为离线玩家自动出牌'}
            </button>}
          </section>
          {view.final && (
            <section className="sins-panel sins-finale">
              <h2>{view.final.winners.map(nameOf).join('、')} {view.final.winners.length > 1 ? '共同获胜' : '获胜'}</h2>
              <ol>
                {[...room.players].sort((a, b) => view.scores[view.final!.roles[b.id]] - view.scores[view.final!.roles[a.id]]).map((player) => {
                  const sin = view.final!.roles[player.id];
                  return <li key={player.id} style={sinStyle(sin)}><strong>{nameOf(player.id)}</strong><span>{SCENES[sin].name} · {view.scores[sin]} 分</span></li>;
                })}
              </ol>
              {isHost ? <button type="button" className="btn btn-primary" onClick={net.backToLobby}>返回大厅</button> : <p>等待房主返回大厅。</p>}
            </section>
          )}
          {past.length > 0 && <section className="sins-panel sins-history">
            <h3>历幕记录</h3>
            {[...past].reverse().map((result) => <details key={result.scene}><summary>第 {view.scenes.indexOf(result.scene) + 1} 幕 · {SCENES[result.scene].place}</summary><RoundLog result={result} nameOf={nameOf} /></details>)}
          </section>}
        </div>
        <aside className="sins-sidebar">
          <section className="sins-panel">
            <h3>罪名积分</h3>
            <ul className="sins-scores">
              {SINS.map((sin) => <li key={sin} style={sinStyle(sin)}><span><i aria-hidden="true">{SCENES[sin].mark}</i> {SCENES[sin].name}</span><strong>{view.scores[sin]}</strong></li>)}
            </ul>
          </section>
          {(view.phase === 'debate' || view.phase === 'cards') && <section className="sins-panel">
            <h3>本幕进度 <small>{view.ready.length} / {room.players.length}</small></h3>
            <ul className="sins-seats">
              {room.players.map((player) => (
                <li key={player.id}><span>{nameOf(player.id)}{player.id === room.you && '（你）'}</span><small>{view.ready.includes(player.id) ? '已完成' : player.connected ? '等待中' : '离线'}</small></li>
              ))}
            </ul>
          </section>}
          <Rules />
        </aside>
      </div>
    </main>
  );
}

export const sevenSinsClient: GameClient = {
  id: sevenSins.id,
  name: sevenSins.name,
  tagline: sevenSins.tagline,
  icon: <span className="party-tab-mark" aria-hidden="true">♛</span>,
  hero: {
    lede: '七宗罪在空冠之下争夺席位。你代表的罪名只有自己知道。先谈条件，再用一张暗牌决定你究竟支持谁。',
    Art: CouncilArt,
    note: '3 至 7 人。七个场景各玩一轮，支持文字发言、语音协商与机器人陪玩。',
    steps: [
      { title: '领取秘密罪名', text: '随机抽取一张身份牌。七个场景会在本局依次登场，顺序每局重排。' },
      { title: '协商后暗出一牌', text: '用发言争取支持，再用一次性的手牌献礼、结盟或弹劾。场景会强化特定手牌。' },
      { title: '揭晓庄家提案', text: '与场景同罪名的玩家秘密决定本幕提案。所有出牌匿名结算，场景缺席时由系统决定提案。' },
    ],
    goals: [{ tone: 'gilt', title: '让自己的罪名拿到最高分', text: '第七幕结束后公开身份。只有分给玩家的罪名参加最终排名。' }],
  },
  Options,
  Board,
};
