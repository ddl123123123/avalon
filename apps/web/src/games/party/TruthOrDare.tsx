import { TruthOrDare, type RoomSnapshot } from '@tabletop/shared';
import { net } from '../../net/client';
import type { GameClient } from '../registry';
import { PartyTable } from './PartyTable';

const { truthOrDare } = TruthOrDare;

function TruthOptions({ options, editable, onChange }: {
  options: TruthOrDare.TruthOptions;
  editable: boolean;
  onChange: (patch: TruthOrDare.TruthOptions) => void;
}) {
  return (
    <div className="party-lobby-copy">
      <p>2 到 10 人，按座位轮流抽真心话。每位玩家都可以跳过。</p>
      <fieldset className="lobby-size">
        <legend>本局玩几圈</legend>
        <div className="lobby-size-buttons">
          {([1, 2] as const).map((laps) => (
            <button key={laps} type="button" className="lobby-size-button" disabled={!editable}
              aria-pressed={options.laps === laps} onClick={() => onChange({ laps })}>{laps} 圈</button>
          ))}
        </div>
        <p>每圈所有玩家各玩一次。</p>
      </fieldset>
    </div>
  );
}

function TruthBoard({ room }: { room: RoomSnapshot }) {
  const view = room.view as TruthOrDare.TruthView;
  const player = room.players.find((candidate) => candidate.id === view.current);
  const isMyTurn = view.current === room.you;
  const isHost = room.hostId === room.you;
  const act = (type: 'draw' | 'done' | 'skip' | 'end') => net.act({ type, turn: view.turn });

  return (
    <PartyTable room={room} name={truthOrDare.name} theme="truth">
      <section className="panel party-panel truth-stage">
        {player ? (
          <>
            <div aria-live="polite">
              <p className="party-kicker">第 {view.turn + 1} / {view.totalTurns} 回合</p>
              <h2>{isMyTurn ? '轮到你了' : `轮到 ${player.seatIndex + 1} 号 · ${player.name}`}</h2>
              {view.prompt ? (
                <div className="truth-prompt" key={view.turn}>
                  <p>{view.prompt.text}</p>
                </div>
              ) : (
                <p>{isMyTurn ? '抽一张真心话，或直接跳过。' : player.connected ? '等待对方抽题。' : '这位玩家暂时离线。'}</p>
              )}
            </div>
            {isMyTurn && (
              <div className="party-actions">
                {view.prompt ? (
                  <button type="button" className="btn btn-primary" onClick={() => act('done')}>完成，下一位</button>
                ) : (
                  <button type="button" className="btn btn-primary" onClick={() => act('draw')}>抽真心话</button>
                )}
                <button type="button" className="btn btn-ghost" onClick={() => act('skip')}>跳过</button>
              </div>
            )}
            {isHost && !player.connected && (
              <button type="button" className="btn btn-ghost" onClick={() => act('skip')}>跳过离线玩家</button>
            )}
            <p className="party-note">可以当面回答，也可以用你们自己的语音通话。</p>
          </>
        ) : (
          <h2>这局结束了</h2>
        )}
      </section>
      {isHost && player && (
        <button type="button" className="link party-end"
          onClick={() => { if (window.confirm('现在结束这局游戏？')) act('end'); }}>结束本局</button>
      )}
    </PartyTable>
  );
}

export const truthOrDareClient: GameClient = {
  id: truthOrDare.id,
  name: truthOrDare.name,
  tagline: truthOrDare.tagline,
  icon: <span className="party-tab-mark" aria-hidden="true">✦</span>,
  hero: {
    lede: '选一个档位，抽一道真心话。遇到不想回答的题，直接换一张。',
    Art: () => <div className="party-art party-art-truth" aria-hidden="true"><span>?</span><i>✦</i></div>,
    note: '适合朋友聚会，也可以自己抽。同一档的题在重新洗牌前不会重复。',
    steps: [
      { title: '选题库', text: '从 13+、16+、18+ 和走心版里选一档。' },
      { title: '抽一张', text: '系统从所选题库随机抽一道真心话。' },
      { title: '想换就换', text: '直接再按一次，抽出另一张。一起玩时可以把手机递给下一位。' },
    ],
    goals: [],
  },
  Options: TruthOptions,
  Board: TruthBoard,
};
