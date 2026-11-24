import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { motion } from 'framer-motion';
import { Avalon } from '@tabletop/shared';
import { DecodedImage } from '../../art/DecodedImage';
import { useReducedMotion } from '../../fx/motion';
import { avalonPigArt, useAvalonCardStyle } from './cardLibrary';

type RoleId = Avalon.Role;

interface RoleGuideContent {
  englishName: string;
  introduction: string;
  tips: readonly [string, string];
}

const ROLE_ORDER: readonly RoleId[] = [
  'merlin',
  'percival',
  'servant',
  'assassin',
  'morgana',
  'mordred',
  'oberon',
  'minion',
];

const ROLE_GUIDE: Record<RoleId, RoleGuideContent> = {
  merlin: {
    englishName: 'MERLIN',
    introduction: '亚瑟王阵营的预言者。你掌握着重要线索，却必须让忠臣自己看起来像是在推理。',
    tips: ['用提问和投票理由传递线索，避免每次都直接点出正确人选。', '留意刺客如何观察你的判断；隐藏身份和找出邪恶方同样重要。'],
  },
  percival: {
    englishName: 'PERCIVAL',
    introduction: '梅林的守护者。你能看到梅林与莫甘娜的候选身份，需要在讨论中辨认真正的引路人。',
    tips: ['比较候选人的组队和投票逻辑，观察谁的判断持续帮助正义方。', '别急着公开自己的线索，避免让刺客更快锁定梅林。'],
  },
  servant: {
    englishName: 'LOYAL SERVANT',
    introduction: '亚瑟王的忠臣没有额外视野，要从队伍构成、投票和任务结果中拼出真相。',
    tips: ['记下每次任务的成员和投票变化，找出前后矛盾的选择。', '说明自己判断的依据，和队友一起逐步排除可疑组合。'],
  },
  assassin: {
    englishName: 'ASSASSIN',
    introduction: '邪恶方的终局猎手。若正义方完成三次任务，你将获得最后一次指认梅林的机会。',
    tips: ['留意谁持续引导队伍、保护忠臣，记录可能的梅林人选。', '前期融入讨论并隐藏阵营，把关键判断留到刺杀时刻。'],
  },
  morgana: {
    englishName: 'MORGANA',
    introduction: '擅长伪装的女巫。在派西维尔眼中，你和梅林难以区分，可以借此误导正义方。',
    tips: ['给出看似可靠的分析，让派西维尔难以确定真正的梅林。', '与队友保持说法连贯，避免为了掩护任务而解释得太刻意。'],
  },
  mordred: {
    englishName: 'MORDRED',
    introduction: '莫德雷德隐藏在亚瑟王的宫廷中，梅林无法看见你的身份。',
    tips: ['利用梅林的视野盲区参与组队，但别表现得像掌握了全部信息。', '从投票和任务结果判断队友的位置，给正义方留下模糊线索。'],
  },
  oberon: {
    englishName: 'OBERON',
    introduction: '独行的邪恶方。你不认识其他邪恶角色，他们也不知道你是谁；但梅林可以看到你。',
    tips: ['根据公开的任务与投票独立判断，不要期待队友为你铺路。', '选择合适时机破坏任务，同时让自己的行动看起来有正当理由。'],
  },
  minion: {
    englishName: "MORDRED'S MINION",
    introduction: '莫德雷德的爪牙认识大多数邪恶同伴，需要在任务中制造失败并保护阵营。',
    tips: ['记住同伴和奥伯伦的特殊视野关系，组队时避免互相暴露。', '结合前几轮的投票决定何时破坏任务，不必每次都急于出手。'],
  },
};

const ROLE_INDEX_LABEL: Record<RoleId, string> = {
  merlin: '梅林',
  percival: '派西维尔',
  servant: '忠臣',
  assassin: '刺客',
  morgana: '莫甘娜',
  mordred: '莫德雷德',
  oberon: '奥伯伦',
  minion: '爪牙',
};

