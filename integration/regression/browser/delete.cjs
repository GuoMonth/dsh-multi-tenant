const { chromium } = require("playwright"),
  fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict"),
  { spawnSync } = require("node:child_process");
const root = path.resolve(
    process.env.DSH_REGRESSION_HOME ||
      (() => {
        throw Error("DSH_REGRESSION_HOME required");
      })(),
  ),
  core = JSON.parse(fs.readFileSync(root + "/evidence/core.json")),
  ref = core.bob.instance.ref;
function admin(identity) {
  const r = spawnSync(
    "kubectl",
    [
      "--kubeconfig",
      root + "/private/kubeconfig",
      "-n",
      "dsh-system",
      "exec",
      "deploy/" + (process.env.DSH_REGRESSION_PLATFORM_DEPLOYMENT || "platform"),
      "-c",
      "platform",
      "--",
      "node",
      "/app/node_modules/dsh-multi-tenant/dist/cell-admin.mjs",
      "/private/admin.sock",
      "delete",
      "bob-main",
      ref.allocationKey,
      identity,
    ],
    { encoding: "utf8" },
  );
  return { exit: r.status, body: JSON.parse(r.stdout) };
}
(async () => {
  const b = await chromium.connectOverCDP("http://127.0.0.1:30444"),
    c = await b.newContext({
      storageState: root + "/private/bob-browser.json",
    }),
    p = await c.newPage();
  await p.goto(core.bob.instance.origin);
  await p.locator('[data-composer-input], [role="dialog"]').first().waitFor();
  const sessionId = await p.evaluate(async () => {
    const r = await fetch("/api/session/create", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "client-request",
        rpcId: "delete-regression",
        method: "session/create",
        payload: { args: { request: {} } },
      }),
    });
    return (await r.json()).result.value.sessionId;
  });
  await p.evaluate(
    (sessionId) =>
      new Promise((resolve, reject) => {
        const s = (window.held = new WebSocket(
          "wss://" + location.host + "/api/remote.mux",
        ));
        const t = setTimeout(() => reject(Error("WS timeout")), 10000);
        s.onopen = () =>
          s.send(
            JSON.stringify({
              type: "open",
              streamId: "delete",
              endpoint: "session/follow",
              payload: {
                args: { request: { address: { kind: "session", sessionId } } },
              },
            }),
          );
        s.onmessage = (e) => {
          const f = JSON.parse(e.data);
          if (f.type === "item" && f.value?.type === "snapshot") {
            clearTimeout(t);
            resolve();
          }
        };
      }),
    sessionId,
  );
  const parent = await c.newPage();
  await parent.goto("https://platform.cells.test/api/environments/bob-main");
  assert.equal(
    await parent.evaluate(
      async () =>
        (await fetch("/api/environments/bob-main", { method: "DELETE" }))
          .status,
    ),
    405,
  );
  const wrong = admin("00000000-0000-4000-8000-000000000000");
  assert.equal(wrong.body.code, "StaleInstance");
  assert.equal(await p.evaluate(() => window.held.readyState), 1);
  const deleted = admin(ref.identity);
  assert.equal(deleted.exit, 0);
  assert.equal(deleted.body.phase, "delete-requested");
  assert.equal(deleted.body.writerState, "unverified");
  await p.waitForFunction(
    () => window.held.readyState === 3,
    {},
    { timeout: 5000 },
  );
  assert.ok(
    [401, 421].includes(
      await p.evaluate(
        async () =>
          (await fetch("/api/settings/describe", { method: "POST" })).status,
      ),
    ),
  );
  const repeated = admin(ref.identity);
  assert.ok(
    repeated.body.phase === "delete-requested" ||
      repeated.body.code === "RecordMissing",
  );
  const post = await parent.evaluate(async () => {
    const r = await fetch("/api/environments/bob-main", { method: "POST" });
    return { status: r.status, body: await r.json() };
  });
  assert.equal(post.body.phase, "delete-requested");
  fs.writeFileSync(
    root + "/evidence/platform-delete.json",
    JSON.stringify(
      {
        publicDelete: 405,
        wrongIdentity: wrong.body,
        accepted: deleted.body,
        repeated: repeated.body,
        post,
        activeWebsocket: "closed",
        newRPC: "denied (401 or removed-route 421)",
      },
      null,
      2,
    ),
  );
  await c.close();
  await b.close();
  console.log(
    "PASS private exact deletion, public denial, child revocation, repeated delete/POST stay closed",
  );
})().catch((e) => {
  console.error(e.message.split("Call log:")[0]);
  process.exit(1);
});
