import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Avalon, type AvalonAssistantFeature, type RoomSnapshot } from '@tabletop/shared';
import { net, useNet } from '../../net/client';
import type { AvalonNotebookData } from './notebookData';

const FEATURES: Array<{ id: AvalonAssistantFeature; title: string; description: string }> = [
  { id: 'team-comparison', title: '队伍对比', description: '结合当前候选队伍、历轮任务和投票记录梳理风险与支持证据。' },
  { id: 'role-coach', title: '角色教练', description: '根据你的身份、已知线索和当前阶段，给出下一步思路。' },
  { id: 'speech-prep', title: '发言准备', description: '整理一条事实、一条推断和一个适合拿到桌面讨论的问题。' },
  { id: 'rules-qa', title: '规则问答', description: '用自然语言询问角色能力、任务、投票或湖中仙女规则。' },
  { id: 'post-game-review', title: '赛后复盘', description: '对局结束后回顾转折点、关键选择和可改进之处。' },
];

export function AvalonAssistant({
  room,
  view,
  notebook,
  onClose,
}: {
  room: RoomSnapshot;
  view: Avalon.AvalonView;
  notebook: AvalonNotebookData;
  onClose: () => void;
}) {
  const { assistantResult, assistantError } = useNet();
  const [feature, setFeature] = useState<AvalonAssistantFeature>('role-coach');
  const [question, setQuestion] = useState('');
  const [pending, setPending] = useState<{ id: string; feature: AvalonAssistantFeature } | null>(null);
  const [answer, setAnswer] = useState<{ feature: AvalonAssistantFeature; content: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selected = FEATURES.find((item) => item.id === feature)!;
  const featureReady = feature === 'team-comparison'
    ? view.team.length > 0
    : feature === 'post-game-review'
      ? view.phase === 'ended'
      : true;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (pending && assistantResult?.requestId === pending.id) {
      setAnswer({ feature: pending.feature, content: assistantResult.content });
      setPending(null);
    }
  }, [assistantResult, pending]);

  useEffect(() => {
    if (pending && assistantError?.requestId === pending.id) {
      setError(assistantError.message);
      setPending(null);
    }
  }, [assistantError, pending]);

  const makePrivateNotes = () => {
    const lines = room.players.flatMap((player) => {
      const role = notebook.guesses[player.id];
      return role ? [`身份预判：${player.seatIndex + 1}号 ${player.name} 疑似${Avalon.ROLES[role].name}`] : [];
    });
    for (const note of notebook.notes.slice(0, 12)) {
      const seats = note.seatNumbers.length ? `（涉及${note.seatNumbers.map((number) => `${number}号`).join('、')}）` : '';
      lines.push(`笔记${seats}：${note.text}`);
    }
    return lines.join('\n').slice(0, 2600);
  };

  const request = () => {
    if (!featureReady || pending) return;
    if (feature === 'rules-qa' && !question.trim()) {
      setError('先写下你想问的规则问题。');
      return;
    }
    const requestId = crypto.randomUUID();
    setError(null);
    setAnswer(null);
    const sent = net.askAvalonAssistant({
      requestId,
      feature,
      question: feature === 'rules-qa' ? question.trim() : undefined,
      privateNotes: makePrivateNotes(),
    });
    if (sent) setPending({ id: requestId, feature });
  };

  return (
    <motion.div className="drawer-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.aside
        className="drawer avalon-assistant-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="阿瓦隆 AI 助手"
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', stiffness: 300, damping: 34 }}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="drawer-head">
          <div>
            <p className="notebook-kicker">ROUND TABLE COUNSEL</p>
            <h2>AI 助手</h2>
          </div>
          <button type="button" className="btn btn-ghost btn-small" onClick={onClose}>关闭</button>
        </header>

        <p className="assistant-privacy">
          发起分析后，你的身份、本人任务牌、已知线索、公开局势及本机预判和笔记会发送给 DeepSeek；用量计入网站配置的 API Key 账户，其他玩家看不到结果。建议仅供推理参考。
        </p>

        <nav className="assistant-feature-grid" aria-label="助手功能">
          {FEATURES.map((item) => {
            const disabled = item.id === 'post-game-review' && view.phase !== 'ended';
            return (
              <button
                key={item.id}
                type="button"
                className="assistant-feature"
                aria-pressed={feature === item.id}
                disabled={disabled}
                onClick={() => {
                  setFeature(item.id);
                  setError(null);
                }}
              >
                {item.title}
                {disabled && <small>对局结束后开放</small>}
              </button>
            );
          })}
        </nav>

        <section className="assistant-selected">
          <h3>{selected.title}</h3>
          <p>{selected.description}</p>
          {feature === 'team-comparison' && view.team.length === 0 && (
            <p className="assistant-inline-hint">等队长选出候选队伍后，就能比较这支队伍。</p>
          )}
          {feature === 'rules-qa' && (
            <label className="assistant-question">
              <span>你想问什么？</span>
              <textarea
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder="例如：7 人局第四次任务需要几张失败牌？"
                maxLength={600}
                rows={3}
              />
            </label>
          )}
          <button type="button" className="btn btn-primary assistant-submit" disabled={!featureReady || Boolean(pending)} onClick={request}>
            {pending ? '正在分析…' : feature === 'rules-qa' ? '提交问题' : '开始分析'}
          </button>
        </section>

        {error && <p className="assistant-error" role="alert">{error}</p>}
        {pending && (
          <p className="assistant-pending" role="status">
            正在整理可见线索并请求 DeepSeek 分析，请稍候…
          </p>
        )}
        {answer && (
          <section className="assistant-answer" aria-live="polite">
            <h3>{FEATURES.find((item) => item.id === answer.feature)?.title} · 分析结果</h3>
            <pre>{answer.content}</pre>
            <small>分析基于发起请求时的局面。</small>
          </section>
        )}
      </motion.aside>
    </motion.div>
  );
}
