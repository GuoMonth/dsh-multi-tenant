[简体中文](./compatibility.zh-CN.md) | English

# Compatibility & versioning policy

## Runtime

- **Node** `^22.19.0 || >=24.0.0` — aligned with the current DeepSeek Harness RC7 engine policy.
- **Cordis** `@deepseek-ai/cordis` `>= 4.0.1 < 5` (peer).

CI exercises both the minimum supported Node 22 line (`22.19.0`) and Node 24.

## Current DSH target

The executable compatibility target is centralized in `scripts/dsh-target.mjs`:

- **DeepSeek Harness:** `0.1.0-rc.7`
- **RC7 release commit:** `99f6f02fecdb7dff40c3fbc9470f5907c29f74ca`

DSH-facing package pins and runtime probes must use that target. `pnpm verify`
checks the Web proof package pin so a future prerelease bump cannot update only
one place and silently leave stale evidence behind.

## RC7 evidence refresh (R1)

R1 selectively revalidated the DSH seams used by this repository instead of
redesigning unaffected layers.

Static RC6 → RC7 review:

| Evidence surface | RC7 source blob | Result |
| --- | --- | --- |
| `RpcMethodMap` (`packages/host/apiproxy/src/api/rpc-map.ts`) | `80dede179913fc3f96bc32e71e77c75ee8460cf9` | unchanged from RC6 |
| AgentLoop entry (`packages/core/agent-loop/src/index.ts`) | `371154a7c9e849a444a4806268e4b2d861b8f22b` | unchanged from RC6 |
| Session service entry (`packages/core/session/src/index.ts`) | `2d82a88623cf8b8d381f9ba905ba2e7088cbfe12` | unchanged from RC6 |

Executable RC7 evidence:

- `scripts/session-genesis-probe.mjs` installs the target `dsh-session` in a
  clean temporary consumer and asserts the publication/rollback behavior used by
  the genesis analysis.
- `scripts/admission-decorator-probe.mjs` installs the target Agent/AgentLoop/
  Session packages and asserts admission-before-`sessions.enter` for create,
  fork, subagent, and resume.
- the real `RpcMethodMap` remains compile-time exhaustive through
  `Record<keyof RpcMethodMap, Category>` in `dsh-multi-tenant-web`; normal CI
  typechecking therefore fails if the DSH unary surface changes without a new
  classification.

These runtime probes are first-class CI gates via `pnpm probe:dsh`, not manual
release notes.

## Target vs historical evidence

"Target" is not permission to rewrite historical evidence. An RC6 proof remains
labelled RC6 in the document that recorded it; R1 adds new RC7 evidence on top.
When DSH moves again, identify the changed seams, rerun only the affected probes
or conformance checks, and update the centralized target explicitly.

A version bump is a compatibility exercise, not a reason to absorb upstream
responsibilities into this repository. If the new version exposes a needed
seam, use it. If a seam is ecosystem-owned but still missing, define the
smallest reusable standard / upstream proposal. If no reliable enforcement
point exists, document the boundary rather than inventing a brittle local fork.

## DSH prerelease pinning

**Never depend on an unqualified `latest` tag for DSH prereleases.** Pin an
explicit prerelease version and record the DSH commit SHA / release used by any
package types, runtime probe, or architectural conclusion.

When DSH moves to a new prerelease:

1. update `scripts/dsh-target.mjs`;
2. identify which DSH-facing seams changed;
3. refresh the lockfile from the explicit prerelease pin;
4. rerun only the probes / conformance checks that cover those seams; and
5. leave unrelated layers alone.

## CI compatibility gates

Pull requests and `main` run:

- frozen-lockfile installation;
- architecture/package verification (`pnpm verify`), including DSH pin drift;
- typecheck, unit/contract tests, build, and packed external-consumer smoke;
- real DSH runtime proofs (`pnpm probe:dsh`);
- the supported Node 22.19 and Node 24 lines.

The packed smoke installs the produced kernel tarball into a clean temporary
consumer and exercises its public subpaths, so CI checks the distributable rather
than only workspace source.

## Toolchain

- **pnpm** `>= 11` (CI currently uses pnpm 11).
- **TypeScript** `>= 6.0` (build baseline; `tsconfig.base.json`).

## Kernel invariant

The kernel depends on Cordis only — no transport/vendor runtime dependencies
(JWT / PostgreSQL / HTTP / MCP / Redis). Enforced by
`scripts/verify-packages.mjs` (CI gate), not by convention.
