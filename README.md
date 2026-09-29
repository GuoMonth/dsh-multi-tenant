# DSH multi-tenant

An Alpha OIDC platform for one persistent DSH environment per authorized user. Kubernetes is the only execution backend. DSH provides its native Web, conversations, tools and application protocols; the platform owns login, membership, environment binding and access revocation. The in-process environment connector provisions a fixed upstream agent-sandbox template.

This candidate targets **DSH 0.2.0-rc.2**, commit `639ed015397290b3745d163aafe02ffee4aa3f84`. It is under integration validation, not a published or production-ready release. There is no compatibility layer or migration from old Alpha state, Cell, Process or Docker backends. Use a fresh private platform state file for this format; do not erase existing data to bypass an error.

Local joint validation passed real two-subject OIDC, native HTTP/WebSocket and retained-data lifecycle after installation fixes. **G3 remains open for real model execution and external-tool authorization.** Use the [installation guide](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/docs/installation/README.md) and [exact candidate evidence](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/docs/installation/joint-validation-2026-09-29.md); these local checks do not authorize publication.

Each owner has one independently bound PVC mounted at `/var/lib/dsh/data`, with `workspace/`, `home/` and `dsh/`. CPU/memory use Kubernetes requests/limits; storage has one requested capacity, not a directory hard quota. Normal stop/start retains that volume. Logout, membership revocation and platform shutdown do not delete it.

## Candidate operation

Use Node 24+ and the exact reviewed platform tarball. The platform must reach the Kubernetes API and workload network. It requires upstream agent-sandbox core, approved runtime RBAC, an existing StorageClass, HTTPS OIDC, TLS/DNS for the platform and environment domain, and the pinned workload image. Installation assets and final combined validation are tracked in [MVP #104](https://github.com/GuoMonth/dsh-multi-tenant/issues/104); source checks alone do not prove installation.

```sh
npm install --ignore-scripts /absolute/path/dsh-multi-tenant-0.10.0-alpha.1.tgz
./node_modules/.bin/dsh-multi-tenant start --config /private/config.json
```

Configuration has seven top-level fields: `runtime`, `stateFile`, `adminSocket`, `oidc`, `members`, `host`, `port`. See the [candidate configuration](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/integration/distribution/config.example.json). `runtime` contains the Kubernetes server and CA/token file paths, namespace prefix, domain, exact image digest, storage size/class, native resources and platform namespace. The fixed workload template belongs to the runtime, not the user or platform configuration. Kubernetes credentials and OIDC client secrets are file references outside user domains. The client secret must be mode 0600; the platform state and admin socket live in a private mode-0700 directory owned by the platform process. The state file is mode 0600 and has a single writer.

`members` maps exact OIDC issuer/subject pairs to `{tenantId, principalId}`. No per-user namespace or environment list is required. After login the platform reserves the owner's stable environment binding; **Enter / create** submits its first allocation. Use **Inspect / resolve status**, **Stop**, **Start stopped environment**, then **Open environment** when Ready. The native DSH page has its own session; it is separate from the platform login and environment access session. Responses expose the lifecycle result or a redacted diagnostic and next action; pending/unknown is not success. Return to the platform page after inspecting a result to open a Ready environment.

Send SIGHUP after changing `members`; removed or remapped members lose existing HTTP/WebSocket connections. Invalid reloads revoke all sessions. Other configuration changes need a restart. SIGINT/SIGTERM shut down the platform and its connections while retaining environments and PVCs.

Administrators use the private Unix socket. Inspect before supplying the persisted allocation key and Sandbox UID:

```sh
dsh-multi-tenant inspect --socket /private/admin.sock --environment env-ID
dsh-multi-tenant stop --socket /private/admin.sock --environment env-ID --allocation-key KEY --identity SANDBOX_UID
dsh-multi-tenant resume --socket /private/admin.sock --environment env-ID --allocation-key KEY --identity SANDBOX_UID
dsh-multi-tenant delete --socket /private/admin.sock --environment env-ID --allocation-key KEY --identity SANDBOX_UID
```

Delete requires positively verified Stopped, deletes runtime resources and retains data. It leaves the allocation blocked for administrator inspection; it is not a recreate button. Unknown create/start/stop/delete outcomes are queried against the original binding, never automatically replaced or retried. Missing or changed Sandbox/PVC identities fail closed. Node partition and unproven writer termination require administrator action; there is no automatic recovery controller.

## Development and evidence

Use the manifest-pinned pnpm version. `pnpm install --frozen-lockfile`, then `pnpm release:check` validates metadata, types, unit/transport tests, build and a clean installed-tarball consumer without publishing. Tests identify connector fixtures explicitly; real runtime/cluster/native DSH/OIDC/model/tool verification belongs to the exact combined candidate in [#106](https://github.com/GuoMonth/dsh-multi-tenant/issues/106). The SDK exports the environment contract, binding store, platform control, OIDC and ingress APIs for trusted platform code only.

The container recipe at [integration/distribution/Dockerfile](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/integration/distribution/Dockerfile) installs the same local tarball and invokes the CLI. No npm publication, public image push or Release is implied by these checks. The user performs final E2E before deciding publication.

Container UID/GID is 1000:1000. `GET /healthz` returns local readiness without authentication or runtime/model calls; it is not workload or model health.
