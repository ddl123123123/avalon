import { useEffect, useState } from 'react';
import { Avalon, type AvalonAssistantFeature, type RoomSnapshot } from '@tabletop/shared';
import { net, useNet } from '../../net/client';
import { ResponsiveSheet } from '../../ui/ResponsiveSheet';
import type { AvalonNotebookData } from './notebookData';

const FEATURES: Array<{ id: AvalonAssistantFeature; title: string; description: string }> = [
  { id: 'team-comparison', title: '队伍对比', description: '结合当前候选队伍、历轮任务和投票记录梳理风险与支持证据。' },
  { id: 'role-coach', title: '角色教练', description: '根据你的身份、已知线索和当前阶段，给出下一步思路。' },
  { id: 'speech-prep', title: '发言准备', description: '生成一段可以编辑的发言正文。' },
  { id: 'rules-qa', title: '规则问答', description: '用自然语言询问角色能力、任务、投票或湖中仙女规则。' },
  { id: 'post-game-review', title: '赛后复盘', description: '对局结束后回顾转折点、关键选择和可改进之处。' },
];

export function AvalonAssistant({
  room,
  view,
  notebook,
  feature,
  onFeatureChange,
  onClose,
  onUseSpeech,
  inline = false,
}: {
  room: RoomSnapshot;
  view: Avalon.AvalonView;
  notebook: AvalonNotebookData;
  feature: AvalonAssistantFeature;
  onFeatureChange: (feature: AvalonAssistantFeature) => void;
  onClose: () => void;
  onUseSpeech?: (text: string) => void;
  inline?: boolean;
}) {
  const { assistantResult, assistantError } = useNet();
  const [question, setQuestion] = useState('');
  const [pending, setPending] = useState<{ id: string; feature: AvalonAssistantFeature } | null>(null);
  const [answer, setAnswer] = useState<{ feature: AvalonAssistantFeature; content: string; privateAnalysis?: string } | null>(null);
  const [error, setError] = useState<{ feature: AvalonAssistantFeature; message: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const selected = FEATURES.find((item) => item.id === feature)!;
  const visibleAnswer = answer?.feature === feature ? answer : null;
  const featureReady = feature === 'team-comparison'
    ? view.team.length > 0
    : feature === 'post-game-review'
      ? view.phase === 'ended'
      : true;

  useEffect(() => {
    if (pending && assistantResult?.requestId === pending.id) {
      setAnswer({ feature: pending.feature, content: assistantResult.content, privateAnalysis: assistantResult.privateAnalysis });
      setPending(null);
    }
  }, [assistantResult, pending]);

  useEffect(() => {
    if (pending && assistantError?.requestId === pending.id) {
      setError({ feature: pending.feature, message: assistantError.message });
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
      setError({ feature, message: '先写下你想问的规则问题。' });
      return;
    }
    const requestId = crypto.randomUUID();
    setError(null);
    setAnswer(null);
    setCopied(false);
    const sent = net.askAvalonAssistant({
      requestId,
      feature,
      question: feature === 'rules-qa' ? question.trim() : undefined,
      privateNotes: makePrivateNotes(),
    });
    if (sent) setPending({ id: requestId, feature });
  };

  const copySpeech = async (draft: string) => {
    if (onUseSpeech) {
      onUseSpeech(draft);
      return;
    }
    try {
      await navigator.clipboard.writeText(draft);
      setCopied(true);
    } catch {
      window.prompt('复制发言正文', draft);
    }
  };

  const content = (
    <>
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
              onClick={() => onFeatureChange(item.id)}
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
          {pending ? '处理中…' : feature === 'speech-prep' ? '生成发言稿' : feature === 'rules-qa' ? '提交问题' : '开始分析'}
        </button>
      </section>

      {error?.feature === feature && <p className="assistant-error" role="alert">{error.message}</p>}
      {pending && (
        <p className="assistant-pending" role="status">
          正在整理可见线索并请求 DeepSeek 分析，请稍候…
        </p>
      )}
      {visibleAnswer && (
        <section className="assistant-answer" aria-live="polite">
          <h3>{visibleAnswer.privateAnalysis ? '发言正文' : `${selected.title} · 分析结果`}</h3>
          <pre>{visibleAnswer.content}</pre>
          {visibleAnswer.privateAnalysis && (
            <>
              <button type="button" className="btn btn-primary btn-small" onClick={() => void copySpeech(visibleAnswer.content)}>
                {onUseSpeech ? '填入我的发言' : copied ? '正文已复制' : '复制发言正文'}
              </button>
              <details className="assistant-private-analysis">
                <summary>分析 · 仅自己可见</summary>
                <pre>{visibleAnswer.privateAnalysis}</pre>
              </details>
            </>
          )}
          <small>分析基于发起请求时的局面。</small>
        </section>
      )}
    </>
  );

  if (inline) return <section aria-label="AI 助手">{content}</section>;

  return (
    <ResponsiveSheet label="阿瓦隆 AI 助手" className="avalon-assistant-drawer" onClose={onClose}>
      <header className="drawer-head">
        <div>
          <p className="notebook-kicker">ROUND TABLE COUNSEL</p>
          <h2>AI 助手</h2>
        </div>
        <button type="button" className="btn btn-ghost btn-small" onClick={onClose}>关闭</button>
      </header>

      {content}
    </ResponsiveSheet>
  );
}
