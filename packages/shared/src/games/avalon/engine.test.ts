import { describe, expect, it } from 'vitest';
import { GameError, type PlayerId, type Rng } from '../../framework';
import { avalon, skipUnavailableSpeech, type AvalonAction, type AvalonState } from './engine';
import { EVIL_COUNT, ROLES, TEAM_SIZES, buildRoleDeck, defaultOptions, recommendedOptions, validateOptions, type AvalonOptions } from './rules';

function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function startGame(players: PlayerId[], options: AvalonOptions, rng: Rng) {
  return players.reduce(
    (state, player) => avalon.reduce(state, player, { type: 'confirm_role' }, rng),
    avalon.setup(players, options, rng),
  );
}

const ids = (n: number): PlayerId[] => Array.from({ length: n }, (_, i) => `p${i}`);
const opts = (o: Partial<AvalonOptions> = {}): AvalonOptions => ({ ...defaultOptions(), ...o });
const act = (s: AvalonState, p: PlayerId, a: AvalonAction) => avalon.reduce(s, p, a, Math.random);
const leaderOf = (s: AvalonState) => s.players[s.leaderIndex]!;
const isEvil = (s: AvalonState, p: PlayerId) => ROLES[s.roles[p]!].alignment === 'evil';
const who = (s: AvalonState, role: string) => s.players.find((p) => s.roles[p] === role)!;

function propose(s: AvalonState, team: PlayerId[]) {
  return act(s, leaderOf(s), { type: 'propose_team', team });
}
function voteAll(s: AvalonState, approve: boolean | ((p: PlayerId) => boolean)) {
  for (const p of s.players) s = act(s, p, { type: 'vote', approve: typeof approve === 'function' ? approve(p) : approve });
  return s;
}
/** 跑完一次任务；failers 中的邪恶方出失败 */
function runQuest(s: AvalonState, team: PlayerId[], failers: PlayerId[] = []) {
  s = voteAll(propose(s, team), true);
  for (const p of team) s = act(s, p, { type: 'quest', success: !failers.includes(p) });
  return s;
}
function goodTeam(s: AvalonState) {
  const size = TEAM_SIZES[s.players.length]![s.questIndex]!;
  return s.players.filter((p) => !isEvil(s, p)).slice(0, size);
}
function teamWithEvil(s: AvalonState, evilCount = 1) {
  const size = TEAM_SIZES[s.players.length]![s.questIndex]!;
  const evil = s.players.filter((p) => isEvil(s, p)).slice(0, evilCount);
  const good = s.players.filter((p) => !isEvil(s, p)).slice(0, size - evil.length);
  return { team: [...evil, ...good], evil };
}

it('requires discussion in text rooms and records only the current speaker’s submitted text', () => {
  let state: AvalonState = { ...startGame(ids(5), opts(), seeded(13)), speechMode: 'text' };
  const leader = leaderOf(state);
  expect(() => propose(state, ids(5).slice(0, 2))).toThrow('请先完成本轮文字讨论');
  state = act(state, leader, { type: 'start_discussion', preselectedTeam: false, leaderFirst: true, direction: 'left', now: 100 });
  const { turn, currentSpeaker, deadline } = avalon.view(state, leader).discussion!;
  expect(() => act(state, state.players.find((id) => id !== leader)!, { type: 'submit_speech', turn, text: '抢先', now: 101 })).toThrow();
  expect(() => act(state, currentSpeaker, { type: 'submit_speech', turn: 'old-turn', text: '过期轮次', now: 101 })).toThrow();
  expect(() => act(state, currentSpeaker, { type: 'submit_speech', turn, text: '时间到', now: deadline })).toThrow();
  const text = '把第一轮的赞成和反对票对一下。'.repeat(600);
  state = act(state, currentSpeaker, { type: 'submit_speech', turn, text, now: 101 });
  expect(avalon.view(state, null).speeches).toEqual([{ questIndex: 0, attempt: 1, player: currentSpeaker, text, result: 'spoken' }]);
  const next = avalon.view(state, leader).discussion!;
  expect(skipUnavailableSpeech(state, next.currentSpeaker, turn, 200)).toBe(state);
  state = skipUnavailableSpeech(state, next.currentSpeaker, next.turn, 200);
  state = act(state, leader, { type: 'timeout_speech', now: state.discussion!.deadline });
  expect(state.speeches.map(({ result }) => result)).toEqual(['spoken', 'unavailable', 'timed_out']);
});

