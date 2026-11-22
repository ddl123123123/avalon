import { Avalon } from '@tabletop/shared';
import { LadyToken, RoleFace } from './art';

const { EVIL_COUNT, MAX_PLAYERS, MIN_PLAYERS, OPTIONAL_ROLES, ROLES, TEAM_SIZES } = Avalon;

/** 大厅里的开局选项：可选角色、湖中仙女，以及当前人数下的牌局构成。 */
export function AvalonOptions({
  options,
  playerCount,
  editable,
  onChange,
}: {
  options: Avalon.AvalonOptions;
  playerCount: number;
  editable: boolean;
  onChange: (options: unknown) => void;
}) {
  const n = Math.min(MAX_PLAYERS, Math.max(MIN_PLAYERS, playerCount));
  const evil = EVIL_COUNT[n]!;
  const valid = Avalon.validateOptions(options, n) === null;
  const deck = valid ? Avalon.buildRoleDeck(n, options) : [];
  const counts = new Map<Avalon.Role, number>();
  for (const role of deck) counts.set(role, (counts.get(role) ?? 0) + 1);

  // 只提交改动的那一项，由服务器合并
  const toggle = (key: keyof Avalon.AvalonOptions) => onChange({ [key]: !options[key] });

  return (
    <div className="av-options">
      <p className="av-options-summary">
        {n} 人局：{n - evil} 名正义方，{evil} 名邪恶方。五次任务分别需要 {TEAM_SIZES[n]!.join('、')} 人
        {n >= 7 ? '，第四次任务要两张失败才算失败。' : '。'}
      </p>

      {deck.length > 0 && (
        <div className="av-deck" aria-label="本局身份牌">
          {[...counts].map(([role, count]) => (
            <div key={role} className="av-deck-card" title={ROLES[role].ability}>
              <RoleFace role={role} />
              {count > 1 && <span className="av-deck-count">×{count}</span>}
            </div>
          ))}
        </div>
      )}

      <h2 className="av-options-heading">{editable ? '加入特殊角色' : '特殊角色'}</h2>
      <div className="av-toggles">
        {OPTIONAL_ROLES.map((role) => {
          const info = ROLES[role];
          return (
            <button
              key={role}
              type="button"
              className={`av-toggle av-toggle-${info.alignment}`}
              aria-pressed={options[role]}
              disabled={!editable}
              onClick={() => toggle(role)}
            >
              <span className="av-toggle-name">{info.name}</span>
              <span className="av-toggle-text">{info.ability}</span>
            </button>
          );
        })}
        <button
          type="button"
          className="av-toggle av-toggle-lady"
          aria-pressed={options.ladyOfTheLake}
          disabled={!editable}
          onClick={() => toggle('ladyOfTheLake')}
        >
          <span className="av-toggle-name">
            <LadyToken className="av-toggle-icon" />
            湖中仙女
          </span>
          <span className="av-toggle-text">
            第 2、3、4 次任务后，持有者可以查验一名玩家的阵营，然后把它交给对方。建议 {Avalon.LADY_RECOMMENDED_PLAYERS} 人以上使用。
          </span>
        </button>
      </div>
    </div>
  );
}
