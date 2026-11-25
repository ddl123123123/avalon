import { useEffect, useId, useRef, useState, type Dispatch, type FormEvent, type Ref, type SetStateAction } from 'react';
import type { Avalon } from '@tabletop/shared';
import { net, useNet } from '../../net/client';

interface DraftPreview {
  source: string;
  turn: string;
  text?: string;
  error?: string;
}

export function SpeechDesk({ view, gameSeq, speechSecondsRemaining, text, setText, inputRef }: {
  view: Avalon.AvalonView;
  gameSeq: number;
  speechSecondsRemaining: number;
  text: string;
  setText: Dispatch<SetStateAction<string>>;
  inputRef: Ref<HTMLTextAreaElement>;
}) {
  const { link } = useNet();
  const [preview, setPreview] = useState<DraftPreview | null>(null);
  const [useSuggestion, setUseSuggestion] = useState(false);
  const [pending, setPending] = useState(false);
  const revision = useRef(0);
  const submitted = useRef<{ quest: number; attempt: number; source: string; text: string } | null>(null);
  const textId = useId();
  const statusId = useId();
  const turn = view.discussion?.turn;
  const myId = view.me?.id;
  const myTurn = !!myId && view.discussion?.currentSpeaker === myId;
  const canSpeak = myTurn && speechSecondsRemaining > 0 && link === 'online';
  const activePreview = preview?.source === text && preview.turn === turn ? preview : null;
  const suggestion = activePreview?.text;

  useEffect(() => {
    const sent = submitted.current;
    if (!sent) return;
    const record = view.speeches.find((speech) =>
      speech.player === myId && speech.questIndex === sent.quest && speech.attempt === sent.attempt,
    );
    if (!record) return;
    submitted.current = null;
    if (record.result === 'spoken' && record.text === sent.text) {
      setText((current) => current === sent.source ? '' : current);
    }
  }, [view.speeches, myId, setText]);

  function edit(value: string) {
    revision.current++;
    setText(value);
    setPreview(null);
    setUseSuggestion(false);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const selected = (useSuggestion && suggestion !== undefined ? suggestion : text).trim();
    if (!canSpeak || !turn || !selected) return;
    if (net.act({ type: 'submit_speech', turn, text: selected } satisfies Avalon.AvalonAction)) {
      submitted.current = { quest: view.questIndex, attempt: view.rejectCount + 1, source: text, text: selected };
    }
  }

  async function polish() {
    if (!canSpeak || !turn || !text.trim() || pending) return;
    const source = text;
    const originalRevision = revision.current;
    setPending(true);
    setPreview(null);
    setUseSuggestion(false);
    try {
      const edited = await net.polishAvalonSpeech({ gameSeq, turn, text: source });
      if (revision.current === originalRevision) setPreview({ source, turn, text: edited });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'AI 润色暂时不可用。';
      if (revision.current === originalRevision) setPreview({ source, turn, error: message });
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="av-speech-composer" onSubmit={submit}>
      <div className="av-editor-head">
        <label htmlFor={textId}>我的发言</label>
        <span id={statusId} role="status">
          {myTurn ? '轮到你发言' : '可先写草稿，轮到你时发送'}
        </span>
      </div>
      <textarea id={textId} ref={inputRef} className="input" rows={3} value={text} aria-describedby={statusId}
        onChange={(event) => edit(event.currentTarget.value)} placeholder="说说你怎么看这支队伍。" />
      {suggestion !== undefined && (
        <section className="av-polish-preview" aria-label="仅自己可见的润色稿">
          <p className="av-polish-heading" role="status">AI 润色建议</p>
          <p className="av-polish-text" tabIndex={0}>{suggestion}</p>
          <div className="av-speech-buttons" role="group" aria-label="选择要发送的版本">
            <button type="button" className="btn btn-ghost btn-small" aria-pressed={!useSuggestion} onClick={() => setUseSuggestion(false)}>使用原文</button>
            <button type="button" className="btn btn-ghost btn-small" aria-pressed={useSuggestion} onClick={() => setUseSuggestion(true)}>使用润色稿</button>
          </div>
        </section>
      )}
      {activePreview?.error && <p className="av-polish-error" role="status">{activePreview.error}</p>}
      <div className="av-speech-buttons">
        <button type="submit" className="btn btn-primary btn-small" disabled={!canSpeak || !text.trim()}>
          {suggestion === undefined ? '发送发言' : useSuggestion ? '发送润色稿' : '发送原文'}
        </button>
        <button type="button" className="btn btn-ghost btn-small" disabled={!canSpeak || pending || !text.trim()} onClick={polish}>
          {pending ? '润色中…' : 'AI 润色'}
        </button>
        {myTurn && <button type="button" className="btn btn-ghost btn-small" disabled={!canSpeak} onClick={() => net.act({ type: 'finish_speech' })}>跳过</button>}
      </div>
    </form>
  );
}
