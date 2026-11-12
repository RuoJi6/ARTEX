#!/usr/bin/env bash
# =============================================================================
# ARTEX administrator password reset utility.
#
# The login username is ARTEX. The password is stored as a bcrypt hash in the
# settings table under auth.password_hash.
#
# Modes:
#   local   Connect from the host with psql.
#   docker  Run psql inside the PostgreSQL container.
#
# Examples:
#   ./reset-password.sh
#   ./reset-password.sh -p 'NewPass!'
#   ./reset-password.sh --dsn postgres://u:p@h:5432/artex
#   ./reset-password.sh -H 127.0.0.1 -P 5433 -U autopentest -W pass -d artex
#   ./reset-password.sh -m docker
#   ./reset-password.sh -m docker -c postgres --exec docker
#
# Passwords are passed through environment variables and are not placed in
# process arguments.
# =============================================================================
set -euo pipefail

PASS_KEY="auth.password_hash"
BCRYPT_COST=10

MODE=""            # local | docker（空=自动判定）
DSN=""
HOST="" PORT="" USER="" DBPASS="" DBNAME="" SSLMODE=""
CONFIG=""
CONTAINER=""       # docker 模式的 postgres 服务/容器名（默认 postgres）
EXEC_KIND=""       # compose | docker（docker 模式下用哪种 exec；空=自动）
NEWPASS=""
ASSUME_YES=0

die() { echo "[ERROR] $*" >&2; exit 1; }
info() { echo "[INFO] $*" >&2; }

usage() {
  cat <<'EOF'
ARTEX administrator password reset utility

Usage:
  ./reset-password.sh [options]

Options:
  -m, --mode local|docker     Select deployment mode
  --dsn DSN                  PostgreSQL connection string
  -H, --host HOST            Database host
  -P, --port PORT            Database port
  -U, --user USER            Database user
  -W, --db-password PASS     Database password
  -d, --dbname NAME          Database name
  --sslmode MODE             PostgreSQL SSL mode
  --config PATH              Path to config.json
  -c, --container NAME       Compose service or container name
  --exec compose|docker      Container execution method
  -p, --new-password PASS    New ARTEX administrator password
  -y, --yes                  Skip confirmation
  -h, --help                 Show this help
EOF
  exit 0
}

# ---- 参数解析 -------------------------------------------------------------
while [[ $# -gt 0 ]]; do
  case "$1" in
    -m|--mode)        MODE="${2:-}"; shift 2 ;;
    --dsn)            DSN="${2:-}"; shift 2 ;;
    -H|--host)        HOST="${2:-}"; shift 2 ;;
    -P|--port)        PORT="${2:-}"; shift 2 ;;
    -U|--user)        USER="${2:-}"; shift 2 ;;
    -W|--db-password) DBPASS="${2:-}"; shift 2 ;;
    -d|--dbname)      DBNAME="${2:-}"; shift 2 ;;
    --sslmode)        SSLMODE="${2:-}"; shift 2 ;;
    --config)         CONFIG="${2:-}"; shift 2 ;;
    -c|--container)   CONTAINER="${2:-}"; shift 2 ;;
    --exec)           EXEC_KIND="${2:-}"; shift 2 ;;
    -p|--new-password) NEWPASS="${2:-}"; shift 2 ;;
    -y|--yes)         ASSUME_YES=1; shift ;;
    -h|--help)        usage ;;
    *) die "Unknown argument: $1. Run with -h for usage." ;;
  esac
done

