# dsh-multi-tenant: guide for coding agents

> Start here to help a developer try, integrate, understand or modify this project. 中文使用者也可直接将本文交给 AI，要求用中文说明和操作。

## Current development policy

Read the [project constitution](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/CONSTITUTION.md) for source work. The current direction is Cell MVP + a neutral internal interface; fixed validation versions, breaking changes allowed, no historical compatibility, upgrade or seamless recovery promise. Fail fast with structured, redacted diagnostics and bounded waits. Historical CLI instructions below apply only to their recorded version.

## Establish the version first

Read the adjacent `package.json`: it owns the package version, Node engine, exports and CLI bin. `runtime-manifest.json` owns the CLI image/DSH/profile identity. Source checkouts deliberately have `image: null`; only the publication workflow binds a verified image digest. Never invent an image URL or assume a source version is on npm.

```sh
npm view dsh-multi-tenant version dist-tags --json
npm view dsh-multi-tenant@0.8.0 version
```

This guide describes the 0.8.0 CLI. If that exact version is absent, use the source path below; 0.7.1 does not have a CLI. When installed, prefer this bundled guide and the installed exports/declarations over `main` documentation. For repository tasks, inspect `git status`, remote and current commit; fetch and compare with the requested baseline before making architectural claims. Preserve local work.

## Choose the task

| User intent | Entry | Completion evidence |
| --- | --- | --- |
| Try native DSH locally | Published CLI below | Native Web opens; Alice/Bob have distinct samples; generated file and history survive restart |
| Integrate into a platform | Adjacent [README](README.md), [中文](README.zh-CN.md), `examples/native-domains/platform.mjs`, `dist/index.d.mts` | Trusted identity mapped to separate domains; HTTP/WS admission, revocation and cleanup verified |
| Modify this repository | Root [AGENTS.md](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/AGENTS.md), then relevant source/tests | Targeted checks and required installed/native proof pass |
| Prepare/publish a release | [Release runbook](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/docs/reference/release.md), [中文](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/docs/reference/release.zh-CN.md) | Local validation, public image digest, installed npm CLI and SDK, matching tag/release |

GitHub links above track `main`; replace `main` with the matching `v<version>` tag for published source. Read only the task-relevant documents. Historical plans and evidence describe their recorded revision, not necessarily the current contract.

## Help a user try the published CLI

Check `node --version`, `npm --version`, `docker info` and `docker context show`. Node must satisfy the package engine; Docker must be running locally with Linux containers. Remote Docker is unsupported. Linux amd64/arm64 have recorded native CI evidence; ongoing quality checks run locally; macOS/Windows Docker Desktop is experimental pending real-machine evidence.

```sh
npx -y dsh-multi-tenant@0.8.0 start
```

The CLI downloads its pinned image, creates local state and prints/opens a one-time sign-in URL. Keep the process running; choose Alice or Bob. The demo model is deterministic, not an LLM: try “Read my sample”, “Create a file” and “Delegate to a subagent”. Real AI requires the user's provider credentials in native Settings and real model selection. Never ask the user to paste credentials into the conversation.

In another terminal, or after restarting the same CLI version:

```sh
npx -y dsh-multi-tenant@0.8.0 status
npx -y dsh-multi-tenant@0.8.0 doctor
npx -y dsh-multi-tenant@0.8.0 stop
```

Use the same `--data-dir PATH` on every command when customized. Default control state is `~/.dsh-experience`; workspace/history live in Docker named volumes, not the npx cache. `start --no-open` prints the local link without opening a browser. Ctrl-C/stop retains data. Start again and verify history/files remain. Do not log bootstrap URLs, cookies, `running.json` control tokens or native credentials.

If Docker is unavailable, report the failed check and help start the local daemon. If an image download fails, retry after fixing connectivity; do not substitute a floating image. On version/profile mismatch, use the original CLI/image or a new data directory. Failed cleanup must retain ownership for verified recovery; do not delete locks, SQLite rows or Docker volumes to make an error disappear. No broad Docker prune/reset. More: [quickstart](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/docs/reference/quickstart.md).

## Architecture and code map

This is a CLI plus platform SDK that manages independent native DeepSeek Harness Hosts. The isolation key is `(tenantId, principalId)`. It is not the pre-0.7 shared-host Cordis plugin. A small native runtime-control plugin runs inside each DSH Host to report readiness; it is not the platform.

```text
trusted identity -> domain repository -> runtime coordinator -> one native DSH Host per Principal
browser -> authenticated HTTP/WebSocket ingress -> that Principal's native Web
local CLI -> demo identities + Docker named volumes + authenticated loopback relay
```

Repository paths:

- `packages/multi-tenant/src/index.ts`: public SDK exports; do not import private providers as public API.
- `src/domain/` under that package: durable owner/desired-state records; `src/runtime/coordinator.ts`: admission, generations and lifecycle.
- `src/ingress/`: authenticated HTTP/WS routing and invalidation.
- `src/runtime/providers/docker.ts`: Linux SDK provider with private host paths/Unix sockets and configured UID/GID.
- `src/runtime/providers/desktop-docker.ts`: internal CLI provider with daemon-owned volumes and authenticated TCP transport. This does not make the Linux SDK provider Desktop-compatible.
- `src/cli/`: local launcher and demo portal; native chat UI remains upstream DSH.
- `src/native/`, `runtime/`, `experience/`: native readiness/relay, pinned image build, deterministic demo model/MCP/preset.
- `scripts/dsh-target.mjs`: exact DSH version and source commit; no unreviewed floating upstream upgrades.
- `packages/multi-tenant/tests/`, `scripts/tests/`, `scripts/experience-smoke.mjs`, `scripts/native-host-probe/`: package contracts, release checks and installed/native evidence.

DSH owns sessions, workspaces, tools, presets, subagents and their persistence. There is no independent per-session/root read ACL within one Principal. Keep platform authentication, management APIs, control storage and the Docker socket outside user domains. Production login/SSO, TLS, quotas and deployment policy belong to the embedding platform; Alice/Bob is only a local demo.

## Work from source

From the repository root, use the Node engine and exact pnpm version in `package.json` (install that pnpm version if missing):

```sh
pnpm install --frozen-lockfile
pnpm build
docker build -f packages/multi-tenant/runtime/Dockerfile -t dsh-experience:dev packages/multi-tenant
docker image inspect dsh-experience:dev --format '{{.Id}}'
```

Pass the returned immutable `sha256:…` ID (not the literal placeholder) to:

```sh
node packages/multi-tenant/dist/cli.mjs start --image sha256:<returned-id> --data-dir /tmp/dsh-experience-dev
```

Use a fresh private data directory for an unrelated test. `pnpm release:check` verifies the package without publishing. Root AGENTS.md maps changes to the appropriate native tests. Report the exact commit, checks actually run, and limitations; a process-ready message alone is not proof the native workbench works.
