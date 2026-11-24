import { RoleFace } from './art';
import { AVALON_CARD_STYLES, setAvalonCardStyle, useAvalonCardStyle } from './cardLibrary';

export function CardLibrarySettings({ compact = false }: { compact?: boolean }) {
  const selected = useAvalonCardStyle();

  return (
    <section className={`av-card-library${compact ? ' av-card-library-compact' : ''}`} aria-label="角色卡牌库设置">
      {!compact && (
        <div className="av-card-library-heading">
          <h2>角色卡牌库</h2>
          <p>选择你想使用的卡面风格，设置仅保存在本机</p>
        </div>
      )}
      <div className="av-card-style-options">
        {AVALON_CARD_STYLES.map((style) => (
          <button
            key={style.id}
            type="button"
            className="av-card-style-option"
            aria-pressed={selected === style.id}
            onClick={() => setAvalonCardStyle(style.id)}
          >
            <span className="av-card-style-preview" aria-hidden="true">
              <RoleFace role="merlin" style={style.id} thumbnail />
              <RoleFace role="morgana" style={style.id} thumbnail />
            </span>
            <span className="av-card-style-name">{style.name}</span>
            <small>{style.description}</small>
          </button>
        ))}
      </div>
    </section>
  );
}
