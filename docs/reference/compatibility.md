[简体中文](./compatibility.zh-CN.md) | English

# Compatibility & versioning policy

## Runtime

- **Node** `>= 22.19` (matches the current DeepSeek Harness engine floor).
- **Cordis** `@deepseek-ai/cordis` `>= 4.0.1 < 5` (peer).

## Current DSH target

The project currently targets **DeepSeek Harness `0.1.0-rc.7`**. New
architecture decisions and new compatibility work are evaluated against that
baseline.

"Target" is not the same as "every historical proof has already been rerun".
Evidence always keeps the version it was actually produced on. For example, an
RC6 runtime probe remains RC6 evidence until the affected seam is revalidated
for RC7. A dependent milestone is considered proven on the current target only
when its affected evidence has been refreshed or an explicit compatibility
review records why the upstream seam is unchanged.

This distinction lets the project follow fast-moving DSH prereleases without
rewriting history or forcing a full architectural revalidation on every release.

## DSH prerelease pinning

**Never depend on an unqualified `latest` tag for DSH prereleases.** Pin an
explicit prerelease version and record the DSH commit SHA / release used by any
package types, runtime probe, or architectural conclusion.

When DSH moves to a new prerelease:

1. identify which DSH-facing seams changed;
2. rerun only the probes / conformance checks that cover those seams;
3. update affected package pins and evidence labels explicitly; and
4. leave unrelated layers alone.

A version bump is a compatibility exercise, not a reason to absorb upstream
responsibilities into this repository. If the new version exposes a needed
seam, use it. If a seam is ecosystem-owned but still missing, define the
smallest reusable standard / upstream proposal. If no reliable enforcement
point exists, document the boundary rather than inventing a brittle local fork.

## Toolchain

- **pnpm** `>= 11` (build-script policy lives in `pnpm-workspace.yaml`).
- **TypeScript** `>= 6.0` (build baseline; `tsconfig.base.json`).

## Kernel invariant

The kernel depends on Cordis only — no transport/vendor runtime dependencies
(JWT / PostgreSQL / HTTP / MCP / Redis). Enforced by
`scripts/verify-packages.mjs` (CI gate), not by convention.
