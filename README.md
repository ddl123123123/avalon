# 桌游厅

用浏览器建房，分享房间号或邀请链接，和朋友在线玩桌游。房主也可以添加机器人，单人体验完整对局。

| 桌游 | 人数 | 玩法 |
| --- | --- | --- |
| 阿瓦隆 | 5–10 | 隐藏身份、组队投票与任务 |
| 富饶之城 | 2–7 | 秘密选角与城市建造 |
| 琉璃工坊 | 2–4 | 取料、烧制彩窗与炉色折扣 |

## 本地运行

使用 Node.js 22 和 pnpm 9.15.9。

```bash
git clone https://github.com/ddl123123123/avalon.git
cd avalon
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

打开 [http://localhost:5310](http://localhost:5310)，选择桌游并建房。Vite 将 `/ws` 代理到本地房间服务（端口 8790）。

## 检查与构建

```bash
pnpm test
pnpm typecheck
pnpm build
```

GitHub Actions 会在推送到 `main` 或提交拉取请求时执行这些检查。

构建完成后，运行 `PORT=8080 pnpm start` 即可从同一端口提供网页和 WebSocket。

## 部署

线上地址 **https://games.anois.site**，和塔罗（ORAE）共用腾讯云主机 `43.138.210.136`：

- 桌游是单独的 compose 项目 `/srv/tabletop`，一个容器，不发布端口，加入塔罗的 `wenpai_default` 网络。
- 80/443 由塔罗的 Nginx 容器（`/srv/wenpai`）提供，按域名反代到 `tabletop:8080`，
  配置是本仓库的 [deploy/nginx/tabletop.conf](deploy/nginx/tabletop.conf)，发版时放进 `/srv/wenpai/nginx/`。
- 本机发版时镜像在本机构建（`linux/amd64`）再传上去；GitHub Actions 自动发版时在服务器上构建（见下）。

> **这台机器是多个项目共用的。** 服务器上的 `/srv/README.md` 记录了现状（谁占哪个目录、哪些 Nginx 配置和证书归谁、
> 证书到期日、内存预算）和共用规范。改服务器之前先读它，改完同步更新它的变更记录：
> `ssh -i avalon.pem root@43.138.210.136 cat /srv/README.md`

```bash
./deploy/ship.sh
```

需要仓库根目录的 `avalon.pem`（SSH 私钥，已 gitignore，权限 600）。脚本依次：构建镜像 → 传到服务器 →
重启容器并等它 healthy →（证书已就位时）放入 Nginx 配置、`nginx -t` 通过后 reload，失败就还原 → 验证。

**自动发版**：推到 `main` 后，GitHub Actions 在检查通过后自动跑 `BUILD=remote ./deploy/ship.sh`（`.github/workflows/ci.yml` 的 `deploy` 任务），
也可以在 Actions 页手动 Run workflow。需要在仓库 Settings → Environments 建 `production` 环境
（Deployment branches 只允许 `main`），放两个 secret：

- `SSH_PRIVATE_KEY`：专给 CI 用的部署私钥（不要复用 `avalon.pem`，泄露时可以单独吊销）
- `SSH_KNOWN_HOSTS`：`ssh-keyscan -t ed25519 43.138.210.136` 的输出，固定服务器指纹

`BUILD=remote` 时服务器从 GitHub 增量拉取这次提交（代码在 `/srv/tabletop/src`），依赖走 npmmirror，在服务器上构建镜像。
原因是 GitHub 的 runner 在美国，到这台国内服务器只有十几 KB/s，传整个镜像要一小时；反方向的 `git fetch` 只要几秒。

CI 里没有证书目录，上传/更换证书仍在本机跑 `./deploy/ship.sh`。

**证书**：腾讯云免费 DV 证书，SAN 须含 `games.anois.site`，下载「Nginx」格式，解压到仓库根目录的
`games.anois.site/`（已 gitignore），重跑 `./deploy/ship.sh` 就会上传到 `/srv/wenpai/certs/` 并接入。换证同样如此。

几条注意：

- 引用的证书不存在时 Nginx 校验会失败，**塔罗那边也会因此发不了版**，所以不要手工把 `tabletop.conf` 先放上去。
- 房间在内存里，每次发版都会清空正在进行的对局。
- 回滚：`ssh` 上去改 `/srv/tabletop/.env` 里的 `TAG`（`docker images tabletop` 看保留的 3 个版本），再 `docker compose up -d`。

### 一个人调试多人局

- 大厅里点「添加机器人凑人数」，机器人会合乎规则地把牌局推进下去。嫌慢可以用环境变量 `BOT_PACE=0.1` 启动服务端，机器人会快十倍。
- 地址后加 `?as=任意名字`，同一个浏览器的不同标签页就会被当作不同的玩家，例如
  `http://localhost:5310/?as=a` 和 `http://localhost:5310/?as=b`。

## 结构

```
packages/shared      与界面无关的部分，前后端共用
  src/framework.ts     GameDefinition：一款桌游需要实现的接口
  src/protocol.ts      房间与联机协议
  src/games/avalon/    阿瓦隆规则（rules.ts 是规则书里的数据，engine.ts 是状态机）
  src/games/citadels/  富饶之城规则（同样的两层结构）
  src/games/glassworks/ 琉璃工坊（原创）：规则书写在 rules.ts 开头
apps/server          房间服务（WebSocket）。不了解任何具体规则，只调用 GameDefinition
apps/web             React 前端
  src/pages/           首页、入房、大厅（与桌游无关）
  src/ui/RoundTable    通用圆桌
  src/fx/              动效组件（微尘、点击火花、逐字浮现、立体倾斜）
  src/art/             通用 SVG 美术（玫瑰窗、玩家纹章、拱窗牌面、牌背、桌面）
  src/games/avalon/    阿瓦隆的牌桌、揭示动画和 SVG 美术
  src/games/citadels/  富饶之城的牌桌、选角、角色牌与城区牌美术
  src/games/glassworks/ 琉璃工坊的牌桌、玻璃料、窗片与委托美术
  src/ui/Ticker        通用的事件播报
```

