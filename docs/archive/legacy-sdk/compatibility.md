# Compatibility

0.7.0 replaces the shared-process plugin with Principal-isolated native Hosts. The public package provides trusted platform APIs and a separate native runtime control asset. It has no DSH peer dependency or Cordis bundle installer. Removed per-Agent exports are not emulated.

Native behavior is verified against DSH 0.1.5-rc.2, source `fb2c4b9e698e30edb738bca4cf0618587db7d203`. The fixed runtime lives inside each Host; a future version requires an explicit rebaseline and native regression suite. The platform supports Node 22.19 and Node 24+; shipped process/container providers require Linux. Docker is a local-engine, offline reference; network-enabled deployments provide a reviewed runtime provider.

Use a fresh platform directory. Existing native-domain experiment directories retain their domains_v1 format, but old per-Agent tenant databases are not imported. Preserve legacy data separately. The supported authorization unit is `(tenantId, principalId)`; there is no independent root read grant.

See the repository README for installation, runtime image/profile layout, authentication and lifecycle contracts. Historical release notes describe their historical API only.
