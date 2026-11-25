import { ResponsiveSheet } from '../../ui/ResponsiveSheet';
import { RoleFace } from './art';
import { AVALON_CARD_STYLES, setAvalonCardStyle, useAvalonCardStyle } from './cardLibrary';

export function CardLibrarySettings({ onClose }: { onClose: () => void }) {
  const selected = useAvalonCardStyle();
  if (selected === 'pig') return null;

  return (
    <ResponsiveSheet label="卡牌外观" className="av-card-library" onClose={onClose}>
      <div className="drawer-head">
        <h2>卡牌外观</h2>
        <button type="button" className="btn btn-ghost btn-small" onClick={onClose}>完成</button>
      </div>
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
            <span className="av-card-style-name">
              {style.name}
              <span className="av-selection-mark" aria-hidden="true" />
            </span>
          </button>
        ))}
      </div>
    </ResponsiveSheet>
  );
}
