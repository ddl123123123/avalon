import type { ComponentType, ReactNode } from 'react';
import type { RoomSnapshot } from '@tabletop/shared';
import { avalonClient } from './avalon';
import { citadelsClient } from './citadels';
import { glassworksClient } from './glassworks';

/**
 * 每款桌游在前端要提供的东西。大厅和房间外壳是通用的，
 * 只有「开局选项」和「牌桌」由桌游自己画。
 */
export interface GameClient {
  id: string;
  name: string;
  tagline: string;
  icon: ReactNode;
  /** 首页上介绍这款桌游的内容 */
  hero: {
    lede: string;
    /** 首页右侧的大幅彩窗 */
    Art: ComponentType;
    /** 人数、时长之类的一句话 */
    note: string;
    /** 一局的流程，按先后顺序 */
    steps: { title: string; text: string }[];
    /** 怎样算赢 */
    goals: { tone: 'good' | 'evil' | 'gilt'; title: string; text: string }[];
  };
  /** 大厅里的开局选项面板 */
  Options: ComponentType<{
    options: any;
    /** 已设置的开局人数，或未限定人数时的当前入座人数。 */
    playerCount: number;
    editable: boolean;
    /** 提交选项的改动（增量），由服务器合并后广播回来 */
    onChange: (patch: unknown) => void;
  }>;
  /** 大厅设置面板中的本机卡牌画风切换。有此入口时，桌游标题显示在顶栏。 */
  LobbyCardStyles?: ComponentType;
  /** 对局界面（进行中和结束后都由它负责） */
  Board: ComponentType<{ room: RoomSnapshot }>;
}

export const GAME_CLIENTS: Record<string, GameClient> = {
  [avalonClient.id]: avalonClient,
  [citadelsClient.id]: citadelsClient,
  [glassworksClient.id]: glassworksClient,
};
