# Operate DSH user environments

[简体中文](../zh-CN/operations.md) · [Guides](index.md)

## User controls and data

After OIDC login, use Enter/create, Inspect, Open, Stop and Start. After a platform restart, Inspect resolves the saved binding before Open becomes available. Configure models and authorize tools inside native DSH.

| Action | Result |
| --- | --- |
| Stop | Interrupts model calls, tools and background commands in the whole environment |
| Start stopped environment | Uses the same volume after the runtime confirms the previous process stopped |
| Logout or member removal | Closes access; the environment and data remain |
| Delete environment | Requires confirmed stop; removes runtime resources and retains the PVC, namespace and network policy |
| Helm uninstall | Retains the platform control PVC and runtime-created user resources |

User data lives under `/var/lib/dsh/data`: `workspace/` for files, `home/` for tools/configuration, `dsh/` for native conversations and credentials. The platform's SQLite binding store uses a separate control PVC. These retention rules are not a backup.

## Administrator commands

Inspect first; use the returned environment ID, allocation key and Sandbox UID for mutations. In a Helm deployment, run commands inside the platform Pod, where the private socket is `/tmp/platform/admin.sock`.

```sh
dsh-multi-tenant inspect --socket /tmp/platform/admin.sock --environment env-ID
dsh-multi-tenant stop --socket /tmp/platform/admin.sock --environment env-ID --allocation-key KEY --identity SANDBOX_UID
dsh-multi-tenant resume --socket /tmp/platform/admin.sock --environment env-ID --allocation-key KEY --identity SANDBOX_UID
dsh-multi-tenant delete --socket /tmp/platform/admin.sock --environment env-ID --allocation-key KEY --identity SANDBOX_UID
```

`resume` starts a stopped user environment. A deleted allocation remains blocked for administrator inspection; deletion does not create a replacement environment. On an unknown result, inspect the original allocation. A missing/replaced PVC, changed resource UID or unverified stop requires investigation before another write.

## Membership and platform restart

Update `members` in the platform ConfigMap, wait for projection into the Pod, then send SIGHUP to the platform process. Removed/remapped subjects lose active HTTP/WebSocket connections; an invalid reload revokes all sessions. Other configuration changes require restart. Restart the platform Pod after OIDC Secret rotation to refresh its private copy. `/healthz` checks local platform readiness.

For integrations with Kubernetes API and Pod-IP reachability, start the platform process directly:

```sh
dsh-multi-tenant start --config /private/config.json
```

Use the [config example](../../integration/distribution/config.example.json). The top-level fields are `runtime`, `stateFile`, `adminSocket`, `oidc`, `members`, `host`, `port`. Secret/token/CA inputs are file references. State/socket directories use mode 0700; files use 0600. Run one process per binding store.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Preflight rejects TLS, DNS or OIDC | Namespace, Secret keys, certificate hosts/expiry, issuer registration and private CA trust |
| Forbidden | Installation/platform RBAC; user workloads have no cluster token |
| ImagePull or rollout timeout | Exact amd64 image availability, Pod events and scheduling capacity |
| PVC or environment remains Pending | StorageClass provisioning, storage capacity, CNI and Pod events |
| Missing volume, changed UID or StopUnverified | Original binding, volume identity and previous Pod termination; preserve data and control state |

Supported reference: one Linux/amd64 node, one platform replica and trusted members. HA, node-partition recovery, supported upgrades and backups remain separate work; see [validation](https://github.com/GuoMonth/dsh-multi-tenant/releases/download/v0.10.0-alpha.1/validation.md).
