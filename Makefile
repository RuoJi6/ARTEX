# ARTEX 构建入口：把散落的 shell 脚本统一成 make 目标。
#
# 核心是「前端静态导出 → 拷贝到 server/webui/dist → go 编译内嵌二进制」这三步，
# 原先生硬地复制在 build.sh / install.sh / update.sh 里，这里收敛成 build 目标。
# release / install / update / reset-password 仍委托给原有脚本（逻辑成熟，不重写）。
#
# 用法：make help 查看全部目标；make build 构建当前平台单二进制。
#
# 依赖：go（编译）、node/npm（构建内嵌前端时）。Unix 环境（Linux / macOS / WSL）
# 均可直接运行；纯 Windows 原生仍用 start.bat + build.sh。

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
TARGETARCH ?= $(shell uname -m | sed 's/x86_64/amd64/;s/aarch64/arm64/')

.DEFAULT_GOAL := help

.PHONY: help build build-web build-backend docker offline-package dev test install update release reset-password clean

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

# 构建当前工作区的单架构离线部署包（应用镜像 + PostgreSQL + Compose + Skills）。
# ARGS 可传镜像名/tag/包名；默认输出到 dist/offline，成功后清理构建中间产物：
#   make offline-package
#   make offline-package ARGS="artex offline"
#   make offline-package ARGS="myrepo/artex offline my-pkg"
#   make offline-package TARGETARCH=arm64
offline-package:
	TARGETARCH=$(TARGETARCH) bash ./build-offline.sh $(ARGS)

# 开发模式（后端 + 代理 + 前端 dev，见 dev.sh）
dev:
	./dev.sh

# 运行全部测试
test:
	$(GO) test ./...

# 首次安装（Docker 或本地编译）
install:
	./install.sh

# 升级（Docker 拉镜像 或 本地重编译）
update:
	./update.sh

# 跨平台 Release 打包（等价 build.sh --release）
release:
	./build.sh --release

# 重置管理员密码
reset-password:
	./reset-password.sh

# 清理构建产物，但保留 dist/offline 中已经生成的离线包
clean:
	rm -rf $(EMBED_DIR) $(WEB_OUT) web/.next web/node_modules web/tsconfig.tsbuildinfo \
	  dist/amd64 dist/arm64 $(BINARY)

help:
	@echo "ARTEX 构建目标："
	@echo ""
	@echo "  make build            构建内嵌前端单二进制（当前平台）"
	@echo "  make build-web        只导出前端静态产物到 server/webui/dist"
	@echo "  make build-backend    只编译后端（不内嵌前端，dev 用）"
	@echo "  make docker           构建 Docker 镜像（自动探测架构，IMAGE/TARGETARCH 可覆盖）"
	@echo "  make offline-package  构建离线安装包（ARGS 可传镜像名/tag/包名）"
	@echo "  make dev              开发模式（dev.sh）"
	@echo "  make test             运行全部测试"
	@echo "  make install          首次安装（install.sh）"
	@echo "  make update           升级（update.sh）"
	@echo "  make release          跨平台 Release（build.sh --release）"
	@echo "  make reset-password   重置管理员密码"
	@echo "  make clean            清理构建产物"
