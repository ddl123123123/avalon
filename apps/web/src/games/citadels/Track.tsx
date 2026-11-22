import { Citadels } from '@tabletop/shared';
import { Ticker } from '../../ui/Ticker';
import { CharacterCard } from './art';
import { describe, toneOf } from './text';

const { CHARACTERS } = Citadels;

/** 八个角色的叫号进度：谁已经亮明、轮到谁、谁被刺杀或被偷。 */
export function Track({ view, nameOf }: { view: Citadels.CitadelsView; nameOf: (id: string) => string }) {
  return (
    <ol className="track" aria-label="角色叫号顺序">
      {CHARACTERS.map((c) => {
        const owner = view.players.find((p) => view.seats[p]!.revealed.includes(c.id));
        const out = view.faceUp.includes(c.id);
        const current = view.turn?.character === c.id;
        const past = view.phase === 'turns' && c.rank <= view.calledRank && !current;
        const classes = ['track-item', current && 'is-current', past && 'is-past', out && 'is-out'].filter(Boolean).join(' ');
        return (
          <li key={c.id} className={classes} title={c.ability}>
            <span className="track-card">
              <CharacterCard character={c.id} />
              {view.murdered === c.id && <span className="track-mark track-mark-murder" title="被刺客盯上" />}
              {view.robbed === c.id && <span className="track-mark track-mark-rob" title="被盗贼盯上" />}
            </span>
            <span className="track-label">{out ? '明弃' : owner ? nameOf(owner) : past ? '无人' : c.name}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** 事件播报 */
export function Announcer({ view, nameOf }: { view: Citadels.CitadelsView; nameOf: (id: string) => string }) {
  return <Ticker log={view.log} describe={(e) => describe(e, nameOf)} tone={toneOf} />;
}
