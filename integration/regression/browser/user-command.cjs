const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const assert = require("node:assert/strict");

const root = path.resolve(
  process.env.DSH_REGRESSION_HOME ||
    (() => {
      throw Error("DSH_REGRESSION_HOME required");
    })(),
);

async function submit(page, prompt, previousBashCount) {
  await page.locator("[data-composer-input]").first().fill(prompt);
  await page.getByRole("button", { name: "Send message" }).click();
  await page
    .locator('[data-tool="bash"][data-state="ok"]')
    .nth(previousBashCount)
    .waitFor({ timeout: 120000 });
}

(async () => {
  const browser = await chromium.connectOverCDP("http://127.0.0.1:30444");
  const core = JSON.parse(fs.readFileSync(path.join(root, "evidence/core.json")));
  const context = await browser.newContext({
    storageState: path.join(root, "private/alice-browser.json"),
    locale: "en-US",
  });
  const page = await context.newPage();
  const origin = core.alice.instance.origin;
  await page.goto(origin + "/auth/login");
  await page.waitForURL(origin + "/", { timeout: 20000 });
  await page.locator("[data-composer-input]").first().waitFor({ timeout: 15000 });

  const marker = "CELL_COMMAND_" + crypto.randomBytes(8).toString("hex");
  const file = "p3-command-" + marker + ".txt";
  const childCode =
    'require("node:fs").writeFileSync(' +
    JSON.stringify(file) +
    "," +
    JSON.stringify(marker) +
    ")";
  const command =
    "node -e 'const { spawnSync } = require(\"node:child_process\"); " +
    "const child = spawnSync(process.execPath, [\"-e\", " +
    JSON.stringify(childCode) +
    '], { encoding: "utf8" }); ' +
    "if (child.error || child.status !== 0) throw child.error || Error(child.stderr); " +
    "process.stdout.write(require(\"node:fs\").readFileSync(" +
    JSON.stringify(file) +
    ', "utf8"))\'';

  const evidence = {
    marker,
    file,
    tool: "bash",
    operation: "Node child_process.spawnSync wrote a workspace file",
  };
  let bashCount = await page.locator('[data-tool="bash"][data-state="ok"]').count();
  await submit(
    page,
    "Use the native bash command tool only; do not use file tools. Call it with description `Run child Node process and persist marker`, workdir `/var/lib/dsh/data/workspace`, and timeoutMs 30000. Run exactly this command and report its stdout: " +
      command,
    bashCount,
  );
  await page.getByText(marker, { exact: true }).last().waitFor({ timeout: 15000 });
  evidence.write = "bash tool succeeded; child process created the file and printed its contents";

  await page.reload();
  await page.locator("[data-composer-input]").first().waitFor({ timeout: 30000 });
  bashCount = await page.locator('[data-tool="bash"][data-state="ok"]').count();
  await submit(
    page,
    "Use the native bash command tool only; do not use file tools. Call it with description `Read marker from workspace file`, workdir `/var/lib/dsh/data/workspace`, and timeoutMs 30000. Run `cat " +
      file +
      "` and report its stdout exactly.",
    bashCount,
  );
  await page.getByText(marker, { exact: true }).last().waitFor({ timeout: 15000 });
  evidence.afterReload = "bash tool read the same workspace file after page reload";

  fs.writeFileSync(
    path.join(root, "evidence/user-command.json"),
    JSON.stringify(evidence, null, 2),
  );
  await context.close();
  await browser.close();
  console.log("PASS native bash tool ran a Node child process; workspace file survived page reload");
})().catch((error) => {
  console.error(error.message.split("Call log:")[0]);
  process.exit(1);
});
