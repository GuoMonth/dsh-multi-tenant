[简体中文](./admission-composition.zh-CN.md) | English

# M3.0 — Agent Setup Admission Composition

> Static proof of how a third-party Cordis plugin can reliably join every Agent
> `setup`. Source read at `deepseek-ai/deepseek-harness` @
> `47f943859bef60e4160492346772ded9b24f765a`. Runtime proof of the chosen
> candidate landed in M4 (②-A) — see §5 and `scripts/admission-decorator-probe.mjs`.

## 1. The composition mechanism

The Web surface composes the agent's `setup` in `composeAgent`
(`packages/host/apiproxy/src/api-proxy.ts`), a **private closure**:

```ts
async function composeAgent(presetId) {
  const presets = ctx.get('agentPresets')
  if (presets === undefined) {
    return { setup: (agentCtx) => { installSelection(agentCtx) } }
  }
  const resolvedId = (await presets.resolve(presetId)).id
  return { setup: async (agentCtx) => {
    installSelection(agentCtx)          // model selection (hardcoded)
    await presets.mount(agentCtx, resolvedId)  // preset composition
  } }
}
```

`presets.mount` → `mountPreset(agentCtx, preset)`
(`packages/preset/agent-presets/src/mount.ts`) mounts the preset's `cordis.yml`
plugins into `agentCtx` via `agentCtx.plugin(PresetTree, config)`. The preset
service is `AgentPresets extends Service` (`static inject = ['loader']`).

So the setup is a **composition window**, but its contents are fixed:
`installSelection` + one preset's mount. There is **no global
setup-contribution registry** a plugin can self-register into.

## 2. Candidate evaluation

| Candidate | Mechanism | Unfailing (automatic)? | Verdict |
| --- | --- | --- | --- |
| **A** native preset composition | add the plugin to a preset's `cordis.yml` | ❌ user-config, not automatic | not unfailing |
| **B** setup contribution registry | a registry plugins register into | — | **does not exist** |
| **C** `ctx.agents` decorator | wrap the AgentService, prepend admission to `setup` | ✅ (if the wrap is installed) | **feasible** |
| **D** upstream global setup middleware | DSH adds a contribution registry | ✅ | cleaner alternative |

## 3. Candidate C in detail (feasible)

A plugin wraps `ctx.agents` (`AgentService`). `create`/`resume` receive
`CreateAgentOptions` / `ResumeAgentOptions`, which carry the identity:

- `options.sessionId` — the session id.
- `options.meta.parentSession` — the parent for fork / subagent.
- `options.resumeSessionId` — the resumed session.

So the wrapped `create` prepends admission to the caller's `setup`:

```ts
create(options) {
  const original = options.setup
  options.setup = async (agentCtx) => {
    await admission(options.sessionId, options.meta?.parentSession)  // claim/inherit
    return original?.(agentCtx)
  }
  return originalAgents.create(options)
}
```

Identity for each path:

| Path | Identity source in `options` | Needs H3? |
| --- | --- | --- |
| create | caller principal | **yes** (not in `options`) |
| fork / subagent | `meta.parentSession` → `getSessionOwner(parent)` | no |
| resume | `resumeSessionId` → durable owner | no |

This matches the M2 ADR: **only top-level create needs H3**.

## 4. Conclusion

- The setup is a composition window, but **not a public seam**: `composeAgent`
  is a private closure with a fixed `installSelection` + `mountPreset` body.
- **C** (`ctx.agents` decorator) is the only plugin-side mechanism that is
  *unfailing* and carries the identity via `options`; **A** is user-config, **B**
  does not exist.
- **D** (an upstream global setup-contribution middleware) is the cleaner
  alternative if wrapping `ctx.agents` proves too invasive in M3.1. **M4 (②-A)
  shows it is not required** — C holds at runtime.

## 5. Runtime proof (M4 · ②-A)

`scripts/admission-decorator-probe.mjs` wraps the **real** `AgentRegistry`
(`ctx.agents`, `@deepseek-ai/dsh-agent`) and runs admission against the **real**
`AgentLoop` (`@deepseek-ai/dsh-agent-loop@0.1.0-rc.6`) + `SessionStore`
(`@deepseek-ai/dsh-session@0.1.0-rc.6`). The `llm` / `tools` / `systemPrompt`
services are structurally injected but not exercised by the create → setup →
enter path, so they are no-op stubs; `sessionPersistence` is a minimal stub for
the resume path.

Result — for all four genesis paths the admission ran inside `setup`, and the
session was **not yet in the store** at admission time (i.e. before
`sessions.enter`), then was present after create/resume resolved:

| Path | Identity available in `options` | Admission before `sessions.enter` |
| --- | --- | --- |
| create | `sessionId` | ✅ |
| fork | `meta.parentSession` | ✅ |
| subagent | `meta.origin === 'subagent'` + `meta.parentSession` | ✅ |
| resume | `resumeSessionId` | ✅ |

This proves **C is composable** (a plugin can wrap `ctx.agents` and prepend to
`setup`) and that the admission point is **before visibility** for every path.
What it does *not* yet prove (②-C) is that a plugin installs the wrap
*unfailingly before the host's own `create` calls* in a live deployment — that is
the transport prototype's job. The upstream gap therefore remains **H3 only**
(identity for top-level `create`), not a new admission seam.
