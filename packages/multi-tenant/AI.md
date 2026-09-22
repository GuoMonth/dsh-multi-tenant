# Agent Workspace alpha operating guide

Use `dsh-multi-tenant --help`. The published platform package is `0.9.0-alpha.1`, requires Node 24+, and starts with `start --config /private/config.json`. The runtime release is `0.3.0-alpha.1`; `release` prints the fixed image/version data and `manifests` prints the pinned Operator/CRD/RBAC YAML. Review and apply those resources as an administrator. Neither npm command creates a cluster.

Prerequisites, the published configuration template, startup and operational limits: [startup guide](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/docs/reference/quickstart.md). The platform needs Kubernetes API and Cell Pod-IP connectivity. The administrator configures cluster, Gateway/TLS, CNI, storage, RBAC and OIDC. The published `0.9.0-alpha.1` instructions below describe that release; the unpublished `0.10.0-alpha.1` source candidate uses a fixed runtime template and rejects the old calibrated profiles.

`cell-release.json` records the runtime/DSH/Connector combination. `source-candidate` with null image digests indicates an unpublished candidate only; the published 0.9.0-alpha.1 package is bound to the fixed public Cell/Operator images in its release manifest. npm `latest` is an installation channel, not a compatibility or stability promise.

## Runtime direction and session terms

The product direction is Kubernetes-only. The target runtime is an `AgentWorkspace` CRD with a thin Operator; Process and Docker runtime backends are not supported alternatives. Existing Cell and legacy provider source remains in this branch until the planned W1 cleanup. The current candidate does not implement the AgentWorkspace CRD. See [Agent Workspace design](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/docs/design/agent-workspace.zh-CN.md) and [Issue #104](https://github.com/GuoMonth/dsh-multi-tenant/issues/104). This direction does not disable OCI image builds or subprocesses running inside a workspace.

Keep these sessions distinct:

- A platform AuthSession is OIDC-derived authorization to enter a user's Agent Workspace. Its expiry or revocation controls platform access.
- A DSH Session is a native DSH conversation. The product model places multiple DSH Sessions in one Agent Workspace, sharing its workspace/home state; closing a platform AuthSession does not mean deleting those conversations or the workspace.

The currently tested Cell preserves workspace data and native DSH state across Pod replacement, and model credentials are configured in DSH's private settings. This establishes persistence at the Cell/workspace level. It does not prove per-conversation isolation of home files, OAuth tokens or CLI credentials; treat those as workspace-shared unless a future design explicitly separates them.

SIGINT/SIGTERM stop only the platform; SIGHUP reloads membership. Use one process per private SQLite state file. Restart requires login; do not delete SQLite or volumes to repair an unknown write.

`inspect --socket PATH --environment ID` is read-only. `delete --socket PATH --environment ID --allocation-key KEY --identity UID` uses the exact inspected target and requires applicable operator authorization. An accepted delete is not proof of writer cessation. Unknown outcomes require inspection of the original key; never automatically replay or recreate.

Credentials belong in private mode-0600 files and DSH private state, never command arguments, docs or issue logs. Share structured diagnostics after redaction.

The runtime repository owns current Cell resources and the Connector; this repository owns OIDC, membership, AuthSessions and protocol admission. The current release remains a fixed-version Cell MVP, without HA or upgrades. Historical SDK and standalone workbench sources do not describe this package's installation path. Later source changes do not alter the published package; the current architecture direction and work are tracked in [Issue #104](https://github.com/GuoMonth/dsh-multi-tenant/issues/104).
