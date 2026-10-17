#!/usr/bin/env bash
# Build a self-contained ARTEX offline deployment bundle for one Linux architecture.
#
# Usage:
#   ./build-offline.sh [image-name] [tag] [package-name]
#   make offline-package ARGS="myrepo/artex v1.2.3 artex-1.2.3-offline"
#
# Environment:
#   TARGETARCH=amd64|arm64       Target Linux architecture (default: host architecture)
#   OFFLINE_OUTPUT_DIR=path      Output directory (default: dist/offline)
#   OVERWRITE=1                  Replace an existing archive with the same name
set -Eeuo pipefail
IFS=$'\n\t'

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

info() { printf '\033[36m[*]\033[0m %s\n' "$*"; }
ok()   { printf '\033[32m[+]\033[0m %s\n' "$*"; }
warn() { printf '\033[33m[!]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[31m[x]\033[0m %s\n' "$*" >&2; exit 1; }

usage() {
  cat <<'EOF'
用法：
  ./build-offline.sh [镜像名] [tag] [包名]

示例：
  ./build-offline.sh
  ./build-offline.sh artex v1.2.3
  ./build-offline.sh myrepo/artex v1.2.3 artex-1.2.3-offline

环境变量：
  TARGETARCH=amd64|arm64    目标 Linux 架构，默认使用当前主机架构
  OFFLINE_OUTPUT_DIR=路径   输出目录，默认 dist/offline
  OVERWRITE=1               覆盖同名离线包

脚本构建当前 Git 工作区，不会切换分支。产物包含 ARTEX/PostgreSQL 镜像、
Docker Compose、内置 Skills、安装脚本、镜像校验和及构建清单。
EOF
}

if [ "${1:-}" = "--help" ] || [ "${1:-}" = "-h" ]; then
  usage
  exit 0
fi
[ "$#" -le 3 ] || die "参数过多，请使用 --help 查看用法"

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "未检测到必需命令：$1"
}

normalize_arch() {
  case "$1" in
    amd64|x86_64) printf '%s' "amd64" ;;
    arm64|aarch64) printf '%s' "arm64" ;;
    *) return 1 ;;
  esac
}

default_tag() {
  if command -v git >/dev/null 2>&1 && git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    git describe --tags --always --dirty 2>/dev/null || printf '%s' "dev"
  else
    printf '%s' "dev"
  fi
}

host_arch="$(normalize_arch "$(uname -m)")" || die "不支持的主机架构：$(uname -m)"
TARGETARCH="$(normalize_arch "${TARGETARCH:-$host_arch}")" || die "TARGETARCH 仅支持 amd64 或 arm64"
IMAGE_NAME="${1:-${OFFLINE_IMAGE:-artex}}"
TAG="${2:-${OFFLINE_TAG:-$(default_tag)}}"
VERSION="${TAG#v}"
image_slug="$(printf '%s' "$IMAGE_NAME" | sed 's|.*/||; s|[^A-Za-z0-9._-]|-|g')"
PKG_NAME="${3:-${image_slug}-${TAG}-linux-${TARGETARCH}-offline}"
OUTPUT_DIR="${OFFLINE_OUTPUT_DIR:-dist/offline}"
FULL_IMAGE="${IMAGE_NAME}:${TAG}"
POSTGRES_IMAGE="postgres:16-alpine"
PLATFORM="linux/${TARGETARCH}"

[ -n "$IMAGE_NAME" ] || die "镜像名不能为空"
case "$IMAGE_NAME" in
  *[[:space:]]*|*@*) die "镜像名不能包含空白或 digest；请传不含 tag 的镜像仓库名" ;;
esac
[[ "$TAG" =~ ^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$ ]] || die "非法镜像 tag：$TAG"
[[ "$PKG_NAME" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$ ]] ||
  die "非法包名：只允许 1-128 位字母、数字、点、下划线和连字符"
[ -n "$VERSION" ] || die "版本号不能为空"

for cmd in docker make go npm tar sed uname mktemp cp mv; do
  require_command "$cmd"
done
if ! command -v sha256sum >/dev/null 2>&1 && ! command -v shasum >/dev/null 2>&1; then
  die "未检测到 sha256sum 或 shasum"
