import { useState } from 'react';
import { NinjaNight, type RoomSnapshot } from '@tabletop/shared';
import { net } from '../../net/client';
import type { GameClient } from '../registry';
import { NinjaCardArt, NinjaCardStyles, NinjaIdentityCard, ninjaFactions as factionNames, useNinjaCardStyle } from './NinjaCards';
import { PartyTable } from './PartyTable';

const { ninjaNight, NIGHT_LIMIT, REQUIRED_MERIT, QUEEN_CHANCE, shadowCount, professions, professionIds, sites, siteOrder } = NinjaNight;
type View = NinjaNight.NinjaView;
type NightResult = View['history'][number];
const phases = { draft: '暗选职业', night: '夜间行动', dawn: '天亮结算', ended: '对局结束' };

function ProfessionGuide() {
  return (
    <details className="party-details ninja-guide">
      <summary>查看六种职业</summary>
      <dl>
        {professionIds.map((id) => (
          <div key={id}><dt>{professions[id].name} · {professions[id].skill}</dt><dd>{professions[id].detail}</dd></div>
        ))}
      </dl>
    </details>
  );
}

function NinjaOptions({ playerCount }: { playerCount: number }) {
  const shadows = shadowCount(playerCount);
  return (
    <div className="party-lobby-copy">
      <p>{playerCount} 人局 · {playerCount - shadows} 名忠臣，{shadows} 名反贼</p>
      <p>双方各有 1–5 号位阶，1 号最高。五夜后有皇后牌则直接定胜负，否则按列席者的位阶比较。</p>
      {playerCount % 2 === 1 && <p>奇数局里，若有反贼选中焦点，反贼在该处额外获得 1 点力量。</p>}
      <ProfessionGuide />
      <NinjaCardStyles />
    </div>
  );
}

function DraftStep({ view, style }: { view: View; style: ReturnType<typeof useNinjaCardStyle> }) {
  const [selected, setSelected] = useState<NinjaNight.Profession | null>(null);
  if (view.profession) {
    return <p className="ninja-notice" role="status">已暗选{professions[view.profession].name}。等待其他玩家。</p>;
  }
  if (!view.offers.length) return <p className="ninja-notice">这夜已跳过你的座位。</p>;

  return (
    <>
      <p>从这夜发给你的三张牌里暗选一张。每夜会重新发牌。</p>
      <div className="ninja-draft" role="group" aria-label="选择职业">
        {view.offers.map((profession) => {
          const card = professions[profession];
          return (
            <button key={profession} type="button" className="ninja-profession" data-style={style}
              aria-pressed={profession === selected} onClick={() => setSelected(profession)}>
              <span aria-hidden="true" className="ninja-profession-mark">{card.mark}</span>
              <strong>{card.name}</strong>
              <span className="ninja-skill">{card.skill}</span>
              <small>{card.detail}</small>
            </button>
          );
        })}
      </div>
      <button type="button" className="btn btn-primary" disabled={!selected} onClick={() => {
        if (selected) net.act({ type: 'draft', night: view.night, profession: selected });
      }}>确认职业</button>
    </>
  );
}

function NightStep({ view }: { view: View }) {
  const [selected, setSelected] = useState<NinjaNight.Site | null>(null);
  const role = view.profession && professions[view.profession];
  if (!role) return <p className="ninja-notice">这夜已跳过你的座位。可以在下一夜重新加入。</p>;
  if (view.target) {
    return <p className="ninja-notice" role="status">已锁定{sites[view.target].name}。等所有玩家提交后结算。</p>;
  }

  return (
    <>
      <p><strong>{role.name} · {role.skill}</strong>　{role.detail}</p>
      <p className="party-note">顺时针顺序：{[...siteOrder, siteOrder[0]].map((site) => sites[site].name).join(' → ')}。</p>
      <div className="ninja-site-grid" role="group" aria-label="选择阵眼">
        {siteOrder.map((site) => (
          <button key={site} type="button" className="ninja-site" aria-pressed={selected === site}
            data-focus={view.focus === site} onClick={() => setSelected(site)}>
            <span aria-hidden="true" className="ninja-site-mark">{sites[site].mark}</span>
            <strong>{sites[site].name}</strong>
            <small>{view.focus === site ? '焦点 · 2 功牌' : '1 功牌'}</small>
          </button>
        ))}
      </div>
      <button type="button" className="btn btn-primary" disabled={!selected} onClick={() => {
        if (selected) net.act({ type: 'visit', night: view.night, site: selected });
      }}>锁定阵眼</button>
    </>
  );
}

