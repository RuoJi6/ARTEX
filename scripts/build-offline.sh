#!/usr/bin/env bash
# Build a self-contained ARTEX offline deployment bundle for one Linux architecture.
#
# Usage:
#   ./scripts/build-offline.sh [image-name] [image-tag] [package-name]
#   make offline-package VERSION=v1.0.0 [IMAGE_NAME=myrepo/artex]
#
# Environment:
#   TARGETARCH=amd64|arm64       Target Linux architecture (default: host architecture)
#   OFFLINE_OUTPUT_DIR=path      Output directory (default: dist/offline)
#   KEEP_BUILD_ARTIFACTS=1       Keep frontend and Go artifacts even on failure
#   DEPLOY_MODE=monolith|separated   Deployment mode (default: monolith)
set -Eeuo pipefail
IFS=$'\n\t'

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

info() { printf '\033[36m[*]\033[0m %s\n' "$*"; }
ok()   { printf '\033[32m[+]\033[0m %s\n' "$*"; }
warn() { printf '\033[33m[!]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[31m[x]\033[0m %s\n' "$*" >&2; exit 1; }

usage() {
  cat <<'EOF'
Build a self-contained ARTEX offline deployment bundle.

Usage:
  ./scripts/build-offline.sh [image-name] [image-tag] [package-name]

Examples:
  ./scripts/build-offline.sh
  ./scripts/build-offline.sh artex offline
  ./scripts/build-offline.sh myrepo/artex offline artex-offline

Environment:
  TARGETARCH=amd64|arm64    Target Linux architecture; defaults to the host architecture
  OFFLINE_OUTPUT_DIR=path   Output directory; defaults to dist/offline
  KEEP_BUILD_ARTIFACTS=1    Keep frontend and Go artifacts even when the build fails
  DEPLOY_MODE=monolith|separated  Deployment mode; defaults to monolith

The build uses the current working tree and does not depend on Git metadata.
EOF
}

if [ "${1:-}" = "--help" ] || [ "${1:-}" = "-h" ]; then
  usage
  exit 0
fi
[ "$#" -le 3 ] || die "Too many arguments. Run with --help for usage."

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "Required command not found: $1"
}

normalize_arch() {
  case "$1" in
    amd64|x86_64) printf '%s' "amd64" ;;
    arm64|aarch64) printf '%s' "arm64" ;;
    *) return 1 ;;
  esac
}

host_arch="$(normalize_arch "$(uname -m)")" || die "Unsupported host architecture: $(uname -m)"
TARGETARCH="$(normalize_arch "${TARGETARCH:-$host_arch}")" || die "TARGETARCH must be amd64 or arm64."
IMAGE_NAME="${1:-${OFFLINE_IMAGE:-artex}}"
IMAGE_TAG="${2:-${OFFLINE_IMAGE_TAG:-offline}}"
image_slug="$(printf '%s' "$IMAGE_NAME" | sed 's|.*/||; s|[^A-Za-z0-9._-]|-|g')"
PKG_NAME="${3:-${image_slug}-linux-${TARGETARCH}-${IMAGE_TAG}}"
OUTPUT_DIR="${OFFLINE_OUTPUT_DIR:-dist/offline}"
DEPLOY_MODE="${DEPLOY_MODE:-monolith}"
FULL_IMAGE="${IMAGE_NAME}:${IMAGE_TAG}"
API_IMAGE_NAME="${IMAGE_NAME}-api"
NGINX_IMAGE_NAME="${IMAGE_NAME}-nginx"
FULL_API_IMAGE="${API_IMAGE_NAME}:${IMAGE_TAG}"
FULL_NGINX_IMAGE="${NGINX_IMAGE_NAME}:${IMAGE_TAG}"
POSTGRES_IMAGE="postgres:16-alpine"
PLATFORM="linux/${TARGETARCH}"

[ -n "$IMAGE_NAME" ] || die "The image name cannot be empty."
case "$IMAGE_NAME" in
  *[[:space:]]*|*@*) die "The image name must not contain whitespace or a digest." ;;
esac
[[ "$IMAGE_TAG" =~ ^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$ ]] || die "Invalid image tag: $IMAGE_TAG"
[[ "$PKG_NAME" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$ ]] ||
  die "Invalid package name. Use 1-128 letters, numbers, dots, underscores, or hyphens."
case "$DEPLOY_MODE" in
  monolith|separated) : ;;
  *) die "DEPLOY_MODE must be monolith or separated." ;;
esac

for cmd in docker make go npm tar sed uname mktemp cp mv; do
  require_command "$cmd"
done
if ! command -v sha256sum >/dev/null 2>&1 && ! command -v shasum >/dev/null 2>&1; then
  die "sha256sum or shasum is required."
fi
docker info >/dev/null 2>&1 || die "The Docker daemon is not available."
docker compose version >/dev/null 2>&1 || die "The Docker Compose plugin is not installed."

for required in Makefile Dockerfile Dockerfile.web deploy/nginx.conf .env.example skills scripts/artexctl; do
  [ -e "$required" ] || die "Required build input is missing: $required"
done