# ---- 从 config.json 读取 database.*（仅 local 模式、且未显式给出连接时）-----
# 优先用 python3 解析（健壮）；缺 python3 时退回 grep（config.json 为规整分字段）。
read_config_json() {
  local path="$1"
  [[ -f "$path" ]] || return 1
  if command -v python3 >/dev/null 2>&1; then
    python3 - "$path" <<'PY'
import json, sys
try:
    d = json.load(open(sys.argv[1])).get("database", {})
except Exception:
    sys.exit(1)
# 支持直接给 dsn，或分字段
if d.get("dsn"):
    print("DSN\t" + d["dsn"]); sys.exit(0)
for k in ("host","port","user","password","dbname","sslmode"):
    if d.get(k) is not None:
        print(k.upper() + "\t" + str(d[k]))
PY
  else
    # 极简后备：逐键 grep（值为字符串或数字）
    local k
    for k in host port user password dbname sslmode; do
      local v
      v=$(grep -oE "\"$k\"[[:space:]]*:[[:space:]]*(\"[^\"]*\"|[0-9]+)" "$path" 2>/dev/null \
            | head -1 | sed -E "s/.*:[[:space:]]*//; s/^\"//; s/\"$//") || true
      [[ -n "$v" ]] && echo -e "${k^^}\t$v"
    done
  fi
}

apply_config_fields() {
  local line key val
  while IFS=$'\t' read -r key val; do
    [[ -z "$key" ]] && continue
    case "$key" in
      DSN)      [[ -z "$DSN" ]] && DSN="$val" ;;
      HOST)     [[ -z "$HOST" ]] && HOST="$val" ;;
      PORT)     [[ -z "$PORT" ]] && PORT="$val" ;;
      USER)     [[ -z "$USER" ]] && USER="$val" ;;
      PASSWORD) [[ -z "$DBPASS" ]] && DBPASS="$val" ;;
      DBNAME)   [[ -z "$DBNAME" ]] && DBNAME="$val" ;;
      SSLMODE)  [[ -z "$SSLMODE" ]] && SSLMODE="$val" ;;
    esac
  done
}

# ---- 自动判定模式 ---------------------------------------------------------
if [[ -z "$MODE" ]]; then
  if [[ -n "$DSN$HOST$USER$DBNAME" || -n "${ARTEX_PG_DSN:-}" || -f "${CONFIG:-config.json}" ]]; then
    MODE="local"
  elif command -v docker >/dev/null 2>&1 && [[ -f docker-compose.yml ]]; then
    MODE="docker"
  else
    MODE="local"
  fi
fi
info "Deployment mode: $MODE"

# ---- 采集新密码 -----------------------------------------------------------
if [[ -z "$NEWPASS" ]]; then
  read -r -s -p "Enter the new password for username ARTEX: " NEWPASS; echo >&2
  [[ -n "$NEWPASS" ]] || die "The password cannot be empty."
  read -r -s -p "Confirm the new password: " NEWPASS2; echo >&2
  [[ "$NEWPASS" == "$NEWPASS2" ]] || die "The passwords do not match."
fi
[[ -n "$NEWPASS" ]] || die "The password cannot be empty."

# 通过环境变量把密码交给 psql（\getenv 读取，不进入 argv/ps）
export ARTEX_RESET_NEWPASS="$NEWPASS"

# 库内生成 bcrypt 并 upsert；密码用 :'newpw' 自动转义。CREATE EXTENSION 幂等，
# 若数据库角色无建扩展权限会在此报错（提示见下方 run 的失败分支）。
SQL=$(cat <<SQL
\\set ON_ERROR_STOP on
\\getenv newpw ARTEX_RESET_NEWPASS
CREATE EXTENSION IF NOT EXISTS pgcrypto;
INSERT INTO settings(key, value)
VALUES ('$PASS_KEY', crypt(:'newpw', gen_salt('bf', $BCRYPT_COST)))
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
SQL
)

