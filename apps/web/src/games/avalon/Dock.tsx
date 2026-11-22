import { motion } from 'framer-motion';
import { Avalon } from '@tabletop/shared';
import { net } from '../../net/client';
import { QuestCard, VoteToken } from './art';

type View = Avalon.AvalonView;

/**
 * 屏幕底部的行动区：轮到你时给出可以做的事，否则说明大家在等谁。
 * 选人（组队 / 湖中仙女 / 刺杀）是在牌桌上点座位完成的，这里只负责确认。
 */
export function Dock({
  view,
  nameOf,
  picked,
}: {
  view: View;
  nameOf: (id: string) => string;
  /** 湖中仙女 / 刺杀时在桌上选中的目标 */
  picked: string | null;
}) {
  const me = view.me;
  const n = view.players.length;
  const size = view.questSizes[view.questIndex]!;
  const questNo = view.questIndex + 1;
  const names = (ids: string[]) => ids.map(nameOf).join('、');
  const send = (action: Avalon.AvalonAction) => net.act(action);

  if (!me) return <DockShell prompt="你正在旁观这一局" />;

  switch (view.phase) {
    case 'team': {
      if (view.leader !== me.id) {
        return <DockShell prompt={`${nameOf(view.leader)} 是队长，正在为第 ${questNo} 次任务挑选 ${size} 名队员`} waiting />;
      }
      const ready = view.team.length === size;
      return (
        <DockShell
          prompt={`你是队长。在桌上点选 ${size} 名队员出第 ${questNo} 次任务`}
          hint={`已选 ${view.team.length} / ${size}${view.rejectCount === 4 ? '。这是本轮最后一次组队，再被否决邪恶方直接获胜' : ''}`}
        >
          <button type="button" className="btn btn-primary" disabled={!ready} onClick={() => send({ type: 'propose_team', team: view.team })}>
            就这支队伍
          </button>
        </DockShell>
      );
    }

    case 'vote': {
      const last = view.rejectCount === 4 ? '这是本轮最后一次组队，再被否决邪恶方直接获胜。' : '';
      if (me.myVote !== null) {
        return (
          <DockShell prompt={`你投了${me.myVote ? '赞成' : '反对'}。等其他人表态`} hint={`${view.voted.length} / ${n} 人已投票`} waiting>
            <div className="dock-mine">
              <VoteToken approve={me.myVote} />
            </div>
          </DockShell>
        );
      }
      return (
        <DockShell prompt={`${nameOf(view.leader)} 提议由 ${names(view.team)} 出任务。你同意吗？`} hint={`${last}所有人投完后同时亮票`}>
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
      const progress = `${view.played.length} / ${view.team.length} 人已出牌`;
      if (!view.team.includes(me.id)) {
        return <DockShell prompt={`${names(view.team)} 正在执行第 ${questNo} 次任务`} hint={progress} waiting />;
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
  children,
}: {
  prompt: string;
  hint?: string;
  waiting?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <motion.div
      // 文案变了就重新入场，提醒玩家局面有变化
      key={prompt}
      className={`dock-inner ${waiting ? 'dock-waiting' : 'dock-active'}`}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.2, 0.7, 0.2, 1] }}
    >
      <div className="dock-text">
        <p className="dock-prompt" aria-live="polite">
          {prompt}
          {waiting && <span className="dots" aria-hidden="true" />}
        </p>
        {hint && <p className="dock-hint">{hint}</p>}
      </div>
      {children && <div className="dock-actions">{children}</div>}
    </motion.div>
  );
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
