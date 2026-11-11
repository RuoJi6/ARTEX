# HTTP 请求标识排查

本次检查覆盖仓库中的 Go HTTP 请求、Python / JavaScript 脚本、安装脚本、前端示例，以及实际使用的 norma v0.4.3 的 WebFetch / WebSearch 实现。排查范围包括 User-Agent 的大小写变体、请求头构造、代理转发、重定向及代理失败后的直连重试。

## 已处理

| 通道 | 排查结果与处理 |
|---|---|
| 内置 WebFetch | SDK 将 `norma/0.4` 写死在首发及重试请求。worker、planner、main、chat 通过统一 session 入口使用本地适配器；保留 SDK 的工具 schema、权限、静态资源限制、代理、CA 验证及 HTML / RECON 输出。 |
| 资产自动补全 | 移除 `artex-enrich/1.0`，HTTP 探测使用统一策略。 |
| 出口连通性探测 | 额外发现 `artex-egress-probe/1.0`，已移除并接入统一策略。 |
| 静态采集 / 同源爬虫模板 | 移除 `spa-api-recon` / `spa-api-recon spider`，避免 urllib 自动填入自己的默认 UA；入口、下载、重定向及重试沿用同一配置。 |
| HTTP 自定义工具 | 原先没有 ARTEX 专属 UA，但未设置时会由 Go 填充默认值。现采用统一策略，模板显式请求头优先。 |
| 请求重放器 | 原先没有 ARTEX 专属 UA。现采用统一策略，用户显式请求头（包括空值）优先，保持原请求的配置能力。 |
| 记录代理 | 转发缺失 UA 的请求时，Go 会补入默认客户端标识。现保留显式省略语义，录制中不展示内部用于抑制默认值的空头。保留客户端已选择的随机或固定 UA。 |
| GitHub 自更新 | 额外发现查询版本、下载校验和与发布包共用的两处 `artex-selfupdate`。均已移除；与其他请求统一采用随机浏览器样本或显式配置的非空 UA，不含默认 ARTEX 名称。 |
| 前端 mock | `ARTEX-worker/1.0` 仅为示例 HTTP 文本，不会发出请求；已删除该行，避免误导。 |

## 配置

默认采用随机 UA 池方案，Go 与两个独立 Python 模板内置相同的 20 个完整浏览器 UA 样本，覆盖 Chrome / Edge / Firefox / Safari 的标准桌面格式。随机选择完整样本，允许重复，不拼接随机版本，不调用 AI 服务。

2026-11-11 核对并更新样本，采用主流浏览器近期稳定版本的标准格式：

| 浏览器 | 版本 | 平台 | 数量 |
|---|---|---|---|
| Chrome | 154 / 155 / 156 / 157 | Windows / macOS / Linux | 12 |
| Edge | 156 / 157 | Windows / macOS | 4 |
| Firefox | 159 | Windows / macOS / Linux | 3 |
| Safari | 27.1 | macOS | 1 |

保留浏览器正常的 UA 缩减字段（如 Chrome 的 `0.0.0` 和 macOS 的冻结版本），不添加工具名称、随机设备型号、扩展标记或自定义后缀。“常见”指主流浏览器的标准 UA 格式，不代表已测量这 20 项在目标站点中的使用占比；浏览器类型和版本仍可从 UA 中读出。

格式与版本参考：

