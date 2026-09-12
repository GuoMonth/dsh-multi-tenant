# Release preparation and publication

The current release candidate is `dsh-multi-tenant@0.8.0`, targeting npm `latest` and Git tag `v0.8.0`. A version in source is not proof of publication: check `npm view dsh-multi-tenant version dist-tags --json`. The package manifest owns release identity; `scripts/dsh-target.mjs` owns the exact DSH baseline. Release notes are in `docs/releases/v0.8.0.md`.

## Prepare a reviewed PR

```sh
pnpm install --frozen-lockfile
pnpm release:check
node scripts/registry-preflight.mjs 0.8.0
```

These commands do not publish. The full check validates metadata, pinned dependencies/actions, public types, tests, build, SQLite recovery and an independently installed SDK tarball. Keep both READMEs, package copies, AI.md, changelogs and release notes consistent. Source `runtime-manifest.json` must keep `image: null`; a release workflow writes the verified digest into the artifact.

CI must pass on the release PR and then on the exact merged main commit: Node 22.19/24, pinned DSH source, installed native domain isolation, and installed CLI on native Linux amd64/arm64. macOS/Windows Docker Desktop is experimental until real-machine acceptance is recorded; Linux CI is not Desktop evidence.

## Publication prerequisites

- npm Trusted Publishing must authorize this repository's `release.yml` and `npm-release` environment. Node 24/npm >=11.5.1 is used by the workflow. Do not introduce a local npm token path. See [npm's trusted-publisher instructions](https://docs.npmjs.com/trusted-publishers/).
- The GHCR package `ghcr.io/guomonth/dsh-multi-tenant-runtime` must permit the workflow to publish and anonymous consumers to pull. GHCR creates new packages private by default: after the first candidate push, an owner must set package visibility to **Public** in package settings. See [GitHub's Container registry documentation](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry). A public Git repository alone is not proof the package is public.
- If the package does not exist yet, the first authorized release run can create candidate images, then stop at the anonymous-pull gate. Set the created package public and rerun failed jobs on the same release run. npm has not been published when this gate fails. Do not bypass it or invent a digest.

## Publish the reviewed main commit

1. Merge the release PR, record the resulting main SHA, and wait for its **push CI** to succeed. A PR run or an older main run does not satisfy the gate.
2. When publication is authorized, open **Actions → Publish package → Run workflow**, select `main`. CLI equivalent: `gh workflow run release.yml --ref main`. Record the run's head SHA and verify it is the intended source.
3. The workflow builds each runtime image on its native architecture, runs the installed CLI/browser proof, pushes candidates, assembles a multi-platform digest and tests anonymous pull. It then runs package checks, checks registry ownership/version state, binds that digest and tests an installed local tarball **without `--image`**.
4. npm Trusted Publishing publishes with provenance. The workflow downloads the exact npm artifact, verifies SDK/types, dist-tag and the real CLI/native browser flow using its bundled digest, then creates the matching source tag and GitHub Release.
5. Confirm npm `latest=0.8.0`, `v0.8.0` points to the run SHA, and the GitHub Release exists. In a fresh local environment, run `npx -y dsh-multi-tenant@0.8.0 start`; verify native Web and retained files/history after stop/start. The workflow's Linux consumer proof does not replace Desktop acceptance.

The npm package manages DSH using its bundled immutable runtime reference. Users do not need a GHCR login, DSH checkout or local image build. DockerHub distribution is not configured.

## Failure and recovery

Before npm publication, fix the failing gate and rerun against the reviewed commit as appropriate. After npm publication, that version is immutable: do not overwrite it, point its tag elsewhere or assume rerunning publishes new content. Registry preflight skips an existing version and verifies the installed artifact/channel. A broken artifact requires a new package version. A failed post-publication verification leaves an npm artifact without a completed GitHub Release; report that partial state explicitly and investigate before marking the release complete.

If only tag/release creation failed, rerun the failed job against the same SHA. An existing tag at another SHA is a hard failure. Keep failed CLI evidence private: bootstrap links and credentials must not appear in shared reports. Release checks never auto-deploy the local demo to a public server.
