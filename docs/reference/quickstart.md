# Cell alpha: install and operate

This guide describes the published `dsh-multi-tenant@0.9.0-alpha.1` platform package and `dsh-isolated-runtime@0.3.0-alpha.1` release. The platform package runs the OIDC/user-protocol service; the runtime package prints the fixed Cell/Operator release data and deployment manifests. Neither command creates a Kubernetes cluster.

## Prerequisites

An administrator must provide one Kubernetes cluster, platform-mode Cell Operator, Gateway/TLS, a CNI that enforces NetworkPolicy, storage, namespace mapping, RBAC, and an OIDC provider. Route the platform origin and `cell-<UID>.<site-domain>` through the platform. The platform needs Kubernetes API and Cell Pod-IP connectivity; run it in-cluster or provide both routes. Use the fixed runtime/DSH/image combination in [`cell-release.json`](../../packages/multi-tenant/cell-release.json). Pin the platform image by digest as well.

## Install runtime resources

The published runtime npm package prints the pinned resources. Review the output and target cluster before applying it:

```sh
npx dsh-isolated-runtime@0.3.0-alpha.1 release
npx dsh-isolated-runtime@0.3.0-alpha.1 manifests > operator.yaml
kubectl apply --server-side -f operator.yaml
kubectl -n dsh-system rollout status deployment/cell-operator --timeout=120s
```

`release` and `manifests` only print information/YAML; `kubectl apply` is the administrator's explicit deployment step. The runtime npm package does not start a second user-facing server. Its former standalone launcher is not the current platform entry.

## Configure and start the platform

Start from [`config.example.json`](../../integration/distribution/config.example.json). Replace every `REPLACE_*` and profile placeholder with values for the fixed cluster. In particular, `allocation.profiles[].expectedSpec` and `expectedPodSpec` must match the API-defaulted approved Cell and Pod templates. This manual calibration remains a known deployment burden; the proposed simplification in Issue #99 has not shipped. Do not use the placeholder object as a production profile or weaken the comparison. Keep the state database and admin socket in a private directory outside Cell storage, and keep OIDC client secret in a mode-0600 file.

Use Node.js 24+ and run the published package in the foreground:

```sh
npx dsh-multi-tenant@0.9.0-alpha.1 start --config /private/config.json
```

After recording and reviewing the resolved version, deployments may use the `latest` channel during installation. Do not resolve `latest` again at every restart. SIGINT/SIGTERM stop the platform while retaining Cells and data; SIGHUP reloads membership. Restart requires a new login and does not replay unknown creates.

## Inspect and delete

Run administrative commands from the platform host with access to the private Unix socket. Inspect before any deletion and use the exact allocation key and identity returned for that environment:

```sh
dsh-multi-tenant inspect --socket /private/admin.sock --environment alice-main
dsh-multi-tenant delete --socket /private/admin.sock --environment alice-main \
  --allocation-key ORIGINAL_KEY --identity EXACT_UID
```

Deletion is explicit and can affect Cell-owned resources according to their retention policy. An accepted request or missing API object does not prove that a writer has stopped. Unknown outcomes require inspecting the original key; do not replay with a new key or delete the state database to force recreation. See [R6 deletion and data boundaries](../design/r6-deletion.md).

## Evidence and limits

The [2026-09-20 regression report](../evidence/cell-regression-2026-09-20.md) records the real cluster/browser/model checks and their limits. The published npm package was separately installed and exercised in the existing test cluster; see [alpha delivery evidence](../evidence/alpha-delivery-2026-09-20.md). These are finite MVP checks, not a full OIDC attack matrix, stress, HA, upgrade, migration, or recovery certification. Runtime P1 sandbox-source changes in [PR #93](https://github.com/GuoMonth/dsh-isolated-runtime/pull/93) are still unmerged and are not present in the published npm-bound manifest.
