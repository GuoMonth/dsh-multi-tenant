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
    b = await chromium.connectOverCDP("http://127.0.0.1:30444");
  const results = {};
  for (const user of ["alice", "bob"]) {
    const c = await b.newContext(),
      p = await c.newPage();
    await p.goto("https://platform.cells.test/auth/login");
    await p.locator('input[name="login"]').fill(user + "@example.com");
    await p.locator('input[name="password"]').fill("password");
    await p.getByRole("button", { name: /login/i }).click();
    await p.waitForURL("https://platform.cells.test/");
    await p.goto(
      "https://platform.cells.test/api/environments/" + user + "-main",
    );
    const result = await p.evaluate(async (id) => {
      const r = await fetch("/api/environments/" + id, { method: "POST" });
      return { status: r.status, body: await r.json() };
    }, user + "-main");
    results[user] = result;
    if (user === "alice") {
      assert.equal(
        result.body.instance.ref.identity,
        core.alice.instance.ref.identity,
      );
      assert.equal(result.body.instance.state, "Ready");
      await p.goto(core.alice.instance.origin + "/auth/login");
      await p.waitForURL(core.alice.instance.origin + "/");
      await p.locator("[data-composer-input]").first().waitFor();
      const sessions = await p.evaluate(async () => {
        const r = await fetch("/api/session/list", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            type: "client-request",
            rpcId: "restart",
            method: "session/list",
            payload: { args: { _request: {} } },
          }),
        });
        return (await r.json()).result.value.items;
      });
      assert.ok(
        sessions.some(
          (x) =>
            x.sessionId ===
            JSON.parse(fs.readFileSync(root + "/evidence/protocol.json"))
              .sessionId,
        ),
      );
    } else {
      assert.equal(result.body.phase, "delete-requested");
      assert.equal(result.body.diagnostic.code, "RecordMissing");
    }
    await c.storageState({ path: root + "/private/" + user + "-browser.json" });
    fs.chmodSync(root + "/private/" + user + "-browser.json", 0o600);
    await c.close();
  }
  fs.writeFileSync(
    root + "/evidence/platform-restart.json",
    JSON.stringify(results, null, 2),
  );
  await b.close();
  console.log(
    "PASS new login after platform restart: Alice exact binding and native sessions preserved; Bob deletion barrier persists",
  );
})().catch((e) => {
  console.error(e.message.split("Call log:")[0]);
  process.exit(1);
});
