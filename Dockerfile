# 桌游厅生产镜像：一个 Node 进程在同一端口提供网页和 /ws。
# 在本机构建（deploy/ship.sh 带 --platform linux/amd64），服务器只负责运行。

FROM node:22-alpine AS base
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/

# ---- 构建前端 ----
FROM base AS build
RUN pnpm install --frozen-lockfile
COPY packages packages
COPY apps apps
RUN pnpm build

# ---- 运行：只装服务端及其依赖 ----
FROM base AS runtime
RUN pnpm install --frozen-lockfile --prod --filter @tabletop/server... \
  && pnpm store prune
COPY packages/shared/src packages/shared/src
COPY apps/server/src apps/server/src
COPY --from=build /app/apps/web/dist apps/web/dist

ENV NODE_ENV=production PORT=8080
EXPOSE 8080
USER node
WORKDIR /app/apps/server
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --start-interval=2s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/healthz >/dev/null || exit 1
# 用 --import 而不是 tsx 命令行：后者会再起一个子进程，信号要多转一层
CMD ["node", "--import", "tsx", "src/index.ts"]
