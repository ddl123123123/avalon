import type { PlayerId } from './framework';

/** 房间与联机协议：与具体桌游无关。 */

export type RoomStatus = 'lobby' | 'playing' | 'ended';

export interface RoomPlayer {
  id: PlayerId;
  name: string;
  connected: boolean;
  isBot: boolean;
}

export interface RoomSnapshot {
  code: string;
  gameId: string;
  hostId: PlayerId;
  /** 座位顺序 */
  players: RoomPlayer[];
  status: RoomStatus;
  options: unknown;
  /** 当前人数和选项下不能开局的原因；可以开局时为 null */
  startBlocker: string | null;
  /** 每开一局加一，客户端用它区分不同的对局 */
  gameSeq: number;
  /** 当前玩家视角下的对局信息；大厅阶段为 null */
  view: unknown | null;
  you: PlayerId;
}

export type ClientMessage =
  | { type: 'hello'; clientId: string }
  | { type: 'create_room'; name: string; gameId: string }
  | { type: 'join_room'; code: string; name: string }
  | { type: 'leave_room' }
  /** options 是增量：只包含要修改的那几项 */
  | { type: 'set_options'; options: unknown }
  | { type: 'add_bot' }
  | { type: 'kick'; playerId: PlayerId }
  | { type: 'start_game' }
  | { type: 'game_action'; action: unknown }
  | { type: 'back_to_lobby' };

export type ServerMessage =
  | { type: 'welcome'; playerId: PlayerId; roomCode: string | null }
  | { type: 'room'; room: RoomSnapshot }
  | { type: 'left'; reason: string | null }
  | { type: 'error'; message: string };

export const NAME_MAX_LENGTH = 12;
