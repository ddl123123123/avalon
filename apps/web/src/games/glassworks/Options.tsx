import { Glassworks } from '@tabletop/shared';
import { PanelCard, Shard } from './art';

const { HUES, MAX_PLAYERS, MIN_PLAYERS, PANELS, PIECE_NAMES, TARGET_POINTS, TIER_NAMES } = Glassworks;

// 每档挑一张做示例
const SAMPLES = ([1, 2, 3] as const).map((tier) => PANELS.filter((p) => p.tier === tier).at(-1)!);

/** 琉璃工坊没有可调的选项：这里说明当前人数下的物料，并讲清楚一回合能做什么。 */
export function GlassworksOptions({ playerCount }: { playerCount: number }) {
  const n = Math.min(MAX_PLAYERS, Math.max(MIN_PLAYERS, playerCount));
  return (
    <div className="av-options">
      <p className="av-options-summary">
        {n} 人局：每种颜色的玻璃料 {Glassworks.piecesPerHue(n)} 块，晾架上摆 {Glassworks.rackSize(n)} 块，翻开 {Glassworks.commissionCount(n)} 张委托。声望先到{' '}
        {TARGET_POINTS} 分的人敲响终局。
      </p>
      <p className="gw-legend">
        {HUES.map((hue) => (
          <span key={hue}>
            <Shard piece={hue} />
            {PIECE_NAMES[hue]}
          </span>
        ))}
        <span>
          <Shard piece="gold" />
          {PIECE_NAMES.gold}（万用）
        </span>
      </p>
      <h2 className="av-options-heading">轮到你时，三选一</h2>
      <ol className="ct-roster gw-howto">
        <li>
          <span>
            <strong>取料</strong>
            从晾架上拿走相邻的 1 到 3 块玻璃料。手里最多留 {Glassworks.HAND_LIMIT} 块。
          </span>
        </li>
        <li>
          <span>
            <strong>描样</strong>
            把一张窗片收作图稿留着以后烧，并拿 1 片金箔。最多留 {Glassworks.SKETCH_LIMIT} 张图稿。
          </span>
        </li>
        <li>
          <span>
            <strong>烧制</strong>
            付出造价烧成一块窗片。它给你一种炉色：以后烧制时，这种颜色的造价少 1。
          </span>
        </li>
      </ol>
      <h2 className="av-options-heading">余温：一档一档往上烧</h2>
      <p className="av-options-summary">
        上一回合烧的是小窗，这一回合接着烧花窗，少付 {Glassworks.HEAT_DISCOUNT[2]} 块料；上一回合烧的是花窗，接着烧玫瑰窗，少付{' '}
        {Glassworks.HEAT_DISCOUNT[3]} 块。{'同一档连着烧不减，跳过一档也不减；中间去取料或描样，炉子就凉了。'}
      </p>
      <h2 className="av-options-heading">三档窗片</h2>
      <div className="gw-samples">
        {SAMPLES.map((p) => (
          <figure key={p.id}>
            <PanelCard panel={p.id} />
            <figcaption>{TIER_NAMES[p.tier]}</figcaption>
          </figure>
        ))}
      </div>
      <p className="av-options-summary">
        左上是声望，右上是炉色，下面一行是造价。窗片共 {PANELS.length} 张，越大的越少。
        {'同一档的窗片要的料总数差不多，但同一种颜色要得越多越难凑，声望也越高。'}
      </p>
      <h2 className="av-options-heading">两种套组</h2>
      <ol className="ct-roster gw-howto">
        <li>
          <span>
            <strong>光谱，每套 +{Glassworks.SPECTRUM_BONUS}</strong>
            五种炉色各有一块，凑成一套。什么颜色都烧一点的人拿这份分。
          </span>
        </li>
        <li>
          <span>
            <strong>联窗，每组 +{Glassworks.TRIPTYCH_BONUS}</strong>
            同一种炉色的小窗、花窗、玫瑰窗各有一块，凑成一组。把一种颜色烧到顶的人拿这份分。
          </span>
        </li>
      </ol>
    </div>
  );
}
