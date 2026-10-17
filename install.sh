#!/usr/bin/env bash
# ARTEX 安装脚本：① 全部 Docker  ② 本地编译运行
set -euo pipefail
cd "$(cd "$(dirname "$0")" && pwd)"

info(){ printf '\033[36m[*]\033[0m %s\n' "$*"; }
ok(){   printf '\033[32m[+]\033[0m %s\n' "$*"; }
warn(){ printf '\033[33m[!]\033[0m %s\n' "$*"; }
die(){  printf '\033[31m[x]\033[0m %s\n' "$*" >&2; exit 1; }
ask(){  local p="$1" d="${2:-}" a; read -rp "$p${d:+ [$d]}: " a; echo "${a:-$d}"; }
rand(){ head -c 18 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 24; }

# ── docker 环境检测 / 自动安装 ───────────────────
ensure_docker(){
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    ok "Docker and Docker Compose are available."; return
  fi
  warn "Docker or Docker Compose was not detected."
  case "$(uname -s)" in
    Linux)
      if [ "$(ask 'Install Docker automatically? (y/n)' y)" = y ]; then
        curl -fsSL https://get.docker.com | sh
        sudo usermod -aG docker "$USER" || true
        ok "Docker installation completed. Sign in again to apply group membership changes."
      else
        die "Install Docker and run this script again."
      fi ;;
    Darwin) die "Install Docker Desktop for macOS: https://www.docker.com/products/docker-desktop/" ;;
    *)      die "Install Docker and run this script again." ;;
  esac
}

# ── ① 全部 Docker ───────────────────────────────
install_docker(){
  ensure_docker
  umask 077
  if [ ! -f .env ]; then
    cp .env.example .env 2>/dev/null || true
    local pw key
    pw="$(ask 'PostgreSQL password (press Enter to generate one)' "$(rand)")"
    key="$(ask 'ANTHROPIC_API_KEY (optional; it can be configured in the UI)' '')"
    sed -i.bak "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${pw}|" .env
    sed -i.bak "s|^ANTHROPIC_API_KEY=.*|ANTHROPIC_API_KEY=${key}|" .env
    rm -f .env.bak
    ok ".env was created and POSTGRES_PASSWORD was set."
  else
    info "Existing .env file preserved."
  fi
  info "Pulling images and starting services..."
  docker compose pull
  docker compose up -d
  ok "ARTEX is available at http://localhost:8787"
  info "View logs with: docker compose logs -f artex"
}

# ── ② 本地编译运行 ──────────────────────────────
install_local(){
  echo "Database setup:"
  echo "  1) Connect to an existing PostgreSQL server"
  echo "  2) Start PostgreSQL with Docker"
  case "$(ask 'Select an option' 1)" in
    2)
      ensure_docker
      local pw; pw="$(ask 'PostgreSQL password (press Enter to generate one)' "$(rand)")"
      docker run -d --name artex-pg -p 5432:5432 \
        -e POSTGRES_USER=artex -e POSTGRES_PASSWORD="$pw" -e POSTGRES_DB=artex \
        -v artex-pg:/var/lib/postgresql/data postgres:16-alpine
      DB_HOST=127.0.0.1 DB_PORT=5432 DB_USER=artex DB_PASS="$pw" DB_NAME=artex DB_SSL=disable ;;
    *)
      DB_HOST="$(ask 'Database host' 127.0.0.1)"
      DB_PORT="$(ask 'Database port' 5432)"
      DB_USER="$(ask 'Database user' artex)"
      DB_PASS="$(ask 'Database password' '')"
      DB_NAME="$(ask 'Database name' artex)"
      DB_SSL="$(ask 'sslmode (disable/require)' disable)" ;;
  esac

  # 生成 config.json
  cat > config.json <<JSON
{
  "database": {
    "host": "${DB_HOST}",
    "port": ${DB_PORT},
    "user": "${DB_USER}",
    "password": "${DB_PASS}",
    "dbname": "${DB_NAME}",
    "sslmode": "${DB_SSL}"
  }
}
JSON
  ok "config.json was created."

  # go 环境检查
  command -v go >/dev/null 2>&1 || die "Go 1.26 or later is required: https://go.dev/dl/"
  ok "Go: $(go version)"

  # 内嵌前端需要 node 出静态产物
  if command -v npm >/dev/null 2>&1; then
    info "Building frontend static assets..."
    ( cd web && npm ci && npm run build:static )
    rm -rf server/webui/dist && cp -r web/out server/webui/dist
    info "Building the frontend-embedded binary..."
    CGO_ENABLED=0 go build -tags embedui -buildvcs=false -trimpath -o artex ./cmd/artex
  else
    warn "npm is unavailable; building the backend without embedded frontend assets."
    CGO_ENABLED=0 go build -buildvcs=false -o artex ./cmd/artex
  fi
  ok "Build completed: ./artex"

  info "Starting ARTEX. Press Ctrl+C to stop."
  ./artex
}

echo "=============================="
echo "  ARTEX Installer"
echo "  1) Docker deployment"
echo "  2) Local build and run"
echo "=============================="
case "$(ask 'Select an option' 1)" in
  1) install_docker ;;
  2) install_local ;;
  *) die "Invalid selection." ;;
esac
