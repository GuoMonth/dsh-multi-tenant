# Cell alpha operating guide

Use `dsh-multi-tenant --help`. Node 24+; current entry is `start --config /private/config.json`. The published 0.8.0 workbench is historical. Do not pass old `--image`, `--data-dir` or Alice/Bob demo options.

`cell-release.json` records the runtime/DSH/Connector combination. `source-candidate` with null image digests is not a published release. `latest` is the chosen npm channel, not a stability or compatibility guarantee.

Prerequisites and configuration: [startup guide](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/docs/reference/quickstart.md). Platform needs API and Pod-IP access; use an administrator-configured cluster and platform-mode Operator. This command creates no cluster and runs no runtime lifecycle installer.

SIGINT/SIGTERM stop only the platform; SIGHUP reloads membership. Start one process against its private SQLite file. Restart requires login; do not delete SQLite or volumes to repair an unknown write.

`inspect --socket PATH --environment ID` is read-only. `delete --socket PATH --environment ID --allocation-key KEY --identity UID` uses the exact inspected target and requires applicable operator authorization. An accepted delete is not proof of writer cessation. Unknown outcomes require inspection of the original key; never automatically replay or recreate.

Credentials belong in private mode-0600 files and DSH private state, never command arguments, docs or issue logs. Share structured diagnostics after redaction.

The runtime repository owns Cell resources and the Connector; this repository owns OIDC, membership, sessions and protocol admission. Current scope is fixed-version Cell MVP, not HA, upgrades or interchangeable Process/Docker support. Historical SDK source remains under src/native and src/runtime; do not confuse it with the Cell CLI.
