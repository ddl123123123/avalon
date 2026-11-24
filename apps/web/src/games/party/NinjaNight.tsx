import { useState } from 'react';
import { NinjaNight, type RoomPlayer, type RoomSnapshot } from '@tabletop/shared';
import { net } from '../../net/client';
import type { GameClient } from '../registry';
import { PartyTable } from './PartyTable';

const { ninjaNight, MAX_ROUNDS, shadowCount } = NinjaNight;
const factionNames = { guard: '守夜忍', shadow: '影忍' };

function NinjaOptions({ playerCount }: { playerCount: number }) {
  const shadows = shadowCount(playerCount);
  return (
    <div className="party-lobby-copy">
      <p>{playerCount} 人局 · {playerCount - shadows} 名守夜忍，{shadows} 名影忍</p>
      <p>每人有一次私密侦察。每轮讨论后匿名投票，单独最高票的玩家公开阵营。三轮内找齐影忍，守夜忍就获胜。</p>
    </div>
  );
}

function NinjaBoard({ room }: { room: RoomSnapshot }) {
  const view = room.view as NinjaNight.NinjaView;
  const players = room.players;
  const label = (id: string) => {
    const player = players.find((seat) => seat.id === id);
    return player ? `${player.seatIndex + 1} 号 · ${player.name}` : '未知玩家';
  };
  const waiting = players.filter((player) => !view.votedPlayers.includes(player.id));
  const canSettle = room.hostId === room.you && waiting.length > 0 && waiting.every((player) => !player.connected);
  const revealed = new Map(view.history.flatMap(({ revealed }) => revealed ? [[revealed.player, revealed.faction] as const] : []));
  const otherPlayers = players.filter((player) => player.id !== room.you);
  return (
    <PartyTable room={room} name={ninjaNight.name} theme="ninja">
      <section className="panel party-panel">
        <p className="party-kicker">{view.winner ? '对局结束' : `第 ${view.round} / ${MAX_ROUNDS} 轮 · 讨论与投票`}</p>
        <h2>{view.winner ? `${factionNames[view.winner]}获胜` : view.faction && `你是${factionNames[view.faction]}`}</h2>
        {view.revealedShadows ? (
          <p>本局影忍：{view.revealedShadows.map(label).join('、')}</p>
        ) : (
          <p>{view.faction === 'shadow' ? '只要三轮结束时还有影忍没有公开阵营，你们就赢。' : '在三轮内找出所有影忍。'}</p>
        )}
        {!view.winner && view.allies.length > 0 && <p>你的同伴：{view.allies.map(label).join('、')}</p>}
        {view.clue && (
          <p className="party-note">你的侦察结果：{label(view.clue.first)} 与 {label(view.clue.second)} {view.clue.same ? '同阵营' : '不同阵营'}。</p>
        )}
      </section>

      {!view.winner && (
        <section className="panel party-panel">
          <h2>本轮行动</h2>
          <p>用你们的语音通话或当面讨论。投票提交后，系统只公布各人得票数。</p>
          {view.myVote ? (
            <p className="party-note">已投给 {label(view.myVote)}，等待本轮结算。</p>
          ) : (
            <NinjaActions
              key={`${room.code}-${room.gameSeq}-${view.round}`}
              round={view.round}
              others={otherPlayers}
              candidates={otherPlayers.filter((player) => !revealed.has(player.id))}
              canScout={!view.clue}
            />
          )}
          {canSettle && (
            <button type="button" className="btn btn-ghost" onClick={() => net.act({ type: 'settle_offline', round: view.round })}>
              跳过离线玩家并结算
            </button>
          )}
        </section>
      )}

      <section className="panel party-panel">
        <h2>玩家{!view.winner && <small> · 已投票 {view.votedPlayers.length} / {players.length}</small>}</h2>
        <ul className="party-roster">
          {players.map((player) => (
            <li key={player.id}>
              <span>{label(player.id)}{player.id === room.you && '（你）'}</span>
              <small>
                {revealed.has(player.id) && factionNames[revealed.get(player.id)!]}
                {!view.winner && ` ${!player.connected ? '离线' : view.votedPlayers.includes(player.id) ? '已投票' : '待投票'}`}
              </small>
            </li>
          ))}
        </ul>
      </section>

      {view.history.length > 0 && (
        <section className="panel party-panel">
          <h2>查验记录</h2>
          <ol className="party-history">
            {view.history.map(({ round, revealed: result, tally }) => (
              <li key={round}>
                <strong>第 {round} 轮 · {result ? `${label(result.player)} 是${factionNames[result.faction]}` : '平票，本轮无人公开阵营'}</strong>
                <p>{tally.map(({ target, votes }) => `${label(target)} ${votes} 票`).join('、')}</p>
              </li>
            ))}
          </ol>
        </section>
      )}
    </PartyTable>
  );
}

