#!/usr/bin/env bash
# ARTEX 更新脚本：① Docker 更新（拉新镜像重建）  ② 本地编译更新（重建二进制）
# 与 install.sh 对应：install 负责首次落地，update 负责升级到新版本。
# DB 迁移无需手动执行——artex 每次启动都会幂等重跑 schema.sql（含 ADD COLUMN/CREATE
# INDEX IF NOT EXISTS），所以“重启即迁移”。数据（pgdata 卷、./data、./skills）不受影响。
set -euo pipefail
cd "$(cd "$(dirname "$0")" && pwd)"

info(){ printf '\033[36m[*]\033[0m %s\n' "$*"; }
ok(){   printf '\033[32m[+]\033[0m %s\n' "$*"; }
warn(){ printf '\033[33m[!]\033[0m %s\n' "$*"; }
die(){  printf '\033[31m[x]\033[0m %s\n' "$*" >&2; exit 1; }
ask(){  local p="$1" d="${2:-}" a; read -rp "$p${d:+ [$d]}: " a; echo "${a:-$d}"; }

# ── 可选：同步仓库到最新代码（compose/脚本/本地编译源码都靠它更新）───────
sync_repo(){
  [ -d .git ] && command -v git >/dev/null 2>&1 || { warn "This is not a Git working tree; skipping git pull."; return; }
  [ "$(ask 'Pull the latest source with git pull --ff-only? (y/n)' y)" = y ] || return
  if ! git pull --ff-only; then
    warn "git pull could not fast-forward. Resolve local changes or branch divergence manually."
  fi
}

# ── ① Docker 更新 ───────────────────────────────
update_docker(){
  command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1 \
    || die "Docker and Docker Compose are required. Run ./install.sh first."
  [ -f .env ] || die ".env is missing. Run ./install.sh first."

  # 可选：升级到指定版本 tag（不填则沿用 .env 中的 ARTEX_TAG，缺省为 latest）
  local tag; tag="$(ask 'Target image tag (press Enter to keep .env/default)' '')"
  if [ -n "$tag" ]; then
    if grep -q '^ARTEX_TAG=' .env; then
      sed -i.bak "s|^ARTEX_TAG=.*|ARTEX_TAG=${tag}|" .env && rm -f .env.bak
    else
      printf '\nARTEX_TAG=%s\n' "$tag" >> .env
    fi
    ok "ARTEX_TAG was set to ${tag}."
  fi

  # 只动 artex：postgres 是固定的 16-alpine，不需要跟着升级（拉它纯属浪费带宽，
  # 且大版本变动还会有兼容风险）。artex 声明了 depends_on postgres，所以带服务名
  # up 时若 pg 没起会自动拉起，已在跑的则原样保留、不重建。
  info "Pulling the ARTEX image..."
  docker compose pull artex
  info "Recreating and starting ARTEX..."
  docker compose up -d artex
  ok "Update completed: http://localhost:8787"
  info "View logs with: docker compose logs -f artex"
  info "Optional old-image cleanup: docker image prune -f"
}

# ── ② 本地编译更新 ──────────────────────────────
update_local(){
  command -v go >/dev/null 2>&1 || die "Go 1.26 or later is required: https://go.dev/dl/"
  [ -f config.json ] || warn "config.json is missing. Use ./install.sh for a first-time deployment."
  ok "Go: $(go version)"

  if command -v npm >/dev/null 2>&1; then
    info "Rebuilding frontend static assets..."
    ( cd web && npm ci && npm run build:static )
    rm -rf server/webui/dist && cp -r web/out server/webui/dist
    info "Rebuilding the frontend-embedded binary..."
    CGO_ENABLED=0 go build -tags embedui -buildvcs=false -trimpath -o artex ./cmd/artex
  else
    warn "npm is unavailable; building the backend without embedded frontend assets."
    CGO_ENABLED=0 go build -buildvcs=false -o artex ./cmd/artex
  fi
  ok "Build completed: ./artex"
  warn "Restart the running ARTEX process to apply the update."
}

echo "=============================="
echo "  ARTEX Updater"
echo "  1) Update the Docker deployment"
echo "  2) Rebuild the local deployment"
echo "=============================="
case "$(ask 'Select an option' 1)" in
  1) sync_repo; update_docker ;;
  2) sync_repo; update_local ;;
  *) die "Invalid selection." ;;
esac
