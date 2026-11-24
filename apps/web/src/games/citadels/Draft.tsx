import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { Citadels } from '@tabletop/shared';
import { net } from '../../net/client';
import { CharacterCard, CitadelsCardBack } from './art';

const { CHARACTER } = Citadels;

/** 轮到我选角色（两人局里还要盖弃一张）。 */
export function DraftPicker({ view }: { view: Citadels.CitadelsView }) {
  const draft = view.draft!;
  const pool = draft.pool ?? [];
  const [chosen, setChosen] = useState<Citadels.CharacterId | null>(null);
  useEffect(() => setChosen(null), [draft.step, pool.length]);
  const picking = draft.step === 'pick';
  const def = chosen ? CHARACTER[chosen] : null;

  return (
    <div className="draft">
      <div className="draft-head">
        <p className="dock-prompt">{picking ? '选一个角色，这一轮你就是他' : '再盖弃一个角色，对手不会知道是哪张'}</p>
        <p className="dock-hint ct-draft-discard">
          {draft.faceDownCount > 0 && <CitadelsCardBack kind="character" />}
          <span>
            {view.faceUp.length > 0 && `明弃：${view.faceUp.map((c) => CHARACTER[c].name).join('、')}。`}
            另有 {draft.faceDownCount} 张盖着移出，没人知道是谁。
          </span>
        </p>
      </div>
      <div className="draft-cards">
        {pool.map((c, i) => (
          <motion.button
            key={c}
            type="button"
            className={`draft-card ${chosen === c ? 'is-chosen' : ''}`}
            aria-pressed={chosen === c}
            onClick={() => setChosen(c)}
            initial={{ opacity: 0, y: 60, rotate: (i - (pool.length - 1) / 2) * 6 }}
            animate={{ opacity: 1, y: chosen === c ? -12 : 0, rotate: 0 }}
            transition={{ delay: i * 0.05, type: 'spring', stiffness: 220, damping: 20 }}
          >
            <CharacterCard character={c} />
          </motion.button>
        ))}
      </div>
      <div className="draft-foot">
        <p className="draft-ability">{def ? `${def.name}：${def.ability}` : '点一张牌看它的能力'}</p>
        <button
          type="button"
          className={`btn ${picking ? 'btn-primary' : 'btn-danger'}`}
          disabled={!chosen}
          onClick={() => chosen && net.act({ type: draft.step, character: chosen } satisfies Citadels.CitadelsAction)}
        >
          {def ? `${picking ? '选' : '盖弃'}${def.name}` : picking ? '选这个角色' : '盖弃这个角色'}
        </button>
      </div>
    </div>
  );
}
