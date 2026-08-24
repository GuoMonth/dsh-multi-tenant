[简体中文](./ROADMAP.zh-CN.md) | English

# Direction

The project no longer maintains a long milestone-by-milestone Roadmap. This file now answers only two questions: **what we are doing now**, and **where we want the architecture to evolve long term**. Current contracts remain authoritative in `docs/specs/*` and executable tests.

## Current state

```text
v0.1  Security Kernel                         frozen
v0.2  Multi-Tenant Runtime Contract           published foundation
v0.3  SaaS Framework Core                     active
```

The live v0.3 Core now has:

- deterministic typed `SaaSDefinition -> CompositionPlan`;
- scope-local canonical Tenant/Principal identity;
- Principal-owned one-shot Operations;
- real DSH create/resume/failure evidence;
- exact `CompositionPlan <-> RuntimeComposition` binding/attestation;
- trusted Product Ingress -> canonical Principal;
- a real replaceable Principal Credentials capability.

## Near-term focus only: M5 real Agent Integration

Do not redesign M4 again and do not block on a universal Broker API. First use the existing `PrincipalCredentials` primitive to ship one real DSH MCP Tools vertical slice with product value:

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

M5 only requires:

- official DSH MCP client/native Tool bridge;
- correct concurrent Tenant/Principal isolation;
- executable create/resume/failure/teardown evidence;
- no Resources/Prompts compatibility stack while DSH lacks a stable native consumer seam;
- no speculative package split;
- if a brokered helper naturally appears, keep it private until real evidence justifies a public contract.

**The goal is to ship the real product loop first.**

## Long-term direction: Credential-as-Data -> Capability-as-Authority

`PrincipalCredentials` is intentionally a small low-level credential primitive today. It proves the M4 ownership/isolation/replacement model, but it is not necessarily the long-term recommended Agent-facing API.

The preferred direction is:

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

An Operation should eventually prefer `ErpClient.query(...)` or `McpTransport.call(...)` over receiving a raw token and performing arbitrary fetches. Different ERP/MCP/GitHub/vendor integrations should remain composable Integration Plugins; the Broker should also be a replaceable plugin capability rather than a Core god object.

This direction **does not freeze an API today**. The evidence path is:

```text
M5 real MCP integration
        ↓
second real integration (for example ERP)
        ↓
observe repeated authority / refresh / injection / audit semantics
        ↓
extract the smallest proven Broker contract
        ↓
allow a deliberate breaking change in the next prerelease
```

See the non-binding long-term principles in [`docs/vision/authority-capabilities.md`](./docs/vision/authority-capabilities.md).

## Long-term rule in one sentence

> **Core owns identity/lifecycle; Broker owns authority/secrets; Integration owns vendor protocol; Operation consumes typed abilities; secrets stay behind the authority boundary whenever practical.**

After M5, priorities continue to come from real release evidence and usage rather than another speculative milestone list.
