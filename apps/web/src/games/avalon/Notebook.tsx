import { useEffect, useMemo, useState, type Dispatch, type FormEvent, type SetStateAction } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Avalon, type RoomPlayer } from '@tabletop/shared';
import { net, useNet } from '../../net/client';
import type { AvalonNotebookData, AvalonNotebookNote } from './notebookData';

const ROUND_NAMES = ['第一轮', '第二轮', '第三轮', '第四轮', '第五轮'];

export function Notebook({
  open,
  currentRound,
  players,
  you,
  roleSet,
  notebook,
  onChange,
  onClose,
  inline = false,
}: {
  open: boolean;
  currentRound: number;
  players: RoomPlayer[];
  you: string;
  roleSet: Avalon.Role[];
  notebook: AvalonNotebookData;
  onChange: Dispatch<SetStateAction<AvalonNotebookData>>;
  onClose: () => void;
  inline?: boolean;
}) {
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [round, setRound] = useState<number | null>(currentRound);
  const [filterSeat, setFilterSeat] = useState<number | null>(null);
  const { link, assistantResult, assistantError } = useNet();
  const [pending, setPending] = useState<{ id: string; round: number; text: string } | null>(null);
  const [error, setError] = useState<{ round: number; message: string } | null>(null);
  const draft = round === null ? '' : drafts[round] ?? '';
  const speech = round === null ? undefined : notebook.speeches[round];
  const roles = [...new Set(roleSet)].sort((a, b) => Avalon.ROLES[a].name.localeCompare(Avalon.ROLES[b].name, 'zh-CN'));
  const playersBySeat = [...players].sort((a, b) => a.seatIndex - b.seatIndex);
  const allowedSeats = useMemo(() => new Set(players.map((player) => player.seatIndex + 1)), [players]);

  useEffect(() => {
    if (!open) {
      setRound(currentRound);
      setFilterSeat(null);
    }
  }, [open, currentRound]);

  useEffect(() => {
    if (!open || inline) return;
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [inline, open, onClose]);

  useEffect(() => {
    if (!pending) return;
    if (assistantResult?.requestId === pending.id) {
      onChange((previous) => {
        const entry = previous.speeches[pending.round];
        if (entry?.text.trim() !== pending.text) return previous;
        return {
          ...previous,
          speeches: { ...previous.speeches, [pending.round]: { ...entry, summary: assistantResult.content } },
        };
      });
      setPending(null);
    } else if (assistantError?.requestId === pending.id || link !== 'online') {
      setError({ round: pending.round, message: assistantError?.requestId === pending.id ? assistantError.message : '网络已断开，请重连后重试。' });
      setPending(null);
    }
  }, [assistantResult, assistantError, link, onChange, pending]);

  const selectRound = (next: number | null) => {
    setRound(next);
    setFilterSeat(null);
  };

  const summarize = () => {
    const text = speech?.text.trim();
    if (round === null || !text || pending) return;
    const id = crypto.randomUUID();
    const sent = net.askAvalonAssistant({ requestId: id, feature: 'speech-summary', speech: { round, text } });
    setError(sent ? null : { round, message: '未能发送请求，请重连后重试。' });
    if (sent) setPending({ id, round, text });
  };

  const setGuess = (id: string, value: string) => {
    const guesses = { ...notebook.guesses };
    if (Object.prototype.hasOwnProperty.call(Avalon.ROLES, value)) guesses[id] = value as Avalon.Role;
    else delete guesses[id];
    onChange((previous) => ({ ...previous, guesses }));
  };

  const addNote = (event: FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text || round === null) return;
    const matches = [...text.matchAll(/#\s*(\d{1,2})|座位\s*(\d{1,2})|(\d{1,2})\s*号/g)];
    const seatNumbers = [...new Set(matches.map((match) => Number(match[1] ?? match[2] ?? match[3])).filter((number) => allowedSeats.has(number)))].sort((a, b) => a - b);
    const note: AvalonNotebookNote = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      text,
      seatNumbers,
      createdAt: Date.now(),
      round,
    };
    onChange((previous) => ({ ...previous, notes: [note, ...previous.notes] }));
    setDrafts((previous) => ({ ...previous, [round]: '' }));
    setFilterSeat(null);
  };

  const roundNotes = notebook.notes.filter((note) => (note.round ?? null) === round);
  const indexedSeats = [...new Set(roundNotes.flatMap((note) => note.seatNumbers))].sort((a, b) => a - b);
  const visibleNotes = filterSeat === null ? roundNotes : roundNotes.filter((note) => note.seatNumbers.includes(filterSeat));

  const content = (
    <>
      <p className="notebook-private">笔记、身份预判和发言记录保存在本机，仅自己可见。</p>

      <section className="notebook-section">
        <header><h3>按轮次查询</h3></header>
        <div className="notebook-index-buttons" aria-label="任务轮次">
          {ROUND_NAMES.slice(0, currentRound).map((name, index) => (
            <button key={name} type="button" className={round === index + 1 ? 'is-active' : ''} aria-pressed={round === index + 1} onClick={() => selectRound(index + 1)}>
              {name}{index + 1 === currentRound && <small>当前</small>}
            </button>
          ))}
          {notebook.notes.some((note) => note.round === undefined) && (
            <button type="button" className={round === null ? 'is-active' : ''} aria-pressed={round === null} onClick={() => selectRound(null)}>未分轮笔记</button>
          )}
        </div>
      </section>

      <section className="notebook-section">
        <header>
          <h3>身份预判</h3>
          <span>标记只对你可见</span>
        </header>
        <ul className="notebook-players">
          {playersBySeat.map((player) => (
            <li key={player.id}>
              <span className="notebook-player-seat">{player.seatIndex + 1} 号</span>
              <span className="notebook-player-name">{player.name}</span>
              <select
                value={notebook.guesses[player.id] ?? ''}
                onChange={(event) => setGuess(player.id, event.target.value)}
                disabled={player.id === you}
                aria-label={`给座位 ${player.seatIndex + 1} 的 ${player.name} 标记身份`}
              >
                <option value="">{player.id === you ? '你' : '未判断'}</option>
                {roles.map((role) => <option key={role} value={role}>{Avalon.ROLES[role].name}</option>)}
              </select>
            </li>
          ))}
        </ul>
      </section>

      {round !== null && <form className="notebook-compose" onSubmit={addNote}>
        <label htmlFor="avalon-note-draft">记下一条线索</label>
        <textarea
          id="avalon-note-draft"
          value={draft}
          onChange={(event) => setDrafts({ ...drafts, [round]: event.target.value })}
          placeholder="例如：#3 两次提议都带上了 5 号；座位 2 可能在保护梅林。"
          maxLength={1200}
          rows={4}
        />
        <div className="notebook-compose-foot">
          <small>写入 #3、3号 或 座位3，可自动建立座位索引。</small>
          <button type="submit" className="btn btn-primary btn-small" disabled={!draft.trim()}>保存笔记</button>
        </div>
      </form>}

      <section className="notebook-section notebook-index">
        <header>
          <h3>按座位查询</h3>
          <span>{roundNotes.length} 条笔记</span>
        </header>
        <div className="notebook-index-buttons">
          <button type="button" className={filterSeat === null ? 'is-active' : ''} aria-pressed={filterSeat === null} onClick={() => setFilterSeat(null)}>全部</button>
          {indexedSeats.map((seatNumber) => {
            const player = playersBySeat.find((candidate) => candidate.seatIndex + 1 === seatNumber);
            const count = roundNotes.filter((note) => note.seatNumbers.includes(seatNumber)).length;
            return (
              <button key={seatNumber} type="button" className={filterSeat === seatNumber ? 'is-active' : ''} aria-pressed={filterSeat === seatNumber} onClick={() => setFilterSeat(seatNumber)}>
                {seatNumber} 号{player ? ` · ${player.name}` : ''}<small>{count}</small>
              </button>
            );
          })}
        </div>
      </section>

      <section className="notebook-notes" aria-live="polite">
        {visibleNotes.length === 0 ? (
          <p className="drawer-empty">{filterSeat === null ? '还没有笔记。写下线索后，提到的座位号会自动出现在索引里。' : `还没有提到 ${filterSeat} 号座位的笔记。`}</p>
        ) : (
          visibleNotes.map((note) => (
            <article key={note.id} className="notebook-note">
              <p>{note.text}</p>
              <footer>
                <time>{new Date(note.createdAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</time>
                <span className="notebook-note-seats">
                  {note.seatNumbers.map((seatNumber) => (
                    <button key={seatNumber} type="button" onClick={() => setFilterSeat(seatNumber)} aria-label={`查看提到 ${seatNumber} 号座位的笔记`}>{seatNumber} 号</button>
                  ))}
                </span>
                <button
                  type="button"
                  className="notebook-note-delete"
                  onClick={() => onChange((previous) => ({ ...previous, notes: previous.notes.filter((entry) => entry.id !== note.id) }))}
                  aria-label="删除这条笔记"
                >
                  删除
                </button>
              </footer>
            </article>
          ))
        )}
      </section>
      {round !== null && (
        <section className="notebook-compose">
          <label htmlFor="avalon-round-speech">{ROUND_NAMES[round - 1]} · {inline ? '私人发言笔记' : '我的发言'}</label>
          <textarea
            id="avalon-round-speech"
            value={speech?.text ?? ''}
            onChange={(event) => {
              const text = event.target.value;
              onChange((previous) => ({ ...previous, speeches: { ...previous.speeches, [round]: { text } } }));
            }}
            placeholder="记录这轮你说了什么"
            maxLength={2600}
            rows={5}
          />
          <div className="notebook-compose-foot">
            <small>发言自动保存。点击总结时，仅将所选轮次和发言正文发给 DeepSeek。</small>
            <button type="button" className="btn btn-primary btn-small" disabled={!speech?.text.trim() || Boolean(pending) || link !== 'online'} onClick={summarize}>
              {pending ? '正在总结…' : 'AI 总结本轮发言'}
            </button>
          </div>
          {error?.round === round && <p className="assistant-error" role="alert">{error.message}</p>}
          {speech?.summary && (
            <div className="assistant-answer" aria-live="polite">
              <h3>发言总结</h3>
              <pre>{speech.summary}</pre>
            </div>
          )}
        </section>
      )}
    </>
  );

  if (inline) return open ? <section aria-label="推理笔记">{content}</section> : null;

  return (
    <AnimatePresence>
      {open && <motion.div className="drawer-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
        <motion.aside
          className="drawer notebook-drawer"
          role="dialog"
          aria-modal="true"
          aria-label="推理笔记"
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', stiffness: 300, damping: 34 }}
          onClick={(event) => event.stopPropagation()}
        >
          <header className="drawer-head">
            <div>
              <p className="notebook-kicker">PRIVATE TABLE NOTES</p>
              <h2>推理笔记</h2>
            </div>
            <button type="button" className="btn btn-ghost btn-small" onClick={onClose}>关闭</button>
          </header>
          {content}
        </motion.aside>
      </motion.div>}
    </AnimatePresence>
  );
}
