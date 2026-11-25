import { useState } from 'react';
import { StreetStall, type RoomSnapshot } from '@tabletop/shared';
import { net } from '../../net/client';
import type { GameClient } from '../registry';
import { PartyTable } from './PartyTable';

const { cellName, fixedRoles, modes, modeFor, roles, street, streetStall, stallIds, stallNames, ROUND_LIMIT, ENFORCEMENT_LIMIT, MEAL_TARGET } = StreetStall;
const art = `${import.meta.env.BASE_URL}street-stall/night-market`;
type View = StreetStall.StallView;
const outcomes = {
  customer: '顾客买齐了两份食物',
  officer: '城管及时清空了两个摊位',
  'late-clear': '摊主撑过了执法时限',
  stalls: '摊主守到了收摊',
  none: '全员落败',
};

function StreetOptions({ options, playerCount, players, editable, onChange }: {
  options: StreetStall.StallOptions; playerCount: number; players: RoomSnapshot['players']; editable: boolean;
  onChange: (patch: unknown) => void;
}) {
  const mode = modeFor(playerCount, options.duel);
  const fixed = fixedRoles(options, mode, players.map(({ id }) => id));
  const taken = new Set(Object.values(fixed));
  return (
    <div className="party-lobby-copy">
      <h2>{modes[mode].name}</h2>
      {playerCount === 2 && (
        <fieldset className="lobby-size">
          <legend>双人模式</legend>
          <div className="lobby-size-buttons">
            {(['duel-a', 'duel-b'] as const).map((duel) => (
              <button key={duel} type="button" className="lobby-size-button" disabled={!editable}
                aria-pressed={options.duel === duel} onClick={() => onChange({ duel })}>
                {duel === 'duel-a' ? 'A · 顾客对双控' : 'B · 城管对双控'}
              </button>
            ))}
          </div>
        </fieldset>
      )}
      <fieldset className="lobby-size street-role-options">
        <legend>角色分配</legend>
        {editable && <p>可以指定真人或机器人，留空的角色开局时随机抽取。</p>}
        {modes[mode].seats.map((role) => (
          <label key={role} className="street-role-option">
            <span>{roles[role]}</span>
            <select className="input" value={fixed[role] ?? ''} disabled={!editable}
              onChange={(event) => onChange({ [role]: event.target.value || null })}>
              <option value="">随机</option>
              {players.map(({ id, name, seatIndex, isBot }) => (
                <option key={id} value={id} disabled={taken.has(id) && fixed[role] !== id}>
                  {seatIndex + 1} 号 · {name}{isBot ? '（机器人）' : ''}
                </option>
              ))}
            </select>
          </label>
        ))}
      </fieldset>
      <p>{mode === 'split' ? '每个摊主有一次拒售。到第 10 回合，卖过食物且仍在场的摊主各自获胜。'
        : '两摊共享一次拒售。到第 10 回合，卖过食物且至少守住一摊即可获胜。'}</p>
      {mode === 'duel-b' && <p>城管有一次「突击」，可移动 5 格。</p>}
    </div>
  );
}

