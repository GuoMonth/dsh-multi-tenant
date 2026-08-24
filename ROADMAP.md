[简体中文](./ROADMAP.zh-CN.md) | English

# Direction

The project no longer maintains a long milestone-by-milestone Roadmap. The detailed M0–M8 planning served its purpose while the v0.3 architecture was uncertain; keeping it alive now creates more narrative debt than engineering value.

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

The current architecture is documented in `docs/specs/*`; those specs and executable tests are authoritative, not this file.

## Next target: M5 Agent Integration reference path

M5 should prove one useful end-to-end path without inventing another protocol framework:

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

The target is deliberately narrow:

- use the official DSH MCP client and native Tool bridge;
- consume the M4 Credentials contract rather than adding auth logic to Agent integration;
- preserve Tenant/Principal isolation across concurrent Agents;
- cover create/resume/failure/teardown in executable evidence;
- keep MCP Resources/Prompts out until the pinned Harness has a stable native consumer seam;
- do not create a separate package unless the implementation proves an independent boundary.

After M5, further work will be prioritized from release evidence and real usage rather than another long speculative milestone list.
