[简体中文](./CONTRIBUTING.zh-CN.md) | English

# Contributing

Read the [project constitution](CONSTITUTION.md). Build the Cell MVP behind a neutral internal interface. Validate a fixed current version; breaking API/configuration/state changes are allowed without historical compatibility, upgrade or seamless recovery promises. Fail fast with structured diagnostics; do not add compatibility layers for old versions.

This project integrates Principal-isolated native DSH Hosts into multi-user platforms. Keep the platform small: authentication, domain ownership, runtime intent and ingress belong here; the Cell runtime owns resource lifecycle; sessions, workspaces, presets, tools, persistence and Web behavior belong to native DSH.

The authority path is:

```text
trusted application login
  -> (tenantId, principalId)
  -> persistent domain directory and cancellable admission
  -> independently owned runtime generation
  -> native DSH Host, data and capabilities
```

There is no independent root/session read ACL inside a Principal. Native permissions remain native behavior; platform management and credentials must stay outside every domain. Extend through `DomainAuthenticator`, `DomainRepository` and `RuntimeProvider`; do not rebind private scopes, copy controllers or reconstruct a parallel Agent lifecycle.

Before merging a material change:

- verify the complete tenant/principal tuple and trusted origin before admission;
- invalidate existing connections on revocation and retain ownership when cleanup cannot be proven;
- include executable lifecycle, concurrency, hostile-input and failure evidence;
- run release checks locally and record the Node version and any untested supported platforms;
- use the installed tarball and native integration proof for public-surface/runtime changes;
- update bilingual capabilities, boundaries and explicit breaking-change/reset guidance;
- remove replaced implementation without removing required behavioral evidence.

`pnpm release:check` does not publish. `pnpm probe:isolated` runs the installed package with real native Hosts; see its documented Linux/Docker/browser requirements. DSH version/source identity is pinned in `scripts/dsh-target.mjs`, while the package manifest owns the package version. Floating upstream changes require a reviewed rebaseline.

For releases, update README and CHANGELOG plus `docs/releases/v<version>.md`, and merge the reviewed change. The manual `release.yml` workflow runs only from a reviewed main commit validated locally; no GitHub CI is required. It verifies registry identity, publishes the package, verifies the installed artifact/dist-tag, then creates the matching Git tag and GitHub Release. Never tag a different commit from the published source or imply that an unpublished source milestone is an npm release.
