import { Avalon } from '@tabletop/shared';
import type { GameClient } from '../registry';
import { AvalonBoard } from './Board';
import { AvalonOptions } from './Options';
import { QuestRoundel } from './art';

export const avalonClient: GameClient = {
  id: Avalon.avalon.id,
  name: Avalon.avalon.name,
  tagline: Avalon.avalon.tagline,
  icon: <QuestRoundel state="success" size={0} twoFails={false} />,
  Options: AvalonOptions,
  Board: AvalonBoard,
};