WORK_DIR="$(mktemp -d)"
[ -n "$WORK_DIR" ] && [ -d "$WORK_DIR" ] || die "Unable to create a temporary directory."
PACKAGE_ROOT="$WORK_DIR/$PKG_NAME"
BUILD_ARTIFACTS_CLEANED=0

cleanup_build_artifacts() {
  [ "$BUILD_ARTIFACTS_CLEANED" = "1" ] && return 0

  # Only remove paths produced or replaced by `make docker`. Keep dist/offline,
  # which contains the last successful archive and its checksum.
  rm -rf -- \
    web/node_modules \
    web/.next \
    web/out \
    web/tsconfig.tsbuildinfo \
    server/webui/dist \
    "dist/$TARGETARCH"
  BUILD_ARTIFACTS_CLEANED=1
}

cleanup() {
  exit_code=$?
  trap - EXIT INT TERM
  set +e

  if [ -n "${WORK_DIR:-}" ] && [ -d "$WORK_DIR" ]; then
    rm -rf -- "$WORK_DIR"
  fi

  if [ "${KEEP_BUILD_ARTIFACTS:-0}" != "1" ]; then
    if [ "$exit_code" -ne 0 ]; then
      warn "Build did not complete; removing intermediate files."
    fi
    cleanup_build_artifacts
  fi

  exit "$exit_code"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

image_arch() {
  docker image inspect --format '{{.Architecture}}' "$1" 2>/dev/null
}

verify_image_arch() {
  image="$1"
  actual="$(image_arch "$image")" || die "Unable to inspect image: $image"
  actual="$(normalize_arch "$actual")" || die "Unsupported image architecture: $image ($actual)"
  [ "$actual" = "$TARGETARCH" ] || die "Image architecture mismatch: $image is $actual, expected $TARGETARCH."
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

info "Deploy mode: $DEPLOY_MODE"
info "Application image: $FULL_IMAGE"
info "Target platform: $PLATFORM"
info "Offline package: $PKG_NAME"

if [ "$DEPLOY_MODE" = "separated" ]; then
  info "1/8 Building separated images (api + nginx)"
  DOCKER_DEFAULT_PLATFORM="$PLATFORM" \
    make docker-api BUILD_LABEL="$IMAGE_TAG" API_IMAGE="$FULL_API_IMAGE" TARGETARCH="$TARGETARCH"
  DOCKER_DEFAULT_PLATFORM="$PLATFORM" \
    make docker-nginx WEB_IMAGE="$FULL_NGINX_IMAGE"
  verify_image_arch "$FULL_API_IMAGE"
  verify_image_arch "$FULL_NGINX_IMAGE"
else
  info "1/8 Building the ARTEX image through Makefile"
  DOCKER_DEFAULT_PLATFORM="$PLATFORM" \
    make docker BUILD_LABEL="$IMAGE_TAG" IMAGE="$FULL_IMAGE" TARGETARCH="$TARGETARCH"
  verify_image_arch "$FULL_IMAGE"
fi

info "2/8 Fetching the PostgreSQL image"
docker pull --platform "$PLATFORM" "$POSTGRES_IMAGE"
verify_image_arch "$POSTGRES_IMAGE"

info "3/8 Running the ARTEX image smoke test"
smoke_image="$FULL_IMAGE"
[ "$DEPLOY_MODE" = "separated" ] && smoke_image="$FULL_API_IMAGE"
docker run --rm --platform "$PLATFORM" --entrypoint /app/artex "$smoke_image" -h >/dev/null

info "4/8 Exporting container images"
mkdir -p "$PACKAGE_ROOT/images"
if [ "$DEPLOY_MODE" = "separated" ]; then
  docker save --output "$PACKAGE_ROOT/images/artex-api-image.tar" "$FULL_API_IMAGE"
  docker save --output "$PACKAGE_ROOT/images/artex-nginx-image.tar" "$FULL_NGINX_IMAGE"
  docker save --output "$PACKAGE_ROOT/images/postgres-image.tar" "$POSTGRES_IMAGE"
else
  docker save --output "$PACKAGE_ROOT/images/artex-image.tar" "$FULL_IMAGE"
  docker save --output "$PACKAGE_ROOT/images/postgres-image.tar" "$POSTGRES_IMAGE"
fi

info "5/8 Assembling deployment files"
# 离线包不内置 docker-compose.yml；由 artexctl 在安装时按数据目录动态生成。
cp -R skills "$PACKAGE_ROOT/skills"
cp scripts/artexctl "$PACKAGE_ROOT/artexctl"
chmod 0755 "$PACKAGE_ROOT/artexctl"

# Reuse the repository's canonical environment template and only pin the image
# identity for this bundle, avoiding a second, drifting copy of Compose settings.
while IFS= read -r line || [ -n "$line" ]; do
  case "$line" in
    ARTEX_MODE=*) printf 'ARTEX_MODE=%s\n' "$DEPLOY_MODE" ;;
    ARTEX_IMAGE=*) printf 'ARTEX_IMAGE=%s\n' "$IMAGE_NAME" ;;
    ARTEX_API_IMAGE=*) printf 'ARTEX_API_IMAGE=%s\n' "$API_IMAGE_NAME" ;;
    ARTEX_NGINX_IMAGE=*) printf 'ARTEX_NGINX_IMAGE=%s\n' "$NGINX_IMAGE_NAME" ;;
    ARTEX_TAG=*) printf 'ARTEX_TAG=%s\n' "$IMAGE_TAG" ;;
    *) printf '%s\n' "$line" ;;
  esac
