[English](./authority-capabilities.md) | 简体中文

# Vision —— Authority-Oriented Capabilities

> Status：**非绑定的长期方向**。这不是当前 v0.3 API contract，不进入 release gate，也不能拿它作为提前创建 package / abstraction 的理由。

## 为什么要记录这个方向

M4 刻意引入了一个很小的 Principal-scoped `PrincipalCredentials` capability，用一个真实 product-facing capability 验证 trusted ingress、Principal ownership、replacement、isolation 与 lifecycle。

它在当前阶段是有用的，但 **raw credential 不是长期推荐的 Agent-facing abstraction**。

长期方向是：

```text
Credential-as-Data
        ↓ 由真实实现证据推动演进
Capability-as-Authority
```

理想状态下，Operation 拿到的是 `ErpClient`、`McpTransport` 或其他 service-specific typed ability；credential 本身留在 authority boundary 后面。

## 长期职责拆分

```text
dsh-multi-tenant Core
  identity / lifecycle / composition / attestation
                │
                ▼
Authority / Credential Broker plugin
  policy / secret resolution / refresh / injection / audit
                │
                ▼
Service Integration plugin
  ERP-A / ERP-B / MCP / GitHub / internal API / ...
                │
                ▼
Typed client / transport capability
                │
                ▼
Operation
  client.query(...) / transport.call(...)
```

真正需要长期保留的是原则，而不是某个接口名字：

> **Core 管身份和生命周期；Broker 管授权与 secret；Integration 管厂商协议；Operation 消费 typed ability；Secret 在可行时留在 authority boundary 后面。**

## Broker 不是 Core 里的新上帝对象

未来 Broker 更适合作为可替换 plugin capability，而不是 Core 内部不断增长的 switch / branch。

未来可能出现的实现包括：

- in-memory / reference broker；
- Vault / cloud secret-backed broker；
- internal IAM / token-exchange broker；
- 为更强 secret isolation 服务的 remote / sidecar broker。

这些只是例子，不是已经批准的 package name。只有多个真实 integration 证明共享语义以后，才应该提炼正式 Broker contract。

尤其不要轻易提供 unrestricted `authorizedFetch(url)` 这种万能入口；如果 target / policy 约束不够强，它很容易重新变成“帮调用方偷偷塞 Authorization header 的任意 HTTP 代理”。产品层通常应该拿 service-specific typed client。

## 不同业务系统通过 Integration Plugin 组装

不同 ERP 不应该变成一个 Broker 里的分支：

```text
                   Authority Broker
                         │
          ┌──────────────┼──────────────┐
          ▼              ▼              ▼
      ERP-A plugin   ERP-B plugin    MCP plugin
          │              │              │
          ▼              ▼              ▼
      ErpAClient      ErpBClient    McpTransport
```

一个 integration plugin 可以消费 Tenant config + Principal authority，并提供 typed capability：

```text
ERP-A Integration
  requires:
    TenantErpAConfig
    Principal authority/broker

  provides:
    ErpAClient
```

Operation 最终消费的是 `ErpAClient`，不是 ERP token。

## 短期执行：不要再次推翻 M4

当前 M4 contract 继续作为实现 baseline：

```text
Product Ingress
  -> RuntimeComposition
  -> PrincipalCredentials
  -> Operation
```

M5 先使用现有 M4 primitive 跑通真正的 DSH MCP Tools vertical slice。当前 DSH / MCP seam 如果要求 trusted integration code 消费 `PrincipalCredentials`，可以这样做；如果实现过程中自然出现一个很小的 brokered helper，先保持 private，直到证据足以支撑公共 abstraction。

**不要为了设计 universal Broker API 阻塞 M5。**

## 做破坏性抽象以前需要的证据

推荐顺序：

```text
M4 当前 contract
        ↓
M5 真实 MCP Tools integration
        ↓
第二个真实 integration（例如 ERP）
        ↓
比较重复出现的 authority / refresh / injection / audit 语义
        ↓
提炼最小、已经被证明的 Broker contract
        ↓
下一个 prerelease 可以做 deliberate breaking change
```

到那时 `PrincipalCredentials` 可能有三种命运：

1. 继续作为 Broker provider 使用的 low-level primitive；
2. 降级成 internal/provider SPI，不再推荐给 application code；
3. 在 Broker 直接连接 Vault / IAM 的实现中消失。

现在不冻结任何一种。

## Security Boundary

Same-process Broker 仍然有真实安全收益：正常应用路径下，Operation、Tool、日志和业务 callback 不再需要看到 raw token。但它不能阻止 hostile same-process plugin 读取 process memory 或 monkey-patch trusted code。

如果 threat model 要求 Agent process 从物理上都不能拿到 secret，最终还需要 process / container / sidecar / remote authority boundary。

## 长期判断规则

未来评估 capability / plugin 设计时，优先使用五条规则：

1. **Core owns identity/lifecycle, not vendor business.**
2. **Secrets stay behind authority boundaries whenever practical.**
3. **Operations consume typed abilities/clients, not raw credentials.**
4. **Service-specific integrations are composable plugins, not Broker branches.**
5. **Public abstraction / package boundary 由真实 vertical slice 挣出来；prerelease breaking change 可以接受。**
