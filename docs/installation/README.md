# RC2 single-cluster installation candidate

[中文](README.zh-CN.md). The local reference installation and two-user native access were exercised by a second operator; see [exact artifacts, results and limitations](joint-validation-2026-09-29.md). Real model file/command execution and genuinely authorized external tools remain unaccepted, so G3 is open. Nothing has been publicly published.

## Prerequisites

Use Linux/amd64 Kubernetes, a NetworkPolicy-capable CNI, dynamic StorageClass, HTTPS-capable Ingress controller, Node24, Helm3 and kubectl. The reference uses Kubernetes1.37, Calico3.32.2 and local-path. The installer does not provision a cluster/CNI/Ingress controller. Ingress must preserve Host and support native HTTP/WebSocket, forward to platform8080 after TLS termination, and disable or redirect plaintext public HTTP.

Provide explicit kubeconfig/context with permission to install the pinned upstream core and platform RBAC. This is a fresh installation with one fixed Helm release `dsh-platform`, not an upgrade/import path. It refuses existing platform deployment, runtime binding or control PVC; inspect partial state rather than erase or adopt it automatically.

Create a dedicated platform namespace and supply its TLS Secret (`tls.crt`, `tls.key`), OIDC client-secret Secret, platform DNS and wildcard `*.env.<platform-domain>` DNS. The certificate must cover both platform and wildcard hosts. Register an HTTPS OIDC client with callback `https://<platform-domain>/auth/callback`; map exact issuer/subject pairs to owners using `members`. No user namespace/PVC list is required.

Private issuer CAs use optional `oidc.caSecretName` / `oidc.caSecretKey` (default `ca.crt`), a PEM Secret in the platform namespace. The chart mounts it read-only and sets native `NODE_EXTRA_CA_CERTS`. Also start the host installer with `NODE_EXTRA_CA_CERTS=/private/issuer-ca.crt`. TLS validation stays enabled. Values contain references only; never commit or log credentials.

## Install

Copy `integration/installation/fixture.values.json` to a private file, replace every fixture domain/digest and secret reference, and use the exact candidate image identities from the result table. Fixture `.invalid` hosts and repeated-character digests are deliberately refused by live installation. Images must be pullable or already imported into the node; digest syntax is not availability proof.

```sh
node charts/install.mjs render --values /private/values.json --namespace dsh-platform
node charts/install.mjs preflight --values /private/values.json --namespace dsh-platform --kubeconfig /private/kubeconfig --context YOUR_CONTEXT
node charts/install.mjs install --values /private/values.json --namespace dsh-platform --kubeconfig /private/kubeconfig --context YOUR_CONTEXT
```

Preflight reads actual namespace/storage/ingress/node state, Secret keys, TLS host coverage and OIDC discovery before writes. Install verifies the vendored core checksums, installs the one upstream controller/CRD and runtime RBAC, then waits for platform rollout. The exact existing core may be reused; a different core image is refused. A timeout or interrupted operation is not rollback or permission to erase PVCs.

The platform is UID1000 with a mode0700 state directory and private child directory containing a mode0600 client secret. It has one control PVC for SQLite bindings, separate from each user's **one** data PVC mounted at `/var/lib/dsh/data/{workspace,home,dsh}`. `storageSize` is the one user-volume capacity; CPU/memory are native requests/limits. Local-path requested capacity is not a directory hard quota. Defaults and the small supported fields are in `charts/dsh-platform/values.yaml`.

The runtime role is the byte-identical runtime-owned asset recorded in `charts/dsh-platform/files/sources.json`, not a duplicated controller. Runtime provisions a fixed Sandbox template, namespace, PVC, tokenless workload SA and network policy. Its role cannot read Secrets or delete PVCs/namespaces; node/lease reads support positive stop evidence. Kubernetes RBAC does not restrict namespace creation by a name prefix, so keep the platform identity trusted and outside user workloads.

## Acceptance and retained state

Log in with two actual subjects. Use Enter/create, Inspect, Open, Stop and Start; after a platform restart use Inspect to resolve the persisted binding before Open appears. Verify distinct PVCs/owners, native HTTP/WS, logout/member-revocation refusal, and retention across stop/start/Pod recreation. Verify a real model reading/writing files and running commands and at least one actually authorized MCP/CLI chain. Administrator exec and mock tokens are not substitutes.

The platform can reload `members` after a projected ConfigMap update with SIGHUP; removed identities lose existing connections. See the [package operation guide](../../README.md) for identity-bound private-socket commands. Default environment deletion requires positively verified stop and retains its PVC; no auto-recovery or old-Alpha migration is provided. Stop proof failure or missing/replaced PVC identity requires investigation.

Helm uninstall retains the annotated platform control PVC and does not delete runtime-provisioned user resources. Preserve data and inspect actual identities before any manual action. Backup/upgrade and scale work remain separate #112/#113. The local [reference scripts](../../integration/e2e/README.md) are test prerequisites and probes, not product deployment defaults or public PKI evidence.
