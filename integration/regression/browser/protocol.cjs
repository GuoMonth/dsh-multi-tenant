const { chromium } = require("playwright");
const fs = require("node:fs"),
  assert = require("node:assert/strict"),
  path = require("node:path");
const root = path.resolve(
  process.env.DSH_REGRESSION_HOME ||
    (() => {
      throw Error("DSH_REGRESSION_HOME required");
    })(),
);
const core = JSON.parse(fs.readFileSync(root + "/evidence/core.json"));
async function rpc(page, method, args) {
  return page.evaluate(
    async ({ method, args }) => {
      const r = await fetch("/api/" + method, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "client-request",
          rpcId: "regression-" + Date.now(),
          method,
          payload: { args },
        }),
      });
      const body = await r.json();
      if (!r.ok || !body.result?.ok)
        throw Error(
          method +
            " failed " +
            r.status +
            " " +
            JSON.stringify(body.result?.error),
        );
      return body.result.value;
    },
    { method, args },
  );
}
(async () => {
  const browser = await chromium.connectOverCDP("http://127.0.0.1:30444");
  const context = await browser.newContext({
    storageState: root + "/private/alice-browser.json",
    locale: "en-US",
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(core.alice.instance.origin);
  await page
    .locator('[data-composer-input], [role="dialog"]')
    .first()
    .waitFor();
  await rpc(page, "settings/describe", {});
  await Promise.all(
    Array.from({ length: 24 }, () => rpc(page, "settings/describe", {})),
  );
  const { sessionId } = await rpc(page, "session/create", { request: {} });
  assert.ok(sessionId);
  const listed = await rpc(page, "session/list", { _request: {} });
  assert.ok(listed.items.some((x) => x.sessionId === sessionId));
  await page.evaluate(
    (sessionId) =>
      new Promise((resolve, reject) => {
        const s = new WebSocket("wss://" + location.host + "/api/remote.mux");
        const timer = setTimeout(() => {
          s.close();
          reject(Error("follow timeout"));
        }, 15000);
        s.onopen = () =>
          s.send(
            JSON.stringify({
              type: "open",
              streamId: "regression",
              endpoint: "session/follow",
              payload: {
                args: { request: { address: { kind: "session", sessionId } } },
              },
            }),
          );
        s.onerror = () => {
          clearTimeout(timer);
          reject(Error("follow rejected"));
        };
        s.onmessage = (e) => {
          const f = JSON.parse(e.data);
          if (f.streamId !== "regression") return;
          if (f.type === "item" && f.value?.type === "snapshot") {
            clearTimeout(timer);
            s.close();
            resolve();
          } else if (f.type === "error") {
            clearTimeout(timer);
            s.close();
            reject(Error("follow error"));
          }
        };
      }),
    sessionId,
  );
  for (const method of ["HEAD", "GET"])
    assert.equal(
      await page.evaluate(
        async ({ sessionId, method }) =>
          (
            await fetch(
              "/api/session.export?sessionId=" + encodeURIComponent(sessionId),
              { method },
            )
          ).status,
        { sessionId, method },
      ),
      200,
    );
  const bob = await browser.newContext({
    storageState: root + "/private/bob-browser.json",
  });
  const b = await bob.newPage();
  await b.goto(core.bob.instance.origin);
  assert.equal(
    (await rpc(b, "session/list", { _request: {} })).items.some(
      (x) => x.sessionId === sessionId,
    ),
    false,
  );
  const cross = await b.goto(core.alice.instance.origin + "/auth/login");
  assert.equal(cross.status(), 403);
  assert.equal(errors.length, 0);
  fs.writeFileSync(
    root + "/evidence/protocol.json",
    JSON.stringify(
      {
        sessionId,
        burst: 24,
        websocket: "snapshot",
        export: ["HEAD", "GET"],
        crossTenant: "denied",
        browserErrors: errors,
      },
      null,
      2,
    ),
  );
  await context.close();
  await bob.close();
  await browser.close();
  console.log(
    "PASS native HTTP RPC, concurrent burst, websocket, export, tenant separation",
  );
})().catch((e) => {
  console.error(e.message.split("Call log:")[0]);
  process.exit(1);
});
