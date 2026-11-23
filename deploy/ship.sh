#!/usr/bin/env bash
# 发版：本机构建 linux/amd64 镜像 → 传到服务器 → 重启容器 → （证书就位时）接上 Nginx → 验证。
#
#   ./deploy/ship.sh
#
# 可覆盖的环境变量：
#   SERVER    默认 root@43.138.210.136（与塔罗共用的腾讯云主机）
#   SSH_KEY   默认仓库根目录的 avalon.pem（已 gitignore，权限须为 600）
#   DOMAIN    默认 games.anois.site
#   CERT_DIR  默认 ./${DOMAIN}/ —— 腾讯云证书「Nginx」格式解压出来的目录；
#             有它就顺带把证书传上去（换证也是重跑这个脚本）
#   TAG       镜像标签，默认当前时间（须以时间开头：服务器按标签排序只留最近 3 个）
#
# GitHub Actions 推到 main 时也跑这个脚本（.github/workflows/ci.yml 的 deploy 任务），
# 私钥和服务器指纹来自 production 环境的 secrets。CI 里没有证书目录，证书仍从本机上传。
set -euo pipefail
cd "$(dirname "$0")/.."

SERVER=${SERVER:-root@43.138.210.136}
SSH_KEY=${SSH_KEY:-avalon.pem}
DOMAIN=${DOMAIN:-games.anois.site}
CERT_DIR=${CERT_DIR:-${DOMAIN}}
REMOTE_DIR=/srv/tabletop
NGINX_DIR=/srv/wenpai          # 塔罗项目的 Nginx（compose project: wenpai）
SSH="ssh -i ${SSH_KEY} -o BatchMode=yes"
TAG=${TAG:-$(date +%Y%m%d-%H%M%S)}

say() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }

[ -f "${SSH_KEY}" ] || { echo "找不到 SSH 私钥 ${SSH_KEY}" >&2; exit 1; }
chmod 600 "${SSH_KEY}"
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "提示：工作区有未提交的改动，发出去的是工作区里的代码。" >&2
fi

say "构建镜像 tabletop:${TAG}（linux/amd64）"
docker buildx build --platform linux/amd64 -t "tabletop:${TAG}" --load .

say "传输镜像"
docker save "tabletop:${TAG}" | gzip | $SSH "$SERVER" 'gunzip | docker load'

say "同步编排文件"
$SSH "$SERVER" "mkdir -p ${REMOTE_DIR}"
rsync -az -e "$SSH" deploy/compose.yml "$SERVER:${REMOTE_DIR}/"

if [ -d "${CERT_DIR}" ]; then
  say "上传证书（${CERT_DIR}）"
  BUNDLE=$(ls "${CERT_DIR}"/*_bundle.pem 2>/dev/null | head -1 || true)
  [ -n "$BUNDLE" ] || BUNDLE=$(ls "${CERT_DIR}"/*_bundle.crt 2>/dev/null | head -1 || true)
  KEY=$(ls "${CERT_DIR}"/*.key 2>/dev/null | head -1 || true)
  [ -n "$BUNDLE" ] && [ -n "$KEY" ] || { echo "${CERT_DIR} 里要有 *_bundle.pem（或 .crt）和 *.key" >&2; exit 1; }
  openssl x509 -in "$BUNDLE" -noout -text | grep -q "DNS:${DOMAIN}" \
    || { echo "证书的 SAN 里没有 ${DOMAIN}，不上传" >&2; exit 1; }
  scp -q -i "${SSH_KEY}" "$BUNDLE" "$SERVER:${NGINX_DIR}/certs/${DOMAIN}.fullchain.pem"
  scp -q -i "${SSH_KEY}" "$KEY" "$SERVER:${NGINX_DIR}/certs/${DOMAIN}.privkey.pem"
  $SSH "$SERVER" "chmod 600 ${NGINX_DIR}/certs/${DOMAIN}.*.pem"
fi

# Nginx 配置只在证书就位后才放进去：否则 nginx -t 失败，塔罗那边也会跟着发不了版
rsync -az -e "$SSH" deploy/nginx/tabletop.conf "$SERVER:/tmp/tabletop.conf"

say "启动"
# 远端脚本里的 docker compose exec 都带 < /dev/null：脚本本身是从 stdin 喂给 bash -s 的，
# 不重定向的话 exec -T 会把剩下的脚本吞掉，后面的命令静默不执行
$SSH "$SERVER" bash -s <<REMOTE
set -euo pipefail
cd ${REMOTE_DIR}
touch .env
grep -q '^TAG=' .env && sed -i 's/^TAG=.*/TAG=${TAG}/' .env || echo 'TAG=${TAG}' >> .env
docker compose up -d --remove-orphans

for i in \$(seq 1 30); do
  s=\$(docker inspect -f '{{.State.Health.Status}}' tabletop-tabletop-1 2>/dev/null || echo starting)
  [ "\$s" = healthy ] && break
  sleep 2
done
[ "\$s" = healthy ] || { echo "容器没有变成 healthy（\$s）"; docker compose logs --tail 50 < /dev/null; exit 1; }
echo "容器 healthy"

cd ${NGINX_DIR}
if [ -f certs/${DOMAIN}.fullchain.pem ] && [ -f certs/${DOMAIN}.privkey.pem ]; then
  had=0; [ -f nginx/tabletop.conf ] && { had=1; cp nginx/tabletop.conf /tmp/tabletop.conf.prev; }
  install -m 644 /tmp/tabletop.conf nginx/tabletop.conf
  if docker compose exec -T web nginx -t < /dev/null; then
    docker compose exec -T web nginx -s reload < /dev/null
    echo "Nginx 已加载 ${DOMAIN}"
  else
    # 回到发版前的状态，别让坏配置留在塔罗的 nginx/ 里
    if [ \$had = 1 ]; then mv /tmp/tabletop.conf.prev nginx/tabletop.conf; else rm -f nginx/tabletop.conf; fi
    echo "nginx -t 失败，已还原配置" >&2; exit 1
  fi
else
  echo "证书还没上传（${NGINX_DIR}/certs/${DOMAIN}.*.pem），暂不接入 Nginx。容器已在运行。"
fi

# 只保留最近 3 个镜像
docker images tabletop --format '{{.Tag}}' | grep -v latest | sort -r | tail -n +4 \
  | xargs -r -I{} docker rmi tabletop:{} >/dev/null || true
REMOTE

say "验证"
# 认响应体里的 rooms 字段：塔罗的 /healthz 也是 200，只看状态码会被它骗过
$SSH "$SERVER" "docker exec wenpai-web-1 wget -qO- http://tabletop:8080/healthz | grep -q '\"rooms\"' \
  && echo 'Nginx 容器 → tabletop:8080 可达' || { echo 'Nginx 容器连不到 tabletop:8080' >&2; exit 1; }"
if $SSH "$SERVER" "test -f ${NGINX_DIR}/nginx/tabletop.conf"; then
  $SSH "$SERVER" "curl -sk --resolve ${DOMAIN}:443:127.0.0.1 https://${DOMAIN}/healthz | grep -q '\"rooms\"' \
    && echo 'https://${DOMAIN}/healthz 经 Nginx 正常' || { echo '经 Nginx 访问 ${DOMAIN} 失败' >&2; exit 1; }"
  echo "公网：https://${DOMAIN}/  （tag ${TAG}）"
else
  echo "容器已上线（tag ${TAG}），等证书就位后重跑本脚本即可对外提供 https://${DOMAIN}/"
fi