describe('牌堆', () => {
  it.each([
    [5, 1, ['assassin', 'morgana']],
    [6, 2, ['assassin', 'morgana']],
    [7, 2, ['assassin', 'morgana', 'mordred']],
    [8, 3, ['assassin', 'morgana', 'mordred']],
    [9, 4, ['assassin', 'morgana', 'mordred']],
    [10, 4, ['assassin', 'morgana', 'mordred', 'oberon']],
  ] as const)('%i 人局按推荐阵容发牌', (n, servants, evilRoles) => {
    const state = avalon.setup(ids(n), opts(recommendedOptions(n)), seeded(n));
    expect(Object.values(state.roles).sort()).toEqual(
      ['merlin', 'percival', ...Array(servants).fill('servant'), ...evilRoles].sort(),
    );
  });

  it('各人数的阵营分配符合规则书', () => {
    for (let n = 5; n <= 10; n++) {
      const deck = buildRoleDeck(n, opts());
      expect(deck).toHaveLength(n);
      expect(deck.filter((r) => ROLES[r].alignment === 'evil')).toHaveLength(EVIL_COUNT[n]!);
      expect(deck.filter((r) => r === 'merlin')).toHaveLength(1);
      expect(deck.filter((r) => r === 'assassin')).toHaveLength(1);
    }
    expect([5, 6, 7, 8, 9, 10].map((n) => EVIL_COUNT[n])).toEqual([2, 2, 3, 3, 3, 4]);
  });

  it('可选角色替换掉普通角色', () => {
    const deck = buildRoleDeck(7, opts({ percival: true, morgana: true, mordred: true }));
    expect(deck.sort()).toEqual(['assassin', 'merlin', 'mordred', 'morgana', 'percival', 'servant', 'servant'].sort());
  });

  it('邪恶角色超出名额时不能开局', () => {
    expect(validateOptions(opts({ morgana: true, mordred: true }), 5)).toMatch(/邪恶/);
    expect(validateOptions(opts({ morgana: true }), 5)).toBeNull();
    expect(validateOptions(opts({ morgana: true, mordred: true, oberon: true }), 10)).toBeNull();
    expect(validateOptions(opts(), 4)).toMatch(/至少/);
  });
});

describe('夜晚信息', () => {
  const s = avalon.setup(ids(10), opts({ percival: true, morgana: true, mordred: true, oberon: true }), seeded(7));
  const seen = (p: PlayerId) => avalon.view(s, p).me!.sightings;

  it('梅林看得到除莫德雷德以外的邪恶方', () => {
    const m = seen(who(s, 'merlin'));
    expect(Object.keys(m).sort()).toEqual([who(s, 'assassin'), who(s, 'morgana'), who(s, 'oberon')].sort());
  });
  it('派西维尔看到梅林和莫甘娜，但分不清', () => {
    const p = seen(who(s, 'percival'));
    expect(Object.keys(p).sort()).toEqual([who(s, 'merlin'), who(s, 'morgana')].sort());
    expect(new Set(Object.values(p))).toEqual(new Set(['merlin']));
  });
  it('邪恶方互相认识，奥伯伦除外', () => {
    expect(Object.keys(seen(who(s, 'assassin'))).sort()).toEqual([who(s, 'morgana'), who(s, 'mordred')].sort());
    expect(seen(who(s, 'oberon'))).toEqual({});
  });
  it('忠臣什么都不知道，也看不到别人的身份', () => {
    const servant = who(s, 'servant');
    const v = avalon.view(s, servant);
    expect(v.me!.sightings).toEqual({});
    expect(v.roles).toBeNull();
    expect(v.assassin).toBeNull();
    expect(JSON.stringify(v)).not.toContain('"roles":{');
  });
});

