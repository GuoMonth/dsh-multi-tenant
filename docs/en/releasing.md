# Release DSH multi-tenant

[简体中文](../zh-CN/releasing.md) · [Guides](index.md)

Platform npm and GitHub Release share a version and lightweight `vVERSION` tag. Runtime has its own version and a cross-linked release. Publish the locally accepted artifacts after publication is authorized. RC/beta uses npm `next`, alpha uses `alpha`, and stable uses `latest`. GitHub prereleases use `--prerelease --latest=false`; default installation and latest-release entries are preserved.

1. Update the platform version, the DSH pin in [dsh-target.mjs](../../scripts/dsh-target.mjs) and [release notes](release-notes.md). Run `pnpm release:check`; the paired runtime runs `make verify` and `make verify-dsh`. This candidate pairs with runtime 0.5.0-rc.3, which must embed the same DSH pin.
2. Merge reviewed sources and run each repository's manual `prepare-release.yml` on main. The workflow re-runs the full `pnpm release:check` before packing and pushing the exact candidate; pull-request CI stays light and the local step 1 remains the primary acceptance record. Download the exact candidates: image digests/source metadata and the platform npm archive.
3. Verify archive integrity and anonymous image pulls. Test installation, two-user access, real model/tool use, data retention and relevant failures on that exact combination. Save a redacted report.
4. Publish the [runtime release](https://github.com/GuoMonth/dsh-isolated-runtime) at its accepted source commit and attach its manifest and validation report.
5. Run platform `release.yml` on the prepared commit with `platform_run`, `runtime_run`, `package_integrity`, `workload_digest` and `runtime_tag` inputs. It publishes the accepted archive, verifies registry bytes and creates the matching tag/Release with archive, manifest and checksums. The runtime validation.md is verified and included automatically.
6. Verify both releases, cross-links, exact package installation and public image pulls. Record source commits, image digests and package integrity with the acceptance Issue.

## Explicit npm latest publication

When the release owner authorizes this version as the default npm installation, set `promote_latest=true` on `release.yml`. The publisher uses the native `npm publish --tag latest` operation on the same verified archive, checks registry bytes and the latest tag, and retains the GitHub prerelease status. This requires only the existing Trusted Publisher's publish permission; no separate dist-tag grant or long-lived token is needed. The default RC path still uses next and preserves latest. A resumed publication keeps the same source, archive and selected channel.

## Qualify immutable candidates

Runtime needs a new GHCR workload image when its Go binary or native SDK closure changes. The platform needs a new npm archive when its bundled SDK/Connector changes. The retired runtime npm installer is not part of this release path.

Merge release preparation changes before freezing the final product sources. Record the two successful main preparation run IDs, source commits, image digests, npm integrity and Connector provenance. The publisher requires the platform preparation source to equal the publication workflow source; advancing main after acceptance requires a new platform candidate and joint acceptance. An unchanged runtime candidate may be retained with its own verified source identity.

The preparation workflow has a separate read-only Kubernetes qualification job:

```sh
gh workflow run prepare-release.yml --repo GuoMonth/dsh-multi-tenant --ref main \
  -f qualify=true -f platform_run=PLATFORM_RUN -f runtime_run=RUNTIME_RUN
```

It downloads the immutable candidates and creates a disposable native Linux/amd64 kind cluster with Calico, dynamic storage, actual Dex/Traefik and the real CLI installer. It exercises two users, native HTTP/WebSocket access, membership revocation, persistence, Pod recreation, UID mismatch, network policy, unknown outcomes, genuine watch-cache expiry and missing/replaced volumes. Fixture tools are pinned by checksum; the browser runner is Ubuntu 24.04 for Playwright 1.58.2. See [integration/e2e](../../integration/e2e/README.md) for exact inputs and limits. Local ARM Docker checks supplement this evidence; an emulated runtime without working RuntimeDefault seccomp cannot qualify Kubernetes deployment.

The `release-qualification` artifact separates harness source from product sources. It contains screened reports, candidate identities, draft publication inputs and SHA256SUMS. Generated passwords, keys, browser cookies and raw logs stay private; clusters are cleaned up after failure as well as success. A failed attempt remains evidence and must not be relabelled as a pass for another source.

Technical qualification deliberately reports `releaseReady=false` until the real model and explicitly authorized CLI checks also have evidence. Supply dedicated test credentials through private files or an approved secret store, never through source, command arguments or platform control credentials. Confirm the native file/session/credential retention after that turn and verify the second user's domain remains isolated.

Before publication, assemble runtime-release.json, a redacted validation.md and checksums from the accepted combination. The report must identify both product source commits, exact platform/workload image digests, package SHA512 integrity, Connector source and qualification run, and distinguish passed, failed and untested requirements. Attach those exact reports and manifests to the runtime release, then publish the accepted platform archive through release.yml. RC publication uses npm next and preserves the default latest channel.

GitHub Actions uses Node 24/npm >=11.5.1, `id-token: write`, workflow `release.yml` and environment `npm-release`, matching the configured Trusted Publisher. Build-generated documentation links point to the source commit.

On partial success, rerun the same candidate. The script checks existing npm integrity before continuing. Published versions/tags remain immutable. Metadata visibility may lag publication; the script polls for up to 15 minutes. After a timeout, check registry visibility and resume the same workflow attempt.

## Accepted known security issue

On 2026-11-18 the release owner authorized GHSA-fc5q-39xc-vjpf on picomatch 4.0.7 as a known issue for this release. The ReDoS risk is not fixed; acceptance expires on 2026-12-02. Set `accept_picomatch=true` on both preparation workflows. Default local audits stay strict; CI explicitly supplies this authorized exception until its enforced expiry. The accepted preparation retains raw reports and a non-clean assessment under candidate/audit, while every other advisory, version change, scan error or expired acceptance still fails. Both Releases and validation reports must disclose this issue.
