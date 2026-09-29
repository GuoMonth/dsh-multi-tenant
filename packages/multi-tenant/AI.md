# Trusted platform integration guide

Read the packaged README. The only backend is Kubernetes through the exact bundled `@dsh/environment-connector-internal` artifact. DSH is fixed at 0.2.0-rc.2 / 639ed015397290b3745d163aafe02ffee4aa3f84. No legacy RuntimeProvider, Cell, Process or Docker APIs exist.

Run `dsh-multi-tenant start --config /private/config.json`. Configuration is exactly runtime/stateFile/adminSocket/oidc/members/host/port; runtime uses EnvironmentRuntimeOptions. Members maps exact issuer/subject to tenantId/principalId. Do not configure per-user environments, PodSpecs, endpoints, templates or secrets in user domains. Runtime owns namespace/PVC/Sandbox provisioning. There is one PVC with workspace/home/dsh and one requested capacity; CPU/Memory use native requests/limits.

Platform SDK APIs are trusted: EnvironmentBindingStore, createEnvironmentControl, createOIDCAuthentication, createPlatformIngress, plus narrow environment contract types and EnvironmentError. Keep the private binding DB outside user PVCs and use one platform process. Preserve exact owner/allocationKey/Sandbox UID/PVC UID; do not derive authorization from a hostname or namespace.

Enter/create reserves one stable allocation. Unknown writes are durable barriers: inspect the original key/ref, never allocate another key or automatically replay. Stop withdraws access and waits for positive writer-stop evidence. Start requires Stopped with the same PVC. Delete requires Stopped and retains data; no automatic recreate. User UI exposes entry, inspection, stop and start; CLI has inspect/stop/resume/delete with a private socket and exact allocation key/Sandbox UID for mutations. `resume` is the CLI spelling for environment start; `start --config` starts the platform process.

SIGHUP reloads membership only. Removed/remapped members, invalid reload, logout and expiry invalidate active HTTP/WS connections. Platform SIGINT/SIGTERM retains runtime resources and data. Native DSH payloads/protocols belong to DSH; the platform must not rewrite them.

`pnpm release:check` checks local sources and packed consumer, not cluster/native E2E. Fixtures do not validate the production runtime. Publication, public images and Releases require the user's separate decision after final E2E; do not perform them as part of these commands.

Joint local OIDC/native/lifecycle checks passed; real model and authorized external-tool execution remain unaccepted (G3 open). Use the hosted installation guides for chart CA Secret references; they are not additional runtime config fields. After platform restart, Inspect resolves the original binding before Open is available. No publication was performed.
