import type { ComponentType, ReactNode } from 'react';
import type { RoomSnapshot } from '@tabletop/shared';
import { avalonClient } from './avalon';

/**
 * 每款桌游在前端要提供的东西。大厅和房间外壳是通用的，
 * 只有「开局选项」和「牌桌」由桌游自己画。
 */
export interface GameClient {
  id: string;
  name: string;
  tagline: string;
  icon: ReactNode;
  /** 大厅里的开局选项面板 */
  Options: ComponentType<{
    options: any;
    playerCount: number;
    editable: boolean;
    /** 提交选项的改动（增量），由服务器合并后广播回来 */
    onChange: (patch: unknown) => void;
  }>;
  /** 对局界面（进行中和结束后都由它负责） */
  Board: ComponentType<{ room: RoomSnapshot }>;
}

export const GAME_CLIENTS: Record<string, GameClient> = {
  [avalonClient.id]: avalonClient,
};
