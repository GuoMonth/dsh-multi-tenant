# AI installation and operation guide

This is the deployment entry for AI assistants helping an administrator install **dsh-multi-tenant 0.10.0-alpha.1**. Answer in the user's language. Use the installed package version and its matching GitHub tag, not commands copied from search snippets or other releases.

## Read in this order

1. [Current product README](https://github.com/GuoMonth/dsh-multi-tenant/blob/v0.10.0-alpha.1/README.md).
2. [Installation](https://github.com/GuoMonth/dsh-multi-tenant/blob/v0.10.0-alpha.1/docs/installation/README.md) ([中文](https://github.com/GuoMonth/dsh-multi-tenant/blob/v0.10.0-alpha.1/docs/installation/README.zh-CN.md)).
3. [Release](https://github.com/GuoMonth/dsh-multi-tenant/releases/tag/v0.10.0-alpha.1): download `release.json` and `SHA256SUMS`, check package integrity and the platform/workload/controller image digests. Use those exact images.
4. [Values example](https://github.com/GuoMonth/dsh-multi-tenant/blob/v0.10.0-alpha.1/docs/installation/values.example.json) and the packaged `charts/dsh-platform/values.schema.json`.

If a release or required artifact is unavailable, report that specific missing input. Do not substitute a floating image or invent a digest.

## Establish the target and collect missing inputs

Inspect existing state before writes. Ask only for unavailable inputs; do not ask again for actions already authorized by the user.

- Existing Linux/amd64 Kubernetes cluster, explicit kubeconfig **file and context**, dedicated platform namespace, sufficient install permissions.
- NetworkPolicy-enforcing CNI, dynamic StorageClass, ingress class with Host preservation and HTTP/WebSocket support. HTTPS termination forwards to platform port8080; plaintext public HTTP is disabled or redirected.
- Platform DNS plus `*.env.<platform-domain>`; a TLS Secret covering both hosts in the platform namespace.
- HTTPS OIDC issuer, client ID, registered callback `https://<platform-domain>/auth/callback`, client-secret Secret name/key. A private issuer CA uses `oidc.caSecretName/caSecretKey`; the host installer also needs `NODE_EXTRA_CA_CERTS` pointing at the CA file. Never disable TLS verification.
- Exact `(issuer, subject)` member mappings to `{tenantId, principalId}`. Email is not the stable identity. Prepare two test members for acceptance.
- Pullable release image digests, user storage size and native CPU/memory requests/limits. Explain that local-path does not enforce a directory hard quota.

Node24+, Helm3 and kubectl are installer prerequisites. The installer does not create the cluster, CNI, ingress, OIDC provider or public DNS/certificates. Use existing organization services. Model credentials and tool authorization are configured by each user inside DSH; do not distribute a shared platform model secret.

## Install the versioned npm package

```sh
npm install --global dsh-multi-tenant@0.10.0-alpha.1
dsh-multi-tenant --version
dsh-multi-tenant --help
```

Copy the example into a mode0600 private file outside the repository. Replace **all** placeholder domains, subjects, Secret references and image digests. Values contain Secret references only, not secret values. Do not print credentials in commands, chat, screenshots, rendered output or logs.

```sh
dsh-multi-tenant render --values /private/values.json --namespace dsh-platform
dsh-multi-tenant preflight --values /private/values.json --namespace dsh-platform --kubeconfig /private/kubeconfig --context YOUR_CONTEXT
dsh-multi-tenant install --values /private/values.json --namespace dsh-platform --kubeconfig /private/kubeconfig --context YOUR_CONTEXT
```

`render` is offline and requires Helm. `preflight` reads the specified cluster; `install` runs those checks before writes. Installation uses fixed release `dsh-platform` and one platform replica. Existing deployment, runtime role binding or control PVC causes refusal: inspect the original installation; never delete state to bypass the check or create a second installation under another namespace.

A timeout is not rollback. Keep the failed resources and inspect redacted events, image availability, permissions, TLS/CA, storage and scheduling. There is no automatic replay, reallocation or data replacement.

## Validate before declaring success

1. Confirm platform rollout and HTTPS OIDC login. `/healthz` proves only local platform readiness.
2. Log in as two subjects, Enter/create, Inspect until Ready, then Open. Confirm distinct owners and PVC UIDs and native HTTP/WebSocket behavior; one user must not open the other's environment.
3. In native DSH, configure a real model; make it write/read a disposable workspace file and execute a harmless command. Authorize one intended CLI/MCP through its native method and make a read-only authenticated call. Never count administrator exec or a mock credential as this proof.
4. Stop, verify Stopped, start and verify the same PVC UID and retained file/session/configuration/tool authorization. Stop interrupts all work in the environment. Test Pod recreation only in an explicitly disposable test environment.
5. Check logout and member removal revoke existing access. Record what actually passed and any remaining failures. Do not claim backup, HA, arbitrary tools, enterprise SSO compatibility or storage hard quotas from a two-user test.

Report version, release URLs, image digests, target context/namespace, platform URL, validation results and next operational steps. Exclude secret values, session cookies and tokens.

## Operate without damaging data

Use the [operation guide](https://github.com/GuoMonth/dsh-multi-tenant/blob/v0.10.0-alpha.1/docs/reference/quickstart.md). `start --config` starts the platform; `resume` starts a stopped user environment. CLI mutations require the exact persisted allocation key and Sandbox UID. Unknown outcomes must be inspected against the original binding. Missing/replaced PVC, changed UID or unverified writer termination fails closed; never create an empty replacement or force a second writer.

Members are reloaded by SIGHUP after ConfigMap projection. Removed/remapped identities and invalid reloads revoke active connections. Other settings and Secret rotation require platform restart. After restart, Inspect resolves persisted bindings before Open is available. Platform exit/logout/revocation does not delete user data. Environment delete requires verified stop and retains data; Helm uninstall retains control storage and runtime user resources. Data removal needs explicit scope and authorization.

## Repository ownership for AI contributors

- **Platform:** this repository owns OIDC, membership, authorization, durable allocation bindings, access sessions, HTTP/WS admission, package/CLI and installation docs/chart.
- **[Runtime](https://github.com/GuoMonth/dsh-isolated-runtime/blob/main/AI.md):** fixed workload image, launcher, in-process Connector, namespace/PVC/Sandbox identity and lifecycle. The private Connector is bundled, not separately npm-installed by users. Runtime RBAC is checksummed and copied into the chart from its owner.
- **Upstream core:** sole Pod/Service reconciler. Do not add another controller.
- **DSH:** model protocols, conversations, tools and user credential refresh. Do not add platform model/tool proxies or copy platform credentials into user domains.

Use the narrow runtime contract. Keep platform identity, control database and secrets outside user PVCs. For source changes run `pnpm release:check` and installation checks; real cluster acceptance is separate. Publish only an explicitly authorized, locally verified candidate via the repository release workflow.
