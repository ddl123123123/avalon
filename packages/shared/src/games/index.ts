import type { GameDefinition } from '../framework';
import { avalon } from './avalon';

/** 已上线的桌游。新增桌游时在这里注册。 */
export const GAMES: Record<string, GameDefinition> = {
  [avalon.id]: avalon,
};

export function getGame(id: string): GameDefinition | undefined {
  return Object.prototype.hasOwnProperty.call(GAMES, id) ? GAMES[id] : undefined;
}
