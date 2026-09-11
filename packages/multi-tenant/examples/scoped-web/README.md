# Scoped Web profile (opt-in)

This loopback-only example uses the native Cordis, AgentLoop, JSONL persistence, Session query, spawn/continuation, present tool, FS and WebServer. The model is a deterministic, keyless test adapter. Authentication uses three fixed demo cookies, selectable on the page; it is not a production identity provider.

From the repository:

```sh
pnpm install --frozen-lockfile
pnpm --filter dsh-multi-tenant demo
```

Open the printed `/tenant-panel` URL. Select an identity, create an Agent, then send a message. `/hold` remains running until Stop; use Steer while it runs. `/delegate` calls the native subagent tool. Select the child to send, stop, reconnect, or `/present` its current workspace report. HTML previews are inert text in a sandboxed iframe; Download requests reauthorize the resource.

`DSH_MT_DEMO_DIRECTORY` chooses a durable local data directory. `DSH_MT_DEMO_PORT` chooses the loopback port (default 0). Do not run two processes against the same directory. A restart retains root ownership and native Session facts.

For a packed installation, install the tarball plus the optional native profile peers:

```sh
pnpm add /path/to/dsh-multi-tenant-0.6.0.tgz @deepseek-ai/cordis@4.0.2 \
  @deepseek-ai/dsh-agent-loop@0.1.5-rc.2 \
  @deepseek-ai/dsh-session-persistence-jsonl@0.1.5-rc.2 \
  @deepseek-ai/dsh-session-projection@0.1.5-rc.2 \
  @deepseek-ai/dsh-session-query-sqlite@0.1.5-rc.2 \
  @deepseek-ai/dsh-system-prompt@0.1.5-rc.2 \
  @deepseek-ai/dsh-subagent@0.1.5-rc.2 \
  @deepseek-ai/dsh-subagent-spawn-in-process@0.1.5-rc.2 \
  @deepseek-ai/dsh-tool-subagent@0.1.5-rc.2 \
  @deepseek-ai/dsh-fs-local@0.1.5-rc.2 \
  @deepseek-ai/dsh-tool-present@0.1.5-rc.2 \
  @deepseek-ai/dsh-host-webserver@0.1.5-rc.2
node node_modules/dsh-multi-tenant/examples/scoped-web/smoke.mjs
node node_modules/dsh-multi-tenant/examples/scoped-web/server.mjs
```

Core peer dependencies are declared by the package. These are installation instructions for a built artifact, not a claim that version 0.6.0 is already on npm.

## Optional official slots

`slots.mjs` is a Client plugin for the official `sidebar.panellist` and keyed `main` slots, using the host's React. Bundle it through the native Client plugin pipeline. It opens the same authorized panel in an iframe and neither consumes nor exports stock Remote services. The actual rc.2 slot registry's delayed registration/unload behavior is exercised in `profile.integration.test.ts`; the standalone browser test exercises the panel itself.

A slot is a display extension, not an authorization layer. Mounting it into an existing stock shell does not isolate the rest of that shell. This profile deliberately omits Connection/gateway/settings/plugin/desktop controllers. Complete official Web UI integration remains deferred in [#71](https://github.com/GuoMonth/dsh-multi-tenant/issues/71), and AgentPresets capability composition in [#68](https://github.com/GuoMonth/dsh-multi-tenant/issues/68). This is the bounded adapter fallback from the approved #63 plan; it is not a second full conversation UI.

## Reproduce browser verification

```sh
agent-browser --session dsh57 open http://127.0.0.1:PORT/tenant-panel
agent-browser --session dsh57 snapshot -i
agent-browser --session dsh57 eval --stdin < packages/multi-tenant/examples/scoped-web/browser-check.js
agent-browser --session dsh57 errors
agent-browser --session dsh57 screenshot --full /tmp/scoped-panel.png
agent-browser --session dsh57 close
```

The script drives the actual page for all three identities: root/child send, Steer/Stop, native delegation, delivery preview/download, and reconnect. It also requires 72 cross-Principal/root requests to fail and all stock privileged routes to return 404. It leaves its own demo resources in the selected data directory for inspection. `smoke.mjs` uses a disposable directory and runs as part of the packed release check.
