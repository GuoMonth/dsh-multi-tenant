# dsh-multi-tenant

[简体中文](README.zh-CN.md) · [Releases](https://github.com/GuoMonth/dsh-multi-tenant/releases) · [Changelog](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/CHANGELOG.md)

Give each signed-in user their own native DeepSeek Harness environment. Users keep DSH's chat, workspaces, files, presets and subagents, while the platform separates their data and execution from other users.

This package is for **developers building a multi-user DSH service**. It provides the integration layer between your existing authentication system and independently running DSH Hosts.

## Where it fits

| Scenario | What you gain | What your platform supplies |
| --- | --- | --- |
| Internal developer workbench | Each employee uses native DSH with their own history, files and MCP configuration | Company login, TLS, private storage and runtime deployment |
| Multi-tenant application | Users with the same name in different tenants still receive separate environments | Trusted tenant/user identity, domain hostnames and resource policy |
| Native DSH integration and evaluation | Reuse the official Web and preset/subagent behavior without maintaining a second chat UI | A pinned DSH runtime, reviewed profiles and your chosen runtime provider |

A typical visit is: **sign in → resolve the user's domain → start or reuse its DSH Host → open native DSH Web**. A browser reconnect returns to the same domain; it does not create a new Host for every request or session.

## What 0.7.0 delivers

- A domain directory keyed by `(tenantId, principalId)`, keeping identity and desired state across platform restarts.
- Deduplicated Host startup, generation checks, suspension/revocation, bounded shutdown and verified recovery after a coordinator crash.
- Authenticated HTTP/WebSocket ingress for native Web, preserving native messages, tools and file transport. Native login cookies remain private to the platform.
- A constrained Linux Docker reference provider and a trusted-development local process provider, plus public interfaces for deployment-specific runtimes.
- Native preset/MCP/subagent composition, exercised through installed-package integration tests rather than a custom Agent facade.

## Decide whether this version suits your deployment

**0.7.0 is a developer integration release.** The included Docker provider has **no outbound network**, so it cannot call external model APIs or remote MCP. Supply a reviewed network-capable `RuntimeProvider` for those uses. Login/SSO, TLS, domain provisioning, quotas and operational monitoring are responsibilities of the embedding platform; an account-management UI or a ready-made hosted service is not included.

The security boundary is the **user within a tenant**, not each project or conversation. Two workspaces belonging to one Principal are not promised to be mutually confidential. Native permissions, tool filters, stop/archive/delete and preset selection retain native semantics. Team-shared domains, project ACLs, cross-user session sharing, automatic idle eviction and multi-machine scheduling are outside this version.

Independent Hosts have a fixed memory and startup cost; an inactive browser can still have background work. Choose resource limits and when to stop domains from your workload. Platform administration, authentication secrets and the Docker socket must stay outside every native Host.

**Upgrading from 0.5.x or earlier:** 0.7.0 changes the integration architecture and public API. The shared-process Cordis plugin, per-Agent resource API and custom panel are removed. Start with a new platform directory, replace the integration code and preserve old data separately; there is no automatic legacy-data migration. The 0.6.0 source milestone was not published to npm.

## First steps

```sh
npm install dsh-multi-tenant@0.7.0
# Check the installed platform API without Docker or an external model:
node node_modules/dsh-multi-tenant/examples/native-domains/smoke.mjs
```

The smoke uses a **simulated runtime** and starts no native DSH Host. To give users a real workbench:

1. Prepare the pinned native runtime image and per-domain profile described below.
2. Connect your login/IdP adapter to trusted tenant/user identity and assign each domain a separate hostname.
3. Choose the offline Docker reference for local fixtures, or a reviewed runtime provider for the network access your model/MCP needs.
4. Embed the ingress/coordinator, provision private data, and implement shutdown, suspension and recovery in your platform.

For a complete keyless native Web demonstration from source, install the repository and `scripts/native-host-probe` dependencies, then run `pnpm probe:isolated` with Docker and Chromium. See [the reproducible native proof](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/scripts/native-host-probe/README.md). This is a verification environment, not a public login service.

## Authority contract

- Different Principals, including the same principal name in different tenants, receive separate data and execution environments.
- Sessions and workspaces inside a Principal's domain are not independent authorization domains. Native permissions, tool filters, stop/archive/delete and preset selection retain native semantics; they are not root read ACLs.
- Platform administration, authentication secrets, the domain directory and Docker socket stay outside every native Host. Native settings and credentials belong only to that domain.
- The platform is trusted code. Do not mount its API in the native Web server or derive domain identity, image, profile paths, runtime endpoints or origins from browser parameters.

## Install and prerequisites

```sh
npm install dsh-multi-tenant@0.7.0
```

To test an unreleased checkout, build and install its tarball with `pnpm --filter dsh-multi-tenant pack`.

The coordinator requires Node 22.19 or Node 24+. The included providers target Linux. `DockerRuntimeProvider` requires a local Docker engine and a prebuilt immutable image containing **DSH 0.1.5-rc.2**, pinned source `fb2c4b9e698e30edb738bca4cf0618587db7d203`. Run the coordinator as a non-root user with Docker access; the reference runtime UID/GID must match that user so both sides can access the private control files. It does not download DSH into the platform process. TypeScript consumers should install `@types/node` and include `node` in compiler `types`.

The Docker reference intentionally uses `--network none`: keyless/local tools work; external model APIs and remote MCP do not. Deployments needing egress must supply a reviewed `RuntimeProvider` with explicit network policy. The local process provider is for trusted development, not hostile workloads.

## Embed in an authenticated server

This is an integration fragment: your application supplies `authenticator` and `trustedDomainOrigins`.

```js
import {
  SQLiteDomainRepository, DomainRuntimeCoordinator,
  DockerRuntimeProvider, createDomainIngress, DSH_RUNTIME_VERSION,
} from 'dsh-multi-tenant'

const directory = new SQLiteDomainRepository('/srv/dsh/control')
const runtime = new DomainRuntimeCoordinator(directory,
  new DockerRuntimeProvider({
    directory: '/srv/dsh/runtime',
    image: 'sha256:<immutable-image-id>',
    profileDirectory: domainId => `/srv/dsh/profiles/${domainId}`,
    uid: process.getuid(), gid: process.getgid(),
  }), DSH_RUNTIME_VERSION, 45_000, 20_000)

const ingress = createDomainIngress({
  authenticator, // your trusted login/IdP adapter, implementing DomainAuthenticator
  runtime,
  originFor: owner => trustedDomainOrigins.get(JSON.stringify([owner.tenantId, owner.principalId])),
})
ingress.server.listen(8080, '127.0.0.1')
```

Provision a profile before `ensure(owner)` can start its Host. `directory.resolve(owner)` provides its opaque domain ID. Supply `authenticator.authenticate(request, signal)` returning `{ owner, signal }` only after authenticating the user; abort the returned signal on logout/expiry to close existing streams. `MemoryDomainSessions` is an in-memory reference adapter: `issue(owner)` is a **trusted server-side** operation, never an unauthenticated login endpoint. Tokens belong in Secure, HttpOnly, host-only cookies with Path=/ and an appropriate SameSite policy; the adapter does not emit cookies or implement an IdP.

Use distinct hostnames (not only different ports) and trusted TLS termination: browser cookies are not isolated by port. Preserve the validated external Host/Origin through the reverse proxy; the ingress ignores client forwarding headers. All native HTTP and WebSocket paths share admission. An additional CSP limits frame ancestors to the same origin, preserving any native CSP; cross-origin iframe embedding is not supported. Native browser cookies remain inside the platform; response cookies are not exposed. Platform management has no HTTP route here. The embedding application owns graceful shutdown; always attempt both `ingress.close()` and `runtime.close()` and retain cleanup errors for repair/retry. A reusable embedding example is in `examples/native-domains/platform.mjs`.

## Runtime image and profile contract

The reference provider launches `/opt/dsh/node_modules/@deepseek-ai/dsh/lib/bin.js --profile web --patch /profile/runtime.patch.json` with Node `--expose-internals` for the pinned native Loader, loopback port 3081 and no browser opener. Install the exact native runtime and copy the exported `dsh-multi-tenant/native/runtime-control.mjs` asset into the image at `/opt/dsh/runtime-control.mjs`. Add this row through the native profile patch:

```json
[
  { "id": "web-runtime", "config": { "printUrl": false, "openBrowser": false } },
  { "insert": [{
      "id": "domain-runtime-control",
      "name": "/opt/dsh/runtime-control.mjs",
      "config": { "runtimeManifest": "/opt/dsh/node_modules/@deepseek-ai/dsh/package.json" }
  }] }
]
```

The asset waits for public `appReady` and uses `connection.authenticatedUrl`, without private scope rebinding or a replacement controller. It is a native Host asset; do not load it into the platform.

Data mounts at `/domain`, the trusted profile at `/profile` read-only, and the narrow readiness/transport directory at `/control`. The native Host has no platform credentials or management socket. Runtime root is read-only, UID/GID non-root, capabilities dropped, no-new-privileges enabled. Defaults: 1 GiB memory, 1 CPU, 160 PIDs and 128 MiB temporary storage. These are configurable reference limits, not measured production capacity. Existing platform directories must have private ownership/permissions. The original socket pathname must fit Linux's 107-byte limit. Connections use a pinned socket inode, so a workload cannot redirect the platform through a substituted symlink. Readiness refuses symlinks/nonregular files and is bounded to 16 KiB.

Native user settings, user-installed domain plugins and domain credentials are inside this execution boundary. They may affect every session in that Principal. Do not put platform secrets in native environment variables, profiles, credentials or mounts. Image/network updates require a new reviewed runtime and regression tests; full native UI reuse does not grant platform administration.

## Stop, revoke, rotate and recover

- `runtime.stop(id)` invalidates current connections, stops the Host and leaves the domain enabled. A later admission starts a new generation.
- `runtime.setDesired(id, 'suspended')` persists suspension before stopping. New admissions fail until explicitly enabled.
- `runtime.setDesired(id, 'revoked')` is terminal and persists across restart. It revokes domain access, not retained data or credentials at an external service. Data retention/deletion is an explicit platform operation after verified stop.
- For domain capability/credential rotation: suspend, await confirmed cleanup, replace trusted assets or revoke external credentials, then enable. External revocation failures must leave the domain suspended. Native credential editing inside the domain remains native behavior; hot MCP credential rotation is not promised.
- A failed stop retains ownership and prevents a new writer. Repair the cause and retry; do not remove the directory lock or clear `unresolved` manually.
- After a coordinator crash, use `runtime.recover(id)` for unresolved records before reopening. The Docker provider checks exact domain/generation/owner labels and removes the previous container before storage reuse. It refuses foreign ownership. The local process provider cannot automatically prove recovery.

One coordinator owns each local SQLite directory. This is not a multi-machine scheduler or storage fence. Domains stay running until explicitly stopped; automatic idle eviction is not provided because a disconnected browser may have active background work. Choose quotas and scheduling in the embedding platform from workload measurements.

## Verification and scope

`pnpm release:check` verifies exports, declarations, lifecycle, ingress, persistence and an independent tarball consumer. `pnpm --dir scripts/native-host-probe install --frozen-lockfile` followed by `pnpm probe:isolated` exercises the installed package with real native Hosts and Playwright (install Chromium first or set `PROBE_CHROMIUM`). The probe builds a pinned test image, uses only fake credentials/keyless model/local MCP and cleans its runtimes. It does not make external model calls.

Root/subagent composition, cold continuation, raw transport, browser reconnection, domain credentials, revocation and cgroup recovery are checked against exact rc.2. The historical root-publication counterexample remains a boundary regression: same-Principal history is readable, as intended. Passing these checks is not a general security certification or a claim of shared-Host multi-user support.
