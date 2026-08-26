[English](./DIRECTION.md) | 简体中文

# Direction

`0.3` 是当前产品线。Live tree 服务当前产品，不负责保存 prerelease 考古资料。

## 当前 Candidate — 0.3.0-rc.3 Durable Local Experience

`0.3.0-rc.2` 已经证明第一条真实产品链路。`0.3.0-rc.3` 解决下一层 adoption friction：个人开发者不应该先安装 PostgreSQL 或 Docker，Session ownership 才能在重启后继续存在。

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
SQLite-backed immutable Session ownership
        ↓ 重启后仍可验证
真实 DSH Agent + 官方 MCP client
        ↓
native MCP Tool
```

DSH bundle 现在默认选择 `SQLiteTenantSessionStore`。它只使用 Node 内置 `node:sqlite`，默认写入 `<cwd>/.dsh-multi-tenant/session-ownership.sqlite`，并继续保持原来的 claim-once `TenantSessionStore` contract。永久 SQLite probe 会真正启动多个独立 Node process，证明 restart persistence 和竞争 claim 只有一个 winner。

SQLite 的定位刻意是 **local durable / single-node adoption provider**。它不把项目包装成 horizontally-scaled persistence 产品。未来真实部署需要时，PostgreSQL/其他 provider 继续替换同一个 Store seam 即可。

## 已承认的 Web 边界 — #41

项目接受 pinned DSH 当前的限制：stock DSH Web RPC dispatch 不会给每个 business method materialize product-authenticated Principal Context。

这个边界不再作为当前产品闭环的 blocker。上游还没有 request-scoped Principal seam 时，生产部署 contract 是：

```text
Browser / external client
        ↓
Product Gateway / BFF
  - authentication
  - canonical Tenant / Principal resolution
  - Session / Agent resource authorization
        ↓ private network / loopback
DSH Web + dsh-multi-tenant
```

公网客户端不能存在绕过 Gateway 直接访问 stock DSH `/api` 的路径。#41 继续保持 open，作为未来 upstream/native integration improvement，而不是暗示 rc.3 已经在进程内保护所有 stock RPC。

## 接下来做什么

rc.3 之后继续由真实产品 evidence 决定优先级。当前更可能的 Gap 是：

- long-lived Principal-owned Agent 面对真实 credential refresh / rotation / revocation 的压力；
- 围绕已承认 #41 边界的 production Gateway/BFF 示例与 executable deployment evidence；
- 第二个 ERP / direct-business-API vertical slice；
- 真正需要 horizontal scaling 时再提供 PostgreSQL 或其他 multi-instance `TenantSessionStore`；
- 真实产品需要时再补最小 audit / policy hook；
- authority / refresh / injection / audit 语义重复到足以提炼 Broker / `Capability-as-Authority` 时再抽象。

不要为了“架构完整”提前做 universal Auth/Broker/Policy framework。

## 当前边界

`0.3.0-rc.3` 不宣称：

- product bridge 能自动让所有 stock DSH Web RPC 获得 tenant authorization；
- bundled SQLite provider 具备 multi-replica production durability；
- 单进程里可以隔离 hostile code、filesystem、network、shell；
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