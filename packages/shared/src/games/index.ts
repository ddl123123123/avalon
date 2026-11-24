import type { GameDefinition } from '../framework';
import { avalon } from './avalon';
import { citadels } from './citadels';
import { glassworks } from './glassworks';
import { ninjaNight } from './ninja-night';
import { truthOrDare } from './truth-or-dare';
import { greyTide } from './grey-tide';
import { sevenSins } from './seven-sins';

/** 已上线的桌游。新增桌游时在这里注册。 */
export const GAMES: Record<string, GameDefinition> = {
  [avalon.id]: avalon,
  [citadels.id]: citadels,
  [glassworks.id]: glassworks,
  [ninjaNight.id]: ninjaNight,
  [truthOrDare.id]: truthOrDare,
  [greyTide.id]: greyTide,
  [sevenSins.id]: sevenSins,
};

export function getGame(id: string): GameDefinition | undefined {
  return Object.prototype.hasOwnProperty.call(GAMES, id) ? GAMES[id] : undefined;
}
