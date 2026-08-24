[English](./ROADMAP.md) | 简体中文

# Direction

项目不再维护一份很长的逐 Milestone Roadmap。当前文件只回答两个问题：**现在做什么**，以及**长期希望往哪里演进**。具体架构 contract 仍以 `docs/specs/*` 与 executable tests 为权威。

## 当前状态

```text
v0.1  Security Kernel                         已冻结
v0.2  Multi-Tenant Runtime Contract           已发布基础
v0.3  SaaS Framework Core                     当前主线
```

当前 v0.3 Core 已具备：

- deterministic typed `SaaSDefinition -> CompositionPlan`；
- scope-local canonical Tenant / Principal identity；
- Principal-owned one-shot Operation；
- 真实 DSH create / resume / failure evidence；
- 精确 `CompositionPlan <-> RuntimeComposition` binding / attestation；
- trusted Product Ingress -> canonical Principal；
- 一个真实、可替换的 Principal Credentials capability。

## 现在只聚焦：M5 真实 Agent Integration

短期不再改造 M4，也不提前设计 universal Broker API。先使用现有 `PrincipalCredentials` primitive 跑通一条真正有产品价值的 DSH MCP Tools vertical slice：

```text
trusted product request
  -> Product Ingress
  -> RuntimeComposition
  -> Tenant MCP config + Principal Credentials
  -> one-shot Operation snapshot
  -> Agent Integration
  -> DSH Agent setup
  -> @deepseek-ai/dsh-mcp-client
  -> native DSH MCP Tools
```

M5 只要求：

- 使用官方 DSH MCP client / native Tool bridge；
- 并发 Tenant / Principal isolation 正确；
- create / resume / failure / teardown 有 executable evidence；
- 当前 DSH 没有稳定 native consumer seam 时，不造 Resources / Prompts compatibility stack；
- 不为了未来想象提前拆 package；
- 如果实现中自然出现 brokered helper，先保持 private，不把它提前冻结成 Core contract。

**目标是先把真实产品闭环做出来。**

## 长期方向：Credential-as-Data -> Capability-as-Authority

`PrincipalCredentials` 当前是有意保持很小的 low-level credential primitive；它验证 M4 所需的 ownership / isolation / replacement，但不代表长期推荐的 Agent-facing API。

长期希望逐步演进到：

```text
Core identity / lifecycle
        ↓
Authority / Credential Broker plugin
        ↓
Service Integration plugin
        ↓
Typed Client / Transport capability
        ↓
Operation
```

例如 Operation 最终更应该消费 `ErpClient.query(...)` / `McpTransport.call(...)`，而不是直接拿 token 自己 fetch。不同 ERP / MCP / GitHub 等协议接入应成为可组合 Integration Plugin；Broker 也应是可替换 plugin capability，而不是 Core 中的上帝对象。

但这个方向**现在不冻结 API**。推荐证据路径是：

```text
M5 真实 MCP integration
        ↓
第二个真实 integration（例如 ERP）
        ↓
观察重复的 authority / refresh / injection / audit 语义
        ↓
提炼最小 Broker contract
        ↓
下一个 prerelease 允许 deliberate breaking change
```

完整的非绑定长期原则见 [`docs/vision/authority-capabilities.zh-CN.md`](./docs/vision/authority-capabilities.zh-CN.md)。

## 一条长期总纲

> **Core 管身份和生命周期；Broker 管授权与 secret；Integration 管厂商协议；Operation 消费 typed ability；Secret 在可行时留在 authority boundary 后面。**

M5 之后继续根据真实 release evidence 与使用反馈决定下一步，不恢复长篇 speculative milestone list。