function PlayerSelect({ label, players, value, setValue }: {
  label: string;
  players: RoomPlayer[];
  value: string;
  setValue: (id: string) => void;
}) {
  return (
    <label className="field">
      {label}
      <select className="input" value={value} onChange={(event) => setValue(event.currentTarget.value)}>
        <option value="">请选择玩家</option>
        {players.map((player) => <option key={player.id} value={player.id}>{player.seatIndex + 1} 号 · {player.name}</option>)}
      </select>
    </label>
  );
}

function NinjaActions({ round, others, candidates, canScout }: {
  round: number;
  others: RoomPlayer[];
  candidates: RoomPlayer[];
  canScout: boolean;
}) {
  const [first, setFirst] = useState('');
  const [second, setSecond] = useState('');
  const [target, setTarget] = useState('');
  return (
    <>
      {canScout && (
        <details className="party-details">
          <summary>私密侦察 · 每局一次，可留到后续轮次</summary>
          <p>选择两位其他玩家。只有你会知道他们是否同阵营。</p>
          <div className="party-fields">
            <PlayerSelect label="第一位" players={others} value={first} setValue={setFirst} />
            <PlayerSelect label="第二位" players={others} value={second} setValue={setSecond} />
          </div>
          <button type="button" className="btn btn-ghost" disabled={!first || !second || first === second}
            onClick={() => net.act({ type: 'scout', round, first, second })}>查看侦察结果</button>
        </details>
      )}
      <div className="party-actions">
        <PlayerSelect label="投票查验对象" players={candidates} value={target} setValue={setTarget} />
        <button type="button" className="btn btn-primary" disabled={!target}
          onClick={() => net.act({ type: 'vote', round, target })}>确认投票</button>
      </div>
    </>
  );
}

export const ninjaNightClient: GameClient = {
  id: ninjaNight.id,
  name: ninjaNight.name,
  tagline: ninjaNight.tagline,
  icon: <span className="party-tab-mark" aria-hidden="true">☾</span>,
  hero: {
    lede: '夜色掩护着潜伏的影忍。用一次私密侦察比对阵营，再和同桌的人讨论，决定这一轮要查验谁。',
    Art: () => <div className="party-art party-art-ninja" aria-hidden="true"><span /><i /></div>,
    note: '4 到 8 人的原创阵营推理游戏。可加机器人凑人数。',
    steps: [
      { title: '查收密令', text: '查看自己的阵营。影忍也能看到同伴。' },
      { title: '私密侦察', text: '全局任选一轮，对比两位其他玩家，只查得同阵营或不同阵营。' },
      { title: '匿名投票', text: '每轮讨论后投票。唯一最高票公开阵营，平票无人公开。已公开的玩家仍能投票。' },
    ],
    goals: [
      { tone: 'good', title: '守夜忍', text: '三轮内公开所有影忍的阵营。' },
      { tone: 'evil', title: '影忍', text: '三轮结束时至少有一名影忍仍未公开阵营。' },
    ],
  },
  Options: NinjaOptions,
  Board: NinjaBoard,
};
