import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import { Avalon, type RoomPlayer } from '@tabletop/shared';
import type { AvalonNotebookData, AvalonNotebookNote } from './notebookData';

export function Notebook({
  players,
  you,
  roleSet,
  notebook,
  onChange,
  onClose,
}: {
  players: RoomPlayer[];
  you: string;
  roleSet: Avalon.Role[];
  notebook: AvalonNotebookData;
  onChange: (next: AvalonNotebookData) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState('');
  const [filterSeat, setFilterSeat] = useState<number | null>(null);
  const roles = [...new Set(roleSet)].sort((a, b) => Avalon.ROLES[a].name.localeCompare(Avalon.ROLES[b].name, 'zh-CN'));
  const playersBySeat = [...players].sort((a, b) => a.seatIndex - b.seatIndex);
  const allowedSeats = useMemo(() => new Set(players.map((player) => player.seatIndex + 1)), [players]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [onClose]);

  const setGuess = (id: string, value: string) => {
    const guesses = { ...notebook.guesses };
    if (Object.prototype.hasOwnProperty.call(Avalon.ROLES, value)) guesses[id] = value as Avalon.Role;
    else delete guesses[id];
    onChange({ ...notebook, guesses });
  };

  const addNote = (event: FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    const matches = [...text.matchAll(/#\s*(\d{1,2})|座位\s*(\d{1,2})|(\d{1,2})\s*号/g)];
    const seatNumbers = [...new Set(matches.map((match) => Number(match[1] ?? match[2] ?? match[3])).filter((number) => allowedSeats.has(number)))].sort((a, b) => a - b);
    const note: AvalonNotebookNote = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      text,
      seatNumbers,
      createdAt: Date.now(),
    };
    onChange({ ...notebook, notes: [note, ...notebook.notes] });
    setDraft('');
    setFilterSeat(null);
  };

  const indexedSeats = [...new Set(notebook.notes.flatMap((note) => note.seatNumbers))].sort((a, b) => a - b);
  const visibleNotes = filterSeat === null ? notebook.notes : notebook.notes.filter((note) => note.seatNumbers.includes(filterSeat));

  return (
      <motion.div className="drawer-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
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
          <p className="notebook-private">身份预判和笔记仅保存在这台设备，不会发送给其他玩家。</p>

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

          <form className="notebook-compose" onSubmit={addNote}>
            <label htmlFor="avalon-note-draft">记下一条线索</label>
            <textarea
              id="avalon-note-draft"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="例如：#3 两次提议都带上了 5 号；座位 2 可能在保护梅林。"
              maxLength={1200}
              rows={4}
            />
            <div className="notebook-compose-foot">
              <small>写入 #3、3号 或 座位3，可自动建立座位索引。</small>
              <button type="submit" className="btn btn-primary btn-small" disabled={!draft.trim()}>保存笔记</button>
            </div>
          </form>

          <section className="notebook-section notebook-index">
            <header>
              <h3>按座位查询</h3>
              <span>{notebook.notes.length} 条笔记</span>
            </header>
            <div className="notebook-index-buttons">
              <button type="button" className={filterSeat === null ? 'is-active' : ''} aria-pressed={filterSeat === null} onClick={() => setFilterSeat(null)}>全部</button>
              {indexedSeats.map((seatNumber) => {
                const player = playersBySeat.find((candidate) => candidate.seatIndex + 1 === seatNumber);
                const count = notebook.notes.filter((note) => note.seatNumbers.includes(seatNumber)).length;
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
                      onClick={() => onChange({ ...notebook, notes: notebook.notes.filter((entry) => entry.id !== note.id) })}
                      aria-label="删除这条笔记"
                    >
                      删除
                    </button>
                  </footer>
                </article>
              ))
            )}
          </section>
        </motion.aside>
      </motion.div>
  );
}
