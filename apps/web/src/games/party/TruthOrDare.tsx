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
      <p>2 到 10 人，按座位轮流抽题。每轮到一位玩家时，对方可以选择真心话、大冒险或跳过。</p>
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
  const act = (type: 'done' | 'skip' | 'end') => net.act({ type, turn: view.turn });
  const draw = (kind: TruthOrDare.PromptKind) => net.act({ type: 'draw', turn: view.turn, kind });

  return (
    <PartyTable room={room} name={truthOrDare.name} theme="truth">
      <section className="panel party-panel truth-stage">
        {player ? (
          <>
            <div aria-live="polite">
              <p className="party-kicker">第 {view.turn + 1} / {view.totalTurns} 回合</p>
              <h2>{isMyTurn ? '轮到你了' : `轮到 ${player.seatIndex + 1} 号 · ${player.name}`}</h2>
              {view.prompt ? (
                <div className="truth-prompt" key={view.turn} data-kind={view.prompt.kind}>
                  <p className="party-kicker">{view.prompt.kind === 'truth' ? '真心话' : '大冒险'}</p>
                  <p>{view.prompt.text}</p>
                </div>
              ) : (
                <p>{isMyTurn ? '选一类题目，或直接跳过。' : player.connected ? '等待对方选题。' : '这位玩家暂时离线。'}</p>
              )}
            </div>
            {isMyTurn && (
              <div className="party-actions">
                {view.prompt ? (
                  <button type="button" className="btn btn-primary" onClick={() => act('done')}>完成，下一位</button>
                ) : (
                  <>
                    <button type="button" className="btn btn-primary" onClick={() => draw('truth')}>抽真心话</button>
                    <button type="button" className="btn btn-ghost" onClick={() => draw('dare')}>抽大冒险</button>
                  </>
                )}
                <button type="button" className="btn btn-ghost" onClick={() => act('skip')}>跳过</button>
              </div>
            )}
            {isHost && !player.connected && (
              <button type="button" className="btn btn-ghost" onClick={() => act('skip')}>跳过离线玩家</button>
            )}
            <p className="party-note">回答和挑战可以当面完成，也可以用你们自己的语音通话。</p>
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
    lede: '轮到你时，选一个问题聊聊自己，或抽一个小挑战给同桌的人看看。有不想做的题，随时跳过。',
    Art: () => <div className="party-art party-art-truth" aria-hidden="true"><span>?</span><i>✦</i></div>,
    note: '2 到 10 人。内置 20 道真心话和 20 道大冒险，同一局内抽到的题不会重复。',
    steps: [
      { title: '入座', text: '通过邀请链接或房间号加入。房主选玩一圈或两圈。' },
      { title: '轮流抽题', text: '按座位顺序发题。当前玩家选择一类，抽到的题会显示给全桌。' },
      { title: '交给下一位', text: '完成或跳过后由下一位抽题。约定的圈数玩完即结束。' },
    ],
    goals: [],
  },
  Options: TruthOptions,
  Board: TruthBoard,
};
