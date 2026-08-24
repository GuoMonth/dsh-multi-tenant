[English](./ROADMAP.md) | 简体中文

# Direction

项目不再维护长篇逐 Milestone Roadmap。当前 contract 以 `docs/specs/*` 与 executable tests 为权威；本文件只记录**当前交付焦点**和**非绑定长期方向**。

## 当前状态

```text
v0.1  Security Kernel                         已冻结
v0.2  Multi-Tenant Runtime Contract           已发布基础
v0.3  SaaS Framework Core                     M5 已完成
0.3.0-rc.1                                    release candidate
```

当前 v0.3 已经证明：

- deterministic typed Composition -> canonical Tenant / Principal Runtime；
- exact `RuntimeComposition` whole-plan binding / attestation；
- trusted Product Ingress -> canonical Principal；
- Principal-scoped replaceable Credentials；
- Principal-owned one-shot Operation；
- Tenant-scoped MCP configuration；
- Principal-bound create/resume 在任何 DSH work 前 enforce Session ownership；
- Principal-owned long-lived DSH Agent；
- 官方 `@deepseek-ai/dsh-mcp-client` 在 Agent publication 前完成 initial discovery；
- 真正 Agent-scoped MCP Tools 通过 DSH ToolRuntime 执行；
- Acme/Alice、Acme/Bob、Globex/Alice 并发隔离；
- Node 22.19 / Node 24 上的 create / resume / startup-failure / teardown executable evidence；
- packed M5 artifact 与 pinned DSH CLI 在 clean consumer 中的真实解析与调用链验证。

## 唯一短期目标：发布并验证 0.3.0-rc.1

这个 candidate 发布并进入真实使用之前，不再开启新的架构 Milestone。

```text
0.3.0-rc.1 manifest + docs 对齐
  -> 永久 tarball installed-consumer smoke
  -> v0.3 registry smoke
  -> 完整 pnpm release:check
  -> release convergence merge 到 main
  -> 手动 dispatch release.yml
  -> OIDC / provenance 发布 exact artifact
  -> 验证 npm latest + exact installed artifact
  -> 创建 Git tag + prerelease GitHub Release
```

发版标准很具体：产品开发者只提供 trusted identity resolution、Tenant MCP config、Principal credentials，就能 create/resume 一个真正 multi-tenant 的 DSH Agent，并直接得到 native MCP Tools，而不用自己手工拼 DSH / MCP composition path。

发布后下一步从 `0.3.0-rc.1` 的真实使用证据决定，不预写 speculative M6 list。

## 长期方向：Credential-as-Data -> Capability-as-Authority

`PrincipalCredentials` 继续是当前 low-level primitive。它对 v0.3 很有用，但不代表 raw credential 是最终 Agent / application-facing abstraction。

长期更偏向：

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

这仍然是 Vision，不进入 `0.3.0-rc.1` release scope。证据路径保持：

```text
真实 MCP integration（M5）       ✅
        ↓
第二个真实 integration（ERP 等）
        ↓
比较重复出现的 authority / refresh / injection / audit 语义
        ↓
只提炼最小且被证明的 Broker contract
        ↓
如果确有价值，允许后续 prerelease deliberate breaking change
```

详见 [`docs/vision/authority-capabilities.zh-CN.md`](./docs/vision/authority-capabilities.zh-CN.md)。

> **Core 管身份和生命周期；Broker 管授权与 secret；Integration 管厂商协议；Operation 消费 typed ability；Secret 在可行时留在 authority boundary 后面。**
