import { motion } from 'framer-motion';
import { useId, useState, type ReactNode } from 'react';
import { Avalon, type RoomPlayer } from '@tabletop/shared';
import { net } from '../../net/client';
import { TeamRoster } from './SeatIdentity';
import { QuestCard, VoteToken } from './art';

type View = Avalon.AvalonView;

/**
 * 屏幕底部的行动区：轮到你时给出可以做的事，否则说明大家在等谁。
 * 选人（组队 / 湖中仙女 / 刺杀）是在牌桌上点座位完成的，这里只负责确认。
 */
export function Dock({
  view,
  isHost,
  players,
  nameOf,
  picked,
  preselectedTeam,
  onPreselectedTeamChange,
  leaderFirst,
  onLeaderFirstChange,
  direction,
  onDirectionChange,
  speechSecondsRemaining,
}: {
  view: View;
  isHost: boolean;
  players: RoomPlayer[];
  nameOf: (id: string | null) => string;
  /** 湖中仙女 / 刺杀时在桌上选中的目标 */
  picked: string | null;
  preselectedTeam: boolean;
  onPreselectedTeamChange: (value: boolean) => void;
  leaderFirst: boolean;
  onLeaderFirstChange: (value: boolean) => void;
  direction: 'left' | 'right';
  onDirectionChange: (value: 'left' | 'right') => void;
  speechSecondsRemaining: number;
}) {
  const me = view.me;
  const n = view.players.length;
  const size = view.questSizes[view.questIndex]!;
  const questNo = view.questIndex + 1;
  const send = (action: Avalon.AvalonAction) => net.act(action);

  if (!me) return <DockShell prompt="你正在旁观这一局" />;

  switch (view.phase) {
    case 'identity':
      return <DockShell prompt="等待全员确认身份" hint="首任车头随机抽取，之后按座位顺时针轮换" waiting />;
    case 'team': {
      const roster = <TeamRoster players={players} team={view.team} label="候选队伍" size={size} />;
      if (view.speechMode === 'manual') {
        const botLeads = players.some(({ id, isBot }) => id === view.leader && isBot);
        if (botLeads && isHost) {
          return (
            <DockShell prompt={view.discussionComplete ? '机器人正在选队伍' : `${nameOf(view.leader)} 是车头`} waiting={view.discussionComplete}>
              {!view.discussionComplete && (
                <button type="button" className="btn btn-primary" onClick={() => send({
                  type: 'request_bot_proposal', questIndex: view.questIndex, rejectCount: view.rejectCount,
                })}>让机器人组队</button>
              )}
            </DockShell>
          );
        }
        if (view.leader !== me.id) return <DockShell prompt={`等 ${nameOf(view.leader)} 提交队伍`} roster={view.team.length ? roster : undefined} />;
        return (
          <DockShell prompt={`第 ${questNo} 次任务 · 点座位选 ${size} 人`} roster={view.team.length ? roster : undefined}
            hint={view.rejectCount === Avalon.MAX_REJECTS - 1 ? '这是本轮最后一次组队，再被否决邪恶方直接获胜' : undefined}>
            <button type="button" className="btn btn-primary" disabled={view.team.length !== size} onClick={() => send({ type: 'propose_team', team: view.team })}>
              提交队伍并投票
            </button>
          </DockShell>
        );
      }
      if (view.leader !== me.id) {
        return (
          <DockShell
            prompt={view.discussionComplete ? `${nameOf(view.leader)} 是队长，正在确定第 ${questNo} 次任务队伍` : `${nameOf(view.leader)} 是队长，正在设置预选队伍和发言顺序`}
            roster={roster}
            waiting
          />
        );
      }
      if (!view.discussionComplete) {
        const readyToTalk = !preselectedTeam || view.team.length === size;
        return (
          <DockShell
            key={`setup-${questNo}-${view.rejectCount}`}
            prompt={`第 ${questNo} 次任务 · 先设置讨论顺序`}
            hint={`${preselectedTeam ? `在桌上选满 ${size} 人，预选名单对全桌公开。` : '讨论结束后再选队伍。'}${view.options.speechSeconds === 0 ? '每人发言不计时。' : `每人${view.speechMode === 'text' ? '文字' : ''}发言限时 ${view.options.speechSeconds} 秒。`}`}
            stacked
            compactLabel="讨论设置"
            roster={preselectedTeam ? roster : undefined}
          >
            <div className="speech-setup">
              <SetupGroup label="预选任务队伍">
                <SetupChoice selected={preselectedTeam} onClick={() => onPreselectedTeamChange(true)}>先亮预选车</SetupChoice>
                <SetupChoice selected={!preselectedTeam} onClick={() => onPreselectedTeamChange(false)}>讨论后再选</SetupChoice>
              </SetupGroup>
              <SetupGroup label="队长发言位置">
                <SetupChoice selected={leaderFirst} onClick={() => onLeaderFirstChange(true)}>我先发言</SetupChoice>
                <SetupChoice selected={!leaderFirst} onClick={() => onLeaderFirstChange(false)}>我最后发言</SetupChoice>
              </SetupGroup>
              <SetupGroup label="从哪一侧开始">
                <SetupChoice selected={direction === 'left'} onClick={() => onDirectionChange('left')}>我的左手边</SetupChoice>
                <SetupChoice selected={direction === 'right'} onClick={() => onDirectionChange('right')}>我的右手边</SetupChoice>
              </SetupGroup>
            </div>
            <button
              type="button"
              className="btn btn-primary speech-setup-submit"
              disabled={!readyToTalk}
              onClick={() => send({ type: 'start_discussion', preselectedTeam, leaderFirst, direction })}
            >
              开始按顺序发言
            </button>
          </DockShell>
        );
      }
      const ready = view.team.length === size;
      return (
        <DockShell
          prompt={`讨论结束。你是队长，确认第 ${questNo} 次任务队伍`}
          hint={view.rejectCount === Avalon.MAX_REJECTS - 1 ? '这是本轮最后一次组队，再被否决邪恶方直接获胜' : undefined}
          roster={roster}
        >
          <button type="button" className="btn btn-primary" disabled={!ready} onClick={() => send({ type: 'propose_team', team: view.team })}>
            就这支队伍
          </button>
        </DockShell>
      );
    }

    case 'discussion': {
      const discussion = view.discussion!;
      const speaker = discussion.currentSpeaker;
      const player = players.find(({ id }) => id === speaker);
      const speakerNumber = (player?.seatIndex ?? view.players.indexOf(speaker)) + 1;
      const timer = player?.isBot ? '正在准备' : discussion.timerSeconds === 0 ? '不计时' : formatTimer(speechSecondsRemaining);
      const current = speaker === me.id;
      return (
        <DockShell
          prompt={current ? (view.speechMode === 'text' ? '现在轮到你打字发言' : '现在轮到你发言') : `现在由 ${speakerNumber} 号玩家发言`}
          hint={`第 ${discussion.currentIndex + 1} / ${discussion.order.length} 位 · ${timer} · ${nameOf(speaker)}`}
          roster={view.team.length ? <TeamRoster players={players} team={view.team} label="预选队伍" /> : undefined}
          waiting={!current}
        >
          {view.speechMode === 'voice' && current && (
            <button type="button" className="btn btn-primary speech-finish" onClick={() => send({ type: 'finish_speech' })}>
              我说完了
            </button>
          )}
        </DockShell>
      );
    }

    case 'vote': {
      const last = view.rejectCount === Avalon.MAX_REJECTS - 1 ? '这是本轮最后一次组队，再被否决邪恶方直接获胜。' : '';
      const revealHint = view.options.voteVisibility === 'totals' ? '所有人投完后只公布赞成和反对票数' : '所有人投完后同时亮票';
      const roster = <TeamRoster players={players} team={view.team} label="提议队伍" />;
      if (me.myVote !== null) {
        return (
          <DockShell prompt={`你投了${me.myVote ? '赞成' : '反对'}。等其他人表态`} hint={`${view.votedCount} / ${n} 人已投票`} roster={roster} waiting>
            <div className="dock-mine">
              <VoteToken approve={me.myVote} />
            </div>
          </DockShell>
        );
      }
      return (
        <DockShell prompt={`你同意 ${nameOf(view.leader)} 提出的队伍吗？`} hint={`${last}${revealHint}`} roster={roster}>
          <div className="dock-choices">
            <ChoiceButton label="赞成" onClick={() => send({ type: 'vote', approve: true })}>
              <VoteToken approve />
            </ChoiceButton>
            <ChoiceButton label="反对" onClick={() => send({ type: 'vote', approve: false })}>
              <VoteToken approve={false} />
            </ChoiceButton>
          </div>
        </DockShell>
      );
    }

    case 'quest': {
      const progress = `${view.played.length} / ${view.team.length} 人已出牌 · 出齐后自动翻牌`;
      if (!view.team.includes(me.id)) {
        return <DockShell prompt={`正在执行第 ${questNo} 次任务`} hint={progress} roster={<TeamRoster players={players} team={view.team} label="任务队伍" />} waiting />;
      }
      if (me.myQuestCard !== null) {
        return <DockShell prompt="你的牌已经盖下。等队友出牌" hint={progress} waiting />;
      }
      const good = me.alignment === 'good';
      return (
        <DockShell prompt="你在队伍里。暗中出一张任务牌" hint={good ? '正义方只能出成功' : '没人知道哪张牌是谁出的'}>
          <div className="dock-choices">
            <ChoiceButton label="出成功" card onClick={() => send({ type: 'quest', success: true })}>
              <QuestCard success />
            </ChoiceButton>
            <ChoiceButton label="出失败" card disabled={good} onClick={() => send({ type: 'quest', success: false })}>
              <QuestCard success={false} />
            </ChoiceButton>
          </div>
        </DockShell>
      );
    }

    case 'lady': {
      const holder = view.lady!.holder;
      if (holder !== me.id) {
        return <DockShell prompt={`湖中仙女在 ${nameOf(holder)} 手上，正在挑选查验对象`} waiting />;
      }
      return (
        <DockShell prompt="湖中仙女在你手上。在桌上点选一名玩家，查验 TA 的阵营" hint="持有过湖中仙女的人不能再被查验">
          <button type="button" className="btn btn-primary" disabled={!picked} onClick={() => picked && send({ type: 'lady', target: picked })}>
            {picked ? `查验 ${nameOf(picked)}` : '先选一个人'}
          </button>
        </DockShell>
      );
    }

    case 'assassin': {
      const assassin = view.assassin!;
      if (assassin !== me.id) {
        return (
          <DockShell
            prompt={`正义方完成了三次任务。刺客 ${nameOf(assassin)} 正在寻找梅林`}
            hint={me.alignment === 'evil' ? '把你的判断告诉刺客' : '别让刺客看出谁是梅林'}
            waiting
          />
        );
      }
      return (
        <DockShell prompt="正义方完成了三次任务。在桌上指认梅林，刺中就能翻盘" hint="和同伴商量好再动手，只有一次机会">
          <button
            type="button"
            className="btn btn-danger"
            disabled={!picked}
            onClick={() => picked && send({ type: 'assassinate', target: picked })}
          >
            {picked ? `刺杀 ${nameOf(picked)}` : '先选一个人'}
          </button>
        </DockShell>
      );
    }

    default:
      return null;
  }
}

