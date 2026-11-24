import { useState } from 'react';
import { GreyTide, type RoomSnapshot } from '@tabletop/shared';
import { net } from '../../net/client';
import type { GameClient } from '../registry';
import { PartyTable } from './PartyTable';

const { greyTide, ROUND_LIMIT, sites, parts, crews, caches, routeName, channelName } = GreyTide;
const heroArt = `${import.meta.env.BASE_URL}grey-tide/lighthouse`;
type View = GreyTide.GreyTideView;
const roles = ['signal', 'mechanic'] as const;
const locations = ['radio', 'workshop', 'gallery', 'lamp'] as const;
const components = ['bracket', 'wire'] as const;
const outcomes = {
  rescued: '船只安全通过',
  storm: '暴潮淹没了栈道',
  abandoned: '这次值守结束了',
};
const partStatus = { missing: '待收集', recovered: '工具箱中', installed: '已装好' };
const readingLabel = { direction: '航向', flash: '闪灯' };

function GreyTideOptions() {
  return (
    <div className="party-lobby-copy">
      <p>仅限 2 人。1 号座位是信号员，2 号座位是维修员。</p>
      <p>你们有 {ROUND_LIMIT} 轮时间收集部件、修好灯塔，并给迷航船只发出正确的信号。</p>
    </div>
  );
}

function StationMap({ view }: { view: View }) {
  return (
    <section className="panel party-panel grey-map">
      <h2>灯塔平面图</h2>
      <div className="grey-stations">
        {locations.map((site) => {
          const part = caches[site];
          const occupants = roles.filter((role) => view.positions[role] === site);
          return (
            <article key={site} className="grey-station" data-current={view.yourCrew !== null && occupants.includes(view.yourCrew)}>
              <h3>{sites[site]}</h3>
              <p>{part ? `${parts[part]} · ${partStatus[view.parts[part]]}`
                : site === 'radio' ? '监听与发信' : '安装灯塔部件'}</p>
              {occupants.length > 0 && (
                <div className="grey-occupants">
                  {occupants.map((role) => <span key={role}>{crews[role]}{view.yourCrew === role && '（你）'}</span>)}
                </div>
              )}
            </article>
          );
        })}
      </div>
      <p className="grey-map-note">横向或纵向相邻的房间相通。移动前请看本轮封路。</p>
    </section>
  );
}

function GreyOrders({ view, partnerPresent }: { view: View; partnerPresent: boolean }) {
  const [selected, setSelected] = useState<number | null>(null);
  const chosen = selected === null ? null : view.choices[selected];
  return (
    <section className="panel party-panel grey-action">
      <h2>本轮行动</h2>
      {view.yourCrew && <p className="party-kicker">{crews[view.yourCrew]} · {sites[view.positions[view.yourCrew]]}</p>}
      {!partnerPresent && <p className="party-note">搭档暂时离线，重连后可以继续。</p>}
      {view.yourPlan ? (
        <div className="grey-wait" role="status">
          <strong>{view.yourPlan.label} · 已提交</strong>
          <p>等搭档提交后，两人的行动会一起结算。</p>
        </div>
      ) : (
        <>
          <p>每人选一项。等两人都提交后，才会公开本轮结果。</p>
          <div className="grey-orders" role="group" aria-label="选择本轮行动">
            {view.choices.map(({ label, detail }, index) => (
              <button key={label} type="button" className="grey-order" aria-pressed={selected === index}
                onClick={() => setSelected(index)}>
                <strong>{label}</strong>
                <small>{detail}</small>
              </button>
            ))}
          </div>
          <button type="button" className="btn btn-primary" disabled={!chosen} onClick={() => {
            if (chosen) net.act({ type: 'plan', round: view.round, order: chosen.order });
          }}>提交行动</button>
        </>
      )}
    </section>
  );
}

