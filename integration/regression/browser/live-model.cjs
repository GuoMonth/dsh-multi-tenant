const { chromium } = require("playwright"),
  fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto");
(async () => {
  const root = path.resolve(
      process.env.DSH_REGRESSION_HOME ||
        (() => {
          throw Error("DSH_REGRESSION_HOME required");
        })(),
    ),
    b = await chromium.connectOverCDP("http://127.0.0.1:30444"),
    p = b.contexts()[0].pages()[0];
  await p
    .getByRole("button", {
      name: "Edit Regression DeepSeek (regression-deepseek)",
      exact: true,
    })
    .waitFor({ timeout: 15000 });
  await p.getByRole("button", { name: "Close", exact: true }).click();
  await p.getByRole("button", { name: /^Select model/ }).click();
  await p.getByRole("menuitem", { name: /^Model/ }).click();
  await p
    .getByRole("menuitemradio", { name: "deepseek-flash", exact: true })
    .click();
  const marker = "CELL_" + crypto.randomBytes(6).toString("hex");
  await p
    .locator('input[type="file"]')
    .setInputFiles({
      name: marker + "-upload.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("Uploaded " + marker),
    });
  await p
    .locator("[data-composer-input]")
    .first()
    .fill(
      "Use the write tool to create " +
        marker +
        ".txt containing exactly " +
        marker +
        ", then read that file and the uploaded text attachment with the read tool. Reply with Verified " +
        marker +
        ". Do not merely describe the actions.",
    );
  await p.getByRole("button", { name: "Send message", exact: true }).click();
  fs.writeFileSync(
    root + "/evidence/live-model-start.json",
    JSON.stringify({
      marker,
      model: "deepseek-flash",
      provider: "regression-deepseek",
    }),
  );
  await p
    .locator('[data-tool="write"][data-state="ok"]')
    .last()
    .waitFor({ timeout: 180000 });
  await p
    .locator('[data-tool="read"][data-state="ok"]')
    .last()
    .waitFor({ timeout: 180000 });
  await p
    .getByText("Verified " + marker, { exact: false })
    .last()
    .waitFor({ timeout: 180000 });
  await p
    .getByRole("button", { name: /stop generating/i })
    .waitFor({ state: "hidden", timeout: 30000 });
  await p.screenshot({ path: root + "/evidence/live-model.png" });
  const title = await p
    .locator('nav[aria-label="Session hierarchy"] button:disabled')
    .innerText();
  await p
    .context()
    .storageState({ path: root + "/private/alice-browser.json" });
  fs.chmodSync(root + "/private/alice-browser.json", 0o600);
  fs.writeFileSync(
    root + "/evidence/live-model.json",
    JSON.stringify(
      {
        marker,
        model: "deepseek-flash",
        title,
        write: "ok",
        read: "ok",
        attachment: "read",
        result: "verified",
      },
      null,
      2,
    ),
  );
  await b.close();
  console.log(
    "PASS real DeepSeek model, DSH write/read tools, uploaded attachment and completed answer",
  );
})().catch((e) => {
  console.error(e.message.split("Call log:")[0]);
  process.exit(1);
});
