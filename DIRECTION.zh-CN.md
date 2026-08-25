[English](./DIRECTION.md) | 简体中文

# Direction

`0.3` 是当前产品线。Live tree 服务当前产品，不负责保存 prerelease 考古资料。

## 当前基线 — 0.3.0-rc.2 First Product Experience

`0.3.0-rc.2` 把已经证明正确的 Multi-Tenant Runtime 推到了真正可试用、可复制的产品层：

```text
已有 JWT / Cookie / req.user
        ↓ 产品自己完成 authentication
TrustedSubject
        ↓
canonical Tenant / Principal
        ↓
Tenant MCP config + Principal credentials
        ↓
Principal-aware Agent create/resume
        ↓
真实 DSH Agent + 官方 MCP client
        ↓
native MCP Tool
        ↓
肉眼可见的 identity / Session isolation
```

这个版本提供可运行的真实 DSH Web Starter、薄 Web identity/admission bridge、MCP-specific product facade，以及 secret-safe first-use diagnostics。永久 FPE probe 会把 packed candidate 安装进 clean DSH Web profile，真正启动 Web，并执行真实 MCP Tool。

## 接下来做什么

下一阶段的最高优先级是 **真实产品使用证据**，不是再预设一个架构 milestone。先让 `0.3.0-rc.2` 进入真实 JWT/Cookie、真实 MCP、真实 SaaS 产品，再根据反馈决定下一个 Gap。

当前候选包括：

- stock DSH Web RPC 如何携带 product Principal authority（#41）；
- production Redis / SQL Session persistence；
- 真实 JWT/Cookie 集成与 token lifecycle 压力；
- 第二个 ERP / direct-business-API vertical slice；
- authority / refresh / injection / audit 语义是否重复到足以提炼 Broker / `Capability-as-Authority`；
- 真实产品需要时再补 Permission / Audit capability。

这些都不是预先冻结的“下一版本 milestone”，优先级由 evidence 决定。

## 当前边界

`0.3.0-rc.2` 不宣称：

- product bridge 能自动让所有 stock DSH Web RPC 获得 tenant authorization；
- 单进程里可以隔离 hostile code、filesystem、network、shell；
- in-memory reference Session store 具备生产 durability；
- 已经有通用 OAuth/OIDC/token refresh 或 Credential Broker framework；
- pinned Harness 尚未消费的 MCP Resources / Prompts 已经被支持。

Strong process isolation 继续属于 process/container/Pod 边界；Product authentication 继续归产品自己。

## Live Tree Policy

- 当前 code / contract / evidence / release machinery 留在主树；
- 完成的 release scope、旧 release note 从 live tree 删除，历史交给 Git history / tag；
- 一次性 probe / workflow 的结论进入永久 evidence 后，临时载体删除；
- package / abstraction 只有在真实 vertical slice 证明独立价值后才新增。

## 长期原则

> **Core 管 identity / lifecycle；Broker 管 authority / secret；Integration 管 vendor protocol；Operation 消费 typed ability；Secret 在可行时留在 authority boundary 后面。**

这个方向仍然成立，但不会为了“架构完整”在真实 integration 之前强行冻结 universal Broker。

详见 [`docs/vision/authority-capabilities.zh-CN.md`](./docs/vision/authority-capabilities.zh-CN.md)。
