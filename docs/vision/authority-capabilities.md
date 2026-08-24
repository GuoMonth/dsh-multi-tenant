[简体中文](./authority-capabilities.zh-CN.md) | English

# Vision — Authority-Oriented Capabilities

> Status: **non-binding long-term direction**. This document is not a current v0.3 API contract, does not create a release gate, and must not be used to justify speculative packages or abstractions.

## Why this exists

M4 intentionally introduced a small Principal-scoped `PrincipalCredentials` capability so the Framework could prove trusted ingress, Principal ownership, replacement, isolation and lifecycle with a real product-facing capability.

That is useful now, but raw credentials are not the preferred long-term Agent-facing abstraction.

The long-term direction is:

```text
Credential-as-Data
        ↓ evolve from real evidence
Capability-as-Authority
```

An Operation should ideally receive a typed ability such as `ErpClient`, `McpTransport` or another service-specific client, while the credential remains behind an authority boundary.

## Long-term responsibility split

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

The durable principle is more important than any proposed interface name:

> Core owns identity and lifecycle. Broker owns authority and secrets. Integration owns vendor protocol. Operation consumes typed abilities. Secrets stay behind the authority boundary whenever practical.

## Broker is not a Core god object

A future broker should be a replaceable plugin capability, not a growing switch statement inside Core.

Possible implementations may eventually include:

- in-memory/reference broker;
- Vault or cloud-secret-backed broker;
- internal IAM/token-exchange broker;
- remote/sidecar broker for stronger secret isolation.

Those are examples, not approved package names. A public Broker contract should be extracted only after multiple real integrations prove the shared semantics.

Avoid a universal API such as unrestricted `authorizedFetch(url)` unless the target/policy boundary is strong enough to prevent arbitrary credential forwarding. The safer product-facing abstraction is normally a service-specific typed client.

## Service integrations are composable plugins

Different ERP systems should not become branches inside one Broker.

Conceptually:

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

An integration plugin may consume Tenant configuration plus Principal authority and provide a typed capability:

```text
ERP-A Integration
  requires:
    TenantErpAConfig
    Principal authority/broker

  provides:
    ErpAClient
```

The Operation then consumes `ErpAClient`, not an ERP token.

## Near-term execution: do not redesign M4 again

The current M4 contract remains the implementation baseline:

```text
Product Ingress
  -> RuntimeComposition
  -> PrincipalCredentials
  -> Operation
```

For M5, use the existing M4 primitives to ship a real DSH MCP Tools vertical slice first. Trusted integration code may consume `PrincipalCredentials` where required by the current DSH/MCP seam. If a small brokered helper naturally appears inside that implementation, keep it private until evidence justifies promotion.

Do **not** block M5 on designing a universal Broker API.

## Evidence path before a breaking abstraction

The preferred sequence is:

```text
M4 current contract
        ↓
M5 real MCP Tools integration
        ↓
second real integration (for example ERP)
        ↓
compare repeated authority / refresh / injection / audit semantics
        ↓
extract the smallest proven Broker contract
        ↓
next prerelease may make a deliberate breaking change
```

At that point `PrincipalCredentials` may:

1. remain as a low-level primitive used by Broker providers;
2. become an internal/provider SPI rather than a recommended public application API; or
3. disappear where a Broker talks directly to Vault/IAM.

No choice is frozen today.

## Security boundary

A same-process Broker materially reduces normal-path secret exposure: Operations, tools, logs and application callbacks do not need to receive raw tokens. It does **not** make a hostile same-process plugin unable to inspect process memory or monkey-patch trusted code.

Strong secret non-disclosure eventually requires a process/container/sidecar/remote authority boundary when the threat model demands it.

## Decision rule

When evaluating future capability/plugin designs, prefer these five rules:

1. **Core owns identity/lifecycle, not vendor business.**
2. **Secrets stay behind authority boundaries whenever practical.**
3. **Operations consume typed abilities/clients, not raw credentials.**
4. **Service-specific integrations are composable plugins, not Broker branches.**
5. **Public abstractions and package boundaries are earned by real vertical slices; prerelease breaking changes are acceptable.**
