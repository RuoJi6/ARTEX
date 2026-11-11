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
| 记录代理 | 转发缺失 UA 的请求时，Go 会补入默认客户端标识。现保留省略语义，录制中不展示内部用于抑制默认值的空头。保留客户端已有 UA。 |
| GitHub 自更新 | 额外发现查询版本、下载校验和与发布包共用的两处 `artex-selfupdate`。均已移除；GitHub API 要求非空 UA，未配置时使用通用 `Go-http-client/1.1`，不含 ARTEX 名称。 |
| 前端 mock | `ARTEX-worker/1.0` 仅为示例 HTTP 文本，不会发出请求；已删除该行，避免误导。 |

## 配置

`ARTEX_HTTP_USER_AGENT` 统一配置以上通道，默认空值使目标请求不发送此头；自更新采用表中非空兼容值。Go 服务重启后生效；Docker 在 `.env` 设置后重建容器。直接运行 Python 模板时可继承同名环境变量。

Python 模板的 `--user-agent VALUE` 优先于环境变量，`--user-agent ''` 强制省略。自定义 HTTP 工具 / 重放器的显式 UA 同样优先于全局值。配置仅接受可打印 ASCII，去除首尾空格；控制字符和非 ASCII 值按空值处理，防止头注入。

不随机轮换、不自动冒充浏览器。可以复用授权目标已有流量中的真实值。省略或修改 UA 不能保证客户端不可识别，第三方出口代理也可能再次添加或改写请求头。

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

- Go：检查真实 HTTP 线上头、配置值 / 空值、代理及失败直连重试、重定向、CA 信任、静态资源限制、HTML / RECON 解析、agent session 注册、自定义工具 / 重放器覆盖、自更新查询及下载和代理录制。
- Python：本地 HTTP 服务验证默认 / 环境变量 / CLI 覆盖 / 显式空值、非法头值、重定向、Cookie 保留及产物生成；不访问真实目标。

本地命令：

```sh
go test ./internal/httpidentity ./internal/webfetch ./enrich ./agent ./selfupdate ./traffic
go test ./server -run 'TestProbe|TestRepeater|TestRunHTTPTool|TestHTTPTool|TestTargetHTTPIdentity' -count=1
python3 -m unittest discover -s skills/api-recon/scripts -p 'test_*.py' -v
```

服务端完整套件另需隔离 PostgreSQL 测试库；未配置数据库时其中的数据库集成用例会失败。
