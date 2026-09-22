# Cell alpha: install and operate

This guide describes the published `dsh-multi-tenant@0.9.0-alpha.1` platform package and `dsh-isolated-runtime@0.3.0-alpha.1` release. The platform package runs the OIDC/user-protocol service; the runtime package prints the fixed Cell/Operator release data and deployment manifests. Neither command creates a Kubernetes cluster.

## Prerequisites

An administrator must provide one Kubernetes cluster, platform-mode Cell Operator, Gateway/TLS, a CNI that enforces NetworkPolicy, storage, namespace mapping, RBAC, and an OIDC provider. Route the platform origin and `cell-<UID>.<site-domain>` through the platform. The platform needs Kubernetes API and Cell Pod-IP connectivity; run it in-cluster or provide both routes. Use the fixed runtime/DSH/image combination in [`cell-release.json`](../../packages/multi-tenant/cell-release.json). Pin the platform image by digest as well.

With the published operator configuration, run the platform Pod in `dsh-system` (the operator's `--system-namespace`) with the label `dsh.isolated.io/access: platform`. Both selectors are required by the generated Cell ingress policy. Keep that namespace/label outside tenant control. Pod-IP routing alone is insufficient for an out-of-cluster process; an administrator must provide an equally restricted and verified access policy. See the [platform Deployment fixture](../../integration/regression/platform.yaml) for the namespace and label; replace its test images, domains and private configuration rather than applying it unchanged.

## Install runtime resources

The published runtime npm package prints the pinned resources. Review the output and target cluster before applying it:

```sh
npx dsh-isolated-runtime@0.3.0-alpha.1 release
npx dsh-isolated-runtime@0.3.0-alpha.1 manifests > operator.yaml
# Replace the example base-domain; review namespace/RBAC, kubeconfig context and image pins first.
kubectl apply --server-side -f operator.yaml
kubectl -n dsh-system rollout status deployment/cell-operator --timeout=120s
```

`release` and `manifests` only print information/YAML; `kubectl apply` is the administrator's explicit deployment step. The runtime npm package does not start a second user-facing server. Its former standalone launcher is not the current platform entry.

## Configure and start the platform

Start from [`config.example.json`](../../integration/distribution/config.example.json). Replace every `REPLACE_*` and profile placeholder with values for the fixed cluster. In particular, `allocation.profiles[].expectedSpec` and `expectedPodSpec` must match the API-defaulted approved Cell and Pod templates. This manual calibration remains a known deployment burden; the proposed simplification in Issue #99 has not shipped. Do not use the placeholder object as a production profile or weaken the comparison. Keep the state database and admin socket in a private directory outside Cell storage, and keep OIDC client secret in a mode-0600 file.

For this published version, create an administrator-approved Cell with the pinned spec, wait for Ready, and capture the API-defaulted Cell spec and StatefulSet `spec.template.spec`; replace only instance UID and origin with `${INSTANCE_ID}` / `${ORIGIN_HOST}`. See [capture-profile.py](../../integration/regression/capture-profile.py) for the capture logic. Its test identities, domain and resources are fixtures, not reusable deployment configuration. This remains the working path for published `0.9.0-alpha.1`.

The fixed-template configuration is a separate unpublished source candidate and is not supported by this release or npm `@latest`; see the [candidate setup guide](cell-mvp-v1-candidate.md).

Use Node.js 24+ and run the published package in the foreground:

```sh
npx dsh-multi-tenant@0.9.0-alpha.1 start --config /private/config.json
```

After recording and reviewing the resolved version, deployments may use the `latest` channel during installation. Do not resolve `latest` again at every restart. SIGINT/SIGTERM stop the platform while retaining Cells and data; SIGHUP reloads membership. Restart requires a new login and does not replay unknown creates.

## Inspect and delete

Run administrative commands from the platform host with access to the private Unix socket. Inspect before any deletion and use the exact allocation key and identity returned for that environment:

```sh
npx dsh-multi-tenant@0.9.0-alpha.1 inspect --socket /private/admin.sock --environment alice-main
npx dsh-multi-tenant@0.9.0-alpha.1 delete --socket /private/admin.sock --environment alice-main \
  --allocation-key ORIGINAL_KEY --identity EXACT_UID
```

Deletion is explicit and can affect Cell-owned resources according to their retention policy. An accepted request or missing API object does not prove that a writer has stopped. Unknown outcomes require inspecting the original key; do not replay with a new key or delete the state database to force recreation. See [R6 deletion and data boundaries](../design/r6-deletion.md).

## Evidence and limits

The [2026-09-20 regression report](../evidence/cell-regression-2026-09-20.md) records the real cluster/browser/model checks and their limits. The [alpha artifact checks](../evidence/alpha-delivery-2026-09-20.md) are a prepublication snapshot; public-package installation and delivery results are recorded in [Issue #82](https://github.com/GuoMonth/dsh-multi-tenant/issues/82) and the [npm publication record](https://github.com/GuoMonth/dsh-multi-tenant/releases/download/v0.9.0-alpha.1/npm-publication.json). These are finite MVP checks, not a full OIDC attack matrix, stress, HA, upgrade, migration, or recovery certification. Later source/task status belongs in the [roadmap](../roadmap.md), not this version’s artifact claims.