function SiteResults({ night }: { night: NightResult }) {
  return (
    <>
      <p>力量左侧为忠臣，右侧为反贼。到场的胜方玩家各获功牌。</p>
      <ul className="ninja-site-grid ninja-outcomes">
        {night.sites.map((result) => (
          <li key={result.site} className="ninja-site" data-focus={result.site === night.focus}>
            <strong>{sites[result.site].name}{result.site === night.focus && ' · 焦点'}</strong>
            <small>力量 {result.power.guard} : {result.power.shadow}</small>
            <small>{result.winner ? `${factionNames[result.winner]}占领 · ${result.merit} 功牌` : '平手 · 无功牌'}</small>
          </li>
        ))}
      </ul>
    </>
  );
}

function NinjaBoard({ room }: { room: RoomSnapshot }) {
  const view = room.view as View;
  const cardStyle = useNinjaCardStyle();
  const isHost = room.hostId === room.you;
  const actionable = view.phase === 'draft' || view.phase === 'night';
  const canSkip = isHost && view.waiting.length > 0 &&
    view.waiting.every((id) => !room.players.find((player) => player.id === id)?.connected);
  const last = view.history.at(-1);
  const past = view.history.slice(0, view.phase === 'ended' || view.phase === 'dawn' ? -1 : undefined);
  const phaseKey = `${room.code}-${room.gameSeq}-${view.night}`;
  const final = view.final;
  const queenHolder = final?.queen ? room.players.find((player) => player.id === final.queen) : null;

  return (
    <PartyTable room={room} name={ninjaNight.name} theme="ninja">
      <section className="panel party-panel">
        <p className="party-kicker">第 {view.night} / {NIGHT_LIMIT} 夜 · {phases[view.phase]}</p>
        <h2>{final?.winner === 'draw' ? '双方打平' : final ? `${factionNames[final.winner]}获胜` : `本夜焦点 · ${sites[view.focus].name}`}</h2>
        {final ? (
          <p>{queenHolder ? `${queenHolder.name}亮出皇后牌，持牌者所在阵营直接获胜。`
            : final.rank ? `比到 ${final.rank} 号位阶时，只有获胜方有人列席。`
              : '逐级比较后，双方没有出现仅一方有人列席的位阶。'}</p>
        ) : (
          <p className="ninja-notice">我的功牌 {view.merit} 枚 · {view.merit >= REQUIRED_MERIT
            ? '已取得列席资格' : `再拿 ${REQUIRED_MERIT - view.merit} 枚即可列席`}</p>
        )}
        {!final && view.faction && view.rank && (
          <details className="party-details ninja-identity">
            <summary>查看我的身份牌</summary>
            <div className="ninja-identity-body">
              <NinjaIdentityCard faction={view.faction} style={cardStyle} rank={view.rank} />
              <div>
                <p>1 号位阶最高。累积 {REQUIRED_MERIT} 枚功牌，终局才能以这个位阶列席。</p>
                {view.hasQueen && <p className="ninja-queen"><strong>皇后牌</strong><br />终局公开后，你所在的阵营直接获胜。</p>}
              </div>
            </div>
          </details>
        )}
      </section>

      <section className="panel party-panel">
        <h2>{phases[view.phase]}</h2>
        {view.phase === 'draft' && <DraftStep key={phaseKey} view={view} style={cardStyle} />}
        {view.phase === 'night' && <NightStep key={phaseKey} view={view} />}
        {(view.phase === 'dawn' || view.phase === 'ended') && last && (
          <>
            <SiteResults night={last} />
            {view.profession && view.target && (
              <p className="party-note">这夜你用{professions[view.profession].name}去了{sites[view.target].name}。</p>
            )}
            {view.phase === 'dawn' && (
              isHost ? (
                <button type="button" className="btn btn-primary"
                  onClick={() => net.act({ type: 'next_night', night: view.night })}>开启下一夜</button>
              ) : <p className="party-note">等房主开启下一夜。</p>
            )}
          </>
        )}
        {actionable && canSkip && (
          <button type="button" className="btn btn-ghost"
            onClick={() => net.act({ type: 'settle_offline', night: view.night, phase: view.phase })}>
            跳过离线座位
          </button>
        )}
      </section>

      <section className="panel party-panel">
        <h2>玩家{actionable && <small> · 还有 {view.waiting.length} 人待提交</small>}</h2>
        <ul className="party-roster">
          {room.players.map((player) => {
            const seat = final?.seats.find(({ id }) => id === player.id);
            return <li key={player.id}>
              <span>{player.seatIndex + 1} 号 · {player.name}{player.id === room.you && '（你）'}</span>
              <small>{seat
                ? `${factionNames[seat.faction]} ${seat.rank} 号 · ${seat.merit >= REQUIRED_MERIT ? '列席' : '未列席'}${final?.queen === player.id ? ' · 皇后牌' : ''}`
                : !player.connected ? '离线' : actionable ? view.waiting.includes(player.id) ? '待提交' : '已处理' : ''}</small>
            </li>;
          })}
        </ul>
        <ProfessionGuide />
      </section>

      {past.length > 0 && (
        <details className="panel party-panel party-details ninja-history">
          <summary>查看往夜战报</summary>
          <ol className="party-history">
            {[...past].reverse().map((night) => (
              <li key={night.night}>
                <h3>第 {night.night} 夜</h3>
                <SiteResults night={night} />
              </li>
            ))}
          </ol>
        </details>
      )}
    </PartyTable>
  );
}

