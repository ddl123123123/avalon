import { Citadels } from '@tabletop/shared';
import { CharacterCard } from './art';
import { CitadelsCardStylePicker } from './cardStyle';

const { CHARACTERS, CITY_SIZE, MAX_PLAYERS, MIN_PLAYERS } = Citadels;

/** 富饶之城目前没有可调的选项，这里说明当前人数下的规则，并列出八个角色。 */
export function CitadelsOptions({ playerCount }: { playerCount: number }) {
  const n = Math.min(MAX_PLAYERS, Math.max(MIN_PLAYERS, playerCount));
  const { faceDown, faceUp } = Citadels.draftDiscards(n);
  const each = Citadels.charactersPerPlayer(n);
  return (
    <div className="av-options">
      <p className="av-options-summary">
        {n} 人局：每人每轮选 {each} 个角色。选角前盖着移出 {faceDown} 张{faceUp > 0 ? `、明着移出 ${faceUp} 张` : ''}角色牌
        {n === 7 ? '，最后一人可以在剩下的一张和盖着的那张之间选' : ''}。先建成 {CITY_SIZE} 座城区的人触发终局。
      </p>
      <label className="ct-lobby-card-style">
        卡牌画风
        <CitadelsCardStylePicker />
      </label>
      <h2 className="av-options-heading">八个角色，按号码依次行动</h2>
      <ol className="ct-roster">
        {CHARACTERS.map((c) => (
          <li key={c.id}>
            <span className="ct-roster-card">
              <CharacterCard character={c.id} />
            </span>
            <span>
              <strong>{c.name}</strong>
              {c.ability}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
