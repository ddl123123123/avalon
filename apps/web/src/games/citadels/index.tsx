import { Citadels } from '@tabletop/shared';
import type { GameClient } from '../registry';
import { CitadelsBoard } from './Board';
import { CitadelsOptions } from './Options';
import { CityWindow, Coin } from './art';

export const citadelsClient: GameClient = {
  id: Citadels.citadels.id,
  name: Citadels.citadels.name,
  tagline: Citadels.citadels.tagline,
  icon: <Coin />,
  hero: {
    lede: '每一轮，所有人暗中换上一副新面孔：刺客、盗贼、国王、军阀……猜中对手是谁，护住自己的金币，抢先把城建起来。',
    Art: CityWindow,
    note: '2 到 7 人，一局约 40 分钟。不需要语音也能玩，但互相试探会有趣得多。',
    steps: [
      { title: '选角色', text: '从持王冠的人开始，角色牌依次暗中传递，每人留下一张。谁选了什么，没人知道。' },
      { title: '按号行动', text: '从 1 号刺客叫到 8 号军阀，被叫到的人亮明身份：拿金币或抽牌，并使用角色的能力。' },
      { title: '建城区', text: '付出金币把手里的城区牌建到面前。有人建成第八座时，打完这一轮就结算。' },
    ],
    goals: [{ tone: 'gilt', title: '分数最高的城市获胜', text: '城区造价即分数。五种颜色齐全加 3 分，率先建成加 4 分，其他建成的人加 2 分。' }],
  },
  Options: CitadelsOptions,
  Board: CitadelsBoard,
};
