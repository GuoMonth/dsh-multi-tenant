# POC 代理选型：保留薄适配，复用传输基础

2026-09-21。范围是浏览器经平台到 Cell/DSH 的反向代理，不是模型请求的出站代理。以平台 `61f6b544`、runtime `cbc8be42` 的代码为基准；结论服务于 [POC 收缩](poc-focus.zh-CN.md)，不新增代理产品路线图。

## 当前究竟是谁实现的

```text
浏览器 → Envoy Gateway（TLS / 入口路由）
       → 平台准入 + Node Connector（owner / 会话 / UID / 撤权断连）
       → Cell launcher 的 Go ReverseProxy（DSH token / 原生 Cookie 适配）
       → 原生 DSH
```

| 层 | 具体实现 | 自有职责 |
| --- | --- | --- |
| 外部入口 | 已验证部署使用 Envoy Gateway；平台 `integration/regression/gateway.yaml` | 配置 HTTPS、域名和平台 Service 路由，无自研 TLS/HTTP 引擎 |
| 平台到 Cell | `integration/cell-platform/src/ingress.ts` + runtime `packages/cell-connector/src/{cell,proxy}.ts` | OIDC/owner 准入、验证精确实例、受控目标、平台凭据剥离、HTTP/WS 转发与会话撤销后的断连 |
| Cell 内部 | `internal/dshcompat/launcher/launcher.go` 的 `newProxy` 使用 Go `net/http/httputil.ReverseProxy` | 保持 DSH authority/query、将进程内启动 token 用于原生登录引导、清理外层身份 Cookie、进程启动/停止 |

当前 platform 模式不启用历史 `cell-authorizer`/Envoy OIDC/ext_authz 直达 Cell 链；这些仍在仓库中的 standalone 文件不是现交付的必需依赖。当前 OIDC 来自平台的 `openid-client`，目标 UID/owner 核验在 Connector 的 `cell.ts`。评估时必须从实际 `gateway.yaml` 和 `--access-mode=platform` 入口追踪，不能按仓库文件名拼接出一条并不存在的混合链路。

自有 Node `proxy.ts` 为 241 行（包含头/Cookie策略、错误和连接生命周期）；它复用 Node HTTP parser 和 stream，不自行解析 HTTP 字节或 WebSocket frame。Go 的 `newProxy` 约 45 行，整个 launcher 的进程管理行数不能全算成“手写代理”。这是成熟入口/标准库加业务适配，并非从零造 Nginx。

代码短、依赖少是真实优点，但不等于维护成本必然小。Node 端仍自己管理 Upgrade 响应、socket 两端关闭、错误、取消、Cookie/Header 等协议边界，需要有限而有效的测试。

## 成熟替代方案的真实收益与成本

| 选择 | 能直接提供什么 | 在本项目仍需做什么 | POC 决策 |
| --- | --- | --- | --- |
| 保持现状 | 已通过原生 HTTP/WS/stream、真实撤权链路；无需新增常驻服务 | 维护小范围 Node 转发和业务校验 | 推荐，限制范围 |
| Nginx | 成熟 HTTP/WS 代理、超时/缓冲；auth_request 可查询认证服务 | 仍需 OIDC/owner/实例绑定服务、受控动态上游、DSH token适配；握手准入本身不等于按用户撤销已升级连接 | 不为 POC 整体替换；若基础设施已有可负责入口 |
| Caddy | 成熟反向代理、WebSocket、forward_auth；可配置流式行为 | 同样需要自有授权/目标绑定；需另做会话撤销与已连接socket的关联，不可把配置重载等同于精确撤权 | 新建简单入口时可选，当前没有收益证据要求切换 |
| Pingora | Rust 可编程代理框架，提供传输基础 | 要编写Rust代理服务、鉴权/路由逻辑、打包运维与联动机制；不是可直接替换的现成认证网关 | 当前不引入 |

Nginx/Caddy 的外部认证适合准入检查，但不能凭一个 auth_request/forward_auth 配置替代当前“父会话撤销立即关闭该用户已有 WS”的应用语义。这是对文档机制与本项目需求的推论，不是宣称这些产品无法经模块/扩展实现。扩展之后仍有自有代码，且需要跨进程连接控制。若未来主动放弃即时撤权，应作为产品决策单独讨论，不能为换代理悄悄改变。

Cell launcher 的 token 留在原进程内。单独放一个 Nginx/Caddy sidecar 会需要额外 token 传递机制；当前标准库代理已经满足此处复用需求，不建议为减少几十行适配反而引入它。

## 本轮建议

1. 保留已经工作的三层职责，不再加 Nginx/Caddy/Pingora 服务；入口继续使用当前已验收 Envoy 参考部署。将来有第二种真实部署需求再验证另一入口，不先建立多代理兼容矩阵。
2. 冻结自有代理范围：仅固定 DSH 的 HTTP/WS/stream、身份/实例约束与断连。HTTP协议解析、TLS、连接基础由标准库/成熟入口承担；不新增通用负载均衡、缓存、重试、插件、HTTP/3。尤其不要自动重放用户有副作用的请求。
3. 将代理有限验证并入 POC 的 P3，而非另开企业级项目：保留已验证的头清理、真实WS撤权、流取消；针对错误上游、连接失败/迟到握手和长流，补充少量真实socket检查。只根据具体缺陷修补或评估成熟Node代理库，不按行数重写。

## 证据与局限

现有真实集群证据见 [回归报告](../evidence/cell-regression-2026-09-20.md)；本地socket证据在 `integration/regression/test/transport.test.mjs`（身份头/Cookie隔离、HTTP流abort、准入校验期间撤权）。这些不证明任意HTTP扩展、恶意上游、无限长流或高并发容量均已覆盖。

静态审查关注点：Node Connector 没有独立可见的上游连接/首部等待期限；会话/请求取消虽然能够终止它，但不等于清晰的阶段超时。应区分连接/握手等待与已建立模型长流，不能一刀切短超时。请求头删除所有 `x-*`、响应Cookie只保留固定DSH模式是当前产品策略，不是通用透明代理承诺；升级DSH时需核验。以上是维护边界和待验证点，未在本轮复现为线上故障。

## 官方依据

- [Go ReverseProxy](https://pkg.go.dev/net/http/httputil#ReverseProxy)：现有标准库基础。
- [Nginx WebSocket](https://nginx.org/en/docs/http/websocket.html)、[auth_request](https://nginx.org/en/docs/http/ngx_http_auth_request_module.html)：升级隧道和准入子请求。
- [Caddy reverse_proxy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy)、[forward_auth](https://caddyserver.com/docs/caddyfile/directives/forward_auth)：流式转发、外部认证预检查。
- [Pingora 官方仓库](https://github.com/cloudflare/pingora)：构建可编程网络服务的Rust库/框架。

## 后续验证归属

[P2 #99](https://github.com/GuoMonth/dsh-multi-tenant/issues/99)评估`connect()`与发送前地址解析各一次`verify()`的重复：正常成功路径两轮合计约10次K8s读。保留临发送前的UID/目标验证，不先建设缓存系统；没有验证不能宣称删一轮校验无损。

[P3 #100](https://github.com/GuoMonth/dsh-multi-tenant/issues/100)覆盖阶段超时、取消与慢上游槽位回收。未认证请求被拒绝后不会进入Cell读取；Node默认入站超时也不能与上游首部等待混为一谈。固定版本不能独立升级是本POC已接受的取舍。审查过程和反证见 [Issue #82](https://github.com/GuoMonth/dsh-multi-tenant/issues/82)，不另设代理路线图。