function GreyTideBoard({ room }: { room: RoomSnapshot }) {
  const view = room.view as View;
  const partner = room.players.find((player) => player.id !== room.you);
  const last = view.history.at(-1);
  const installed = components.filter((part) => view.parts[part] === 'installed').length;

  return (
    <PartyTable room={room} name={greyTide.name} theme="lighthouse">
      <section className="panel party-panel grey-forecast">
        {view.outcome ? (
          <>
            <h2>{outcomes[view.outcome]}</h2>
            {view.revealedChannel && <p>迷航船只的信号为 {channelName(view.revealedChannel)}。</p>}
          </>
        ) : (
          <>
            <p className="party-kicker">第 {view.round} / {ROUND_LIMIT} 轮</p>
            <h2>{view.forecast.name}</h2>
            <p className={view.forecast.closure ? 'grey-closure' : undefined}>
              {view.forecast.closure ? `${routeName(view.forecast.closure)} 暂时封闭。` : '这一轮通道全部开放。'}
            </p>
          </>
        )}
        <div className="grey-mission">
          <div>
            <h3>灯塔部件 · {installed} / {components.length}</h3>
            <ul>{components.map((part) => <li key={part}>{parts[part]} · {partStatus[view.parts[part]]}</li>)}</ul>
          </div>
          <div>
            <h3>求救信号 · {view.readings.length} / 2</h3>
            <ul>
              {view.readings.length ? view.readings.map(({ field, value }) => (
                <li key={field}>{readingLabel[field]} · {value}</li>
              )) : <li>还没截获线索</li>}
            </ul>
          </div>
        </div>
      </section>

      <div className="grey-layout">
        {!view.outcome && view.yourCrew && (
          <GreyOrders key={`${room.code}-${room.gameSeq}-${view.round}`} view={view} partnerPresent={Boolean(partner?.connected)} />
        )}
        <div className="grey-crew-map">
          <section className="panel party-panel grey-crew" aria-label="搭档状态">
            {roles.map((role) => {
              const player = room.players.find(({ id }) => id === view.crew[role]);
              return (
                <div key={role}>
                  <strong>{crews[role]}{view.yourCrew === role && '（你）'}</strong>
                  <p>{player?.name ?? '玩家'} · {sites[view.positions[role]]}</p>
                  {!view.outcome && (
                    <small>{!player?.connected ? '离线' : view.ready.includes(role) ? '已提交' : '选择中'}</small>
                  )}
                </div>
              );
            })}
          </section>
          <StationMap view={view} />
        </div>
      </div>

      {last && (
        <section className="panel party-panel grey-log">
          <h2>第 {last.round} 轮结果</h2>
          <ul>{last.events.map((event, index) => <li key={index}>{event}</li>)}</ul>
          {view.history.length > 1 && (
            <details className="party-details">
              <summary>查看之前的航海日志</summary>
              <ol className="party-history">
                {view.history.slice(0, -1).reverse().map(({ round, forecast, events }) => (
                  <li key={round}>
                    <strong>第 {round} 轮 · {forecast}</strong>
                    {events.map((event, index) => <p key={index}>{event}</p>)}
                  </li>
                ))}
              </ol>
            </details>
          )}
        </section>
      )}
      {!view.outcome && room.hostId === room.you && (
        <button type="button" className="link party-end" onClick={() => {
          if (window.confirm('要结束这次值守并结算吗？')) net.act({ type: 'end', round: view.round });
        }}>结束本局</button>
      )}
    </PartyTable>
  );
}

export const greyTideClient: GameClient = {
  id: greyTide.id,
  name: greyTide.name,
  tagline: greyTide.tagline,
  icon: <span className="grey-tab-mark" aria-hidden="true">✧</span>,
  hero: {
    lede: '雾里有船发出求救信号，岸上的灯塔却熄了。一个人听电报，一个人修灯。涨潮前，你们必须一起把船引出礁区。',
    Art: () => (
      <img className="grey-hero-art" src={`${heroArt}.webp`}
        srcSet={`${heroArt}-small.webp 450w, ${heroArt}.webp 900w`}
        sizes="(max-width: 860px) 76vw, 45vw"
        width={900} height={900} alt="雨夜海崖上的灯塔，光束照向远处的船" />
    ),
    note: '原创双人合作游戏。创建房间后邀请一位搭档，坐在 1 号位的是信号员。',
    steps: [
      { title: '查看潮况', text: '每轮公布一张潮况牌。部分通道会关闭，信号员可留在电报室指引维修员过封路。' },
      { title: '同时下令', text: '先和搭档商量，再分别提交一个行动。你们可以分头找部件，由维修员在灯室安装。' },
      { title: '发出引航信号', text: '信号员监听两次，可查清船的航向和闪灯方式。也可以提前猜测，但发错会额外耗去一轮。' },
    ],
    goals: [
      { tone: 'gilt', title: `在第 ${ROUND_LIMIT} 轮结束前救船`, text: '装好透镜托架和导电铜线，再发出匹配船只的信号。同轮安排最后一次维修和发信也能成功。' },
    ],
  },
  Options: GreyTideOptions,
  Board: GreyTideBoard,
};