describe('组队与投票', () => {
  it('全员确认后只随机抽取首任车头', () => {
    const players = ids(5);
    let s = avalon.setup(players, opts(), seeded(1));
    const confirm = { type: 'confirm_role' } as const;
    const noDraw = () => {
      throw new Error('全员确认之前不应抽签');
    };
    for (const player of players.slice(0, -1)) s = avalon.reduce(s, player, confirm, noDraw);
    expect(avalon.reduce(s, players[0]!, confirm, noDraw)).toBe(s);
    expect(avalon.view(s, null)).toMatchObject({ phase: 'identity', leader: null, confirmedRoles: players.slice(0, -1) });
    expect(() => act(s, players[0]!, { type: 'draft_team', team: [] })).toThrow(/等待所有玩家/);

    let draws = 0;
    s = avalon.reduce(s, players.at(-1)!, confirm, () => { draws++; return 0.82; });
    expect(s.phase).toBe('team');
    expect(draws).toBe(1);
    expect(s.players).toEqual(players);
    expect(avalon.view(s, null).leader).toBe('p4');
  });

  it('只有队长能组队，人数必须正确', () => {
    const s = startGame(ids(5), opts(), seeded(1));
    const other = s.players.find((p) => p !== leaderOf(s))!;
    expect(() => act(s, other, { type: 'propose_team', team: ['p0', 'p1'] })).toThrow(GameError);
    expect(() => propose(s, ['p0'])).toThrow(/2 名/);
    expect(() => propose(s, ['p0', 'p0'])).toThrow(GameError);
    expect(propose(s, ['p0', 'p1']).phase).toBe('vote');
  });

  it('平票和完成任务后都顺时针换车头，末座接回首座', () => {
    let s = startGame(ids(6), opts(), () => 0.9);
    expect(leaderOf(s)).toBe('p5');
    s = propose(s, ['p0', 'p1']);
    s = voteAll(s, (p) => ['p0', 'p1', 'p2'].includes(p));
    expect(s.proposals[0]!.approved).toBe(false);
    expect(s.phase).toBe('team');
    expect(s.rejectCount).toBe(1);
    expect(leaderOf(s)).toBe('p0');
    s = runQuest(s, ['p0', 'p1']);
    expect(leaderOf(s)).toBe('p1');
  });

  it('投票结束前看不到别人的票，结束后公开', () => {
    let s = startGame(ids(5), opts(), seeded(3));
    s = propose(s, ['p0', 'p1']);
    s = act(s, 'p0', { type: 'vote', approve: false });
    const v = avalon.view(s, 'p1');
    expect(v.voted).toEqual(['p0']);
    expect(v.proposals).toHaveLength(0);
    expect(v.me!.myVote).toBeNull();
    expect(avalon.view(s, 'p0').me!.myVote).toBe(false);
    expect(() => act(s, 'p0', { type: 'vote', approve: true })).toThrow(/已经/);
    for (const p of s.players.slice(1)) s = act(s, p, { type: 'vote', approve: true });
    expect(avalon.view(s, 'p1').proposals[0]).toMatchObject({ votes: { p0: false, p1: true }, approvals: 4, rejections: 1 });
  });

  it('只公开票数时，房主和其他玩家都只能看到合计与自己的票', () => {
    let s = propose(startGame(ids(5), opts({ voteVisibility: 'totals' }), seeded(3)), ['p0', 'p1']);
    s = act(s, 'p0', { type: 'vote', approve: false });
    expect(avalon.view(s, 'p1')).toMatchObject({ voted: [], votedCount: 1, proposals: [], me: { myVote: null } });
    expect(avalon.view(s, 'p0').me!.myVote).toBe(false);
    for (const id of s.players.slice(1)) s = act(s, id, { type: 'vote', approve: true });
    expect(s.phase).toBe('quest');
    for (const viewer of [...s.players, null]) {
      expect(avalon.view(s, viewer).proposals[0]).toMatchObject({ votes: null, approvals: 4, rejections: 1, approved: true });
    }
  });

  it.each([3, 5] as const)('第 %i 车提交队伍就执行任务，下一项任务重新计数', (forceLaunchAt) => {
    let s = startGame(ids(5), opts({ forceLaunchAt }), seeded(4));
    for (let i = 1; i < forceLaunchAt; i++) {
      expect(avalon.view(s, null).forcedLaunch).toBe(false);
      s = propose(s, goodTeam(s));
      expect(s.phase).toBe('vote');
      s = voteAll(s, false);
    }
    expect(avalon.view(s, null).forcedLaunch).toBe(true);
    expect(s.rejectCount).toBe(forceLaunchAt - 1);
    expect(() => propose(s, ['p0'])).toThrow(/2 名/);
    const leader = leaderOf(s);
    const team = goodTeam(s);
    s = propose(s, team);
    expect(s.phase).toBe('quest');
    expect(s.winner).toBeNull();
    expect(avalon.view(s, null).proposals.at(-1)).toMatchObject({ attempt: forceLaunchAt, leader, team, forced: true, votes: null });
    expect(() => act(s, 'p0', { type: 'vote', approve: true })).toThrow('现在不是投票阶段');
    for (const player of team) s = act(s, player, { type: 'quest', success: true });
    expect(s.rejectCount).toBe(0);
    expect(s.questIndex).toBe(1);
    expect(avalon.view(s, null).forcedLaunch).toBe(false);
    expect(propose(s, goodTeam(s)).phase).toBe('vote');
  });
});