fi
docker info >/dev/null 2>&1 || die "Docker daemon 不可用"
docker compose version >/dev/null 2>&1 || die "未检测到 docker compose 插件"

for required in Makefile Dockerfile docker-compose.yml .env.example skills; do
  [ -e "$required" ] || die "缺少构建输入：$required"
done

WORK_DIR="$(mktemp -d)"
[ -n "$WORK_DIR" ] && [ -d "$WORK_DIR" ] || die "无法创建临时目录"
PACKAGE_ROOT="$WORK_DIR/$PKG_NAME"

cleanup() {
  if [ -n "${WORK_DIR:-}" ] && [ -d "$WORK_DIR" ]; then
    rm -rf -- "$WORK_DIR"
  fi
}
trap cleanup EXIT INT TERM

image_arch() {
  docker image inspect --format '{{.Architecture}}' "$1" 2>/dev/null
}

verify_image_arch() {
  image="$1"
  actual="$(image_arch "$image")" || die "无法读取镜像信息：$image"
  actual="$(normalize_arch "$actual")" || die "镜像架构不受支持：$image ($actual)"
  [ "$actual" = "$TARGETARCH" ] || die "镜像架构错误：$image 是 $actual，期望 $TARGETARCH"
}

write_checksums() {
  directory="$1"
  shift
  if command -v sha256sum >/dev/null 2>&1; then
    (cd "$directory" && sha256sum "$@")
  else
    (cd "$directory" && shasum -a 256 "$@")
  fi
}

info "目标镜像：$FULL_IMAGE"
info "目标平台：$PLATFORM"
info "离线包名：$PKG_NAME"

info "1/8 通过 Makefile 构建 ARTEX 镜像"
DOCKER_DEFAULT_PLATFORM="$PLATFORM" \
  make docker VERSION="$VERSION" IMAGE="$FULL_IMAGE" TARGETARCH="$TARGETARCH"
verify_image_arch "$FULL_IMAGE"

info "2/8 拉取 PostgreSQL 镜像"
docker pull --platform "$PLATFORM" "$POSTGRES_IMAGE"
verify_image_arch "$POSTGRES_IMAGE"

info "3/8 验证 ARTEX 镜像可执行"
docker run --rm --platform "$PLATFORM" --entrypoint /app/artex "$FULL_IMAGE" -h >/dev/null

info "4/8 导出容器镜像"
mkdir -p "$PACKAGE_ROOT/images"
docker save --output "$PACKAGE_ROOT/images/artex-image.tar" "$FULL_IMAGE"
docker save --output "$PACKAGE_ROOT/images/postgres-image.tar" "$POSTGRES_IMAGE"

info "5/8 组装部署文件"
cp docker-compose.yml "$PACKAGE_ROOT/docker-compose.yml"
cp -R skills "$PACKAGE_ROOT/skills"

# Reuse the repository's canonical environment template and only pin the image
# identity for this bundle, avoiding a second, drifting copy of Compose settings.
while IFS= read -r line || [ -n "$line" ]; do
  case "$line" in
    ARTEX_IMAGE=*) printf 'ARTEX_IMAGE=%s\n' "$IMAGE_NAME" ;;
    ARTEX_TAG=*) printf 'ARTEX_TAG=%s\n' "$TAG" ;;
    *) printf '%s\n' "$line" ;;
  esac
done < .env.example > "$PACKAGE_ROOT/.env.example"

cat > "$PACKAGE_ROOT/install.sh" <<'INSTALL'
#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'
umask 077
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

info() { printf '[*] %s\n' "$*"; }
die()  { printf '[x] %s\n' "$*" >&2; exit 1; }

command -v docker >/dev/null 2>&1 || die "未检测到 docker"
docker info >/dev/null 2>&1 || die "Docker daemon 不可用"
docker compose version >/dev/null 2>&1 || die "未检测到 docker compose 插件"

info "1/4 校验离线镜像"
if [ -f SHA256SUMS ]; then
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum -c SHA256SUMS
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 -c SHA256SUMS
  else
    die "缺少 sha256sum/shasum，无法校验离线镜像"
  fi
fi

