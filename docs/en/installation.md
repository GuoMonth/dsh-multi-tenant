# Install DSH multi-tenant on Kubernetes

[简体中文](../zh-CN/installation.md) · [Guides](index.md)

Deploy platform 0.10.0-alpha.1 with runtime 0.4.0-alpha.1 and DSH 0.2.0-rc.2. The CLI installs its Helm chart, upstream Agent Sandbox core v1.0.3 and runtime RBAC.

## Prepare

- Linux/amd64 Kubernetes with an enforcing NetworkPolicy CNI, dynamic StorageClass and an Ingress controller. The tested reference used Kubernetes 1.37, Calico 3.32.2 and local-path.
- Node 24+, Helm 3 and kubectl on the installation machine; explicit kubeconfig/context and permission to install cluster CRDs, controller and RBAC.
- One platform namespace, already created. Supply its TLS Secret (`tls.crt`, `tls.key`) and OIDC client-secret Secret. Put Secret names and keys in values, not secret contents.
- Platform DNS and wildcard `*.env.<platform-domain>` DNS pointing to the same HTTPS ingress. Its certificate covers both. Ingress preserves Host, supports WebSocket and forwards to platform port 8080 after TLS termination. Disable or redirect public plaintext HTTP.
- An HTTPS OIDC issuer and client with callback `https://<platform-domain>/auth/callback`. Map exact issuer/subject pairs to tenant/principal IDs in `members`.
- Pullable or node-imported platform and workload image digests from the [release manifest](https://github.com/GuoMonth/dsh-multi-tenant/releases/tag/v0.10.0-alpha.1).

For a private issuer CA, use `oidc.caSecretName` and `oidc.caSecretKey` (default `ca.crt`) for a PEM Secret in the platform namespace. Also run the host installer with `NODE_EXTRA_CA_CERTS=/private/issuer-ca.crt`.

## Configure and install

Copy [values.json](../examples/values.json) to a private file and replace the placeholders. Defaults are in [values.yaml](../../charts/dsh-platform/values.yaml): user storage 10Gi, CPU/memory requests 250m/512Mi and limits 2/2Gi; control storage is 1Gi. PVC requested capacity depends on the storage backend; local-path does not enforce a directory quota.

```sh
npm install --global dsh-multi-tenant@0.10.0-alpha.1
dsh-multi-tenant --version
dsh-multi-tenant render --values /private/values.json --namespace dsh-platform
dsh-multi-tenant preflight --values /private/values.json --namespace dsh-platform --kubeconfig /private/kubeconfig --context YOUR_CONTEXT
dsh-multi-tenant install --values /private/values.json --namespace dsh-platform --kubeconfig /private/kubeconfig --context YOUR_CONTEXT
```

`render` is offline. `preflight` checks the target cluster, storage, ingress, Secret keys, TLS/DNS and OIDC discovery. `install` then installs the fixed resources and waits for platform rollout. This is a fresh installation with the Helm release name `dsh-platform`; existing platform state causes refusal. Inspect partial resources after failure. A timeout leaves resources and storage in place.

## Verify

Log in with two OIDC subjects. Create and open separate environments, configure a real model, read/write a disposable file and run a command. Verify an authorized CLI or MCP call. Stop/start and recreate a test Pod, checking the same PVC UID and retained files, session and credentials. Confirm cross-user access is denied and logout/member removal closes access.

See [operations](operations.md) for troubleshooting and uninstall behavior. The [release validation report](https://github.com/GuoMonth/dsh-multi-tenant/releases/download/v0.10.0-alpha.1/validation.md) records the tested combination and limits.
