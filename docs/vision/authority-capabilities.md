[简体中文](./authority-capabilities.zh-CN.md) | English

# Vision — Authority-Oriented Capabilities

> Status: **non-binding long-term direction**. This is not a current `0.3` API contract and does not create a release gate.

## Why this direction matters

`0.3` intentionally ships a small Principal-scoped `PrincipalCredentials` primitive because it is enough to build and prove a real multi-tenant MCP product path.

That does not mean raw credentials are the preferred long-term Agent-facing abstraction.

```text
Credential-as-Data
        ↓ evolve only from real evidence
Capability-as-Authority
```

The preferred end state is that an Operation consumes a typed ability such as `ErpClient` or another service-specific client/transport while the secret stays behind an authority boundary.

## Long-term responsibility split

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

> **Core owns identity/lifecycle; Broker owns authority/secrets; Integration owns vendor protocol; Operation consumes typed abilities; secrets stay behind the authority boundary whenever practical.**

## Broker should be composable, not a god object

A future Broker should itself be a replaceable plugin capability. Different ERP/MCP/vendor systems should remain separate Integration Plugins rather than branches inside one universal Broker.

Potential Broker implementations may include in-memory/reference, Vault/cloud-secret, internal IAM/token-exchange, or remote/sidecar variants. These are examples, not approved package names.

Avoid a universal unrestricted `authorizedFetch(url)` unless the target and policy boundary is strong enough to prevent arbitrary credential forwarding. Service-specific typed clients are usually the safer product-facing capability.

## Evidence required before a public Broker contract

The real MCP integration is now shipped in the `0.3` baseline. The next useful evidence is a second real integration such as ERP:

```text
real MCP integration        ✅
        ↓
second real integration
        ↓
compare authority / refresh / injection / audit semantics
        ↓
extract only the smallest common contract that actually repeats
        ↓
allow a deliberate prerelease breaking change if justified
```

Until then, `PrincipalCredentials` remains the current low-level primitive. Later it may remain as a Broker-provider primitive, move behind an internal SPI, or disappear where a Broker talks directly to Vault/IAM. No choice is frozen today.

## Security boundary

A same-process Broker can materially reduce normal-path secret exposure, but it cannot protect against malicious code that already shares process memory and trusted execution privileges.

If the threat model requires the Agent process itself to be unable to obtain secrets, use a process/container/sidecar/remote authority boundary.

## Decision rules

1. **Core owns identity/lifecycle, not vendor business.**
2. **Secrets stay behind authority boundaries whenever practical.**
3. **Operations consume typed abilities/clients, not raw credentials.**
4. **Service-specific integrations are composable plugins, not Broker branches.**
5. **Public abstractions and package boundaries are earned by real integrations; prerelease breaking changes are acceptable.**
