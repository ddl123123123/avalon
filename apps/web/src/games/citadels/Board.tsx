import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import { useEffect, useState, type ReactNode } from 'react';
import { Citadels, type RoomSnapshot } from '@tabletop/shared';
import { net } from '../../net/client';
import { DraftPicker } from './Draft';
import { EndScreen } from './EndScreen';
import { PlayerPanel } from './PlayerPanel';
import { Announcer, Track } from './Track';
import { CharacterCard, CitadelsCardBack, Coin, DistrictCard } from './art';
import { CitadelsCardStylePicker, useCitadelsPigTheme } from './cardStyle';
import { describe, destroyCostOf, incomeOf } from './text';

type View = Citadels.CitadelsView;
type CharacterId = Citadels.CharacterId;
const { CHARACTER, CHARACTERS, TYPE_NAMES, districtOf } = Citadels;

/** 需要先选目标再确认的操作 */
type Mode = null | 'murder' | 'rob' | 'swap' | 'redraw' | 'lab' | 'destroy';

export function CitadelsBoard({ room }: { room: RoomSnapshot }) {
  const pigTheme = useCitadelsPigTheme();
  const themeClass = pigTheme ? ' ct-pig-theme' : '';
  const view = room.view as View;
  const me = view.me;
  const byId = new Map(room.players.map((p) => [p.id, p]));
  const nameOf = (id: string) => byId.get(id)?.name ?? '？';
  const playerOf = (id: string) => byId.get(id) ?? { id, name: '？', connected: false, isBot: false, seatIndex: -1 };
  const act = (action: Citadels.CitadelsAction) => net.act(action);

  const [mode, setMode] = useState<Mode>(null);
  const [handSel, setHandSel] = useState<string[]>([]);
  const [charSel, setCharSel] = useState<CharacterId | null>(null);
  const [playerSel, setPlayerSel] = useState<string | null>(null);
  const [target, setTarget] = useState<{ player: string; card: string } | null>(null);
  const [keepSel, setKeepSel] = useState<string[]>([]);
  const [inspect, setInspect] = useState<string | null>(null);
  const [showLog, setShowLog] = useState(false);

  const cancel = () => {
    setMode(null);
    setHandSel([]);
    setCharSel(null);
    setPlayerSel(null);
    setTarget(null);
  };
  const start = (next: Mode) => {
    cancel();
    setMode(next);
  };
  // 换人行动、技能用掉之后，清掉没做完的选择
  const turn = view.turn;
  useEffect(cancel, [view.round, view.calledRank, view.phase, turn?.powerUsed, turn?.labUsed, turn?.player]);
  useEffect(() => setKeepSel([]), [turn?.drawnCount]);
  const handKey = me?.hand.join(',') ?? '';
  useEffect(() => setHandSel((sel) => sel.filter((c) => me?.hand.includes(c))), [handKey]); // eslint-disable-line react-hooks/exhaustive-deps

  if (view.phase === 'ended') {
    return (
      <main className={`board board-ended${themeClass}`}>
        <header className="room-bar">
          <button type="button" className="link" onClick={net.leaveRoom}>
            离开
          </button>
          <div className="room-code">
            <span>房间号</span>
            <strong>{room.code}</strong>
          </div>
          <CitadelsCardStylePicker />
        </header>
        <EndScreen room={room} view={view} onCard={setInspect} />
        <AnimatePresence>{inspect && <Inspect card={inspect} onClose={() => setInspect(null)} />}</AnimatePresence>
      </main>
    );
  }

  const myIndex = me ? view.players.indexOf(me.id) : -1;
  const rivals = view.players.map((_, i) => view.players[(myIndex + 1 + i) % view.players.length]!).filter((id) => id !== me?.id);
  const myTurn = !!me && view.phase === 'turns' && turn?.player === me.id && !view.pendingGraveyard;
  const myGold = me ? view.seats[me.id]!.gold : 0;
  const myCity = me ? view.seats[me.id]!.city : [];
  const owned = (id: string) => myCity.some((c) => districtOf(c).id === id);
  const drafting = view.phase === 'draft' && view.draft?.picker === me?.id;

  const canBuild = (card: string): string | null => {
    if (!myTurn || !turn) return '还没轮到你';
    const def = districtOf(card);
    if (!turn.actionTaken) return '先拿金币或抽牌';
    if (turn.builds >= turn.buildLimit) return `这一回合最多建 ${turn.buildLimit} 座`;
    if (owned(def.id)) return `城里已经有${def.name}了`;
    if (def.cost > myGold) return `还差 ${def.cost - myGold} 枚金币`;
    return null;
  };

  const onHandCard = (card: string) => {
    // 不是自己的回合时，手牌没什么可操作的，点一下就是看牌
    if (!myTurn) return setInspect(card);
    if (mode === 'redraw') setHandSel((sel) => (sel.includes(card) ? sel.filter((c) => c !== card) : [...sel, card]));
    else setHandSel((sel) => (sel[0] === card ? [] : [card]));
  };

  const costOf = (player: string) =>
    mode === 'destroy'
      ? (card: string) => {
          const cost = destroyCostOf(view, player, card);
          return cost !== null && cost <= myGold ? cost : null;
        }
      : undefined;
  const onCityCard = (player: string) => (card: string) => {
    if (mode === 'destroy') setTarget({ player, card });
    else setInspect(card);
  };

  /* ---------- 行动区 ---------- */
  let prompt = '';
  let hint: ReactNode = null;
  let body: ReactNode = null;
  let buttons: ReactNode = null;
  const cancelButton = (
    <button type="button" className="btn btn-ghost btn-small" onClick={cancel}>
      取消
    </button>
  );

  if (!me) {
    prompt = '你正在旁观这一局';
  } else if (view.phase === 'draft' && view.draft) {
    prompt = `等 ${nameOf(view.draft.picker)} ${view.draft.step === 'pick' ? '选角色' : '盖弃一个角色'}`;
    hint = me.characters.length ? `你这一轮是${me.characters.map((c) => CHARACTER[c].name).join('和')}` : '角色牌正在传递，轮到你时会亮出来';
  } else if (view.pendingGraveyard) {
    const g = view.pendingGraveyard;
    const name = districtOf(g.card).name;
    if (g.owner === me.id) {
      prompt = `${name}被摧毁了。花 1 枚金币把它收进手牌吗？`;
      hint = '这是你的墓地的效果';
      buttons = (
        <>
          <button type="button" className="btn btn-primary" onClick={() => act({ type: 'graveyard', take: true })}>
            花 1 枚金币收回
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => act({ type: 'graveyard', take: false })}>
            不要
          </button>
        </>
      );
    } else {
      prompt = `等 ${nameOf(g.owner)} 决定要不要用墓地收回${name}`;
    }
  } else if (!myTurn || !turn) {
    prompt = turn ? `${nameOf(turn.player)}（${CHARACTER[turn.character].name}）正在行动` : '';
    hint = me.characters.length ? `你这一轮是${me.characters.map((c) => CHARACTER[c].name).join('和')}` : null;
  } else if (turn.drawn) {
    prompt = `从抽到的牌里留下 ${turn.keepCount} 张`;
    hint = '没留下的牌放回牌堆底';
    body = (
      <div className="pick-row">
        {turn.drawn.map((card) => (
          <button
            key={card}
            type="button"
            className={`hand-card ${keepSel.includes(card) ? 'is-selected' : ''}`}
            aria-pressed={keepSel.includes(card)}
            onClick={() =>
              setKeepSel((sel) => (sel.includes(card) ? sel.filter((c) => c !== card) : turn.keepCount === 1 ? [card] : [...sel, card].slice(-turn.keepCount)))
            }
          >
            <DistrictCard card={card} />
          </button>
        ))}
      </div>
    );
    buttons = (
      <button type="button" className="btn btn-primary" disabled={keepSel.length !== turn.keepCount} onClick={() => act({ type: 'keep', cards: keepSel })}>
        留下{keepSel.length === 1 ? districtOf(keepSel[0]!).name : '选中的牌'}
      </button>
    );
  } else if (mode === 'murder' || mode === 'rob') {
    const murder = mode === 'murder';
    prompt = murder ? '刺杀哪个角色？他这一轮不能行动' : '偷哪个角色？轮到他时金币全归你';
    hint = '你指定的是角色，不是玩家。没人选这个角色的话就落空了';
    const blocked = (c: CharacterId) =>
      c === 'assassin' || view.faceUp.includes(c) || (!murder && (c === 'thief' || c === view.murdered));
    body = (
      <div className="pick-row pick-row-chars">
        {CHARACTERS.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`char-pick ${charSel === c.id ? 'is-selected' : ''}`}
            disabled={blocked(c.id)}
            aria-pressed={charSel === c.id}
            onClick={() => setCharSel(c.id)}
          >
            <CharacterCard character={c.id} />
          </button>
        ))}
      </div>
    );
    buttons = (
      <>
        <button
          type="button"
          className="btn btn-danger"
          disabled={!charSel}
          onClick={() => charSel && act({ type: murder ? 'murder' : 'rob', character: charSel })}
        >
          {charSel ? `${murder ? '刺杀' : '偷'}${CHARACTER[charSel].name}` : '先选一个角色'}
        </button>
        {cancelButton}
      </>
    );
  } else if (mode === 'swap') {
    prompt = '和谁交换全部手牌？在上面点选一名玩家';
    buttons = (
      <>
        <button type="button" className="btn btn-primary" disabled={!playerSel} onClick={() => playerSel && act({ type: 'swap_hand', target: playerSel })}>
          {playerSel ? `和 ${nameOf(playerSel)} 交换（对方有 ${view.seats[playerSel]!.handCount} 张）` : '先选一名玩家'}
        </button>
        {cancelButton}
      </>
    );
  } else if (mode === 'redraw') {
    prompt = '点选要换掉的手牌，换掉几张就抽几张';
    buttons = (
      <>
        <button type="button" className="btn btn-primary" disabled={handSel.length === 0} onClick={() => act({ type: 'redraw', cards: handSel })}>
          换掉 {handSel.length} 张
        </button>
        {cancelButton}
      </>
    );
  } else if (mode === 'lab') {
    prompt = '实验室：点选一张手牌弃掉，换 1 枚金币';
    buttons = (
      <>
        <button type="button" className="btn btn-primary" disabled={!handSel[0]} onClick={() => handSel[0] && act({ type: 'laboratory', card: handSel[0] })}>
          {handSel[0] ? `弃掉${districtOf(handSel[0]).name}` : '先选一张手牌'}
        </button>
        {cancelButton}
      </>
    );
  } else if (mode === 'destroy') {
    prompt = '点选要摧毁的城区，角标是要付的金币';
    hint = '要塞、主教的城区和已建成的城市动不了';
    const cost = target ? destroyCostOf(view, target.player, target.card) : null;
    buttons = (
      <>
        <button type="button" className="btn btn-danger" disabled={!target} onClick={() => target && act({ type: 'destroy', target: target.player, card: target.card })}>
          {target ? `摧毁 ${nameOf(target.player)} 的${districtOf(target.card).name}（${cost} 枚金币）` : '先选一座城区'}
        </button>
        {cancelButton}
      </>
    );
  } else {
    const who = CHARACTER[turn.character];
    prompt = `轮到你了，你是${who.name}`;
    const picked = handSel[0];
    const blocker = picked ? canBuild(picked) : null;
    const income = incomeOf(view, me.id, turn.character);
    hint = !turn.actionTaken
      ? '先选一样：拿金币，或者抽牌'
      : picked
        ? (blocker ?? `${districtOf(picked).name}：造价 ${districtOf(picked).cost} 枚金币`)
        : turn.builds < turn.buildLimit
          ? `点一张手牌来建造（这一回合还能建 ${turn.buildLimit - turn.builds} 座），或者结束回合`
          : '这一回合的建造次数用完了';
    buttons = (
      <>
        {!turn.actionTaken && (
          <>
            <button type="button" className="btn btn-primary" onClick={() => act({ type: 'take_gold' })}>
              拿 {Citadels.ACTION_GOLD} 枚金币
            </button>
            <button type="button" className="btn btn-primary" onClick={() => act({ type: 'draw' })}>
              <CitadelsCardBack kind="district" />
              抽牌
            </button>
          </>
        )}
        {turn.actionTaken && picked && (
          <button type="button" className="btn btn-primary" disabled={blocker !== null} onClick={() => act({ type: 'build', card: picked })}>
            建造{districtOf(picked).name}
          </button>
        )}
        {!turn.powerUsed && turn.character === 'assassin' && (
          <button type="button" className="btn btn-danger" onClick={() => start('murder')}>
            刺杀
          </button>
        )}
        {!turn.powerUsed && turn.character === 'thief' && (
          <button type="button" className="btn btn-danger" onClick={() => start('rob')}>
            偷窃
          </button>
        )}
        {!turn.powerUsed && turn.character === 'magician' && (
          <>
            <button type="button" className="btn btn-ghost" onClick={() => start('swap')}>
              交换手牌
            </button>
            <button type="button" className="btn btn-ghost" disabled={me.hand.length === 0} onClick={() => start('redraw')}>
              弃牌重抽
            </button>
          </>
        )}
        {who.income && !turn.incomeTaken && (
          <button type="button" className="btn btn-ghost" disabled={income === 0} onClick={() => act({ type: 'income' })}>
            收城区收入 +{income}
          </button>
        )}
        {!turn.powerUsed && turn.character === 'warlord' && turn.actionTaken && (
          <button type="button" className="btn btn-danger" onClick={() => start('destroy')}>
            摧毁城区
          </button>
        )}
        {owned('laboratory') && !turn.labUsed && (
          <button type="button" className="btn btn-ghost" disabled={me.hand.length === 0} onClick={() => start('lab')}>
            实验室
          </button>
        )}
        {owned('smithy') && !turn.smithyUsed && (
          <button type="button" className="btn btn-ghost" disabled={myGold < 2} onClick={() => act({ type: 'smithy' })}>
            铁匠铺：2 金换 3 牌
          </button>
        )}
        {turn.actionTaken && (
          <button type="button" className="btn btn-ghost" onClick={() => act({ type: 'end_turn' })}>
            结束回合
          </button>
        )}
      </>
    );
  }

  const handPickable = mode === 'redraw' || mode === 'lab';

  return (
    <main className={`board ct-board${themeClass}`}>
      <header className="room-bar">
        <button type="button" className="link" onClick={net.leaveRoom}>
          离开
        </button>
        <div className="room-code">
          <span>房间号</span>
          <strong>{room.code}</strong>
        </div>
        <div className="room-bar-actions">
          {pigTheme && <span className="ct-pig-room-mark" aria-hidden="true">🐷</span>}
          <span className={`ct-round ${view.finalRound ? 'is-final' : ''}`}>{view.finalRound ? '最后一轮' : `第 ${view.round} 轮`}</span>
          <CitadelsCardStylePicker />
          <button type="button" className="btn btn-ghost btn-small" onClick={() => setShowLog(true)}>
            记录
          </button>
        </div>
      </header>

      <LayoutGroup>
        <div className="ct-rivals" data-count={rivals.length}>
          {rivals.map((id) => (
            <PlayerPanel
              key={id}
              player={playerOf(id)}
              view={view}
              isMe={false}
              onPickPlayer={mode === 'swap' ? () => setPlayerSel(id) : undefined}
              pickedPlayer={playerSel === id}
              costOf={costOf(id)}
              pickedCard={target?.player === id ? target.card : null}
              onCard={onCityCard(id)}
            />
          ))}
        </div>

        <div className="ct-stage">
          <Track view={view} nameOf={nameOf} />
          <Announcer view={view} nameOf={nameOf} />
        </div>

        <div className="ct-me">
          {me && (
            <PlayerPanel
              player={playerOf(me.id)}
              view={view}
              isMe
              mine={me.characters}
              costOf={costOf(me.id)}
              pickedCard={target?.player === me.id ? target.card : null}
              onCard={onCityCard(me.id)}
            />
          )}

          {drafting ? (
            <DraftPicker view={view} />
          ) : (
            <>
              {me && !body && (
                <div className={`ct-hand ${handPickable ? 'is-picking' : ''}`} aria-label="你的手牌">
                  <AnimatePresence initial={false}>
                    {me.hand.map((card) => {
                      const selected = handSel.includes(card);
                      const ready = !handPickable && canBuild(card) === null;
                      return (
                        <motion.button
                          key={card}
                          type="button"
                          layout
                          className={`hand-card ${selected ? 'is-selected' : ''} ${ready ? 'is-ready' : ''}`}
                          aria-pressed={selected}
                          onClick={() => onHandCard(card)}
                          initial={{ opacity: 0, y: 50, rotate: 8 }}
                          animate={{ opacity: 1, y: selected ? -14 : 0, rotate: 0 }}
                          exit={{ opacity: 0, y: -60, scale: 0.7 }}
                          transition={{ type: 'spring', stiffness: 300, damping: 24 }}
                        >
                          <DistrictCard card={card} />
                          {selected && !handPickable && (
                            <span
                              className="hand-info"
                              onClick={(e) => {
                                e.stopPropagation();
                                setInspect(card);
                              }}
                            >
                              说明
                            </span>
                          )}
                        </motion.button>
                      );
                    })}
                  </AnimatePresence>
                  {me.hand.length === 0 && <p className="ct-hand-empty">手里没有牌了。回合里选择「抽牌」来补充。</p>}
                </div>
              )}

              <div className={`ct-actions ${myTurn || (view.pendingGraveyard?.owner === me?.id) ? 'is-mine' : ''}`}>
                <div className="ct-actions-text">
                  <p className="dock-prompt" aria-live="polite">
                    {prompt}
                  </p>
                  {hint && <p className="dock-hint">{hint}</p>}
                </div>
                {body}
                {buttons && <div className="ct-buttons">{buttons}</div>}
              </div>
            </>
          )}
        </div>
      </LayoutGroup>

      <AnimatePresence>
        {inspect && <Inspect key="inspect" card={inspect} onClose={() => setInspect(null)} />}
        {showLog && (
          <motion.div key="log" className="drawer-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowLog(false)}>
            <motion.aside
              className="drawer"
              role="dialog"
              aria-label="对局记录"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', stiffness: 300, damping: 34 }}
              onClick={(e) => e.stopPropagation()}
            >
              <header className="drawer-head">
                <h2>对局记录</h2>
                <button type="button" className="btn btn-ghost btn-small" onClick={() => setShowLog(false)}>
                  关闭
                </button>
              </header>
              <p className="dock-hint">
                牌堆还剩 {view.deckCount} 张。最新的在最上面。
              </p>
              <ol className="ct-log">
                {[...view.log].reverse().map((e) => (
                  <li key={e.seq} className={e.t === 'round' ? 'is-round' : ''}>
                    {describe(e, nameOf)}
                  </li>
                ))}
              </ol>
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}

/** 放大看一张城区牌 */
function Inspect({ card, onClose }: { card: string; onClose: () => void }) {
  const def = districtOf(card);
  return (
    <motion.div className="overlay" role="dialog" aria-modal="true" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <div className="overlay-body">
        <motion.div className="role-card-big" initial={{ scale: 0.7, rotate: -6 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 200, damping: 18 }}>
          <DistrictCard card={card} />
        </motion.div>
        <div className="overlay-text">
          <p className="overlay-title">
            {def.name}，{TYPE_NAMES[def.type]}城区
          </p>
          <p>
            造价 {def.cost} <Coin className="inline-coin" />
            {def.text ? `。${def.text}` : `，终局计 ${Citadels.districtScore(card)} 分。`}
          </p>
          <button type="button" className="btn btn-ghost btn-small" onClick={onClose}>
            收起
          </button>
        </div>
      </div>
    </motion.div>
  );
}
