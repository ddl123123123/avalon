# 部署

线上地址 **https://games.anois.site**，和塔罗（ORAE）共用腾讯云主机 `43.138.210.136`：

- 桌游是单独的 compose 项目 `/srv/tabletop`，一个容器，不发布端口，加入塔罗的 `wenpai_default` 网络。
- 80/443 由塔罗的 Nginx 容器（`/srv/wenpai`）提供，按域名反代到 `tabletop:8080`，
  配置是本仓库的 [deploy/nginx/tabletop.conf](../deploy/nginx/tabletop.conf)，发版时放进 `/srv/wenpai/nginx/`。
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

## 数据库（账号与运营统计）

账号、登录会话和运营统计存在**塔罗那台 Postgres（`wenpai-db-1`，Postgres 16）里单独的 `tabletop` 库**，
用单独的 `tabletop` 角色访问（非超级用户、连接数上限 10、库的 CONNECT 权限已从 PUBLIC 收回；
这个角色读不到塔罗库里的任何表）。连接串只写在服务器 `/srv/tabletop/.env` 的 `DATABASE_URL`（权限 600），
compose 里缺了它会直接拒绝启动。表结构由服务启动时自动迁移（`apps/server/src/db.ts` 的 `MIGRATIONS`，只能往后追加）。

| 表 | 内容 |
| --- | --- |
| `users` / `sessions` | 账号（密码只存 scrypt 散列）、登录会话（只存令牌的 SHA-256） |
| `auth_events` | 注册、输密码登录的时间，用来看登录趋势 |
| `daily_visitors` | 每天每个访客一行：登录用户按账号，游客按浏览器标识的散列 |
| `games` / `game_players` | 每局的桌游、开始/结束时间、真人/机器人/登录玩家数，以及登录玩家是谁 |

**不做备份**（按当前决定）：塔罗的 `/srv/wenpai/backup.sh` 只导出 `tarot` 库，不含这个库。

**本地开发**不用装 Postgres：没有 `DATABASE_URL` 时服务端用 PGlite（进程内的 Postgres），数据在仓库根目录 `.data/pglite`。
想连真库就在根目录 `.env` 里写 `DATABASE_URL`。测试也跑在 PGlite 上。

## 管理页

`https://games.anois.site/admin`：注册/活跃/开局的按天趋势、各桌游的开局数、用户列表（只读）。
需要登录一个带管理员标记的账号；管理员只能在服务器上授予，不能靠注册某个用户名得到：

```bash
ssh -i avalon.pem root@43.138.210.136 \
  docker exec tabletop-tabletop-1 node --import tsx src/admin-cli.ts grant <用户名>   # revoke <用户名> / list
```

本地：`pnpm --filter @tabletop/server admin grant <用户名>`。

## DeepSeek 助手

阿瓦隆 AI 助手通过服务端调用 DeepSeek。首次启用时，在服务器 `/srv/tabletop/.env` 里添加下面几项；API Key 只保存在服务器，不要放入 GitHub、前端构建参数或浏览器：

```dotenv
DEEPSEEK_API_KEY=你的完整_API_Key
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-flash
```

阿瓦隆机器人默认复用这套 DeepSeek 配置。要给不同机器人接不同的 OpenAI 兼容模型，可在同一份服务端 `.env` 追加：

```dotenv
AVALON_BOT_MODELS='[{"id":"alt","label":"备用模型","baseUrl":"https://provider.example/v1","model":"model-id","apiKeyEnv":"ALT_BOT_KEY"}]'
AVALON_BOT_API_KEYS='{"ALT_BOT_KEY":"填该提供商的密钥"}'
AVALON_BOT_ROLE_MODELS='{"merlin":"deepseek","assassin":"alt","servant":"local"}'
```

房主可以逐席选择模型，也可以将统一模型应用到所有机器人。随后加入的机器人会继承统一模型，各座位仍可单独更改。座位设置优先于按角色配置的默认模型。角色默认路由只保存在服务器，避免通过模型推测随机身份。模型请求使用单个座位的可见信息；发言和战报是公开数据，个人任务牌与记忆只在该机器人的请求中使用。服务无响应时，机器人用本地规则继续对局，并根据公开局势提交简短发言。

真人在文字发言时可以请求 AI 润色。润色优先用 DeepSeek，未配置时使用首个可用的外部模型，只发送玩家点选润色的原稿。建议只显示给该玩家，由玩家选择发送原文或润色稿。

保存后重新发布（推送到 `main` 会自动发版），Compose 会把这些变量传入桌游服务。`.env` 中已有的 `TAG` 和其他项目配置要保留。之后可以在 DeepSeek 开放平台查看用量与余额；模型按输入和输出 token 计费，具体价格以[官方说明](https://api-docs.deepseek.com/quick_start/pricing/)为准。

如果 Key 没有在创建时保存，平台列表里的遮罩内容和 Tracking ID 都不能用于调用；请在 DeepSeek 平台新建一个 Key 并安全保存完整值。

CI 里没有证书目录，上传/更换证书仍在本机跑 `./deploy/ship.sh`。

**证书**：腾讯云免费 DV 证书，SAN 须含 `games.anois.site`，下载「Nginx」格式，解压到仓库根目录的
`games.anois.site/`（已 gitignore），重跑 `./deploy/ship.sh` 就会上传到 `/srv/wenpai/certs/` 并接入。换证同样如此。

几条注意：

- 引用的证书不存在时 Nginx 校验会失败，**塔罗那边也会因此发不了版**，所以不要手工把 `tabletop.conf` 先放上去。
- 房间在内存里，每次发版都会清空正在进行的对局。
- 回滚：`ssh` 上去改 `/srv/tabletop/.env` 里的 `TAG`（`docker images tabletop` 看保留的 3 个版本），再 `docker compose up -d`。
