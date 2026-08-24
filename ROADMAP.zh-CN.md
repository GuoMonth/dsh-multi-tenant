[English](./ROADMAP.md) | 简体中文

# Direction

项目不再维护一份很长的逐 Milestone Roadmap。M0–M8 的详细规划在 v0.3 架构尚未收敛时有价值；现在继续维护只会制造叙事债务。

## 当前状态

```text
v0.1  Security Kernel                         已冻结
v0.2  Multi-Tenant Runtime Contract           已发布基础
v0.3  SaaS Framework Core                     当前主线
```

当前 v0.3 Core 已经具备：

- deterministic typed `SaaSDefinition -> CompositionPlan`；
- scope-local canonical Tenant / Principal identity；
- Principal-owned one-shot Operation；
- 真实 DSH create / resume / failure evidence；
- 精确的 `CompositionPlan <-> RuntimeComposition` 绑定与 attestation；
- trusted Product Ingress -> canonical Principal；
- 一个真实、可替换的 Principal Credentials capability。

当前架构以 `docs/specs/*` 和 executable tests 为权威，不再以本文件维护详细任务清单。

## 下一目标：M5 Agent Integration Reference Path

M5 只需要证明一条真正有用的端到端链路，不再发明新的 protocol framework：

```text
trusted product request
  -> Product Ingress
  -> bound RuntimeComposition
  -> Tenant config + Principal Credentials
  -> one-shot Operation snapshot
  -> Agent Integration recipe
  -> DSH Agent setup
  -> @deepseek-ai/dsh-mcp-client
  -> native DSH MCP Tools
```

目标刻意保持窄：

- 使用官方 DSH MCP client 与原生 Tool bridge；
- 消费 M4 Credentials contract，不把 auth logic 塞进 Agent integration；
- 并发 Agent 下保持 Tenant / Principal isolation；
- create / resume / failure / teardown 都有 executable evidence；
- pinned Harness 还没有稳定 native consumer seam 时，不做 MCP Resources / Prompts compatibility stack；
- implementation 没证明独立 boundary 前，不拆新 package。

M5 以后根据 release evidence 与真实使用反馈决定优先级，不再继续写一份很长的 speculative milestone list。
