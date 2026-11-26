import { Avalon } from '@tabletop/shared';
import type { GameClient } from '../registry';
import { AvalonBoard } from './Board';
import { AvalonOptions } from './Options';
import { RoseWindow } from '../../art/RoseWindow';
import { QuestRoundel } from './art';

export const avalonClient: GameClient = {
  id: Avalon.avalon.id,
  name: Avalon.avalon.name,
  tagline: Avalon.avalon.tagline,
  icon: <QuestRoundel state="success" size={0} twoFails={false} />,
  hero: {
    lede: '亚瑟王的圆桌旁，混进了莫德雷德的爪牙。五次任务，三次定胜负。听每个人怎么说，看每一票怎么投，找出谁在说谎。',
    Art: RoseWindow,
    note: '5 到 10 人，一局约半小时。身份由系统秘密发放，建议开着语音一起玩。',
    steps: [
      { title: '组队', text: '队长挑选出任务的队员。人选可以商量，但决定权在队长手里。' },
      { title: '投票', text: '过半赞成即可出发，否决则顺时针换车头。达到房间设置的强制车次时，车头提交名单后直接执行任务。' },
      { title: '做任务', text: '队员暗中出牌。正义方只能出成功，邪恶方可以出失败。只要混进一张失败，任务就毁了。' },
    ],
    goals: [
      { tone: 'good', title: '正义方', text: '完成三次任务，并且不让刺客认出梅林。' },
      { tone: 'evil', title: '邪恶方', text: '破坏三次任务，或在最后一刻刺中梅林。' },
    ],
  },
  Options: AvalonOptions,
  Board: AvalonBoard,
};