- [Chromium UA Reduction](https://www.chromium.org/updates/ua-reduction/)
- [Chrome 稳定版发布记录](https://chromereleases.googleblog.com/search/label/Stable%20updates)
- [Edge UA 格式](https://learn.microsoft.com/en-us/microsoft-edge/web-platform/user-agent-guidance)
- [Edge 稳定版发布记录](https://learn.microsoft.com/en-us/deployedge/microsoft-edge-relnote-stable-channel)
- [Firefox UA 格式](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/User-Agent/Firefox)
- [Firefox 159 发布记录](https://www.firefox.com/en-US/firefox/159.0/releasenotes/)
- [Safari 27.1 发布记录](https://developer.apple.com/documentation/safari-release-notes/safari-27_1-release-notes)

- Go 每次 HTTP 逻辑请求抽选一次；WebFetch 每次工具调用重新抽选，重定向、代理请求及失败后的直连重试复用同一值。
- Python 脚本每次运行抽选一次，入口、并发资源下载及重试复用同一值；独立调用 `fetch()` 时每次调用单独选择。
- `ARTEX_HTTP_USER_AGENT` 非空且合法时覆盖随机值；留空、仅空格或非法值回退随机池。Go 使用系统加密随机源；若随机源出错，保留池中首个非空有效样本。
- Python 的 `--user-agent VALUE` 优先于环境变量，`--user-agent ''` 仍显式省略；自定义 HTTP 工具 / 重放器显式提供的 UA（包括空值）同样优先，保留原请求的控制能力。
- 固定值只接受可打印 ASCII，去除首尾空格；控制字符和非 ASCII 值回退随机池，防止头注入。

Go 服务重启后使用新配置；Docker 在 `.env` 设置后重建容器。直接运行 Python 模板时继承同名环境变量。已同步 agent OPSEC 提示，避免旧提示与平台随机策略冲突；遇到限速等异常时仍停止，不以换 UA 继续当前方向。

UA 随机化不会同步改变 TLS、Cookie 或其他浏览器特征，不能保证客户端不可识别；第三方出口代理也可能再次改写请求头。

## 检查过的其他通道与边界

| 通道 | 结果 |
|---|---|
| SDK 联网搜索 | norma 的 DDGS 后端含固定 Firefox 128 浏览器 UA，没有 ARTEX / norma 名称；仅发往搜索服务，属于依赖的兼容策略，未改动，也不受此环境变量控制。Brave / Tavily 及 DeepSeek 搜索未发现 ARTEX 专属 UA。 |
| 浏览器自动化 / runtime_harvest.js | 沿用浏览器请求头；运行时转发复制捕获到的请求头，没有硬编码 ARTEX UA。 |
| LLM 请求 / 模型列表 / JEV | 未发现硬编码 ARTEX UA；仍可能有 HTTP 库、SDK、服务协议和用户自定义标识，不套用目标流量配置。 |
| MCP HTTP / SSE | 未发现 ARTEX UA；显式自定义头保留。初始化协议体仍有 `clientInfo.name = artex`，这是对用户配置的 MCP 服务的协议自报身份，本次不改动。 |
| Webhook / 通知 | 未发现硬编码 ARTEX UA；保留用户自定义头及客户端默认行为。 |
| 安装脚本 | 未发现 ARTEX UA；获取 Docker 安装脚本的 curl 仍使用其原生身份。外部命令及用户自建脚本不由本次策略接管。 |
| phpfinger | 仓库未包含其源码，无法核验默认值；需要在独立工具中通过 `--user-agent` 配置。 |

服务端响应中的 `X-Artex-Auth` 仍用于前端识别 Basic Auth 未认证状态，属于站点自身对访问者的响应协议；它不是向目标站点发送的请求头。本次不改变该协议，也不承诺消除服务端页面、API、TLS 或其他流量特征。

## 回归验证

- Go：检查真实 HTTP 线上头、随机样本选择 / 固定值覆盖 / 显式空值、代理及失败直连重试、重定向、CA 信任、静态资源限制、HTML / RECON 解析、agent session 注册、自定义工具 / 重放器覆盖、自更新查询及下载和代理录制。
- Python：本地 HTTP 服务验证默认随机 / 环境变量 / CLI 覆盖 / 显式空值、非法头值、重定向、Cookie 保留及产物生成；不访问真实目标。

本地命令：

```sh
go test ./internal/httpidentity ./internal/webfetch ./enrich ./agent ./selfupdate ./traffic
go test ./server -run 'TestProbe|TestRepeater|TestRunHTTPTool|TestHTTPTool|TestTargetHTTPIdentity' -count=1
go test -race ./internal/httpidentity ./internal/webfetch ./enrich ./traffic
python3 -m unittest discover -s skills/api-recon/scripts -p 'test_*.py' -v
```

以上专项回归、Go race 检查及 Python 3 项测试均通过。池扩展后的回归还检查恰好 20 个不重复样本、逐项选择以及 Go 与两个 Python 模板的样本一致性。

2026-11-11 使用项目提供的本地 PostgreSQL，在新建的独立测试库中执行了 `go test ./... -count=1 -p 1 -timeout 180s`，测试库用后删除。完整套件未全部通过：

- `agent` 的 `TestGraphOverviewExpandsAssociatedCompanyScope`、`TestCaptureApprovalLifecycle` 和 `db` 的 `TestInterceptApprovalFilters`、`TestSideTaskArchiveVersions` 失败；在原提交 `17c2fc5` 的独立副本和另一新建测试库中复现了相同失败。
- `server` 首次运行有 3 个用例在临时目录清理阶段报 `directory not empty`，涉及 `TestInheritedActivityDetailAndRelationDeletion`、`TestTaskMetadataPatchReturnsRenameAndPin`、`TestTaskMetadataPatchGlobalAssetSharing`，不是 UA 断言失败。再次在新建隔离库中运行完整 `server` 套件时这 3 项通过，但 `TestCoreTaskLifecyclePG` 报 `expected goal nodes seeded, got 0`。原提交的完整 `server` 套件通过；修改后完整 `server` 套件仍未获得全绿结果。
