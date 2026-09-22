# Cell alpha operating guide

Use `dsh-multi-tenant --help`. The published platform package is `0.9.0-alpha.1`, requires Node 24+, and starts with `start --config /private/config.json`. The runtime release is `0.3.0-alpha.1`; `release` prints the fixed image/version data and `manifests` prints the pinned Operator/CRD/RBAC YAML. Review and apply those resources as an administrator. Neither npm command creates a cluster.

Prerequisites, the current configuration template, startup and operational limits: [startup guide](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/docs/reference/quickstart.md). The platform needs Kubernetes API and Cell Pod-IP connectivity. The administrator configures cluster, Gateway/TLS, CNI, storage, RBAC and OIDC. The `expectedSpec` and `expectedPodSpec` profile values are currently calibrated manually against API-defaulted resources; the simplification tracked by Issue #99 has not shipped.

`cell-release.json` records the runtime/DSH/Connector combination. `source-candidate` with null image digests indicates an unpublished candidate only; the published 0.9.0-alpha.1 package is bound to the fixed public Cell/Operator images in its release manifest. npm `latest` is an installation channel, not a compatibility or stability promise.

SIGINT/SIGTERM stop only the platform; SIGHUP reloads membership. Use one process per private SQLite state file. Restart requires login; do not delete SQLite or volumes to repair an unknown write.

`inspect --socket PATH --environment ID` is read-only. `delete --socket PATH --environment ID --allocation-key KEY --identity UID` uses the exact inspected target and requires applicable operator authorization. An accepted delete is not proof of writer cessation. Unknown outcomes require inspection of the original key; never automatically replay or recreate.

Credentials belong in private mode-0600 files and DSH private state, never command arguments, docs or issue logs. Share structured diagnostics after redaction.

The runtime repository owns Cell resources and the Connector; this repository owns OIDC, membership, sessions and protocol admission. Current scope is fixed-version Cell MVP, not HA, upgrades or interchangeable Process/Docker support. Historical SDK and standalone workbench sources do not describe this package's installation path. Runtime P1 sandbox-source changes in [PR #93](https://github.com/GuoMonth/dsh-isolated-runtime/pull/93) remain unmerged and unpublished; do not imply the current npm-bound runtime includes them.