export const ninjaNightClient: GameClient = {
  id: ninjaNight.id,
  name: ninjaNight.name,
  tagline: ninjaNight.tagline,
  icon: <span className="party-tab-mark" aria-hidden="true">☾</span>,
  hero: {
    lede: '虚构王朝的宫城连夜封门。忠臣与反贼各领一枚位阶令，暗中争夺宫门、御花园和望楼。五夜之后，谁能列席定局？',
    Art: NinjaCardArt,
    note: '4 到 10 人，可添加机器人。奇数局有反贼到达焦点时，反贼在该处额外增加 1 点力量。',
    steps: [
      { title: '领身份，选职业', text: '阵营和 1–5 号位阶保密。每夜从三张职业牌中暗选一张，再秘密决定去哪一处。' },
      { title: '夜夺功牌', text: '天亮时，力量占优的阵营占领阵眼。亲自到场的胜方各领 1 枚功牌，焦点各领 2 枚，平手无人领取。' },
      { title: '五夜后比位阶', text: `至少 ${REQUIRED_MERIT} 枚功牌才能列席。从 1 号起，只有一方有人列席的位阶决定胜负。两方都有或都没有，就比下一号。` },
    ],
    goals: [
      { tone: 'gilt', title: '皇后牌优先', text: `每局有 ${QUEEN_CHANCE * 100}% 的机会发出唯一一张皇后牌。到第 ${NIGHT_LIMIT} 夜结算时，持牌者所在阵营直接获胜，无需列席。未发出皇后牌且所有位阶比完仍相同，则平局。` },
    ],
  },
  Options: NinjaOptions,
  Board: NinjaBoard,
};
