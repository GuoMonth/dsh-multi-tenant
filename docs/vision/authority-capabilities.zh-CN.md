[English](./authority-capabilities.md) | 简体中文

# Vision —— Authority-Oriented Capabilities

> 状态：**非绑定长期方向**。它不是当前 `0.3` API contract，也不进入 release gate。

## 为什么记录这个方向

`0.3` 有意保留一个很小的 Principal-scoped `PrincipalCredentials` primitive，因为它已经足够构建并证明真实 multi-tenant MCP 产品链路。

但这不意味着 raw credential 是长期推荐的 Agent-facing abstraction。

```text
Credential-as-Data
        ↓ 只由真实 evidence 推动演进
Capability-as-Authority
```

长期更希望 Operation 消费 `ErpClient` 或其他 service-specific client / transport，让 secret 留在 authority boundary 后面。

## 长期职责拆分

```text
dsh-multi-tenant Core
  identity / lifecycle / composition / attestation
                ↓
Authority / Credential Broker plugin
  policy / secret resolution / refresh / injection / audit
                ↓
Service Integration plugin
  ERP-A / ERP-B / MCP / GitHub / internal API / ...
                ↓
Typed client / transport capability
                ↓
Operation
```

> **Core 管身份和生命周期；Broker 管授权与 secret；Integration 管厂商协议；Operation 消费 typed ability；Secret 在可行时留在 authority boundary 后面。**

## Broker 应该可组合，而不是新的上帝对象

未来 Broker 更应该是 replaceable plugin capability。不同 ERP / MCP / vendor 系统保持为独立 Integration Plugin，而不是不断往一个万能 Broker 里加 branch。

未来可能有 in-memory/reference、Vault/cloud-secret、internal IAM/token-exchange、remote/sidecar 等 Broker 实现。这些只是例子，不代表已经冻结 package name。

尤其不要轻易暴露 unrestricted `authorizedFetch(url)`；如果 target / policy 边界不够强，它很容易重新变成任意 credential forwarding。产品层通常更应该消费 service-specific typed client。

## 正式 Broker contract 前需要什么证据

真实 MCP integration 已经进入 `0.3` baseline。下一份真正有价值的 evidence 是第二个真实 integration，例如 ERP：

```text
真实 MCP integration       ✅
        ↓
第二个真实 integration
        ↓
比较 authority / refresh / injection / audit 语义
        ↓
只提炼真正重复出现的最小共同 contract
        ↓
必要时允许 deliberate prerelease breaking change
```

在此之前，`PrincipalCredentials` 继续是当前 low-level primitive。未来它可能继续作为 Broker provider primitive、退到 internal SPI，或者在 Broker 直接连接 Vault/IAM 时消失。现在不冻结任何一种。

## Security Boundary

Same-process Broker 可以明显降低正常路径上的 secret 暴露，但无法防御已经拥有 process memory 与 trusted execution 权限的恶意同进程代码。

如果 threat model 要求 Agent process 自己物理上拿不到 secret，应使用 process / container / sidecar / remote authority boundary。

## 判断规则

1. **Core owns identity/lifecycle, not vendor business.**
2. **Secrets stay behind authority boundaries whenever practical.**
3. **Operations consume typed abilities/clients, not raw credentials.**
4. **Service-specific integrations are composable plugins, not Broker branches.**
5. **Public abstraction / package boundary 由真实 integration 挣出来；prerelease breaking change 可以接受。**