function DockShell({
  prompt,
  hint,
  waiting = false,
  stacked = false,
  compactLabel,
  roster,
  children,
}: {
  prompt: string;
  hint?: string;
  waiting?: boolean;
  stacked?: boolean;
  compactLabel?: string;
  roster?: ReactNode;
  children?: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const actionsId = useId();
  return (
    <motion.div
      // 文案变了就重新入场，提醒玩家局面有变化
      key={prompt}
      className={`dock-inner ${waiting ? 'dock-waiting' : 'dock-active'} ${stacked ? 'dock-inner-stacked' : ''} ${expanded ? 'dock-expanded' : ''}`}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.2, 0.7, 0.2, 1] }}
    >
      {compactLabel && (
        <button type="button" className="btn btn-primary av-dock-toggle" aria-expanded={expanded} aria-controls={actionsId} onClick={() => setExpanded((open) => !open)}>
          {expanded ? '收起讨论设置' : compactLabel}
        </button>
      )}
      <div className="dock-text">
        <p className="dock-prompt" aria-live="polite">
          {prompt}
          {waiting && <span className="dots" aria-hidden="true" />}
        </p>
        {hint && <p className="dock-hint">{hint}</p>}
        {!compactLabel && roster}
      </div>
      {compactLabel && roster}
      {children && <div id={actionsId} className="dock-actions">{children}</div>}
    </motion.div>
  );
}

function SetupGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="speech-setup-group">
      <span>{label}</span>
      <div className="speech-setup-options" role="group" aria-label={label}>{children}</div>
    </div>
  );
}

function SetupChoice({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" className="speech-setup-choice" aria-pressed={selected} onClick={onClick}>
      {children}
    </button>
  );
}

function formatTimer(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function ChoiceButton({
  label,
  card = false,
  disabled = false,
  onClick,
  children,
}: {
  label: string;
  card?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <motion.button
      type="button"
      className={`choice ${card ? 'choice-card' : 'choice-token'}`}
      disabled={disabled}
      onClick={onClick}
      whileHover={disabled ? undefined : { y: -6, scale: 1.05 }}
      whileTap={disabled ? undefined : { scale: 0.94 }}
      transition={{ type: 'spring', stiffness: 400, damping: 20 }}
    >
      {children}
      <span className="choice-label">{label}</span>
    </motion.button>
  );
}