几条设计上的约定：

- **规则只在服务器上运行。** 每个玩家收到的是 `view(state, 自己)` 过滤后的视图，别人的身份、未公开的票和任务牌不会出现在网络数据里。
- **规则引擎是纯函数**，随机数由外部注入，所以可以确定性地测试。
- **所有美术都是代码生成的 SVG**，没有位图资源。玩家纹章由玩家 id 决定，角色牌的玻璃纹理由角色决定。
- 系统开启「减弱动态效果」时，装饰性动画会停掉。

## 增加一款桌游

1. 在 `packages/shared/src/games/<id>/` 实现 `GameDefinition`（`setup` / `reduce` / `view` / `isOver`，可选 `botAction`），并在 `games/index.ts` 注册。
2. 在 `apps/web/src/games/<id>/` 实现 `GameClient`（首页介绍 `hero`、大厅里的选项面板 `Options` 和牌桌 `Board`），并在 `games/registry.tsx` 注册。

房间、座位、断线重连、机器人调度都是现成的，不需要改服务器。

规则数据放在各游戏的 `rules.ts`，状态机放在 `engine.ts`。

## 阿瓦隆规则实现范围

依据《抵抗组织：阿瓦隆》规则书：

- 5–10 人的阵营人数与五次任务的队伍人数；7 人及以上第四次任务需要两张失败牌。
- 组队、全员投票（平票为否决）、队长顺时针传递；同一轮连续五次否决邪恶方获胜。
- 任务牌暗出，只公开失败张数；正义方不能出失败。
- 梅林、刺客必定在场；可选派西维尔、莫甘娜、莫德雷德、奥伯伦，夜晚信息按各自能力发放。
- 三次任务成功后进入刺杀阶段。
- 可选湖中仙女：从首任队长右手边开始，第 2、3、4 次任务后使用，持有过的人不能再被查验。

尚未实现：王者之剑等扩展、文字聊天（目前建议配合语音）、旁观。

## 富饶之城规则实现范围

依据 Fantasy Flight Games 第三版（经典版）规则书与官方 FAQ v1.2，只含基础游戏的 8 个角色。
不要和 2016 年修订版混淆：那一版 4 人以上建成 7 座即结束，平分看角色号码，紫色城区也不同。

- 66 张城区牌（贵族 12、宗教 11、商业 20、军事 11、特殊 12），开局每人 4 张牌、2 枚金币。
- 选角：4 / 5 / 6–7 人分别明弃 2 / 1 / 0 张，另盖弃 1 张，国王不会被明弃；7 人局最后一人可在剩下的一张和盖着的那张之间选；2–3 人局每人两个角色（2 人局中途各盖弃一张）。
- 回合：先拿 2 金币或抽 2 留 1，再建造 1 座；城里不能有同名城区；城区收入每回合一次，时机自选（忘了收会在结束回合时自动补上）。
- 八个角色的能力，包括：盗贼不能偷刺客和被刺杀者；被刺杀的国王在轮末继承王冠；被刺杀的主教不受庇护；军阀不能动要塞和已建成的城市。
- 11 种特殊城区的效果，包括官方 FAQ 的裁定：同时有图书馆和天文台时抽 3 留 2；墓地救不了墓地自己；长城对自己不加价。
- 建成第 8 座城区后打完当轮结算：城区分（龙门、大学计 8 分）、五色齐全 +3、率先建成 +4、其他建成者 +2；平分先比城区分，再比金币。

规则书没有写明、这里自行决定的地方：被摧毁和弃掉的城区牌放回牌堆底；牌堆抽完后有多少抽多少；金币不设上限；首位执王冠者随机。

尚未实现：黑暗之城扩展的角色与城区、8 人局（需要 9 号角色）、「建成 7 座」的短局变体。

## 琉璃工坊（原创设计）

彩窗匠人题材的引擎构筑游戏，2–4 人，一局约 20 圈。完整规则书在
[rules.ts](packages/shared/src/games/glassworks/rules.ts) 的开头，这里是摘要：

- 五色玻璃料装在布袋里，随机摆上「晾架」排成一行；金箔是万用料。
- 轮到你时三选一：**取料**（拿走晾架上相邻的 1–3 块）、**描样**（把一张窗片收作图稿，并拿 1 片金箔）、
  **烧制**（付出造价烧成窗片，料回到布袋）。
- 每块窗片带一种「炉色」，以后烧制时该色造价少 1。
- 炉色满足委托的要求就接下委托；五种炉色每凑齐一整套加 2 分（光谱）。
- 有人声望达到 17 分后打完这一圈结算。

60 张窗片由 12 个造价模板在五种颜色上各转一圈生成，所以五色天然对称。数值是用两种打法的机器人
自对战调出来的（各人数 800–1200 局）：各座次胜率接近，不设后手补偿；「先搭炉色再冲大窗」对
「什么便宜烧什么」约为 55 比 45。机器人不会抢图稿、不会卡位，真人对局的手感还需要实际玩过才知道。
