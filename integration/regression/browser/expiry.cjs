const { chromium } = require("playwright"),
  fs = require("fs"),
  path = require("path"),
  assert = require("assert/strict");
(async () => {
  const root = path.resolve(
      process.env.DSH_REGRESSION_HOME ||
        (() => {
          throw Error("DSH_REGRESSION_HOME required");
        })(),
    ),
    core = JSON.parse(fs.readFileSync(root + "/evidence/core.json")),
    b = await chromium.connectOverCDP("http://127.0.0.1:30444"),
    c = await b.newContext(),
    p = await c.newPage();
  await p.goto("https://platform.cells.test/auth/login");
  await p.locator('input[name="login"]').fill("alice@example.com");
  await p.locator('input[name="password"]').fill("password");
  await p.getByRole("button", { name: /login/i }).click();
  await p.waitForURL("https://platform.cells.test/");
  const start = Date.now();
  await p.goto("https://platform.cells.test/api/environments/alice-main");
  await p.goto(core.alice.instance.origin + "/auth/login");
  await p.waitForURL(core.alice.instance.origin + "/");
  await p.locator("[data-composer-input]").first().waitFor();
  await p.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const s = (window.expirySocket = new WebSocket(
          "wss://" + location.host + "/api/remote.mux",
        ));
        s.onopen = resolve;
        s.onerror = () => reject(Error("WS failed"));
      }),
  );
  await p.waitForFunction(
    () => window.expirySocket.readyState === 3,
    {},
    { timeout: 70000 },
  );
  const elapsed = Date.now() - start;
  assert.ok(elapsed >= 50000 && elapsed < 70000);
  const status = await p.evaluate(
    async () =>
      (await fetch("/api/settings/describe", { method: "POST" })).status,
  );
  assert.equal(status, 401);
  fs.writeFileSync(
    root + "/evidence/expiry.json",
    JSON.stringify(
      {
        lifetimeMs: 60000,
        elapsedMs: elapsed,
        activeWebsocket: "closed",
        newRPC: status,
      },
      null,
      2,
    ),
  );
  await c.close();
  await b.close();
  console.log(
    "PASS real 60-second parent expiry closes active WS and rejects new RPC",
  );
})().catch((e) => {
  console.error(e.message.split("Call log:")[0]);
  process.exit(1);
});
