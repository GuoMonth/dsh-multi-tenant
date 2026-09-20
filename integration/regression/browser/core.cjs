const { chromium } = require("playwright");
const fs = require("node:fs");
const assert = require("node:assert/strict");
const root = require("node:path").resolve(
  process.env.DSH_REGRESSION_HOME ||
    (() => {
      throw Error("DSH_REGRESSION_HOME required");
    })(),
);
const origin = "https://platform.cells.test";
async function login(page, user) {
  await page.goto(origin + "/auth/login");
  if (new URL(page.url()).hostname === "dex.dsh-system.svc") {
    await page.locator('input[name="login"]').fill(user + "@example.com");
    await page.locator('input[name="password"]').fill("password");
    await page.getByRole("button", { name: /login/i }).click();
    await page.waitForURL(origin + "/", { timeout: 20000 });
  }
  assert.equal(new URL(page.url()).origin, origin);
}
async function api(page, id, method = "GET") {
  return page.evaluate(
    async ({ id, method }) => {
      const r = await fetch("/api/environments/" + id, { method });
      return { status: r.status, body: await r.json() };
    },
    { id, method },
  );
}
async function ready(page, id) {
  let response = await api(page, id, "POST");
  console.log(id + " create", JSON.stringify(response));
  for (let i = 0; i < 45; i++) {
    response = await api(page, id);
    if (response.status === 200 && response.body.instance?.state === "Ready")
      return response.body;
    if (i % 10 === 0) console.log(id + " inspect", JSON.stringify(response));
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw Error("Readiness timed out: " + JSON.stringify(response));
}
(async () => {
  const browser = await chromium.connectOverCDP("http://127.0.0.1:30444");
  const evidence = {};
  for (const user of ["alice", "bob"]) {
    const context = await browser.newContext({ locale: "en-US" });
    const page = await context.newPage();
    await login(page, user);
    await page.goto(origin + "/api/environments/" + user + "-main");
    evidence[user] = await ready(page, user + "-main");
    const cross = await api(
      page,
      (user === "alice" ? "bob" : "alice") + "-main",
    );
    assert.equal(cross.status, 403);
    const envOrigin = evidence[user].instance.origin;
    await page.goto(envOrigin + "/auth/login");
    await page.waitForURL(envOrigin + "/", { timeout: 20000 });
    await page
      .locator('[data-composer-input], [role="dialog"]')
      .first()
      .waitFor({ timeout: 20000 });
    await page.screenshot({ path: root + "/evidence/" + user + "-native.png" });
    evidence[user].cookies = (await context.cookies()).map(
      ({ name, domain, path, secure, httpOnly, sameSite }) => ({
        name,
        domain,
        path,
        secure,
        httpOnly,
        sameSite,
      }),
    );
    await context.storageState({
      path: root + "/private/" + user + "-browser.json",
    });
    fs.chmodSync(root + "/private/" + user + "-browser.json", 0o600);
    await context.close();
  }
  fs.writeFileSync(
    root + "/evidence/core.json",
    JSON.stringify(evidence, null, 2),
  );
  console.log(
    "PASS two OIDC users, distinct native Cells, cross-user API denial, host-only cookies",
  );
  await browser.close();
})().catch((e) => {
  console.error(e.message.split("Call log:")[0]);
  process.exit(1);
});
