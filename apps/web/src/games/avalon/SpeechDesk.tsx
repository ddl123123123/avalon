import { motion } from 'framer-motion';
import { useId, useState, type FormEvent } from 'react';
import type { Avalon } from '@tabletop/shared';
import { net } from '../../net/client';

const speechStatus = {
  passed: '选择跳过',
  timed_out: '发言时间已结束',
  unavailable: '机器人未能生成发言',
};

function Body({ record }: { record: Avalon.SpeechRecord }) {
  return <p className="av-speech-body">{record.result === 'spoken' ? record.text : speechStatus[record.result]}</p>;
}

export function SpeechDesk({ view, canSpeak, nameOf, onOpenLog }: {
  view: Avalon.AvalonView;
  canSpeak: boolean;
  nameOf: (player: string) => string;
  onOpenLog: () => void;
}) {
  const [text, setText] = useState('');
  const textId = useId();
  const last = view.speeches.at(-1);
  const recent = last && last.questIndex === view.questIndex && last.attempt === view.rejectCount + 1 ? last : null;
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (text.trim() && view.discussion) {
      net.act({ type: 'submit_speech', turn: view.discussion.turn, text } satisfies Avalon.AvalonAction);
    }
  }

  return (
    <div className="av-speech-desk">
      {recent && (
        <div className="av-speech-preview" aria-live="polite">
          <strong>{nameOf(recent.player)}</strong><Body record={recent} />
        </div>
      )}
      {canSpeak ? (
        <form className="av-speech-composer" onSubmit={submit}>
          <label htmlFor={textId}>我的文字发言</label>
          <textarea id={textId} className="input" rows={3} value={text} onChange={(event) => setText(event.currentTarget.value)}
            placeholder="选一两条关键线索，说说你怎么看。" />
          <div className="av-speech-buttons">
            <button type="submit" className="btn btn-primary" disabled={!text.trim()}>发送发言</button>
            <button type="button" className="btn btn-ghost btn-small" onClick={() => net.act({ type: 'finish_speech' })}>跳过</button>
            <button type="button" className="btn btn-ghost btn-small" onClick={onOpenLog}>发言记录</button>
          </div>
        </form>
      ) : <button type="button" className="btn btn-ghost btn-small" onClick={onOpenLog}>发言记录</button>}
    </div>
  );
}

export function SpeechLog({ speeches, nameOf, onClose }: {
  speeches: Avalon.SpeechRecord[];
  nameOf: (player: string) => string;
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
            <p className="history-line"><strong>{nameOf(record.player)}</strong><small>　任务 {record.questIndex + 1} · 第 {record.attempt} 次组队</small></p>
            <Body record={record} />
          </article>
        ))}
      </motion.aside>
    </motion.div>
  );
}