describe('线下手动计时', () => {
  it('由房主控制全桌计时，超时后不切阶段，车头可以直接发起投票', () => {
    const players = ids(5);
    const context = { hostId: 'p0', offlinePlayers: [] };
    let s = startGame(players, opts({ discussionMode: 'manual', speechSeconds: 60 }), () => 0.3);
    const captain = leaderOf(s);
    const timer = { type: 'set_manual_timer', running: true, questIndex: 0, rejectCount: 0, now: 1000 } as const;
    expect(captain).toBe('p1');
    expect(() => avalon.reduce(s, captain, timer, Math.random, context)).toThrow('只有房主');
    expect(() => act(s, captain, { type: 'start_discussion', preselectedTeam: false, leaderFirst: false, direction: 'left' })).toThrow('线下手动发言');
    s = avalon.reduce(s, context.hostId, timer, Math.random, context);
    expect(avalon.view(s, captain)).toMatchObject({ speechMode: 'manual', manualSpeechDeadline: 61000, discussion: null });
    expect(act(s, captain, { type: 'timeout_speech', now: 65000 }).phase).toBe('team');
    expect(s.leaderIndex).toBe(1);
    s = avalon.reduce(s, context.hostId, { ...timer, now: 65000 }, Math.random, context);
    expect(s.manualSpeechDeadline).toBe(125000);
    s = avalon.reduce(s, context.hostId, { ...timer, running: false }, Math.random, context);
    expect(s.manualSpeechDeadline).toBeNull();
    s = voteAll(propose(s, ['p0', 'p1']), false);
    expect(s.phase).toBe('team');
    expect(avalon.reduce(s, context.hostId, timer, Math.random, context)).toBe(s);
  });

  it('机器人车头在房主请求后才会提出队伍', () => {
    let s = startGame(ids(5), opts({ discussionMode: 'manual', speechSeconds: 0 }), () => 0.3);
    const captain = leaderOf(s);
    const context = { hostId: 'p0', offlinePlayers: [], botPlayers: [captain] };
    expect(avalon.botAction!(s, captain, Math.random)).toBeNull();
    s = avalon.reduce(s, context.hostId, { type: 'request_bot_proposal', questIndex: 0, rejectCount: 0 }, Math.random, context);
    const action = avalon.botAction!(s, captain, Math.random)!;
    expect(action.type).toBe('propose_team');
    expect(act(s, captain, action).phase).toBe('vote');
  });
});

