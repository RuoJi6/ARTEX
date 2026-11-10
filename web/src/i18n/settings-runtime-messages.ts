export const settingsRuntimeMessages = {
  "settings.progress.rollback_unprotected": [
    "警告：写入升级标记失败，本次升级将没有自动回滚保护",
    "Warning: The update marker could not be written. This update will not have automatic rollback protection.",
  ],
  "settings.searchTestSucceeded_one": [
    "搜索测试成功 · {{backend}} 返回 {{count}} 条结果",
    "Search test passed · {{backend}} returned {{count}} result",
  ],
  "settings.searchTestSucceeded_other": [
    "搜索测试成功 · {{backend}} 返回 {{count}} 条结果",
    "Search test passed · {{backend}} returned {{count}} results",
  ],
  "settings.egressSkip.no_proxy": ["输入框为空，未配置代理", "The field is empty; no proxy is configured"],
  "settings.egressSkip.saved_proxy_active": [
    "输入框为空；已保存的代理仍在生效",
    "The field is empty; the saved proxy is still active",
  ],
  "settings.egressWarning.pending_direct": [
    "此地址尚未保存，Agent 当前仍使用 {{proxy}}。保存后即改为直连。",
    "This change is not saved. Agents still use {{proxy}}. Saving will switch to a direct connection.",
  ],
  "settings.egressWarning.pending_proxy": [
    "此地址尚未保存，Agent 当前仍为直连。上方结果对应输入框中的值，保存后生效。",
    "This address is not saved. Agents still connect directly. The test uses the value in the field; save it to apply.",
  ],
  "settings.egressWarning.pending_change": [
    "此地址尚未保存，Agent 当前仍使用 {{proxy}}。上方结果对应输入框中的值，保存后生效。",
    "This address is not saved. Agents still use {{proxy}}. The test uses the value in the field; save it to apply.",
  ],
  "settings.egressWarning.socks_without_capture": [
    "当前是「关闭捕获 + socks5」：本测试用的是 Go 客户端（一定遵守代理），但 agent 的工具不一定——curl 能走，python urllib 会直接报错。所以这里通不代表工具都能走；要稳定生效请开启流量捕获（由 MITM 亲自拨号）。",
    "Traffic capture is disabled with SOCKS5. This test uses a Go client that respects the proxy, but Agent tools may behave differently: curl supports it, while Python urllib may fail. A successful test does not guarantee all tools will work. Enable traffic capture to let the MITM proxy handle connections.",
  ],
  "settings.egressWarning.same_ip": [
    "直连与代理的出口 IP 相同（{{ip}}）：可能代理未生效、只是透明转发，也可能跳板机与本机在同一 NAT 后面（出口本来就相同）。要区分：在「自定义 IP 探测服务」里填一台内网回显服务，看它看到的源 IP 是否变成了跳板机。",
    "Direct and proxy connections have the same outbound IP ({{ip}}). The proxy may be inactive, forwarding transparently, or sharing the same NAT as this computer. Use a private-network echo service as the custom probe and check whether it sees the proxy host’s source IP.",
  ],
  "settings.egressWarning.capture_direct": [
    "已开启流量捕获，但全局代理为空：捕获只负责记录，出口仍是直连。",
    "Traffic capture is enabled, but no global proxy is configured. Capture records traffic; outbound connections are still direct.",
  ],
  "settings.egressWarning.loopback_proxy": [
    "代理地址是回环地址（127.0.0.1 / localhost）。如果 ARTEX 跑在容器里，这里的 127.0.0.1 指容器自身，连不到宿主机上的代理；请改用宿主机的可达 IP（如 http://192.168.x.x:端口）。",
    "The proxy uses a loopback address (127.0.0.1 / localhost). Inside a container this refers to the container itself, not the host proxy. Use a reachable host IP, such as http://192.168.x.x:port.",
  ],
  "error.demo_basic_auth_disabled": [
    "演示模式不支持修改 HTTP Basic Auth，请在实际部署中配置",
    "HTTP Basic Auth cannot be changed in the demo. Configure it in a deployed instance.",
  ],
} satisfies Record<string, readonly [string, string]>;
