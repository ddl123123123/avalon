import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Avalon, type RoomSnapshot } from '@tabletop/shared';
import { net, useNet } from '../../net/client';
import { RoundTable } from '../../ui/RoundTable';
import { Dock } from './Dock';
import { EndScreen } from './EndScreen';
import { History } from './History';
import { AssassinReveal, LadyReveal, QuestReveal, RoleReveal } from './Reveals';
import { Seat, type SeatProps } from './Seat';
import { QuestRoundel } from './art';
import { CardLibrarySettings } from './CardLibrarySettings';
import { AvalonAssistant } from './Assistant';
import { Notebook } from './Notebook';
import { notebookStorageKey, readNotebook, saveNotebook } from './notebookData';

type View = Avalon.AvalonView;

/** 需要停下来给所有人看的时刻，按发生顺序排队播放。 */
type Reveal =
  | { kind: 'vote'; proposal: Avalon.ProposalRecord }
  | { kind: 'quest'; quest: Avalon.QuestRecord }
  | { kind: 'lady'; target: string; alignment: Avalon.Alignment }
  | { kind: 'assassin' };

const introKey = (room: RoomSnapshot) => `avalon.intro.${room.code}.${room.gameSeq}.${room.you}`;

function useReveals(room: RoomSnapshot, view: View) {
  const ladyCount = Object.keys(view.me?.ladyResults ?? {}).length;
  const snapshot = () => ({
    seq: room.gameSeq,
    proposals: view.proposals.length,
    quests: view.quests.length,
    lady: ladyCount,
    ended: view.phase === 'ended',
  });
  // 刷新页面或中途重连时，已经发生过的事不再重播
  const seen = useRef(snapshot());
  const [queue, setQueue] = useState<Reveal[]>([]);

  useEffect(() => {
    const s = seen.current;
    if (s.seq !== room.gameSeq) {
      seen.current = snapshot();
      setQueue([]);
      return;
    }
    const added: Reveal[] = [];
    while (s.proposals < view.proposals.length) added.push({ kind: 'vote', proposal: view.proposals[s.proposals++]! });
    while (s.quests < view.quests.length) added.push({ kind: 'quest', quest: view.quests[s.quests++]! });
    if (s.lady < ladyCount && view.lady) {
      const last = view.lady.inspections.filter((i) => i.by === view.me!.id).at(-1)!;
      added.push({ kind: 'lady', target: last.target, alignment: view.me!.ladyResults[last.target]! });
      s.lady = ladyCount;
    }
    if (!s.ended && view.phase === 'ended') {
      s.ended = true;
      if (view.assassinTarget) added.push({ kind: 'assassin' });
    }
    if (added.length) setQueue((q) => [...q, ...added]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, room.gameSeq]);

  const next = useCallback(() => setQueue((q) => q.slice(1)), []);
  // 还在排队等待翻牌的任务，结果先不要在任务轨上剧透
  const sealedFrom = Math.min(...queue.map((r) => (r.kind === 'quest' ? r.quest.questIndex : Infinity)), Infinity);
  return { current: queue[0] ?? null, next, sealedFrom };
}

export function AvalonBoard({ room }: { room: RoomSnapshot }) {
  return <AvalonBoardSession key={`${room.code}.${room.gameSeq}.${room.you}`} room={room} />;
}

function AvalonBoardSession({ room }: { room: RoomSnapshot }) {
  const { link } = useNet();
  const view = room.view as View;
  const me = view.me;
  const byId = new Map(room.players.map((p) => [p.id, p]));
  const nameOf = (id: string) => byId.get(id)?.name ?? '？';
  const seatNameOf = (id: string) => {
    const player = byId.get(id);
    return player ? `${player.seatIndex + 1} 号 · ${player.name}` : '未知玩家';
  };
  const dossierKey = notebookStorageKey(room);
  const [notebook, setNotebook] = useState(() => readNotebook(dossierKey));
  const [showNotebook, setShowNotebook] = useState(false);
  const [showAssistant, setShowAssistant] = useState(false);

  const { current: reveal, next, sealedFrom } = useReveals(room, view);
  const [intro, setIntro] = useState(() => me !== null && view.proposals.length === 0 && sessionStorage.getItem(introKey(room)) === null);
  const [showRole, setShowRole] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [preselectedTeam, setPreselectedTeam] = useState(true);
  const [leaderFirst, setLeaderFirst] = useState(true);
  const [direction, setDirection] = useState<'left' | 'right'>('left');
  const [, setClockTick] = useState(0);
  const speechDeadline = view.discussion?.deadline ?? null;

  useEffect(() => {
    if (speechDeadline === null) return;
    setClockTick(Date.now());
    const interval = window.setInterval(() => setClockTick(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [speechDeadline]);

  useEffect(() => {
    if (speechDeadline === null || link !== 'online') return;
    let timer = 0;
    const requestTimeout = () => {
      net.act({ type: 'timeout_speech' } satisfies Avalon.AvalonAction);
      timer = window.setTimeout(requestTimeout, 900);
    };
    timer = window.setTimeout(requestTimeout, Math.max(0, speechDeadline - Date.now()) + 250);
    return () => window.clearTimeout(timer);
  }, [speechDeadline, link]);

  useEffect(() => {
    if (!view.discussionComplete) {
      setPreselectedTeam(true);
      setLeaderFirst(true);
      setDirection('left');
    }
  }, [view.discussionComplete, view.leader, view.questIndex, view.rejectCount]);

  useEffect(() => saveNotebook(dossierKey, notebook), [dossierKey, notebook]);

  useEffect(() => setPicked(null), [view.phase, view.questIndex]);
  useEffect(() => {
    if (me && view.proposals.length === 0 && sessionStorage.getItem(introKey(room)) === null) setIntro(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.gameSeq]);
  const closeIntro = () => {
    sessionStorage.setItem(introKey(room), '1');
    setIntro(false);
  };

  // 亮票停留几秒后自动继续
  useEffect(() => {
    if (reveal?.kind !== 'vote') return;
    const t = setTimeout(next, 2200 + view.players.length * 110);
    return () => clearTimeout(t);
  }, [reveal, next, view.players.length]);

  const voteReveal = reveal?.kind === 'vote' ? reveal.proposal : null;
  const busy = reveal !== null || intro;
  const ended = view.phase === 'ended';
  const speechSecondsRemaining = speechDeadline === null ? 0 : Math.max(0, Math.ceil((speechDeadline - Date.now()) / 1000));

  // 亮票期间牌桌停留在被表决的那支队伍上
  const shownTeam = voteReveal ? voteReveal.team : view.phase === 'lady' || view.phase === 'assassin' ? [] : view.team;
  const showPublicPreselection = view.team.length > 0 && (
    (view.phase === 'team' && !view.discussionComplete) ||
    (view.phase === 'discussion' && view.discussion?.preselectedTeam)
  );
  const publicPreselection = showPublicPreselection
    ? view.team.map((id) => (byId.get(id)?.seatIndex ?? view.players.indexOf(id)) + 1).join('、')
    : null;
  const shownLeader = voteReveal ? voteReveal.leader : view.leader;
  const size = view.questSizes[view.questIndex]!;
  const iLead = me?.id === view.leader;

  const pickableIds = new Set<string>();
  if (!busy && me) {
    if (view.phase === 'team' && iLead && (view.discussionComplete || preselectedTeam)) view.players.forEach((id) => pickableIds.add(id));
    if (view.phase === 'lady' && view.lady?.holder === me.id) {
      view.players.filter((id) => !view.lady!.pastHolders.includes(id)).forEach((id) => pickableIds.add(id));
    }
    if (view.phase === 'assassin' && view.assassin === me.id) {
      view.players.filter((id) => id !== me.id && me.sightings[id] !== 'evil').forEach((id) => pickableIds.add(id));
    }
  }

  const onPick = (id: string) => {
    if (view.phase === 'team') {
      const team = view.team.includes(id) ? view.team.filter((x) => x !== id) : [...view.team, id];
      if (team.length <= size) net.act({ type: 'draft_team', team } satisfies Avalon.AvalonAction);
      return;
    }
    setPicked((cur) => (cur === id ? null : id));
  };

  const noteFor = (id: string): SeatProps['note'] => {
    if (!me || id === me.id) return null;
    const lady = me.ladyResults[id];
    if (lady) return { text: lady === 'good' ? '查验为正义方' : '查验为邪恶方', tone: lady };
    const sight = me.sightings[id];
    if (sight === 'evil') return { text: me.role === 'merlin' ? '邪恶方' : '同伴', tone: 'evil' };
    if (sight === 'merlin') return { text: Object.keys(me.sightings).length > 1 ? '梅林或莫甘娜' : '梅林', tone: 'good' };
    return null;
  };

  const status = (): string => {
    if (voteReveal) return '';
    switch (view.phase) {
      case 'team':
        return `${nameOf(view.leader)} 正在组队`;
      case 'vote':
        return `投票中 ${view.voted.length} / ${view.players.length}`;
      case 'quest':
        return `任务进行中 ${view.played.length} / ${view.team.length}`;
      case 'lady':
        return '湖中仙女';
      case 'assassin':
        return '刺客在寻找梅林';
      default:
        return '';
    }
  };

  const approvals = voteReveal ? Object.values(voteReveal.votes).filter(Boolean).length : 0;

  return (
    <main className={`board av-board ${ended && !reveal ? 'board-ended' : ''}`}>
      <header className="room-bar">
        <button type="button" className="link" onClick={net.leaveRoom}>
          离开
        </button>
        <div className="room-code">
          <span>房间号</span>
          <strong>{room.code}</strong>
        </div>
        <div className="room-bar-actions">
          <details className="role-card-settings">
            <summary className="btn btn-ghost btn-small" aria-label="角色卡牌库设置" title="角色卡牌库设置">卡牌</summary>
            <CardLibrarySettings compact />
          </details>
          <button type="button" className="btn btn-ghost btn-small" onClick={() => setShowNotebook(true)}>
            笔记
          </button>
          <button type="button" className="btn btn-ghost btn-small" onClick={() => setShowHistory(true)}>
            任务记录
          </button>
          <button type="button" className="btn btn-ghost btn-small" onClick={() => setShowAssistant(true)}>
            AI 助手
          </button>
          {me && !ended && (
            <button type="button" className="btn btn-ghost btn-small" onClick={() => setShowRole(true)}>
              我的身份
            </button>
          )}
        </div>
      </header>

      {ended && !reveal ? (
        <EndScreen room={room} view={view} onHistory={() => setShowHistory(true)} />
      ) : (
        <>
          <div className="board-table">
            <LayoutGroup>
              <RoundTable
                className="av-playfield"
                seats={view.players}
                meIndex={me ? view.players.indexOf(me.id) : 0}
                seatKey={(id) => id}
                center={
                  <section className="av-match-panel" aria-label="对局信息">
                    <div className="av-match-progress">
                      <h2>任务进度</h2>
                      <div className="quest-track" role="list" aria-label="五次任务">
                        {view.questSizes.map((questSize, i) => {
                          const done = view.quests.find((q) => q.questIndex === i);
                          // 翻牌动画还没播完时，圆章先不亮结果
                          const hidden = i >= sealedFrom;
                          const state = done && !hidden ? (done.success ? 'success' : 'fail') : i === view.questIndex && !ended ? 'current' : 'pending';
                          const label = { success: '成功', fail: '失败', current: '当前任务', pending: '未开始' }[state];
                          return (
                            <div key={i} className={`quest-slot quest-slot-${state}`} role="listitem" aria-label={`第 ${i + 1} 次任务，${questSize} 人，${label}`}>
                              <QuestRoundel state={state} size={questSize} twoFails={view.failsRequired[i] === 2} />
                            </div>
                          );
                        })}
                      </div>
                      {view.failsRequired[view.questIndex] === 2 && (
                        <p className="av-match-rule">本次任务需两张失败牌才算失败</p>
                      )}
                    </div>
                    <AnimatePresence mode="wait">
                      {voteReveal ? (
                        <motion.div
                          key="verdict"
                          className={`verdict ${voteReveal.approved ? 'verdict-yes' : 'verdict-no'}`}
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0 }}
                          transition={{ delay: 0.5 + view.players.length * 0.11, duration: 0.22 }}
                        >
                          <strong>{voteReveal.approved ? '组队通过' : '组队被否决'}</strong>
                          <span>
                            赞成 {approvals}，反对 {view.players.length - approvals}
                          </span>
                          <span>{voteReveal.team.map(seatNameOf).join('、')}</span>
                        </motion.div>
                      ) : (
                        <motion.div key="status" className="center-info" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                          <div className="reject-track" aria-label={`本轮已否决 ${view.rejectCount} 次，满 5 次邪恶方获胜`}>
                            {Array.from({ length: Avalon.MAX_REJECTS }, (_, i) => (
                              <span key={i} className={`reject-pip ${i < view.rejectCount ? 'is-used' : ''} ${i === 4 ? 'is-last' : ''}`} />
                            ))}
                            <span className="reject-label">否决 {view.rejectCount} / 5</span>
                          </div>
                          {view.discussion && (
                            <div className="speech-status">
                              <div className="speech-status-main" role="status">
                                <span className="speech-seat-number">{(byId.get(view.discussion.currentSpeaker)?.seatIndex ?? view.players.indexOf(view.discussion.currentSpeaker)) + 1}</span>
                                <span>号玩家发言</span>
                              </div>
                              <strong className="speech-countdown">
                                {Math.floor(speechSecondsRemaining / 60)}:{String(speechSecondsRemaining % 60).padStart(2, '0')}
                              </strong>
                              <small className="speech-progress">
                                第 {view.discussion.currentIndex + 1} / {view.discussion.order.length} 位 · 从队长{view.discussion.direction === 'left' ? '左' : '右'}手边开始
                              </small>
                            </div>
                          )}
                          {!view.discussion && <p className="center-status" role="status">{status()}</p>}
                          {publicPreselection && (
                            <p className="public-preselected-team" aria-live="polite">
                              公开预组车 · {publicPreselection} 号
                            </p>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </section>
                }
                renderSeat={(id, i) => (
                  <Seat
                    player={byId.get(id) ?? { id, name: '？', connected: false, isBot: false, seatIndex: i }}
                    seatNumber={(byId.get(id)?.seatIndex ?? i) + 1}
                    guess={notebook.guesses[id] ? Avalon.ROLES[notebook.guesses[id]!].name : null}
                    isMe={id === me?.id}
                    isLeader={id === shownLeader}
                    isSpeaking={view.discussion?.currentSpeaker === id}
                    onTeam={shownTeam.includes(id)}
                    hasLady={view.lady?.holder === id}
                    acted={!voteReveal && (view.voted.includes(id) || view.played.includes(id))}
                    vote={voteReveal ? voteReveal.votes[id]! : null}
                    order={i}
                    note={noteFor(id)}
                    pickable={pickableIds.has(id)}
                    picked={picked === id}
                    onPick={() => onPick(id)}
                  />
                )}
              />
            </LayoutGroup>
          </div>

          <footer className="dock">
            {busy ? (
              <div className="dock-inner dock-waiting">
                {voteReveal && (
                  <p className="dock-hint">亮票结束后自动继续</p>
                )}
              </div>
            ) : (
              <Dock
                view={view}
                nameOf={seatNameOf}
                picked={picked}
                preselectedTeam={preselectedTeam}
                onPreselectedTeamChange={(value) => {
                  setPreselectedTeam(value);
                  if (!value && view.team.length) net.act({ type: 'draft_team', team: [] } satisfies Avalon.AvalonAction);
                }}
                leaderFirst={leaderFirst}
                onLeaderFirstChange={setLeaderFirst}
                direction={direction}
                onDirectionChange={setDirection}
                speechSecondsRemaining={speechSecondsRemaining}
              />
            )}
          </footer>
        </>
      )}

      <AnimatePresence>
        {intro && me && <RoleReveal key="intro" me={me} players={room.players} nameOf={nameOf} intro onClose={closeIntro} />}
        {!intro && showRole && me && <RoleReveal key="role" me={me} players={room.players} nameOf={nameOf} intro={false} onClose={() => setShowRole(false)} />}
        {!intro && reveal?.kind === 'quest' && (
          <QuestReveal
            key={`quest-${reveal.quest.questIndex}`}
            quest={reveal.quest}
            required={view.failsRequired[reveal.quest.questIndex]!}
            onDone={next}
          />
        )}
        {!intro && reveal?.kind === 'lady' && byId.get(reveal.target) && (
          <LadyReveal key={`lady-${reveal.target}`} target={byId.get(reveal.target)!} alignment={reveal.alignment} onDone={next} />
        )}
        {!intro && reveal?.kind === 'assassin' && view.roles && view.assassin && view.assassinTarget && (
          <AssassinReveal
            key="assassin"
            assassin={byId.get(view.assassin)!}
            target={byId.get(view.assassinTarget)!}
            targetRole={view.roles[view.assassinTarget]!}
            onDone={next}
          />
        )}
        {showHistory && <History key="history" view={view} nameOf={seatNameOf} onClose={() => setShowHistory(false)} />}
        {showAssistant && me && (
          <AvalonAssistant
            key={`assistant-${room.gameSeq}`}
            room={room}
            view={view}
            notebook={notebook}
            onClose={() => setShowAssistant(false)}
          />
        )}
        {showNotebook && (
          <Notebook
            key="notebook"
            players={room.players}
            you={room.you}
            roleSet={view.roleSet}
            notebook={notebook}
            onChange={setNotebook}
            onClose={() => setShowNotebook(false)}
          />
        )}
      </AnimatePresence>
    </main>
  );
}
