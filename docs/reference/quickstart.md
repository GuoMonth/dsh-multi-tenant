# Platform operation

Install using the [installation guide](../installation/README.md) or [AI guide](../../packages/multi-tenant/AI.md). The package includes the installer and Helm chart. DSH is fixed to 0.2.0-rc.2.

## Platform process

For trusted integrations with Kubernetes API and Pod-IP reachability:

```sh
dsh-multi-tenant start --config /private/config.json
```

[Configuration example](../../integration/distribution/config.example.json). The seven top-level fields are `runtime`, `stateFile`, `adminSocket`, `oidc`, `members`, `host`, `port`. Kubernetes token/CA and OIDC client secret are file references. Keep the state and admin socket in private mode0700 directories owned by the process; secret/state files are mode0600. Run a single process against the binding store.

`members` maps exact OIDC issuer/subject to tenantId/principalId. After changing the projected ConfigMap, send SIGHUP to reload membership. Removal/remapping closes existing HTTP/WS connections; invalid reload revokes all sessions. Other changes require restart; restart the platform Pod after Secret rotation. SIGINT/SIGTERM closes platform access and retains environments/data. `GET /healthz` is local readiness only.

## Environment operations

Use the platform page to Enter/create, Inspect, Open, Stop and Start. After platform restart, Inspect resolves the persisted binding. Unknown operations require inspection of the original key and identities; never invent replacement keys or replay writes automatically.

For administrators, inspect first and use its exact allocation key and Sandbox UID:

```sh
dsh-multi-tenant inspect --socket /private/admin.sock --environment env-ID
dsh-multi-tenant stop --socket /private/admin.sock --environment env-ID --allocation-key KEY --identity SANDBOX_UID
dsh-multi-tenant resume --socket /private/admin.sock --environment env-ID --allocation-key KEY --identity SANDBOX_UID
dsh-multi-tenant delete --socket /private/admin.sock --environment env-ID --allocation-key KEY --identity SANDBOX_UID
```

In the Helm deployment the socket is `/tmp/platform/admin.sock`. Stop interrupts all model/tool/background work. Resume requires verified Stopped and the same PVC. Delete requires verified Stopped, removes runtime resources and retains the user PVC; the allocation remains blocked for administrator inspection. This is not a recreate operation.

Unverified stop, unavailable node, missing PVC or replaced resource identity requires investigation. Do not force-resume, delete control state or create an empty volume as recovery. Logout/revocation/uninstall do not imply data removal. Retained PVCs are not backups.