export function AvalonRoleGuide() {
  const pigTheme = useAvalonCardStyle() === 'pig';
  const reducedMotion = useReducedMotion();
  const [selected, setSelected] = useState<RoleId>('merlin');
  const swipeStartX = useRef<number | null>(null);
  const role = Avalon.ROLES[selected];
  const guide = ROLE_GUIDE[selected];
  const side = role.alignment === 'good' ? 'good' : 'evil';

  const startSwipe = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.target instanceof Element && event.target.closest('.avalon-guide-index')) {
      swipeStartX.current = null;
      return;
    }
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    swipeStartX.current = event.clientX;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const endSwipe = (event: ReactPointerEvent<HTMLDivElement>) => {
    const startX = swipeStartX.current;
    swipeStartX.current = null;
    if (startX === null) return;
    const distance = event.clientX - startX;
    if (Math.abs(distance) < 52) return;

    setSelected((current) => {
      const index = ROLE_ORDER.indexOf(current);
      const next = (index + (distance < 0 ? 1 : -1) + ROLE_ORDER.length) % ROLE_ORDER.length;
      return ROLE_ORDER[next]!;
    });
  };

  return (
    <section className="avalon-guide" aria-labelledby="avalon-guide-title">
      <header className="avalon-guide-header">
        <div>
          <p className="avalon-guide-eyebrow">CHARACTER ARCHIVE / 08</p>
          <h2 id="avalon-guide-title">阿瓦隆角色图鉴</h2>
          <p className="avalon-guide-summary">认识每张身份牌，也想一想别人会从哪里看出你的身份。</p>
        </div>
        <span className="avalon-guide-count">5—10 人 · 隐藏身份</span>
      </header>

      <div
        className={`avalon-guide-feature is-${side}`}
        role="group"
        aria-label={`${role.name}角色介绍，左右滑动切换角色`}
        onPointerDown={startSwipe}
        onPointerUp={endSwipe}
        onPointerCancel={() => { swipeStartX.current = null; }}
      >
        <div className="avalon-guide-visual">
          <motion.figure
            key={selected}
            className={`avalon-guide-portrait is-${side}`}
            initial={reducedMotion ? false : { opacity: 0, y: 22, scale: 0.95, rotateY: 7 }}
            animate={{ opacity: 1, y: 0, scale: 1, rotateY: 0 }}
            transition={reducedMotion ? { duration: 0 } : {
              opacity: { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
              y: { type: 'spring', stiffness: 94, damping: 17, mass: 0.82 },
              scale: { type: 'spring', stiffness: 115, damping: 19 },
              rotateY: { duration: 0.68, ease: [0.22, 1, 0.36, 1] },
            }}
            whileHover={reducedMotion ? undefined : {
              y: -4,
              scale: 1.012,
              transition: { type: 'spring', stiffness: 230, damping: 20 },
            }}
            whileTap={reducedMotion ? undefined : {
              scale: 0.986,
              transition: { type: 'spring', stiffness: 300, damping: 20 },
            }}
          >
            <DecodedImage
              src={pigTheme ? avalonPigArt(selected) : `${import.meta.env.BASE_URL}avalon-roles/${selected}.jpg`}
              width={768}
              height={1024}
              alt={`${role.name}角色立绘`}
              draggable={false}
              loading="lazy"
              decoding="async"
            />
            <figcaption>{guide.englishName}</figcaption>
          </motion.figure>
          <div className="avalon-guide-index" role="group" aria-label="选择要查看的角色">
            <div className="avalon-guide-index-heading">
              <strong>选择一张身份牌</strong>
              <span>左右滑动图文切换</span>
            </div>
            <div className="avalon-guide-index-track">
              {ROLE_ORDER.map((id, index) => {
                const item = Avalon.ROLES[id];
                const itemSide = item.alignment === 'good' ? 'good' : 'evil';
                return (
                  <button
                    key={id}
                    type="button"
                    className={`avalon-guide-option is-${itemSide}`}
                    aria-pressed={id === selected}
                    title={item.name}
                    aria-label={`查看${item.name}`}
                    onClick={() => setSelected(id)}
                  >
                    <small>{String(index + 1).padStart(2, '0')}</small>
                    <span>{ROLE_INDEX_LABEL[id]}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        <article className="avalon-guide-detail" aria-live="polite">
          <span className={`avalon-guide-faction is-${side}`}>
            <i aria-hidden="true" />
            {side === 'good' ? '正义方' : '邪恶方'}
          </span>
          <p className="avalon-guide-roleline">{guide.introduction}</p>
          <h3>{role.name}</h3>

          <div className="avalon-guide-block">
            <h4>在游戏中的作用</h4>
            <p>{role.ability}</p>
          </div>
          <div className="avalon-guide-block">
            <h4>玩法建议</h4>
            <ol>
              {guide.tips.map((tip, index) => <li key={index}>{tip}</li>)}
            </ol>
          </div>
        </article>
      </div>

      <details className="avalon-guide-lore">
        <summary>
          <span>亚瑟王与阿瓦隆</span>
          <small>世界观背景 · 可选阅读</small>
        </summary>
        <p>
          传说中，亚瑟王的骑士们围坐圆桌，受命寻找并守护阿瓦隆。莫德雷德的势力暗中混入队伍，忠诚与背叛难以从外表分辨。每一趟任务，都是一次信任的考验。
        </p>
      </details>
    </section>
  );
}
