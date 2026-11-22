# 桌游厅

在线桌游平台，网页即玩，凭房间号或链接联机。目前上线的是《阿瓦隆》，架构为继续增加其他桌游预留了位置。

## 运行

需要 Node 20+ 和 pnpm 9。

```bash
pnpm install
pnpm dev        # 前端 http://localhost:5310 ，房间服务 :8790（/ws 由 Vite 代理）
pnpm test       # 规则引擎的单元测试
pnpm typecheck
```

同一局域网内的手机可以直接访问 `http://<电脑的 IP>:5310`。

生产部署只需要一个端口：

```bash
pnpm build                 # 构建前端到 apps/web/dist
PORT=8080 pnpm start       # 同一个端口提供页面和 WebSocket（/ws）
```

放到反向代理后面时，记得为 `/ws` 开启 WebSocket 转发；用 HTTPS 时前端会自动改用 `wss`。

### 一个人调试多人局

- 大厅里点「添加机器人凑人数」，机器人会合乎规则地把牌局推进下去。
- 地址后加 `?as=任意名字`，同一个浏览器的不同标签页就会被当作不同的玩家，例如
  `http://localhost:5310/?as=a` 和 `http://localhost:5310/?as=b`。

## 结构

```
packages/shared      与界面无关的部分，前后端共用
  src/framework.ts     GameDefinition：一款桌游需要实现的接口
  src/protocol.ts      房间与联机协议
  src/games/avalon/    阿瓦隆规则（rules.ts 是规则书里的数据，engine.ts 是状态机）
apps/server          房间服务（WebSocket）。不了解任何具体规则，只调用 GameDefinition
apps/web             React 前端
  src/pages/           首页、入房、大厅（与桌游无关）
  src/ui/RoundTable    通用圆桌
  src/fx/              动效组件（微尘、点击火花、逐字浮现、立体倾斜）
  src/art/             通用 SVG 美术（玫瑰窗、玩家纹章）
  src/games/avalon/    阿瓦隆的牌桌、揭示动画和 SVG 美术
```

几条设计上的约定：

- **规则只在服务器上运行。** 每个玩家收到的是 `view(state, 自己)` 过滤后的视图，别人的身份、未公开的票和任务牌不会出现在网络数据里。
- **规则引擎是纯函数**，随机数由外部注入，所以可以确定性地测试。
- **所有美术都是代码生成的 SVG**，没有位图资源。玩家纹章由玩家 id 决定，角色牌的玻璃纹理由角色决定。
- 系统开启「减弱动态效果」时，装饰性动画会停掉。

## 增加一款桌游

1. 在 `packages/shared/src/games/<id>/` 实现 `GameDefinition`（`setup` / `reduce` / `view` / `isOver`，可选 `botAction`），并在 `games/index.ts` 注册。
2. 在 `apps/web/src/games/<id>/` 实现 `GameClient`（大厅里的选项面板 `Options` 和牌桌 `Board`），并在 `games/registry.tsx` 注册。

房间、座位、断线重连、机器人调度都是现成的，不需要改服务器。

## 阿瓦隆规则实现范围

依据《抵抗组织：阿瓦隆》规则书：

- 5–10 人的阵营人数与五次任务的队伍人数；7 人及以上第四次任务需要两张失败牌。
- 组队、全员投票（平票为否决）、队长顺时针传递；同一轮连续五次否决邪恶方获胜。
- 任务牌暗出，只公开失败张数；正义方不能出失败。
- 梅林、刺客必定在场；可选派西维尔、莫甘娜、莫德雷德、奥伯伦，夜晚信息按各自能力发放。
- 三次任务成功后进入刺杀阶段。
- 可选湖中仙女：从首任队长右手边开始，第 2、3、4 次任务后使用，持有过的人不能再被查验。

尚未实现：王者之剑等扩展、文字聊天（目前建议配合语音）、旁观。
