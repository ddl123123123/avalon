import { Glassworks } from '@tabletop/shared';
import type { GameClient } from '../registry';
import { GlassworksBoard } from './Board';
import { GlassworksOptions } from './Options';
import { Shard, WorkshopWindow } from './art';

export const glassworksClient: GameClient = {
  id: Glassworks.glassworks.id,
  name: Glassworks.glassworks.name,
  tagline: Glassworks.glassworks.tagline,
  icon: <Shard piece="violet" />,
  hero: {
    lede: '取下晾架上的玻璃料，烧出一扇扇彩窗。每烧成一块，你的炉子就多一种拿手的颜色。先攒起作坊的底子，再去接教堂和行会的委托。',
    Art: WorkshopWindow,
    note: '2 到 4 人，一局约半小时。这是本站自己设计的桌游，规则都在这一页和大厅里。',
    steps: [
      { title: '取料', text: '玻璃料从布袋里随机摆上晾架。每次只能拿相邻的一到三块，所以位置和颜色一样重要。' },
      { title: '烧制', text: '付出造价烧成窗片。每块窗片带一种炉色，之后烧同色料更省。炉子烧过还有余温，接着烧大窗能再省一两块料。' },
      { title: '接委托', text: '炉色达到委托的要求就能把它接下，谁先达到归谁。五色凑齐是一套光谱，同色的小窗、花窗、玫瑰窗凑齐是一组联窗，都另有声望。' },
    ],
    goals: [
      {
        tone: 'gilt',
        title: `声望先到 ${Glassworks.TARGET_POINTS} 分敲响终局`,
        text: '打完这一圈后结算，声望最高的作坊获胜。声望来自窗片、委托，以及凑成的光谱和联窗。',
      },
    ],
  },
  Options: GlassworksOptions,
  Board: GlassworksBoard,
};
