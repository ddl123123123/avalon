import { Avalon } from '@tabletop/shared';
import { LadyToken, QuestRoundel, RoleFace } from './art';

const { EVIL_COUNT, MAX_PLAYERS, MIN_PLAYERS, OPTIONAL_ROLES, ROLES, TEAM_SIZES } = Avalon;

/** 大厅里的阵容预览和房主可调整的开局选项。 */
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
  const deck = Avalon.validateOptions(options, n) === null ? Avalon.buildRoleDeck(n, options) : [];
  const counts = new Map<Avalon.Role, number>();
  for (const role of deck) counts.set(role, (counts.get(role) ?? 0) + 1);

  const recommended = Avalon.recommendedOptions(n);
  const custom = OPTIONAL_ROLES.some((role) => options[role] !== recommended[role]);
  const evilSlotsFull = OPTIONAL_ROLES.filter((role) => ROLES[role].alignment === 'evil' && options[role]).length >= evil - 1;

  // 只提交改动的那一项，由服务器合并
  const toggle = (key: Avalon.OptionalRole | 'ladyOfTheLake') => onChange({ [key]: !options[key] });

  return (
    <div className="av-options">
      <section className="av-lobby-quests" aria-label={`${n} 人局任务`}>
        <h2 className="av-options-heading">任务人数</h2>
        <ol className="av-lobby-quest-track">
          {TEAM_SIZES[n]!.map((size, index) => {
            const twoFails = Avalon.failsRequired(n, index) === 2;
            return (
              <li key={index} className={twoFails ? 'av-lobby-quest-special' : undefined}>
                <span className="av-lobby-quest-label">任务 <b>{index + 1}</b></span>
                <span role="img" aria-label={`${size} 人`} className="av-lobby-quest-token">
                  <QuestRoundel state="pending" size={size} twoFails={twoFails} />
                </span>
                {twoFails && <>
                  <span className="av-lobby-quest-rule" aria-hidden="true"><b>2</b> 张失败牌</span>
                  <span className="sr-only">至少两张失败牌才算失败</span>
                </>}
              </li>
            );
          })}
        </ol>
      </section>

      <fieldset className="av-timer-setting">
        <legend>发言倒计时</legend>
        <div className="av-timer-options av-speech-timer-options" role="group" aria-label="选择发言时长">
          {[0, ...Avalon.SPEECH_TIMERS].map((seconds) => (
            <button
              key={seconds}
              type="button"
              className="av-timer-choice"
              aria-pressed={options.speechSeconds === seconds}
              disabled={!editable}
              onClick={() => onChange({ speechSeconds: seconds })}
            >
              {seconds === 0 ? '不计时' : <><b>{seconds}</b> 秒</>}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="av-roster" aria-live="polite">
        <h2 className="av-options-heading">{custom ? '自定义阵容' : '推荐阵容'}</h2>
        {deck.length > 0 && (
          <div className="av-deck">
            {(['good', 'evil'] as const).map((alignment) => (
              <section key={alignment} className={`av-deck-side av-deck-${alignment}`}>
                <h3>{alignment === 'good' ? `正义方 ${n - evil} 人` : `邪恶方 ${evil} 人`}</h3>
                <ul>
                  {[...counts]
                    .filter(([role]) => ROLES[role].alignment === alignment)
                    .map(([role, count]) => (
                      <li key={role} title={ROLES[role].ability}>
                        <span className="av-deck-card" aria-hidden="true">
                          <RoleFace role={role} thumbnail />
                        </span>
                        <span>
                          {ROLES[role].name}{count > 1 && <small> ×{count}</small>}
                        </span>
                      </li>
                    ))}
                </ul>
              </section>
            ))}
          </div>
        )}
        {options.ladyOfTheLake && <p className="av-options-summary">已启用湖中仙女</p>}
      </div>

      {editable && (
        <details className="av-role-editor">
          <summary>调整角色和湖中仙女</summary>
          <div className="av-toggles">
            {evilSlotsFull && OPTIONAL_ROLES.some((role) => ROLES[role].alignment === 'evil' && !options[role]) && (
              <p className="av-options-summary">邪恶方名额已满，取消一名后可替换。</p>
            )}
            {OPTIONAL_ROLES.map((role) => {
              const info = ROLES[role];
              return (
                <button
                  key={role}
                  type="button"
                  className={`av-toggle av-toggle-${info.alignment}`}
                  aria-pressed={options[role]}
                  disabled={info.alignment === 'evil' && !options[role] && evilSlotsFull}
                  onClick={() => toggle(role)}
                >
                  <span className="av-toggle-name">{info.name}</span>
                  <span className="av-toggle-text">{info.ability}</span>
                  <span className="av-selection-mark" aria-hidden="true" />
                </button>
              );
            })}
            <button
              type="button"
              className="av-toggle av-toggle-lady"
              aria-pressed={options.ladyOfTheLake}
              onClick={() => toggle('ladyOfTheLake')}
            >
              <span className="av-toggle-name">
                <LadyToken className="av-toggle-icon" />
                湖中仙女
              </span>
              <span className="av-toggle-text">
                第 2、3、4 次任务后，持有者可以查验一名玩家的阵营，然后把它交给对方。建议 {Avalon.LADY_RECOMMENDED_PLAYERS} 人以上使用。
              </span>
              <span className="av-selection-mark" aria-hidden="true" />
            </button>
            {custom && <button type="button" className="link av-reset" onClick={() => onChange(recommended)}>恢复推荐阵容</button>}
          </div>
        </details>
      )}
    </div>
  );
}