describe('任务', () => {
  it('正义方不能出失败，非队员不能出牌', () => {
    let s = startGame(ids(5), opts(), seeded(6));
    const team = goodTeam(s);
    s = voteAll(propose(s, team), true);
    expect(() => act(s, team[0]!, { type: 'quest', success: false })).toThrow(/只能出/);
    const outsider = s.players.find((p) => !team.includes(p))!;
    expect(() => act(s, outsider, { type: 'quest', success: true })).toThrow(GameError);
  });

  it('一张失败牌即任务失败，记录里只有失败张数', () => {
    let s = startGame(ids(5), opts(), seeded(8));
    const { team, evil } = teamWithEvil(s);
    s = runQuest(s, team, evil);
    expect(s.quests[0]).toMatchObject({ success: false, fails: 1 });
    expect(Object.keys(avalon.view(s, 'p0').quests[0]!)).not.toContain('cards');
  });

  it('7 人以上第 4 次任务需要两张失败牌', () => {
    let s = startGame(ids(7), opts(), seeded(9));
    s = runQuest(s, goodTeam(s));
    s = runQuest(s, goodTeam(s));
    let t = teamWithEvil(s);
    s = runQuest(s, t.team, t.evil);
    expect(s.questIndex).toBe(3);
    t = teamWithEvil(s, 1);
    const one = runQuest(s, t.team, t.evil);
    expect(one.quests[3]).toMatchObject({ success: true, fails: 1 });
    t = teamWithEvil(s, 2);
    const two = runQuest(s, t.team, t.evil);
    expect(two.quests[3]).toMatchObject({ success: false, fails: 2 });
    expect(avalon.view(s, null).failsRequired).toEqual([1, 1, 1, 2, 1]);
    expect(avalon.view(avalon.setup(ids(6), opts(), seeded(1)), null).failsRequired).toEqual([1, 1, 1, 1, 1]);
  });

  it('三次任务失败，邪恶方直接获胜', () => {
    let s = startGame(ids(5), opts(), seeded(10));
    for (let i = 0; i < 3; i++) {
      const t = teamWithEvil(s);
      s = runQuest(s, t.team, t.evil);
    }
    expect(s).toMatchObject({ phase: 'ended', winner: 'evil', winReason: 'quests_failed' });
    expect(avalon.view(s, 'p0').roles).toEqual(s.roles);
  });
});

