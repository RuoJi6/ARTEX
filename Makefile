# ARTEX 构建入口：把散落的 shell 脚本统一成 make 目标。
#
# 核心是「前端静态导出 → 拷贝到 server/webui/dist → go 编译内嵌二进制」这三步，
# 原先生硬地复制在 build.sh / install.sh / update.sh 里，这里收敛成 build 目标。
# release / install / update / reset-password 仍委托给原有脚本（逻辑成熟，不重写）。
#
# 用法：make help 查看全部目标；make build 构建当前平台单二进制。
#
# 依赖：go（编译）、node/npm（构建内嵌前端时）。Unix 环境（Linux / macOS / WSL）
# 均可直接运行；纯 Windows 原生仍用 start.bat + scripts/build.sh。

BINARY ?= artex
GO     ?= go
NPM    ?= npm

# 离线/本地构建不依赖 Git；仅写入固定构建标识，调用方仍可按需覆盖。
BUILD_LABEL ?= offline
LDFLAGS := -s -w -buildid= -X main.version=$(BUILD_LABEL)
# 构建标识已经由 LDFLAGS 显式注入，不再让 Go 调用 Git 生成 VCS 元数据。
GO_BUILD_FLAGS := -buildvcs=false -trimpath

WEB_OUT   := web/out
EMBED_DIR := server/webui/dist

# Docker 镜像构建。IMAGE 是镜像名/tag；TARGETARCH 自动探测宿主机架构（x86_64→amd64、
# aarch64→arm64），与 Dockerfile 的 COPY dist/${TARGETARCH}/artex 及 BuildKit 原生构建对齐。
IMAGE      ?= artex:local
API_IMAGE  ?= artex-api:local
WEB_IMAGE  ?= artex-nginx:local
TARGETARCH ?= $(shell uname -m | sed 's/x86_64/amd64/;s/aarch64/arm64/')

# 离线包参数：IMAGE_NAME 镜像名、VERSION 版本（= 镜像 tag，也写入二进制 main.version）、
# PKG_NAME 包名（默认由脚本按「镜像名-架构-版本」自动生成）。
IMAGE_NAME ?= artex
VERSION    ?=
PKG_NAME   ?=

.DEFAULT_GOAL := help

.PHONY: help build build-web build-backend docker docker-api docker-nginx offline-package dev test install update release reset-password clean

# 构建内嵌前端的单二进制（当前平台）
build: build-web
	CGO_ENABLED=0 $(GO) build -tags embedui $(GO_BUILD_FLAGS) -ldflags "$(LDFLAGS)" -o $(BINARY) ./cmd/artex

# 只导出前端静态产物到 server/webui/dist
# build:static 由 Node 脚本设置 NEXT_EXPORT，兼容 Linux/macOS，以及 WSL 中调用
# Windows npm/node.exe 的混合环境。
build-web:
	cd web && $(NPM) ci && $(NPM) run build:static
	rm -rf $(EMBED_DIR) && mkdir -p $(EMBED_DIR) && cp -r $(WEB_OUT)/. $(EMBED_DIR)/

# 只编译后端（不内嵌前端，dev 模式用）
build-backend:
	CGO_ENABLED=0 $(GO) build $(GO_BUILD_FLAGS) -ldflags "$(LDFLAGS)" -o $(BINARY) ./cmd/artex

# 构建 Docker 镜像（本地单架构，默认 amd64）。等价 CI docker job 的本地简化版：
# 前端静态 → 编译 linux 二进制到 dist/<arch>/artex → docker build 拷进镜像。
# arm64 机器用：make docker TARGETARCH=arm64
docker: build-web
	mkdir -p dist/$(TARGETARCH)
	CGO_ENABLED=0 GOOS=linux GOARCH=$(TARGETARCH) $(GO) build -tags embedui $(GO_BUILD_FLAGS) \
	  -ldflags "$(LDFLAGS)" -o dist/$(TARGETARCH)/artex ./cmd/artex
	docker build -t $(IMAGE) .

# 前后端分离：后端 API 镜像（不内嵌前端，webui 桩 404）
docker-api:
	mkdir -p dist/$(TARGETARCH)
	CGO_ENABLED=0 GOOS=linux GOARCH=$(TARGETARCH) $(GO) build $(GO_BUILD_FLAGS) \
	  -ldflags "$(LDFLAGS)" -o dist/$(TARGETARCH)/artex ./cmd/artex
	docker build -t $(API_IMAGE) .

# 前后端分离：前端 nginx 镜像（托管静态导出 + 反代 /api）
docker-nginx: build-web
	docker build -f Dockerfile.web -t $(WEB_IMAGE) .

# 构建当前工作区的单架构离线部署包（应用镜像 + PostgreSQL + Compose + Skills）。
# 未指定 VERSION 时交互提示输入版本（回车默认 offline）；默认输出到 dist/offline，退出时清理：
#   make offline-package
#   make offline-package VERSION=v1.0.0
#   make offline-package IMAGE_NAME=myrepo/artex VERSION=v1.0.0
#   make offline-package TARGETARCH=arm64
offline-package:
	@ver="$(VERSION)"; \
	if [ -z "$$ver" ]; then \
		printf 'Enter version [offline]: '; \
		read -r ver || true; \
		[ -n "$$ver" ] || ver=offline; \
	fi; \
	TARGETARCH=$(TARGETARCH) bash ./scripts/build-offline.sh $(IMAGE_NAME) "$$ver" $(PKG_NAME)

# 开发模式（后端 + 代理 + 前端 dev，见 scripts/dev.sh）
dev:
	./scripts/dev.sh

# 运行全部测试
test:
	$(GO) test ./...

# 首次安装（Docker 或本地编译）
install:
	./install.sh

# 升级（Docker 拉镜像 或 本地重编译）
update:
	./update.sh

# 跨平台 Release 打包（等价 scripts/build.sh --release）
release:
	./scripts/build.sh --release

# 重置管理员密码
reset-password:
	./reset-password.sh

# 清理构建产物，但保留 dist/offline 中已经生成的离线包
clean:
	rm -rf $(EMBED_DIR) $(WEB_OUT) web/.next web/node_modules web/tsconfig.tsbuildinfo \
	  dist/amd64 dist/arm64 $(BINARY)

help:
	@echo "ARTEX build targets:"
	@echo ""
	@echo "  make build            Build a frontend-embedded binary for the current platform"
	@echo "  make build-web        Export frontend assets to server/webui/dist"
	@echo "  make build-backend    Build the backend without embedded frontend assets"
	@echo "  make docker           Build the Docker image; IMAGE and TARGETARCH are configurable"
	@echo "  make offline-package  Build the offline deployment bundle (VERSION=..., IMAGE_NAME=...)"
	@echo "  make dev              Run the development environment"
	@echo "  make test             Run all Go tests"
	@echo "  make install          Run the repository installer"
	@echo "  make update           Run the repository updater"
	@echo "  make release          Build cross-platform release archives"
	@echo "  make reset-password   Reset the administrator password"
	@echo "  make clean            Remove build artifacts but keep offline bundles"
