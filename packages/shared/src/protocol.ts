import type { PlayerId } from './framework';

/** 房间与联机协议：与具体桌游无关。 */

export type RoomStatus = 'lobby' | 'playing' | 'ended';

export interface RoomPlayer {
  id: PlayerId;
  name: string;
  connected: boolean;
  isBot: boolean;
  /** 从 0 开始的固定座位号；大厅中的空座不会压缩编号。 */
  seatIndex: number;
}

export interface RoomSnapshot {
  code: string;
  gameId: string;
  hostId: PlayerId;
  /** 座位顺序 */
  players: RoomPlayer[];
  status: RoomStatus;
  options: unknown;
  /** 房主指定的开局人数；未使用固定人数的桌游为 null。 */
  targetPlayers: number | null;
  /** 当前人数和选项下不能开局的原因；可以开局时为 null */
  startBlocker: string | null;
  /** 每开一局加一，客户端用它区分不同的对局 */
  gameSeq: number;
  /** 当前玩家视角下的对局信息；大厅阶段为 null */
  view: unknown | null;
  you: PlayerId;
}

export type AvalonAssistantFeature =
  | 'team-comparison'
  | 'role-coach'
  | 'speech-prep'
  | 'speech-summary'
  | 'rules-qa'
  | 'post-game-review';

export type ClientMessage =
  | { type: 'hello'; clientId: string }
  | { type: 'create_room'; name: string; gameId: string; options?: unknown }
  | { type: 'join_room'; code: string; name: string }
  | { type: 'leave_room' }
  | { type: 'choose_seat'; seatIndex: number }
  /** options 是增量：只包含要修改的那几项 */
  | { type: 'set_options'; options: unknown }
  | { type: 'set_player_count'; playerCount: number }
  | { type: 'add_bot' }
  | { type: 'kick'; playerId: PlayerId }
  | { type: 'start_game' }
  | { type: 'game_action'; action: unknown }
  | {
      type: 'avalon_assistant';
      requestId: string;
      feature: AvalonAssistantFeature;
      question?: string;
      privateNotes?: string;
      speech?: { round: number; text: string };
    }
  | { type: 'back_to_lobby' };

export type ServerMessage =
  | { type: 'welcome'; playerId: PlayerId; roomCode: string | null }
  | { type: 'room'; room: RoomSnapshot }
  | { type: 'avalon_assistant_result'; requestId: string; content: string }
  | { type: 'avalon_assistant_error'; requestId: string; message: string }
  | { type: 'left'; reason: string | null }
  | { type: 'error'; message: string };

export const NAME_MAX_LENGTH = 12;