describe('刺杀', () => {
  function threeWins(seed: number) {
    let s = startGame(ids(5), opts(), seeded(seed));
    for (let i = 0; i < 3; i++) s = runQuest(s, goodTeam(s));
    return s;
  }
  it('三次任务成功后进入刺杀阶段，并公开刺客', () => {
    const s = threeWins(11);
    expect(s.phase).toBe('assassin');
    expect(s.winner).toBeNull();
    expect(avalon.view(s, 'p0').assassin).toBe(who(s, 'assassin'));
  });
  it('刺中梅林，邪恶方获胜', () => {
    const s = threeWins(12);
    const end = act(s, who(s, 'assassin'), { type: 'assassinate', target: who(s, 'merlin') });
    expect(end).toMatchObject({ phase: 'ended', winner: 'evil', winReason: 'assassinated' });
  });
  it('认错人，正义方获胜', () => {
    const s = threeWins(13);
    const end = act(s, who(s, 'assassin'), { type: 'assassinate', target: who(s, 'servant') });
    expect(end).toMatchObject({ phase: 'ended', winner: 'good', winReason: 'merlin_safe' });
  });
  it('只有刺客能动手', () => {
    const s = threeWins(14);
    expect(() => act(s, who(s, 'merlin'), { type: 'assassinate', target: who(s, 'servant') })).toThrow(/刺客/);
  });
  it('刺客只可以从正义方指认一人，包括排除奥伯伦', () => {
    let s = startGame(ids(5), opts({ oberon: true }), seeded(15));
    const assassin = who(s, 'assassin');
    const oberon = who(s, 'oberon');
    expect(avalon.view(s, assassin).me?.sightings[oberon]).toBeUndefined();
    expect(avalon.view(s, assassin).me?.assassinationTargets).toEqual([]);
    for (let i = 0; i < 3; i++) s = runQuest(s, goodTeam(s));
    expect(avalon.view(s, assassin).me?.assassinationTargets).toEqual(s.players.filter((id) => !isEvil(s, id)));
    expect(avalon.view(s, oberon).me?.assassinationTargets).toEqual([]);
    expect(() => act(s, assassin, { type: 'assassinate', target: oberon })).toThrow(/正义方/);
  });
});

describe('湖中仙女', () => {
  it('从首任队长右手边开始，第 2、3、4 次任务后使用，持有过的人不能被查验', () => {
    let s = startGame(ids(7), opts({ ladyOfTheLake: true }), seeded(15));
    const first = s.lady!.holder;
    expect(first).toBe(s.players[(s.leaderIndex - 1 + 7) % 7]);
    s = runQuest(s, goodTeam(s));
    expect(s.phase).toBe('team');
    let t = teamWithEvil(s);
    s = runQuest(s, t.team, t.evil);
    expect(s.phase).toBe('lady');
    expect(() => act(s, first, { type: 'lady', target: first })).toThrow(GameError);
    const target = s.players.find((p) => p !== first && isEvil(s, p))!;
    const bystander = s.players.find((p) => p !== first && p !== target)!;
    expect(() => act(s, bystander, { type: 'lady', target })).toThrow(/不在你手上/);
    s = act(s, first, { type: 'lady', target });
    expect(s.phase).toBe('team');
    expect(s.lady!.holder).toBe(target);
    expect(avalon.view(s, first).me!.ladyResults).toEqual({ [target]: 'evil' });
    expect(avalon.view(s, bystander).me!.ladyResults).toEqual({});
    expect(avalon.view(s, bystander).lady!.inspections).toEqual([{ by: first, target, afterQuest: 1 }]);
    t = teamWithEvil(s);
    s = runQuest(s, t.team, t.evil);
    expect(s.phase).toBe('lady');
    expect(() => act(s, target, { type: 'lady', target: first })).toThrow(GameError);
  });
});

describe('机器人', () => {
  it('任意人数和配置都能把一局打完', () => {
    for (let n = 5; n <= 10; n++) {
      for (let seed = 0; seed < 40; seed++) {
        const rng = seeded(seed * 31 + n);
        const o = opts({ percival: seed % 2 === 0, morgana: seed % 3 === 0, oberon: n >= 7 && seed % 5 === 0, ladyOfTheLake: seed % 4 === 0 });
        let s = avalon.setup(ids(n), o, rng);
        let steps = 0;
        while (!avalon.isOver(s)) {
          const mover = s.players.find((p) => avalon.botAction!(s, p, rng) !== null);
          expect(mover, `卡在 ${s.phase}`).toBeDefined();
          s = avalon.reduce(s, mover!, avalon.botAction!(s, mover!, rng)!, rng);
          expect(++steps).toBeLessThan(2000);
        }
        expect(s.winner).not.toBeNull();
      }
    }
  });
});
