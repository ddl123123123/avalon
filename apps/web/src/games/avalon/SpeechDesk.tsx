import { motion } from 'framer-motion';
import { useId, useRef, useState, type FormEvent } from 'react';
import type { Avalon, RoomPlayer } from '@tabletop/shared';
import { net } from '../../net/client';
import { SeatIdentity } from './SeatIdentity';

const speechStatus = {
  passed: '选择跳过',
  timed_out: '发言时间已结束',
  unavailable: '机器人未能生成发言',
};

function Body({ record }: { record: Avalon.SpeechRecord }) {
  return <p className="av-speech-body">{record.result === 'spoken' ? record.text : speechStatus[record.result]}</p>;
}

export function SpeechDesk({ view, gameSeq, canSpeak, players, onOpenLog }: {
  view: Avalon.AvalonView;
  gameSeq: number;
  canSpeak: boolean;
  players: RoomPlayer[];
  onOpenLog: () => void;
}) {
  const [text, setText] = useState('');
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [useSuggestion, setUseSuggestion] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const revision = useRef(0);
  const textId = useId();
  const last = view.speeches.at(-1);
  const recent = last && last.questIndex === view.questIndex && last.attempt === view.rejectCount + 1 ? last : null;
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const selected = useSuggestion && suggestion !== null ? suggestion : text;
    if (selected.trim() && view.discussion) {
      net.act({ type: 'submit_speech', turn: view.discussion.turn, text: selected } satisfies Avalon.AvalonAction);
    }
  }

  function edit(value: string) {
    revision.current++;
    setText(value);
    setSuggestion(null);
    setUseSuggestion(false);
    setError('');
  }

  async function polish() {
    if (!canSpeak || !view.discussion || !text.trim() || pending) return;
    const originalRevision = revision.current;
    setPending(true);
    setError('');
    try {
      const edited = await net.polishAvalonSpeech({ gameSeq, turn: view.discussion.turn, text });
      if (revision.current === originalRevision) {
        setSuggestion(edited);
        setUseSuggestion(false);
      }
    } catch (error) {
      if (revision.current === originalRevision) setError(error instanceof Error ? error.message : 'AI 润色暂时不可用。');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="av-speech-desk">
      {recent && (
        <div className="av-speech-preview" aria-live="polite">
          <SeatIdentity player={players.find((player) => player.id === recent.player)} /><Body record={recent} />
        </div>
      )}
      {canSpeak ? (
        <form className="av-speech-composer" onSubmit={submit}>
          <label htmlFor={textId}>我的文字发言</label>
          <textarea id={textId} className="input" rows={3} value={text} onChange={(event) => edit(event.currentTarget.value)}
            placeholder="选一两条关键线索，说说你怎么看。" />
          {suggestion !== null && (
            <section className="av-polish-preview" aria-label="仅自己可见的润色稿">
              <p className="av-polish-heading" role="status">AI 润色建议</p>
              <p className="av-polish-text" tabIndex={0}>{suggestion}</p>
              <div className="av-speech-buttons" role="group" aria-label="选择要发送的版本">
                <button type="button" className="btn btn-ghost btn-small" aria-pressed={!useSuggestion} onClick={() => setUseSuggestion(false)}>使用原文</button>
                <button type="button" className="btn btn-ghost btn-small" aria-pressed={useSuggestion} onClick={() => setUseSuggestion(true)}>使用润色稿</button>
              </div>
            </section>
          )}
          {error && <p className="av-polish-error" role="status">{error}</p>}
          <div className="av-speech-buttons">
            <button type="submit" className="btn btn-primary" disabled={!text.trim()}>
              {suggestion === null ? '发送发言' : useSuggestion ? '发送润色稿' : '发送原文'}
            </button>
            <button type="button" className="btn btn-ghost btn-small" disabled={pending || !text.trim()} onClick={polish}>
              {pending ? '润色中…' : 'AI 润色'}
            </button>
            <button type="button" className="btn btn-ghost btn-small" onClick={() => net.act({ type: 'finish_speech' })}>跳过</button>
            <button type="button" className="btn btn-ghost btn-small" onClick={onOpenLog}>发言记录</button>
          </div>
        </form>
      ) : <button type="button" className="btn btn-ghost btn-small" onClick={onOpenLog}>发言记录</button>}
    </div>
  );
}

export function SpeechLog({ speeches, players, onClose }: {
  speeches: Avalon.SpeechRecord[];
  players: RoomPlayer[];
  onClose: () => void;
}) {
  return (
    <motion.div className="drawer-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.aside className="drawer av-speech-log" role="dialog" aria-label="发言记录" aria-modal="true"
        initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => { if (event.key === 'Escape') onClose(); }}>
        <header className="drawer-head">
          <h2>发言记录</h2>
          <button type="button" className="btn btn-ghost btn-small" onClick={onClose} autoFocus>关闭</button>
        </header>
        {speeches.length === 0 && <p className="drawer-empty">还没有记录。文字发言发送后会同步到全桌。</p>}
        {[...speeches].reverse().map((record) => (
          <article className="history-proposal" key={`${record.questIndex}-${record.attempt}-${record.player}`}>
            <div className="av-speech-author">
              <SeatIdentity player={players.find((player) => player.id === record.player)} />
              <small>任务 {record.questIndex + 1} · 第 {record.attempt} 次组队</small>
            </div>
            <Body record={record} />
          </article>
        ))}
      </motion.aside>
    </motion.div>
  );
}