shopt -s nullglob
images=(images/*.tar)
[ "${#images[@]}" -gt 0 ] || die "离线包中没有镜像文件"

info "2/4 加载容器镜像"
for image in "${images[@]}"; do
  docker load --input "$image"
done

info "3/4 准备部署配置"
if [ ! -f .env ]; then
  password="$(od -An -N24 -tx1 /dev/urandom | tr -d ' \n')"
  temp_env=".env.tmp.$$"
  trap 'rm -f -- "${temp_env:-}"' EXIT INT TERM
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      POSTGRES_PASSWORD=*) printf 'POSTGRES_PASSWORD=%s\n' "$password" ;;
      *) printf '%s\n' "$line" ;;
    esac
  done < .env.example > "$temp_env"
  mv "$temp_env" .env
  trap - EXIT INT TERM
  printf '[+] 已生成 .env，并设置随机数据库密码\n'
else
  chmod 600 .env
  printf '[!] 保留已有 .env 配置\n'
fi
mkdir -p data skills
docker compose config >/dev/null

info "4/4 启动服务"
docker compose up -d
docker compose ps
printf '[+] 部署完成：http://localhost:8787（首次进入 /setup 设置管理员密码）\n'
INSTALL
chmod 0755 "$PACKAGE_ROOT/install.sh"

git_commit="$(git rev-parse HEAD 2>/dev/null || printf '%s' unknown)"
app_image_id="$(docker image inspect --format '{{.Id}}' "$FULL_IMAGE")"
postgres_image_id="$(docker image inspect --format '{{.Id}}' "$POSTGRES_IMAGE")"
cat > "$PACKAGE_ROOT/MANIFEST.txt" <<EOF
ARTEX offline deployment bundle
package=$PKG_NAME
version=$VERSION
git_commit=$git_commit
platform=$PLATFORM
application_image=$FULL_IMAGE
application_image_id=$app_image_id
postgres_image=$POSTGRES_IMAGE
postgres_image_id=$postgres_image_id
EOF

cat > "$PACKAGE_ROOT/README.md" <<EOF
# ARTEX $TAG 离线部署包

- 平台：\`$PLATFORM\`
- 应用镜像：\`$FULL_IMAGE\`
- 数据库镜像：\`$POSTGRES_IMAGE\`

## 部署

\`\`\`bash
tar xzf $PKG_NAME.tar.gz
cd $PKG_NAME
./install.sh
\`\`\`

安装脚本会先校验并加载镜像，首次部署时生成权限为 0600 的 \`.env\` 和随机数据库密码，
然后通过 Docker Compose 启动服务。启动后访问 http://localhost:8787。

如需配置 LLM，请在启动前编辑 \`.env\`，或者启动后在 ARTEX 页面中配置。
不要删除 \`skills/\`，该目录会挂载到容器中并保存后续 Skill 修改。
EOF

write_checksums "$PACKAGE_ROOT" images/artex-image.tar images/postgres-image.tar > "$PACKAGE_ROOT/SHA256SUMS"
docker compose --env-file "$PACKAGE_ROOT/.env.example" -f "$PACKAGE_ROOT/docker-compose.yml" config >/dev/null

info "6/8 创建压缩包"
TEMP_ARCHIVE="$WORK_DIR/${PKG_NAME}.tar.gz"
tar -C "$WORK_DIR" -czf "$TEMP_ARCHIVE" "$PKG_NAME"

info "7/8 写入输出目录"
mkdir -p "$OUTPUT_DIR"
FINAL_ARCHIVE="$OUTPUT_DIR/${PKG_NAME}.tar.gz"
FINAL_CHECKSUM="$FINAL_ARCHIVE.sha256"
if [ -e "$FINAL_ARCHIVE" ] || [ -e "$FINAL_CHECKSUM" ]; then
  [ "${OVERWRITE:-0}" = "1" ] || die "产物已存在：$FINAL_ARCHIVE（如需覆盖请设置 OVERWRITE=1）"
  rm -f -- "$FINAL_ARCHIVE" "$FINAL_CHECKSUM"
fi
mv "$TEMP_ARCHIVE" "$FINAL_ARCHIVE"
write_checksums "$OUTPUT_DIR" "$(basename "$FINAL_ARCHIVE")" > "$FINAL_CHECKSUM"

info "8/8 完成"
ok "离线包：$FINAL_ARCHIVE"
ok "校验值：$FINAL_CHECKSUM"
warn "Makefile 构建产物已保留；确认不再需要后可执行 make clean"
