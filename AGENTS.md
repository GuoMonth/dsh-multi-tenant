# Repository instructions for coding agents

Read [the AI project guide](packages/multi-tenant/AI.md) for task routing and architecture, then [CONTRIBUTING.md](CONTRIBUTING.md) for the integration contract. Explicit user instructions take precedence. These instructions cover repository work; they do not authorize publishing or deployment by themselves.

## Orientation

- Inspect `git status`, branch and remote before editing; compare with the requested upstream revision. Preserve unrelated local changes.
- The publishable package is `packages/multi-tenant`; the repository root is a private pnpm workspace.
- Version/exports/engine: package `package.json`. Package manager: root `package.json`. DSH baseline: `scripts/dsh-target.mjs`. Read these sources instead of guessing versions.
- Use the current Principal-isolated Host architecture. DSH owns native sessions/tools/Web; this package owns trusted identity, domains, lifecycle and ingress. Keep platform secrets and control storage outside domains.
- No separate per-root ACL, shared-host user isolation, or custom Agent lifecycle. The CLI provider is internal; the Linux SDK provider has a different transport contract.

## Setup and checks

Use Node satisfying the package engine and the pnpm version pinned in the root manifest:

```sh
pnpm install --frozen-lockfile
pnpm release:check
```

`release:check` performs metadata/contract checks, typechecking, tests, build, SQLite proof and an independently installed tarball SDK smoke; it does not publish. For narrow edits, run relevant checks first. Before a release PR, run the complete release check. Record local validation and the tested Node version in the PR; GitHub does not repeat quality tests.

Runtime, CLI, ingress or public API changes also require the relevant installed/native proof, on a machine with local Docker and Chromium:

```sh
pnpm --dir scripts/native-host-probe install --frozen-lockfile
pnpm --dir scripts/native-host-probe exec playwright install chromium
pnpm probe:isolated
```

For CLI/image changes, build the runtime image as described in the AI guide, then run `DSH_EXPERIENCE_IMAGE=sha256:<actual-image-id> node scripts/experience-smoke.mjs`. `pnpm probe:image` verifies the installed runtime image and network behavior. Prior CI evidence covers native amd64 and arm64; future validation runs locally on available hardware, with untested architectures stated explicitly. Use `PROBE_CHROMIUM` for an existing compatible browser. Read the probe requirements before running; do not claim Desktop hardware coverage from Linux CI.

## Editing and delivery

- Follow nearby TypeScript ESM patterns. Keep native behavior upstream and extend public platform interfaces instead of copying native controllers.
- Preserve fail-closed admission, revocation, cancellation and exact generation/ownership cleanup. Failed cleanup must block another writer.
- Update both root READMEs and their npm package copies for user-facing changes; package links must resolve outside a checkout. Keep `AI.md` shipped and current when commands/architecture change.
- Use meaningful behavioral tests for lifecycle or security changes; documentation edits need link/command/package-content checks rather than mirror tests.
- Summarize what changed, actual verification and remaining limits in the PR. Never expose one-time URLs, control tokens or model credentials in logs/evidence.
- Release preparation and publication are distinct. Follow [the release runbook](docs/reference/release.md); an authorized publication uses the manual workflow from a reviewed main commit validated locally. Never fabricate an image digest, publish from a feature branch, or tag a commit different from the published source.
