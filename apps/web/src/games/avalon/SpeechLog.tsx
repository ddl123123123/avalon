import { useId, useRef, useState } from 'react';
import type { Avalon, PlayerId, RoomPlayer } from '@tabletop/shared';
import { SeatIdentity, TeamRoster } from './SeatIdentity';

const speechStatus = {
  passed: '选择跳过',
  timed_out: '发言时间已结束',
  unavailable: '机器人未能生成发言',
};

interface Attempt {
  questIndex: number;
  attempt: number;
  speeches: Avalon.SpeechRecord[];
  proposal?: Avalon.ProposalRecord;
  active?: { leader: PlayerId; team: PlayerId[]; status: string };
}

function attemptsFor(view: Avalon.AvalonView) {
  const attempts = new Map<string, Attempt>();
  function get(questIndex: number, attempt: number) {
    const key = `${questIndex}:${attempt}`;
    let entry = attempts.get(key);
    if (!entry) {
      entry = { questIndex, attempt, speeches: [] };
      attempts.set(key, entry);
    }
    return entry;
  }
  for (const speech of view.speeches) get(speech.questIndex, speech.attempt).speeches.push(speech);
  for (const proposal of view.proposals) get(proposal.questIndex, proposal.attempt).proposal = proposal;

  if (view.leader && (view.phase === 'discussion' || view.phase === 'team' || view.phase === 'vote')) {
    get(view.questIndex, view.rejectCount + 1).active = {
      leader: view.leader,
      team: view.team,
      status: view.phase === 'vote' ? `投票中 · ${view.voted.length}/${view.players.length} 人已投`
        : view.phase === 'discussion' ? '发言中' : view.discussionComplete ? '待提交队伍' : '组队中',
    };
  }
  return [...attempts.values()].sort((a, b) => b.questIndex - a.questIndex || b.attempt - a.attempt);
}

function Votes({ votes, players, approve }: {
  votes: Record<PlayerId, boolean>;
  players: RoomPlayer[];
  approve: boolean;
}) {
  const group = players.filter((player) => votes[player.id] === approve);
  return (
    <div className="av-log-votes">
      <span className={approve ? 'tone-good' : 'tone-evil'}>
        {approve ? '赞成' : '反对'} {group.length}
      </span>
      {group.length ? (
        <ul aria-label={approve ? '赞成玩家' : '反对玩家'}>
          {group.map((player) => <li key={player.id}><SeatIdentity player={player} /></li>)}
        </ul>
      ) : <span className="av-log-muted">无</span>}
    </div>
  );
}

export function SpeechLog({ view, players }: { view: Avalon.AvalonView; players: RoomPlayer[] }) {
  const heading = useId();
  const [speaker, setSpeaker] = useState('');
  const [quest, setQuest] = useState('');
  const scroll = useRef<HTMLDivElement>(null);
  const byId = new Map(players.map((player) => [player.id, player]));
  const attempts = attemptsFor(view);
  const results = attempts.filter((group) =>
    (!quest || group.questIndex === Number(quest)) &&
    (!speaker || group.speeches.some((speech) => speech.player === speaker)),
  );

  return (
    <section className="av-speech-log" aria-labelledby={heading}>
      <header className="av-log-head">
        <h2 id={heading} tabIndex={-1}>发言记录</h2>
        <div className="av-log-filters" role="group" aria-label="检索发言">
          <label><span>发言人</span>
            <select className="input" value={speaker} onChange={(event) => {
              setSpeaker(event.currentTarget.value);
              scroll.current?.scrollTo(0, 0);
            }}>
              <option value="">全部玩家</option>
              {players.map((player) => <option key={player.id} value={player.id}>{player.seatIndex + 1}号 {player.name}</option>)}
            </select>
          </label>
          <label><span>任务轮次</span>
            <select className="input" value={quest} onChange={(event) => {
              setQuest(event.currentTarget.value);
              scroll.current?.scrollTo(0, 0);
            }}>
              <option value="">全部轮次</option>
              {view.questSizes.map((_, index) => <option key={index} value={index}>第 {index + 1} 次任务</option>)}
            </select>
          </label>
        </div>
      </header>
      <div ref={scroll} className="av-log-scroll" tabIndex={0} role="region" aria-label="发言与票型">
        {results.length === 0 && <p className="av-log-empty">{speaker || quest ? '没有符合条件的记录' : '本局还没有发言记录'}</p>}
        {results.map(({ questIndex, attempt, speeches, proposal, active }) => {
          const leader = proposal?.leader ?? active?.leader;
          const team = proposal?.team ?? active?.team;
          const mission = proposal?.approved ? view.quests.find((item) => item.questIndex === questIndex) : undefined;
          const matching = speaker ? speeches.filter((speech) => speech.player === speaker) : speeches;
          return (
            <article key={`${questIndex}:${attempt}`} className="av-log-attempt">
              <header className="av-log-attempt-head">
                <h3>任务 {questIndex + 1} · 第 {attempt} 次组队</h3>
                {proposal ? <span className={proposal.approved ? 'tone-good' : 'tone-evil'}>{proposal.approved ? '通过' : '否决'}</span>
                  : <span className="av-log-muted">{active?.status ?? '待亮票'}</span>}
              </header>
              {leader && <p className="av-log-leader">车头 <SeatIdentity player={byId.get(leader)} /></p>}
              {team && team.length > 0 && <TeamRoster players={players} team={team} label={proposal || view.phase === 'vote' ? '提议队伍' : '候选队伍'} />}
              {proposal && (
                <div className="av-log-ballot" aria-label="公开票型">
                  <Votes votes={proposal.votes} players={players} approve />
                  <Votes votes={proposal.votes} players={players} approve={false} />
                  {mission && <p className={mission.success ? 'tone-good' : 'tone-evil'}>
                    任务{mission.success ? '成功' : '失败'} · {mission.fails} 张失败牌
                  </p>}
                </div>
              )}
              {[...matching].reverse().map((record) => (
                <div className="av-log-message" key={record.player}>
                  <SeatIdentity player={byId.get(record.player)} />
                  <p className={`av-speech-body${record.result === 'spoken' ? '' : ' av-log-muted'}`}>
                    {record.result === 'spoken' ? record.text : speechStatus[record.result]}
                  </p>
                </div>
              ))}
            </article>
          );
        })}
      </div>
    </section>
  );
}
