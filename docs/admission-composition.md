# M3.0 — Agent Setup Admission Composition

> Static proof of how a third-party Cordis plugin can reliably join every Agent
> `setup`. Source read at `deepseek-ai/deepseek-harness` @
> `47f943859bef60e4160492346772ded9b24f765a`. Runtime proof of the chosen
> candidate is M3.1's first step.

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
  alternative if wrapping `ctx.agents` proves too invasive in M3.1.

M3.1's first step is the runtime proof of **C** — wrap `ctx.agents`, assert the
admission runs inside `setup` before `sessions.enter`, for the three
identity-bearing paths.