function StreetMap({ view, moves, chosen, setChosen }: {
  view: View; moves: View['moves']; chosen: string | null; setChosen: (id: string) => void;
}) {
  const steps = new Map(moves.map((move) => [move.to, move.steps]));
  return (
    <div className="street-map" aria-label="21 格双岔路地图">
      {street.map(({ id, x, y, label }) => {
        const customer = view.customerCell === id;
        const officer = view.officerCell === id;
        const shop = stallIds.find((stall) => view.stalls[stall].cell === id);
        const open = shop && view.stalls[shop].clearedRound === null;
        const distance = steps.get(id);
        const title = [label, customer && '顾客', officer && '城管', shop && (open ? stallNames[shop] : '摊位已清'),
          distance && `可走 ${distance} 格`].filter(Boolean).join(' · ');
        return (
          <button key={id} type="button" className="street-cell"
            style={{ gridColumn: x + 1, gridRow: y + 1 }}
            disabled={distance === undefined} aria-pressed={chosen === id} aria-label={title} title={title}
            data-shop={Boolean(open)} onClick={() => setChosen(id)}>
            <span className="street-cell-marks" aria-hidden="true">
              {shop && <i data-unit={open ? 'stall' : 'closed'}>{shop === 'a' ? '①' : '②'}</i>}
              {customer && <i data-unit="customer">客</i>}
              {officer && <i data-unit="officer">管</i>}
              {!shop && !customer && !officer && (distance ?? '·')}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function StreetPlay({ room, view }: { room: RoomSnapshot; view: View }) {
  const [chosen, setChosen] = useState<string | null>(null);
  const [rush, setRush] = useState(false);
  const moves = rush ? view.rushMoves : view.moves;
  const move = moves.find(({ to }) => to === chosen);
  const ownTurn = view.currentPlayer === room.you && !view.result;
  const label = (id: string | null) => room.players.find((player) => player.id === id)?.name ?? '玩家';
  const actor = view.turn === 'customer' ? '顾客' : view.turn === 'officer' ? '城管' : stallNames[view.sale!.stall];
  const act = (type: 'move' | 'wait' | 'buy' | 'sell' | 'refuse') => net.act({
    type, round: view.round, actor: view.turn, ...(type === 'move' && move ? { to: move.to, rush } : {}),
  });

  return (
    <div className="street-play" data-turn={view.turn} data-can-buy={view.canBuy}>
      <section className="panel party-panel street-map-panel">
        <h2>街区地图</h2>
        <p className="street-map-legend"><span data-unit="customer">客 顾客</span><span data-unit="officer">管 城管</span><span data-unit="stall">① ② 小摊</span></p>
        <StreetMap view={view} moves={moves} chosen={chosen} setChosen={setChosen} />
        {ownTurn && view.turn !== 'stall' && (
          <button type="button" className="btn btn-primary" disabled={!move} onClick={() => move && act('move')}>
            {move ? `移动到${cellName(move.to)} · ${move.steps} 格` : '点亮色格子选路线'}
          </button>
        )}
      </section>
      <section className="panel party-panel street-actions">
        <h2>{view.result ? '街区结算' : ownTurn ? `轮到你 · ${actor}` : `等待 ${label(view.currentPlayer)} · ${actor}`}</h2>
        {view.result ? <p>{outcomes[view.result.reason]}。</p> : (
          <>
            <p>{view.turn === 'customer' ? '移动最多 2 格，或在原地等候。到摊后须完整等一回合才能购买。' :
              view.turn === 'officer' ? '移动最多 3 格。可以停在顾客所在格，不能穿过它；结算时顾客同格会保住摊。' :
                '顾客已等满一回合。你可以卖出，也可以用掉一次拒售。'}</p>
            {view.sale && <p className="party-note">{stallNames[view.sale.stall]} · {view.sale.refused ? '本次已拒售' : '购买等待本轮结算'}</p>}
            {ownTurn && (view.turn === 'stall' ? (
              <div className="party-actions">
                <button type="button" className="btn btn-primary" onClick={() => act('sell')}>卖出一份</button>
                <button type="button" className="btn btn-ghost" onClick={() => act('refuse')}>使用拒售</button>
              </div>
            ) : (
              <div className="party-actions">
                <button type="button" className="btn btn-ghost" onClick={() => act('wait')}>原地待机</button>
                {view.canBuy && <button type="button" className="btn btn-primary" onClick={() => act('buy')}>购买一份</button>}
                {view.rushMoves.length > 0 && (
                  <button type="button" className="btn btn-ghost" aria-pressed={rush} onClick={() => {
                    setRush((value) => !value); setChosen(null);
                  }}>{rush ? '已选突击 · 最多 5 格' : '突击 · 多走 2 格'}</button>
                )}
              </div>
            ))}
          </>
        )}
        {view.events.length > 0 && <ul className="street-events">{view.events.map((event, index) => <li key={index}>{event}</li>)}</ul>}
      </section>
    </div>
  );
}

function StreetBoard({ room }: { room: RoomSnapshot }) {
  const view = room.view as View;
  const label = (id: string) => room.players.find((player) => player.id === id)?.name ?? '玩家';
  const last = view.history.at(-1);
  return (
    <PartyTable room={room} name={streetStall.name} theme="street">
      <section className="panel party-panel street-status">
        <p className="party-kicker">{modes[view.mode].name} · 第 {view.round} / {ROUND_LIMIT} 回合</p>
        <h2>{view.result ? view.result.winners.length ? `${view.result.winners.map(label).join('、')}获胜` : '全员落败' : '顾客 → 小摊 → 城管'}</h2>
        <ul className="party-roster street-role-list" aria-label="本局角色">
          {modes[view.mode].seats.map((role) => {
            const player = room.players.find(({ id }) => id === view.roleOwners[role]);
            return <li key={role}>{roles[role]} · {player?.name ?? '玩家'}{player?.id === room.you ? '（你）' : player?.isBot ? '（机器人）' : ''}</li>;
          })}
        </ul>
        <p>顾客已买 {view.meals} / {MEAL_TARGET} 份 · {view.round <= ENFORCEMENT_LIMIT ? `执法窗口还剩 ${ENFORCEMENT_LIMIT - view.round + 1} 回合` : '执法窗口已过'}</p>
        <ul className="street-shops">
          {stallIds.map((id) => {
            const shop = view.stalls[id];
            const owner = view.owners.stalls[id];
            return (
              <li key={id}>
                <strong>{stallNames[id]} · {label(owner)}</strong>
                <span>{shop.clearedRound === null ? `营业 · 已卖 ${shop.sold} 份` : `第 ${shop.clearedRound} 回合被清`}</span>
                {shop.clearedRound === null && <small>拒售{view.usedRefusals.includes(owner) ? '已用' : '可用'}{view.mode === 'split' ? '' : '（两摊共享）'}</small>}
              </li>
            );
          })}
        </ul>
      </section>
      <StreetPlay key={`${view.round}-${view.turn}-${room.gameSeq}`} room={room} view={view} />
      {last && (
        <details className="panel party-panel party-details">
          <summary>回合记录 · 最近第 {last.round} 回合</summary>
          <ol className="party-history">
            {[...view.history].reverse().map(({ round, events }) => (
              <li key={round}><strong>第 {round} 回合</strong>{events.map((event, index) => <p key={index}>{event}</p>)}</li>
            ))}
          </ol>
        </details>
      )}
    </PartyTable>
  );
}

export const streetStallClient: GameClient = {
  id: streetStall.id,
  name: streetStall.name,
  tagline: streetStall.tagline,
  icon: <span className="street-tab-mark" aria-hidden="true">摊</span>,
  hero: {
    lede: '晚饭点，两条巷口各摆了一摊。顾客想买到两份吃的，摊主想把买卖留住，城管只剩五回合能赢。',
    Art: () => <img className="street-hero" src={`${art}.webp`} srcSet={`${art}-small.webp 450w, ${art}.webp 900w`}
      sizes="(max-width: 860px) 76vw, 45vw" width={900} height={900} alt="入夜小巷里，两辆热气腾腾的路边摊亮起了灯" />,
    note: '推荐 3 人标准局。也可开 2 人 A／B 对战，或让两位老板分控摊位的 4 人局。',
    steps: [
      { title: '沿双岔路走', text: '顾客先走 2 格，城管最后走 3 格。摊位固定，平时自动待机，有购买时选择卖出或拒售。' },
      { title: '等满一轮再买', text: '抵达摊位后另花一整回合等候，下一回合才能买。顾客和摊同格时，该摊不会被城管清除。' },
      { title: '行动完再结算', text: '先交易，再清摊。买满两份顾客立刻赢。城管前五回合清空两摊才赢，最多打十回合。' },
    ],
    goals: [
      { tone: 'gilt', title: '摊主怎么赢', text: '标准局和双人局在十回合后卖过且有摊存活便胜；第六回合后才被清空也算拖延胜。四人局只看各自的摊是否卖过并撑到终局。' },
    ],
  },
  Options: StreetOptions,
  Board: StreetBoard,
};
