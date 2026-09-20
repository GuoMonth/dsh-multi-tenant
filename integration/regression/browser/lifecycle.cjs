const { chromium } = require("playwright"),
  fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict"),
  { execFileSync } = require("node:child_process");
const root = path.resolve(
    process.env.DSH_REGRESSION_HOME ||
      (() => {
        throw Error("DSH_REGRESSION_HOME required");
      })(),
  ),
  core = JSON.parse(fs.readFileSync(root + "/evidence/core.json")),
  protocol = JSON.parse(fs.readFileSync(root + "/evidence/protocol.json"));
const k = (args, input) =>
  execFileSync(
    "kubectl",
    ["--kubeconfig", root + "/private/kubeconfig", ...args],
    { input, encoding: "utf8" },
  );
async function hold(p) {
  await p.evaluate(
    (sessionId) =>
      new Promise((resolve, reject) => {
        const s = (window.regressionSocket = new WebSocket(
          "wss://" + location.host + "/api/remote.mux",
        ));
        const t = setTimeout(
          () => reject(Error("held websocket timeout")),
          12000,
        );
        s.onerror = () => {
          clearTimeout(t);
          reject(Error("held websocket rejected"));
        };
        s.onopen = () =>
          s.send(
            JSON.stringify({
              type: "open",
              streamId: "held",
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
    protocol.sessionId,
  );
}
async function status(p) {
  return p.evaluate(async () => {
    const r = await fetch("/api/settings/describe", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "client-request",
        rpcId: "lifecycle",
        method: "settings/describe",
        payload: { args: {} },
      }),
    });
    return r.status;
  });
}
async function aliceLogin(context) {
  const p = await context.newPage();
  await p.goto("https://platform.cells.test/auth/login");
  if (new URL(p.url()).hostname === "dex.dsh-system.svc") {
    await p.locator('input[name="login"]').fill("alice@example.com");
    await p.locator('input[name="password"]').fill("password");
    await p.getByRole("button", { name: /login/i }).click();
    await p.waitForURL("https://platform.cells.test/");
  }
  await p.goto(core.alice.instance.origin + "/auth/login");
  await p.waitForURL(core.alice.instance.origin + "/");
  await p.locator("[data-composer-input]").first().waitFor();
  return p;
}
(async () => {
  const b = await chromium.connectOverCDP("http://127.0.0.1:30444");
  const ca = await b.newContext({
    storageState: root + "/private/alice-browser.json",
  });
  const a = await ca.newPage();
  await a.goto(core.alice.instance.origin);
  await a.locator("[data-composer-input]").first().waitFor();
  assert.equal(await status(a), 200);
  // Restored DSH still lists its durable pre-restart session; hold() requires a real snapshot.
  await hold(a);
  const cb = await b.newContext({
      storageState: root + "/private/bob-browser.json",
    }),
    bob = await cb.newPage();
  await bob.goto(core.bob.instance.origin);
  assert.equal(await status(bob), 200);
  const parent = await ca.newPage();
  await parent.goto("https://platform.cells.test/api/environments/alice-main");
  assert.equal(
    await parent.evaluate(
      async () => (await fetch("/auth/logout", { method: "POST" })).status,
    ),
    200,
  );
  await a.waitForFunction(
    () => window.regressionSocket.readyState === WebSocket.CLOSED,
    {},
    { timeout: 5000 },
  );
  assert.equal(await status(a), 401);
  assert.equal(await status(bob), 200);
  console.log(
    "PASS parent logout closes existing websocket and rejects new RPC; Bob unaffected",
  );
  const fresh = await aliceLogin(ca);
  await hold(fresh);
  const script =
    'const fs=require("fs");const p="/private/config.json";fs.copyFileSync(p,"/private/config-before-members.json");const c=JSON.parse(fs.readFileSync(p));c.members=c.members.filter(m=>m.owner.principalId!=="alice");fs.writeFileSync(p,JSON.stringify(c));process.kill(1,"SIGHUP")';
  k([
    "-n",
    "dsh-system",
    "exec",
    "deploy/platform",
    "-c",
    "platform",
    "--",
    "node",
    "-e",
    script,
  ]);
  try {
    await fresh.waitForFunction(
      () => window.regressionSocket.readyState === WebSocket.CLOSED,
      {},
      { timeout: 5000 },
    );
    assert.equal(await status(fresh), 401);
    assert.equal(await status(bob), 200);
    console.log(
      "PASS membership removal closes existing websocket; Bob unaffected",
    );
  } finally {
    k([
      "-n",
      "dsh-system",
      "exec",
      "deploy/platform",
      "-c",
      "platform",
      "--",
      "node",
      "-e",
      'const fs=require("fs");fs.copyFileSync("/private/config-before-members.json","/private/config.json");process.kill(1,"SIGHUP")',
    ]);
  }
  const restored = await aliceLogin(ca);
  assert.equal(await status(restored), 200);
  await ca.storageState({ path: root + "/private/alice-browser.json" });
  fs.chmodSync(root + "/private/alice-browser.json", 0o600);
  fs.writeFileSync(
    root + "/evidence/revocation.json",
    JSON.stringify(
      {
        parentLogout: "active WS closed; new RPC 401",
        membershipRemoval: "active WS closed; new RPC 401",
        otherTenant: "unaffected",
        restoredMember: "fresh login works",
        durableSession: "snapshot after Pod recreation",
      },
      null,
      2,
    ),
  );
  await ca.close();
  await cb.close();
  await b.close();
})().catch((e) => {
  console.error(e.message.split("Call log:")[0]);
  process.exit(1);
});
