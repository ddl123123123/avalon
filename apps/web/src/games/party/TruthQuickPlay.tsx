import { useState } from 'react';
import { pick, TruthOrDare } from '@tabletop/shared';

const { promptBank, promptPresets } = TruthOrDare;
type Preset = TruthOrDare.PromptPreset;

export function TruthQuickPlay() {
  const [preset, setPreset] = useState<Preset>('13+');
  const [seen, setSeen] = useState<Partial<Record<Preset, string[]>>>({});
  const [card, setCard] = useState<string | null>(null);
  const used = seen[preset] ?? [];
  const remaining = promptBank[preset].truth.filter((question) => !used.includes(question));

  const draw = () => {
    if (remaining.length === 0) return;
    const text = pick(remaining, Math.random);
    setSeen((previous) => ({ ...previous, [preset]: [...(previous[preset] ?? []), text] }));
    setCard(text);
  };

  return (
    <section className="entry truth-quick" aria-label="快速抽题">
      <fieldset>
        <legend>选择题库</legend>
        <div className="truth-presets">
          {promptPresets.map((option) => (
            <button key={option.id} type="button" className="btn btn-ghost" aria-pressed={preset === option.id}
              onClick={() => {
                if (preset === option.id) return;
                setPreset(option.id);
                setCard(null);
              }}>
              {option.label}
            </button>
          ))}
        </div>
        <p className="truth-preset-note">{promptPresets.find((option) => option.id === preset)?.description}</p>
      </fieldset>
      {remaining.length > 0 ? (
        <button type="button" className="btn btn-primary" onClick={draw}>
          {card ? '下一题' : '抽真心话'}
        </button>
      ) : (
        <button type="button" className="btn btn-ghost" onClick={() => {
          setSeen((previous) => ({ ...previous, [preset]: [] }));
          setCard(null);
        }}>重新洗牌</button>
      )}
      <div aria-live="polite">
        {card && (
          <div className="truth-prompt">
            <p>{card}</p>
          </div>
        )}
        {remaining.length === 0 && <p className="truth-preset-note">这档题目抽完了，可以重新洗牌。</p>}
      </div>
    </section>
  );
}
