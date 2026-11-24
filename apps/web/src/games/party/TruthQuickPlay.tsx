import { useState } from 'react';
import { pick, TruthOrDare } from '@tabletop/shared';

const { promptBank, promptPresets } = TruthOrDare;
type Kind = TruthOrDare.PromptKind;
type Preset = TruthOrDare.PromptPreset;
const kinds: Kind[] = ['truth', 'dare'];
const names: Record<Kind, string> = { truth: '真心话', dare: '大冒险' };

export function TruthQuickPlay() {
  const [preset, setPreset] = useState<Preset>('13+');
  const [seen, setSeen] = useState<Partial<Record<Preset, string[]>>>({});
  const [card, setCard] = useState<{ kind: Kind; text: string } | null>(null);
  const bank = promptBank[preset];
  const used = seen[preset] ?? [];
  const remaining = {
    truth: bank.truth.filter((question) => !used.includes(question)),
    dare: bank.dare.filter((question) => !used.includes(question)),
  };
  const availableKinds = kinds.filter((kind) => remaining[kind].length > 0);

  const draw = (requested: Kind | 'random') => {
    if (availableKinds.length === 0) return;
    const kind = requested === 'random' ? pick(availableKinds, Math.random) : requested;
    if (!remaining[kind].length) return;
    const text = pick(remaining[kind], Math.random);
    setSeen((previous) => ({ ...previous, [preset]: [...(previous[preset] ?? []), text] }));
    setCard({ kind, text });
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
      <div className="truth-draw-actions" role="group" aria-label="抽题方式">
        {kinds.map((kind) => (
          <button key={kind} type="button" className="btn btn-ghost" disabled={!remaining[kind].length} onClick={() => draw(kind)}>
            {names[kind]}
          </button>
        ))}
        <button type="button" className="btn btn-primary" disabled={!availableKinds.length} onClick={() => draw('random')}>
          随机抽
        </button>
      </div>
      <div aria-live="polite">
        {card && (
          <div className="truth-prompt" data-kind={card.kind}>
            <p className="party-kicker">{names[card.kind]}</p>
            <p>{card.text}</p>
          </div>
        )}
        {availableKinds.length === 0 && <p className="truth-preset-note">这档题目抽完了，可以重新洗牌。</p>}
      </div>
      {availableKinds.length === 0 && (
        <button type="button" className="btn btn-ghost" onClick={() => {
          setSeen((previous) => ({ ...previous, [preset]: [] }));
          setCard(null);
        }}>重新洗牌</button>
      )}
    </section>
  );
}
