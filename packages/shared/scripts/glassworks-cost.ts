/**
 * 琉璃工坊的造价难度：同样的块数，颜色越集中越难凑。这个脚本量的是「难多少」。
 *
 * 做法：在一局真实的 3 人对局里（另外两家是机器人，照常取料、烧制、把料还回布袋），
 * 让一位玩家只盯着一种造价凑料：每回合拿晾架上最有用的一段，一块有用的都没有就去描样拿金箔。
 * 数他从空手到付得起要几个回合（含烧制的那一回合）。炉色按「已有 k 块、颜色随机」来扣。
 *
 *   pnpm --filter @tabletop/shared cost:glassworks            # 量规则里现有的 15 个模板
 *   pnpm --filter @tabletop/shared cost:glassworks 4-2 3-3-1  # 量任意形状，各色块数用 - 隔开
 */
import { chooseAction, glassworks, type BotStyle, type GlassworksAction, type GlassworksState } from '../src/games/glassworks/engine';
import { HAND_LIMIT, HUES, PANELS, PIECES, SKETCH_LIMIT, TAKE_LIMIT, type Hue, type Tier } from '../src/games/glassworks/rules';

function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

const TRIALS = Number(process.env.TRIALS) || 600;
const PLAYERS = ['me', 'b1', 'b2', 'b3'].slice(0, Number(process.env.PLAYERS) || 3);
/** GOLD=0：不许靠描样拿金箔，只看晾架 */
const USE_GOLD = process.env.GOLD !== '0';
const STYLES: BotStyle[] = ['climb', 'sprawl'];
/** 量每一档时假设手里已经有几块炉色 */
const KILNS: Record<Tier, number[]> = { 1: [0, 3], 2: [3, 6], 3: [6, 10] };

/** 一种造价形状要凑几个回合。shape 是各色块数（从多到少），kilnCount 是已有的炉色数 */
export function turnsFor(shape: number[], kilnCount: number, trials = TRIALS): { mean: number; p90: number } {
  const all: number[] = [];
  for (let t = 0; t < trials; t++) {
    const rng = seeded(t * 7919 + shape.reduce((a, b) => a * 11 + b, kilnCount) * 104729 + 5);
    // 造价落在哪几种颜色上、炉色是哪几块，每一局都重新随机
    const hues = HUES.slice().sort(() => rng() - 0.5);
    const need: Record<Hue, number> = { blue: 0, red: 0, green: 0, amber: 0, violet: 0 };
    shape.forEach((amount, i) => (need[hues[i]!] = amount));
    for (let k = 0; k < kilnCount; k++) {
      const hue = HUES[Math.floor(rng() * 5)]!;
      need[hue] = Math.max(0, need[hue] - 1);
    }
    let state: GlassworksState = glassworks.setup(PLAYERS, {}, rng);
    let turns = 0;
    for (let steps = 0; steps < 2000 && state.phase === 'play'; steps++) {
      const who = state.turn;
      let action: GlassworksAction | null;
      if (who !== 'me') {
        action = chooseAction(state, who, rng, STYLES[PLAYERS.indexOf(who) % 2]!);
      } else {
        const glass = state.glass.me!;
        const miss = HUES.map((h) => Math.max(0, need[h] - glass[h]));
        const short = miss.reduce((a, b) => a + b, 0) - glass.gold;
        if (state.mustDiscard > 0) {
          // 放回用不上的料
          const left = { ...glass };
          const spare = [];
          while (spare.length < state.mustDiscard) {
            const hue = HUES.filter((h) => left[h] > 0).sort((a, b) => left[b] - need[b] - (left[a] - need[a]))[0]!;
            left[hue] -= 1;
            spare.push(hue);
          }
          action = { type: 'discard', pieces: spare };
        } else {
          turns += 1;
          if (short <= 0) break; // 这一回合烧制
          let best = { from: 0, count: 1, useful: -1 };
          for (let from = 0; from < state.rack.length; from++) {
            for (let count = 1; count <= TAKE_LIMIT && from + count <= state.rack.length; count++) {
              const want = Object.fromEntries(HUES.map((h, i) => [h, miss[i]!])) as Record<Hue, number>;
              let useful = 0;
              for (const hue of state.rack.slice(from, from + count)) {
                if (want[hue] > 0) {
                  want[hue] -= 1;
                  useful += 1;
                }
              }
              const held = PIECES.reduce((sum, p) => sum + glass[p], 0);
              if (held + count > HAND_LIMIT + 2) continue;
              if (useful > best.useful) best = { from, count, useful };
            }
          }
          if (USE_GOLD && best.useful <= 0 && state.sketches.me!.length < SKETCH_LIMIT && state.gold > 0 && state.decks[1].length > 0) {
            action = { type: 'sketch', tier: 1, slot: -1 };
          } else if (state.rack.length > 0) {
            action = { type: 'take', from: best.from, count: best.count };
          } else {
            action = { type: 'pass' };
          }
        }
      }
      if (!action) break;
      state = glassworks.reduce(state, who, action, rng);
    }
    all.push(turns);
  }
  all.sort((a, b) => a - b);
  return { mean: all.reduce((a, b) => a + b, 0) / trials, p90: all[Math.floor(trials * 0.9)]! };
}

const shapeOf = (cost: Partial<Record<Hue, number>>) => Object.values(cost).sort((a, b) => b - a);

if (process.argv[1]?.endsWith('glassworks-cost.ts')) {
  const args = process.argv.slice(2);
  const rows: { tier: Tier; points: number | null; shape: number[] }[] = args.length
    ? args.map((a) => {
        const shape = a.split('-').map(Number).sort((x, y) => y - x);
        const sum = shape.reduce((x, y) => x + y, 0);
        return { tier: (sum <= 5 ? 1 : sum <= 8 ? 2 : 3) as Tier, points: null, shape };
      })
    : PANELS.filter((p) => p.hue === 'blue').map((p) => ({ tier: p.tier, points: p.points, shape: shapeOf(p.cost) }));
  console.log('档  造价        总数 最高色  声望   回合数 平均·九成局以内（炉色少 / 炉色多）');
  for (const row of rows) {
    const [few, many] = KILNS[row.tier].map((k) => turnsFor(row.shape, k));
    const sum = row.shape.reduce((a, b) => a + b, 0);
    console.log(
      `${row.tier}   ${row.shape.join('+').padEnd(10)}  ${String(sum).padStart(2)}    ${row.shape[0]}     ${row.points ?? '—'}     ` +
        `${few!.mean.toFixed(1)}·${few!.p90}（${KILNS[row.tier][0]} 炉色） / ${many!.mean.toFixed(1)}·${many!.p90}（${KILNS[row.tier][1]} 炉色）`,
    );
  }
}
