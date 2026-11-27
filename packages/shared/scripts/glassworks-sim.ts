/**
 * 琉璃工坊的机器人自对战：调数值时用它看一局打多久、各座次和各打法的胜率、分数从哪里来。
 *
 *   pnpm --filter @tabletop/shared sim:glassworks            # 每种人数 1000 局
 *   pnpm --filter @tabletop/shared sim:glassworks 3000 4     # 只跑 4 人，3000 局
 */
import { chooseAction, glassworks, type BotStyle, type GlassworksState } from '../src/games/glassworks/engine';
import { PANELS, panelOf } from '../src/games/glassworks/rules';

function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

const GAMES = Number(process.argv[2]) || 1000;
const COUNTS = process.argv[3] ? [Number(process.argv[3])] : [2, 3, 4];
const STYLES: BotStyle[] = ['climb', 'sprawl'];
const pct = (n: number, d: number) => (d ? `${((n / d) * 100).toFixed(1)}%` : '—');
const avg = (list: number[]) => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : 0);

for (const n of COUNTS) {
  const players = Array.from({ length: n }, (_, i) => `p${i}`);
  const seatWins = Array<number>(n).fill(0);
  const styleWins: Record<BotStyle, number> = { climb: 0, sprawl: 0 };
  const styleSeats: Record<BotStyle, number> = { climb: 0, sprawl: 0 };
  const rounds: number[] = [];
  const winner = { total: [] as number[], panels: [] as number[], commissions: [] as number[], bonus: [] as number[], count: [] as number[], tiers: [0, 0, 0] };
  const all = { total: [] as number[], count: [] as number[] };
  let stuck = 0;
  let mixed = 0;
  /** 每个模板被烧成了几次、其中几次吃到了余温 */
  const built = new Map<string, number>();
  let heated = 0;
  let builds = 0;

  for (let g = 0; g < GAMES; g++) {
    const rng = seeded(g * 7919 + n * 104729 + 17);
    let state: GlassworksState = glassworks.setup(players, {}, rng);
    // 打法按座次轮换，每种座次和打法的组合出现次数相同
    const style = (p: string): BotStyle => STYLES[(players.indexOf(p) + g) % 2]!;
    const order = state.players.slice(state.players.indexOf(state.startPlayer)).concat(state.players.slice(0, state.players.indexOf(state.startPlayer)));
    let steps = 0;
    while (state.phase === 'play' && steps++ < 4000) {
      const action = chooseAction(state, state.turn, rng, style(state.turn));
      if (!action) break;
      state = glassworks.reduce(state, state.turn, action, rng);
      const last = state.log.at(-1);
      if (action.type === 'build' && last?.t === 'build') {
        builds++;
        if (last.saved) heated++;
      }
    }
    if (state.phase !== 'ended' || !state.winner || !state.scores) {
      stuck++;
      continue;
    }
    rounds.push(state.round);
    for (const p of players) {
      for (const id of state.panels[p]!) {
        const key = id.split('-').slice(0, 2).join('-');
        built.set(key, (built.get(key) ?? 0) + 1);
      }
    }
    seatWins[order.indexOf(state.winner)]! += 1;
    const used = new Set(players.map(style));
    if (used.size === 2) {
      mixed++;
      styleWins[style(state.winner)] += 1;
      for (const p of players) styleSeats[style(p)] += 1;
    }
    const w = state.scores[state.winner]!;
    winner.total.push(w.total);
    winner.panels.push(w.panels);
    winner.commissions.push(w.commissions);
    winner.bonus.push(w.total - w.panels - w.commissions);
    winner.count.push(state.panels[state.winner]!.length);
    for (const id of state.panels[state.winner]!) winner.tiers[panelOf(id).tier - 1]! += 1;
    for (const p of players) {
      all.total.push(state.scores[p]!.total);
      all.count.push(state.panels[p]!.length);
    }
  }

  const done = rounds.length;
  rounds.sort((a, b) => a - b);
  console.log(`\n== ${n} 人 · ${done} 局${stuck ? `（${stuck} 局没打完）` : ''} ==`);
  console.log(`圈数  平均 ${avg(rounds).toFixed(1)}  中位 ${rounds[Math.floor(done / 2)]}  10%–90% ${rounds[Math.floor(done * 0.1)]}–${rounds[Math.floor(done * 0.9)]}`);
  console.log(`座次胜率（先手起）  ${seatWins.map((w) => pct(w, done)).join(' / ')}`);
  // 每种打法的座位数可能不同（3 人局是 2:1），按「每个座位的胜率」比
  const perSeat = (s: BotStyle) => styleWins[s] / Math.max(1, styleSeats[s]);
  console.log(`打法（每座位胜率）  攀高枝 ${pct(perSeat('climb'), perSeat('climb') + perSeat('sprawl'))}  铺摊子 ${pct(perSeat('sprawl'), perSeat('climb') + perSeat('sprawl'))}  （${mixed} 局混战）`);
  console.log(
    `赢家  ${avg(winner.total).toFixed(1)} 分 = 窗片 ${avg(winner.panels).toFixed(1)} + 委托 ${avg(winner.commissions).toFixed(1)} + 套组 ${avg(winner.bonus).toFixed(1)}；` +
      `烧了 ${avg(winner.count).toFixed(1)} 块（小窗 ${(winner.tiers[0]! / done).toFixed(1)} / 花窗 ${(winner.tiers[1]! / done).toFixed(1)} / 玫瑰窗 ${(winner.tiers[2]! / done).toFixed(1)}）`,
  );
  console.log(`全体  平均 ${avg(all.total).toFixed(1)} 分，${avg(all.count).toFixed(1)} 块窗片`);
  console.log(`余温  每局触发 ${(heated / Math.max(1, done)).toFixed(1)} 次（占全部烧制的 ${pct(heated, builds)}）`);
  if (process.env.CARDS) {
    // 每个模板每局被烧成几张（每个模板有 5 张）。长期没人烧的就是定价偏贵，抢着烧的就是偏便宜
    console.log('模板  声望  造价        每局烧成');
    for (const p of PANELS.filter((x) => x.hue === 'blue')) {
      const key = p.id.split('-').slice(0, 2).join('-');
      const shape = Object.values(p.cost).sort((a, b) => b - a).join('+');
      console.log(`${key.padEnd(6)} ${p.points}    ${shape.padEnd(10)}  ${((built.get(key) ?? 0) / Math.max(1, done)).toFixed(2)}`);
    }
  }
}
