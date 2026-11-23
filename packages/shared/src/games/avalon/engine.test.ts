import { describe, expect, it } from 'vitest';
import { GameError, type PlayerId } from '../../framework';
import { avalon, type AvalonAction, type AvalonState } from './engine';
import { EVIL_COUNT, ROLES, TEAM_SIZES, buildRoleDeck, defaultOptions, recommendedOptions, validateOptions, type AvalonOptions } from './rules';

function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
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
  it('只有队长能组队，人数必须正确', () => {
    const s = avalon.setup(ids(5), opts(), seeded(1));
    const other = s.players.find((p) => p !== leaderOf(s))!;
    expect(() => act(s, other, { type: 'propose_team', team: ['p0', 'p1'] })).toThrow(GameError);
    expect(() => propose(s, ['p0'])).toThrow(/2 名/);
    expect(() => propose(s, ['p0', 'p0'])).toThrow(GameError);
    expect(propose(s, ['p0', 'p1']).phase).toBe('vote');
  });

  it('平票算否决，队长顺时针传给下一位', () => {
    let s = avalon.setup(ids(6), opts(), seeded(2));
    const first = s.leaderIndex;
    s = propose(s, ['p0', 'p1']);
    s = voteAll(s, (p) => ['p0', 'p1', 'p2'].includes(p));
    expect(s.proposals[0]!.approved).toBe(false);
    expect(s.phase).toBe('team');
    expect(s.rejectCount).toBe(1);
    expect(s.leaderIndex).toBe((first + 1) % 6);
  });

  it('投票结束前看不到别人的票，结束后公开', () => {
    let s = avalon.setup(ids(5), opts(), seeded(3));
    s = propose(s, ['p0', 'p1']);
    s = act(s, 'p0', { type: 'vote', approve: false });
    const v = avalon.view(s, 'p1');
    expect(v.voted).toEqual(['p0']);
    expect(v.proposals).toHaveLength(0);
    expect(v.me!.myVote).toBeNull();
    expect(avalon.view(s, 'p0').me!.myVote).toBe(false);
    expect(() => act(s, 'p0', { type: 'vote', approve: true })).toThrow(/已经/);
  });

  it('连续五次否决，邪恶方获胜', () => {
    let s = avalon.setup(ids(5), opts(), seeded(4));
    for (let i = 0; i < 5; i++) s = voteAll(propose(s, ['p0', 'p1']), false);
    expect(s.phase).toBe('ended');
    expect(s.winner).toBe('evil');
    expect(s.winReason).toBe('rejects');
  });

  it('任务完成后否决计数清零', () => {
    let s = avalon.setup(ids(5), opts(), seeded(5));
    for (let i = 0; i < 4; i++) s = voteAll(propose(s, goodTeam(s)), false);
    expect(s.rejectCount).toBe(4);
    s = runQuest(s, goodTeam(s));
    expect(s.rejectCount).toBe(0);
    expect(s.questIndex).toBe(1);
  });
});

describe('任务', () => {
  it('正义方不能出失败，非队员不能出牌', () => {
    let s = avalon.setup(ids(5), opts(), seeded(6));
    const team = goodTeam(s);
    s = voteAll(propose(s, team), true);
    expect(() => act(s, team[0]!, { type: 'quest', success: false })).toThrow(/只能出/);
    const outsider = s.players.find((p) => !team.includes(p))!;
    expect(() => act(s, outsider, { type: 'quest', success: true })).toThrow(GameError);
  });

  it('一张失败牌即任务失败，记录里只有失败张数', () => {
    let s = avalon.setup(ids(5), opts(), seeded(8));
    const { team, evil } = teamWithEvil(s);
    s = runQuest(s, team, evil);
    expect(s.quests[0]).toMatchObject({ success: false, fails: 1 });
    expect(Object.keys(avalon.view(s, 'p0').quests[0]!)).not.toContain('cards');
  });

  it('7 人以上第 4 次任务需要两张失败牌', () => {
    let s = avalon.setup(ids(7), opts(), seeded(9));
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
    let s = avalon.setup(ids(5), opts(), seeded(10));
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
    let s = avalon.setup(ids(5), opts(), seeded(seed));
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
});

describe('湖中仙女', () => {
  it('从首任队长右手边开始，第 2、3、4 次任务后使用，持有过的人不能被查验', () => {
    let s = avalon.setup(ids(7), opts({ ladyOfTheLake: true }), seeded(15));
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
