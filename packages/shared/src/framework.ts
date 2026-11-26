/**
 * 通用桌游框架。
 *
 * 每一款桌游实现一个 GameDefinition：纯函数式的状态机 + 按玩家过滤的视图。
 * 房间服务器只认识这个接口，不了解任何具体规则，因此新增桌游只需要：
 *   1. 在 packages/shared/src/games/<id>/ 下实现 GameDefinition 并注册；
 *   2. 在 apps/web/src/games/<id>/ 下实现对应的界面并注册。
 */

export type PlayerId = string;

/** 返回 [0, 1) 的随机数。注入它是为了让规则可以被确定性地测试。 */
export type Rng = () => number;

/** 由房间服务器提供，用于处理离线座位和房主权限。 */
export interface GameActionContext {
  hostId: PlayerId;
  offlinePlayers: readonly PlayerId[];
  botPlayers?: readonly PlayerId[];
}

/** 玩家做了规则不允许的事。message 会直接展示给玩家。 */
export class GameError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GameError';
  }
}

export interface GameDefinition<State = any, Action = any, View = any, Options = any> {
  id: string;
  name: string;
  tagline: string;
  minPlayers: number;
  maxPlayers: number;

  /** 支持房主指定本局人数的桌游，可在切换人数时应用推荐选项。 */
  playerCountOptions?: {
    defaultCount: number;
    recommendedOptions(playerCount: number): Partial<Options>;
  };
  defaultOptions(): Options;
  /** 把不可信的输入整理成合法结构的选项（不校验人数相关的约束）。 */
  normalizeOptions(raw: unknown): Options;
  /** 返回 null 表示可以开局，否则返回给房主看的原因。 */
  validateOptions(options: Options, playerCount: number): string | null;

  /** players 为座位顺序（顺时针）。 */
  setup(players: PlayerId[], options: Options, rng: Rng): State;
  /** 不得修改传入的 state；非法操作抛出 GameError。 */
  reduce(state: State, player: PlayerId, action: Action, rng: Rng, context?: GameActionContext): State;
  /** viewer 能看到的全部信息。隐藏信息绝不能出现在别人的视图里。 */
  view(state: State, viewer: PlayerId | null): View;
  isOver(state: State): boolean;

  /** 可选：让机器人玩家行动。无事可做时返回 null。 */
  botAction?(state: State, player: PlayerId, rng: Rng): Action | null;
}

export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

export function pick<T>(items: readonly T[], rng: Rng): T {
  return items[Math.floor(rng() * items.length)]!;
}
