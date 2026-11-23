import { Avalon, type RoomSnapshot } from '@tabletop/shared';

export interface AvalonNotebookNote {
  id: string;
  text: string;
  seatNumbers: number[];
  createdAt: number;
}

export interface AvalonNotebookData {
  guesses: Record<string, Avalon.Role>;
  notes: AvalonNotebookNote[];
}

function isRole(value: unknown): value is Avalon.Role {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(Avalon.ROLES, value);
}

export function notebookStorageKey(room: RoomSnapshot): string {
  return `avalon.notebook.${room.code}.${room.gameSeq}.${room.you}`;
}

export function readNotebook(key: string): AvalonNotebookData {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? 'null');
    if (!value || typeof value !== 'object') return { guesses: {}, notes: [] };

    const raw = value as { guesses?: unknown; notes?: unknown };
    const guesses: Record<string, Avalon.Role> = {};
    if (raw.guesses && typeof raw.guesses === 'object') {
      for (const [id, role] of Object.entries(raw.guesses)) {
        if (isRole(role)) guesses[id] = role;
      }
    }
    const notes = Array.isArray(raw.notes)
      ? raw.notes
          .filter(
            (note): note is AvalonNotebookNote =>
              note !== null &&
              typeof note === 'object' &&
              typeof note.id === 'string' &&
              typeof note.text === 'string' &&
              typeof note.createdAt === 'number' &&
              Array.isArray(note.seatNumbers),
          )
          .map((note) => ({
            ...note,
            seatNumbers: [...new Set(note.seatNumbers.filter((number) => Number.isInteger(number) && number >= 1 && number <= 10))],
          }))
      : [];
    return { guesses, notes };
  } catch {
    return { guesses: {}, notes: [] };
  }
}

export function saveNotebook(key: string, notebook: AvalonNotebookData) {
  try {
    localStorage.setItem(key, JSON.stringify(notebook));
  } catch {
    // 本次页面仍保留笔记，隐私模式可能不允许持久化。
  }
}
