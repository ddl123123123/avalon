import { useState } from 'react';
import { NinjaNight, type RoomSnapshot } from '@tabletop/shared';
import { net } from '../../net/client';
import type { GameClient } from '../registry';
import { NinjaCardArt, NinjaCardStyles, NinjaIdentityCard, ninjaFactions as factionNames, useNinjaCardStyle } from './NinjaCards';
import { PartyTable } from './PartyTable';

const { ninjaNight, NIGHT_LIMIT, TARGET_SCORE, shadowCount, professions, professionIds, sites, siteOrder } = NinjaNight;
type View = NinjaNight.NinjaView;
type NightResult = View['history'][number];
const phases = { draft: '暗选职业', night: '夜间行动', dawn: '天亮结算', ended: '对局结束' };
const factions = ['guard', 'shadow'] as const;

function ProfessionGuide() {
  return (
    <details className="party-details ninja-guide">
      <summary>查看六种职业</summary>
      <dl>
        {professionIds.map((id) => (
          <div key={id}><dt>{professions[id].name}</dt><dd>{professions[id].detail}</dd></div>
        ))}
      </dl>
    </details>
  );
}

function NinjaOptions({ playerCount }: { playerCount: number }) {
  const shadows = shadowCount(playerCount);
  return (
    <div className="party-lobby-copy">
      <p>{playerCount} 人局 · {playerCount - shadows} 名守夜忍，{shadows} 名影忍</p>
      <p>暗选职业，再秘密选择山门、枫庭或钟楼。天亮后按阵眼力量结算得分。</p>
      {playerCount % 2 === 1 && <p>奇数局里，若有影忍选中焦点，影忍在该处额外获得 1 点力量。</p>}
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
      <p><strong>你的职业是{role.name}。</strong> {role.detail}</p>
      <p className="party-note">顺时针顺序：山门 → 枫庭 → 钟楼 → 山门。</p>
      <div className="ninja-site-grid" role="group" aria-label="选择阵眼">
        {siteOrder.map((site) => (
          <button key={site} type="button" className="ninja-site" aria-pressed={selected === site}
            data-focus={view.focus === site} onClick={() => setSelected(site)}>
            <span aria-hidden="true" className="ninja-site-mark">{sites[site].mark}</span>
            <strong>{sites[site].name}</strong>
            <small>{view.focus === site ? '焦点 · 2 分' : '1 分'}</small>
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
      <p>守夜忍 +{night.earned.guard} 分 · 影忍 +{night.earned.shadow} 分</p>
      <ul className="ninja-site-grid ninja-outcomes">
        {night.sites.map((result) => (
          <li key={result.site} className="ninja-site" data-focus={result.site === night.focus}>
            <strong>{sites[result.site].name}{result.site === night.focus && ' · 焦点'}</strong>
            <small>力量 {result.power.guard} : {result.power.shadow}</small>
            <small>{result.winner ? `${factionNames[result.winner]} +${result.points} 分` : '平手 · 无人得分'}</small>
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

  return (
    <PartyTable room={room} name={ninjaNight.name} theme="ninja">
      <section className="panel party-panel">
        <p className="party-kicker">第 {view.night} / {NIGHT_LIMIT} 夜 · {phases[view.phase]}</p>
        <h2>{view.winner === 'draw' ? '双方打平' : view.winner ? `${factionNames[view.winner]}获胜` : `本夜焦点 · ${sites[view.focus].name}`}</h2>
        <div className="ninja-scores" aria-label="双方累计得分">
          {factions.map((faction) => (
            <div key={faction} data-faction={faction}>
              <span>{factionNames[faction]}</span>
              <strong>{view.scores[faction]} <small>分</small></strong>
            </div>
          ))}
        </div>
        {!view.winner && view.faction && (
          <details className="party-details ninja-identity">
            <summary>查看我的身份牌</summary>
            <div className="ninja-identity-body">
              <NinjaIdentityCard faction={view.faction} style={cardStyle} />
              <div><p>帮自己的阵营赢得阵眼。每个人只能看到自己的身份。</p></div>
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
          {room.players.map((player) => (
            <li key={player.id}>
              <span>{player.seatIndex + 1} 号 · {player.name}{player.id === room.you && '（你）'}</span>
              <small>{view.revealedShadows
                ? factionNames[view.revealedShadows.includes(player.id) ? 'shadow' : 'guard']
                : !player.connected ? '离线' : actionable ? view.waiting.includes(player.id) ? '待提交' : '已处理' : ''}</small>
            </li>
          ))}
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
    lede: '山门、枫庭、钟楼每夜争夺一轮。你只知道自己的阵营。选一张职业牌，猜猜其他人今夜会去哪里。',
    Art: NinjaCardArt,
    note: '4 到 8 人的原创阵营策略游戏，可添加机器人。奇数局里，若有影忍到达焦点，影忍在该处额外获得 1 点力量。',
    steps: [
      { title: '暗选职业', text: '每人收到三张职业牌，暗选其一。六种职业的能力对所有人公开。' },
      { title: '夜探阵眼', text: '三处阵眼任选其一，职业能力在天亮时一起结算。本夜焦点值 2 分，其他阵眼各值 1 分。' },
      { title: '查看战报', text: '每处由力量更高的阵营得分，平手不得分。战报公开各处合计力量，个人分工保密。' },
    ],
    goals: [
      { tone: 'gilt', title: `累计 ${TARGET_SCORE} 分并领先即可获胜`, text: `若打满 ${NIGHT_LIMIT} 夜，累计得分更高的一方获胜，同分则平局。结束后公开所有人阵营。` },
    ],
  },
  Options: NinjaOptions,
  Board: NinjaBoard,
};