# ---- 执行 -----------------------------------------------------------------
if [[ "$MODE" == "local" ]]; then
  # 连接信息优先级：命令行 > --dsn/$ARTEX_PG_DSN > config.json
  if [[ -z "$DSN" && -z "$HOST$USER$DBNAME" ]]; then
    [[ -n "${ARTEX_PG_DSN:-}" ]] && DSN="$ARTEX_PG_DSN"
  fi
  if [[ -z "$DSN" && -z "$HOST$USER$DBNAME" ]]; then
    cfg="${CONFIG:-config.json}"
    if [[ -f "$cfg" ]]; then
      info "Reading database settings from $cfg"
      apply_config_fields < <(read_config_json "$cfg")
    fi
  fi

  command -v psql >/dev/null 2>&1 || die "psql is not installed. Install postgresql-client or use -m docker."

  declare -a PSQL_ARGS=()
  if [[ -n "$DSN" ]]; then
    PSQL_ARGS=("$DSN")
    target="$DSN"
  else
    [[ -n "$USER"   ]] || die "A database user (-U), config.json, or DSN is required."
    [[ -n "$DBNAME" ]] || die "A database name (-d), config.json, or DSN is required."
    HOST="${HOST:-127.0.0.1}"; PORT="${PORT:-5432}"; SSLMODE="${SSLMODE:-disable}"
    PSQL_ARGS=(-h "$HOST" -p "$PORT" -U "$USER" -d "$DBNAME")
    [[ -n "$SSLMODE" ]] && export PGSSLMODE="$SSLMODE"
    [[ -n "$DBPASS" ]] && export PGPASSWORD="$DBPASS"
    target="$USER@$HOST:$PORT/$DBNAME"
  fi

  info "Target database: $target"
  if [[ "$ASSUME_YES" -ne 1 ]]; then
    read -r -p "Reset the ARTEX password in this database? [y/N] " ans
    [[ "$ans" == "y" || "$ans" == "Y" ]] || die "Operation cancelled."
  fi

  if ! printf '%s\n' "$SQL" | psql "${PSQL_ARGS[@]}" -v ON_ERROR_STOP=1 -q >/dev/null; then
    die "Password update failed. Verify pgcrypto permissions or create the extension manually."
  fi

else
  # ---- docker ----
  command -v docker >/dev/null 2>&1 || die "Docker is not installed."
  CONTAINER="${CONTAINER:-postgres}"

  # 选择 exec 方式：优先 docker compose exec（服务名），否则 docker exec（容器名）
  if [[ -z "$EXEC_KIND" ]]; then
    if docker compose version >/dev/null 2>&1 && [[ -f docker-compose.yml ]]; then
      EXEC_KIND="compose"
    else
      EXEC_KIND="docker"
    fi
  fi

  # 容器内的 psql 凭据：优先命令行，其次 .env 的 POSTGRES_*，再退回 compose 默认(artex)
  if [[ -f .env ]]; then
    # shellcheck disable=SC1091
    set -a; . ./.env; set +a
  fi
  DUSER="${USER:-${POSTGRES_USER:-artex}}"
  DNAME="${DBNAME:-${POSTGRES_DB:-artex}}"
  [[ -n "$DBPASS" ]] && export PGPASSWORD="$DBPASS"
  [[ -z "${PGPASSWORD:-}" && -n "${POSTGRES_PASSWORD:-}" ]] && export PGPASSWORD="$POSTGRES_PASSWORD"

  info "Target: psql -U $DUSER -d $DNAME in container/service $CONTAINER (exec=$EXEC_KIND)"
  if [[ "$ASSUME_YES" -ne 1 ]]; then
    read -r -p "Reset the ARTEX password in this container database? [y/N] " ans
    [[ "$ans" == "y" || "$ans" == "Y" ]] || die "Operation cancelled."
  fi

  # -e 只带名字不带值 → 从当前环境继承，密码不出现在 docker 命令 argv 里。
  declare -a EXEC_CMD
  if [[ "$EXEC_KIND" == "compose" ]]; then
    EXEC_CMD=(docker compose exec -T -e ARTEX_RESET_NEWPASS -e PGPASSWORD "$CONTAINER"
              psql -U "$DUSER" -d "$DNAME" -v ON_ERROR_STOP=1 -q)
  else
    EXEC_CMD=(docker exec -i -e ARTEX_RESET_NEWPASS -e PGPASSWORD "$CONTAINER"
              psql -U "$DUSER" -d "$DNAME" -v ON_ERROR_STOP=1 -q)
  fi

  if ! printf '%s\n' "$SQL" | "${EXEC_CMD[@]}" >/dev/null; then
    die "Password update failed. Verify the container, database credentials, and pgcrypto permissions."
  fi
fi

unset ARTEX_RESET_NEWPASS
echo "[OK] The ARTEX administrator password was reset. Sign in with username ARTEX."
