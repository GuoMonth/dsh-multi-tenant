# Release DSH multi-tenant

[简体中文](../zh-CN/releasing.md) · [Guides](index.md)

Platform npm and GitHub Release share a version and lightweight `vVERSION` tag. Runtime has its own version and a cross-linked release. Publish the locally accepted artifacts after publication is authorized. RC/beta uses npm `next`, alpha uses `alpha`, and stable uses `latest`. GitHub prereleases use `--prerelease --latest=false`; default installation and latest-release entries are preserved.

1. Update package version and [release notes](release-notes.md). Run `pnpm release:check`; the paired runtime runs `make verify` and `make verify-dsh`.
2. Merge reviewed sources and run each repository's manual `prepare-release.yml` on main. Download the exact candidates: image digests/source metadata and the platform npm archive.
3. Verify archive integrity and anonymous image pulls. Test installation, two-user access, real model/tool use, data retention and relevant failures on that exact combination. Save a redacted report.
4. Publish the [runtime release](https://github.com/GuoMonth/dsh-isolated-runtime) at its accepted source commit and attach its manifest and validation report.
5. Run platform `release.yml` on the prepared commit with `platform_run`, `runtime_run`, `package_integrity`, `workload_digest` and `runtime_tag` inputs. It publishes the accepted archive, verifies registry bytes and creates the matching tag/Release with archive, manifest and checksums. The runtime validation.md is verified and included automatically.
6. Verify both releases, cross-links, exact package installation and public image pulls. Record source commits, image digests and package integrity with the acceptance Issue.

GitHub Actions uses Node 24/npm >=11.5.1, `id-token: write`, workflow `release.yml` and environment `npm-release`, matching the configured Trusted Publisher. Build-generated documentation links point to the source commit.

On partial success, rerun the same candidate. The script checks existing npm integrity before continuing. Published versions/tags remain immutable. Metadata visibility may lag publication; the script polls for up to 15 minutes. After a timeout, check registry visibility and resume the same workflow attempt.