done < .env.example > "$PACKAGE_ROOT/.env.example"

postgres_image_id="$(docker image inspect --format '{{.Id}}' "$POSTGRES_IMAGE")"
if [ "$DEPLOY_MODE" = "separated" ]; then
  api_image_id="$(docker image inspect --format '{{.Id}}' "$FULL_API_IMAGE")"
  nginx_image_id="$(docker image inspect --format '{{.Id}}' "$FULL_NGINX_IMAGE")"
else
  app_image_id="$(docker image inspect --format '{{.Id}}' "$FULL_IMAGE")"
fi
cat > "$PACKAGE_ROOT/MANIFEST.txt" <<EOF
ARTEX offline deployment bundle
package=$PKG_NAME
deploy_mode=$DEPLOY_MODE
image_tag=$IMAGE_TAG
platform=$PLATFORM
postgres_image=$POSTGRES_IMAGE
postgres_image_id=$postgres_image_id
EOF
if [ "$DEPLOY_MODE" = "separated" ]; then
  cat >> "$PACKAGE_ROOT/MANIFEST.txt" <<EOF
api_image=$FULL_API_IMAGE
api_image_id=$api_image_id
nginx_image=$FULL_NGINX_IMAGE
nginx_image_id=$nginx_image_id
EOF
else
  cat >> "$PACKAGE_ROOT/MANIFEST.txt" <<EOF
application_image=$FULL_IMAGE
application_image_id=$app_image_id
EOF
fi

if [ "$DEPLOY_MODE" = "separated" ]; then
  image_summary="API: $FULL_API_IMAGE; Frontend: $FULL_NGINX_IMAGE"
else
  image_summary="$FULL_IMAGE"
fi

cat > "$PACKAGE_ROOT/README.md" <<EOF
# ARTEX Offline Deployment Bundle

- Platform: \`$PLATFORM\`
- Deploy mode: \`$DEPLOY_MODE\`
- Application image: \`$image_summary\`
- Database image: \`$POSTGRES_IMAGE\`

## Install

\`\`\`bash
tar xzf $PKG_NAME.tar.gz
cd $PKG_NAME
./artexctl install
\`\`\`

Press Enter at the PostgreSQL password prompt to generate a secure random password,
then choose a data directory (defaults to \`/opt/artex\`) and a mapped port (defaults to
\`8787\`). All persistent state — the \`.env\` file, application data, skills, and
PostgreSQL — lives under that directory, so re-installing to a different path reuses it
automatically.

Run \`./artexctl help\` for start, stop, restart, status, logs, verification,
and administrator password reset commands. After startup, use
\`http://<server-ip-or-domain>:8787\` from another machine or
\`http://localhost:8787\` on the server itself. Allow TCP port 8787 through the
firewall when remote access is required; use an HTTPS reverse proxy in production.
EOF

if [ "$DEPLOY_MODE" = "separated" ]; then
  write_checksums "$PACKAGE_ROOT" images/artex-api-image.tar images/artex-nginx-image.tar images/postgres-image.tar > "$PACKAGE_ROOT/SHA256SUMS"
else
  write_checksums "$PACKAGE_ROOT" images/artex-image.tar images/postgres-image.tar > "$PACKAGE_ROOT/SHA256SUMS"
fi

info "6/8 Creating the compressed archive"
TEMP_ARCHIVE="$WORK_DIR/${PKG_NAME}.tar.gz"
tar -C "$WORK_DIR" -czf "$TEMP_ARCHIVE" "$PKG_NAME"

info "7/8 Writing the final output"
mkdir -p "$OUTPUT_DIR"
FINAL_ARCHIVE="$OUTPUT_DIR/${PKG_NAME}.tar.gz"
FINAL_CHECKSUM="$FINAL_ARCHIVE.sha256"
if [ -e "$FINAL_ARCHIVE" ] || [ -e "$FINAL_CHECKSUM" ]; then
  info "Replacing the existing package with the completed build"
  rm -f -- "$FINAL_ARCHIVE" "$FINAL_CHECKSUM"
fi
mv "$TEMP_ARCHIVE" "$FINAL_ARCHIVE"
write_checksums "$OUTPUT_DIR" "$(basename "$FINAL_ARCHIVE")" > "$FINAL_CHECKSUM"

info "8/8 Cleaning intermediate build files"
if [ "${KEEP_BUILD_ARTIFACTS:-0}" = "1" ]; then
  warn "Intermediate files were preserved because KEEP_BUILD_ARTIFACTS=1."
else
  cleanup_build_artifacts
fi

ok "Offline package: $FINAL_ARCHIVE"
ok "Checksum file: $FINAL_CHECKSUM"
