# Release DSH multi-tenant

[简体中文](../zh-CN/releasing.md) · [Guides](index.md)

Platform npm and GitHub Release share a version and lightweight `vVERSION` tag. Runtime has its own version and a cross-linked release. Publish the locally accepted artifacts after publication is authorized. By default, RC/beta uses npm `next`, alpha uses `alpha`, and stable uses `latest`. GitHub prereleases use `--prerelease --latest=false`; explicit npm latest selection is described below.

Platform changes can be reviewed and merged against the environment adapter contract. The combined steps below apply to qualifying and publishing the reference deployment.

1. Set an unpublished platform version in the package manifest and update the release notes. Confirm the exact version and commit of the upstream DSH pin. Run `pnpm release:check`. The paired runtime must embed the same DSH identity and pass `make verify` and `make verify-dsh`. [DSH pin](../../scripts/dsh-target.ts) · [Release notes](release-notes.md)
2. Merge reviewed sources and run the manual `prepare-release.yml` on main for each new candidate. The platform workflow reruns `pnpm release:check` before packing the npm archive and pushing the GHCR image. Download the candidate manifests, image digests and npm archive. Reuse an unchanged runtime candidate with its verified source commit and image digest.
3. Verify archive integrity and anonymous image pulls. Test installation, two-user access, real model/tool use, data retention and relevant failures on that exact combination. Save a redacted report.
4. Publish the [runtime release](https://github.com/GuoMonth/dsh-isolated-runtime) at its accepted source commit and attach its manifest and validation report.
5. Run platform `release.yml` on the prepared commit with `platform_run`, `runtime_run`, `package_integrity`, `workload_digest` and `runtime_tag` inputs. It publishes the accepted archive, verifies registry bytes and creates the matching tag/Release with archive, manifest and checksums. The runtime validation.md is verified and included automatically.
6. Verify both releases, cross-links, exact package installation and public image pulls. Record source commits, image digests and package integrity with the acceptance Issue.

## Explicit npm latest publication

When the release owner authorizes this version as the default npm installation, set `promote_latest=true` on `release.yml`. The publisher uses the native `npm publish --tag latest` operation on the same verified archive, checks registry bytes and the latest tag, and retains the GitHub prerelease status. This requires only the existing Trusted Publisher's publish permission; no separate dist-tag grant or long-lived token is needed. The default RC path still uses next and preserves latest. A resumed publication keeps the same source, archive and selected channel.

## Qualify immutable candidates

Runtime needs a new GHCR workload image when its Go binary or native SDK closure changes. Preparation installs the exact Connector separately in the Kubernetes reference image. The platform npm archive carries the adapter API and entry point. The retired runtime npm installer is not part of this release path.

Merge release preparation changes before freezing the final product sources. Record the two successful main preparation run IDs, source commits, image digests, npm integrity and Connector provenance. The publisher requires the platform preparation source to equal the publication workflow source; advancing main after acceptance requires a new platform candidate and joint acceptance. An unchanged runtime candidate may be retained with its own verified source identity.

The preparation workflow has a separate read-only Kubernetes qualification job:

```sh
gh workflow run prepare-release.yml --repo GuoMonth/dsh-multi-tenant --ref main \
  -f qualify=true -f platform_run=PLATFORM_RUN -f runtime_run=RUNTIME_RUN
```

It downloads the immutable candidates and creates a disposable native Linux/amd64 kind cluster with Calico, dynamic storage, actual Dex/Traefik and the real CLI installer. It exercises two users, native HTTP/WebSocket access, membership revocation, persistence, Pod recreation, UID mismatch, network policy, unknown outcomes, genuine watch-cache expiry and missing/replaced volumes. Fixture tools are pinned by checksum; the browser runner is Ubuntu 24.04 for Playwright 1.58.2. See [integration/e2e](../../integration/e2e/README.md) for exact inputs and limits. Local ARM Docker checks supplement this evidence; an emulated runtime without working RuntimeDefault seccomp cannot qualify Kubernetes deployment.

The `release-qualification` artifact separates harness source from product sources. It contains screened reports, candidate identities, draft publication inputs and SHA256SUMS. Generated passwords, keys, browser cookies and raw logs stay private; clusters are cleaned up after failure as well as success. A failed attempt remains evidence and must not be relabelled as a pass for another source.

Technical qualification deliberately reports `releaseReady=false` until the real model and explicitly authorized CLI checks also have evidence. Supply dedicated test credentials through private files or an approved secret store, never through source, command arguments or platform control credentials. Confirm the native file/session/credential retention after that turn and verify the second user's domain remains isolated.

Before publication, assemble runtime-release.json, a redacted validation.md and checksums from the accepted combination. The report must identify both product source commits, exact platform/workload image digests, package SHA512 integrity, Connector source and qualification run, and distinguish passed, failed and untested requirements. Attach those exact reports and manifests to the runtime release, then publish the accepted platform archive through release.yml.

GitHub Actions uses Node 24.22.3/npm >=11.5.1, `id-token: write`, workflow `release.yml` and environment `npm-release`, matching the configured Trusted Publisher. Build-generated documentation links point to the source commit.

On partial success, rerun the same candidate. The script checks existing npm integrity before continuing. Published versions/tags remain immutable. Metadata visibility may lag publication; the script polls for up to 15 minutes. After a timeout, check registry visibility and resume the same workflow attempt.

## Security reports

Use strict Node audits and retain the raw reports and assessments with both candidates. GitHub withdrew the Picomatch advisory on 2026-11-18. The published 0.12.0-rc.2 validation report records the exception authorized for that release. [GitHub advisory](https://github.com/advisories/GHSA-fc5q-39xc-vjpf) · [Published validation](https://github.com/GuoMonth/dsh-multi-tenant/releases/download/v0.12.0-rc.2/validation.md)
