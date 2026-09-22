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
  const groups = page.getByRole("button", { name: /^\d+ tool calls?$/ });
  const previousGroupCount = await groups.count();
  await page.locator('[data-composer-input][contenteditable="true"]').first().fill(prompt);
  await page.getByRole("button", { name: "Send message" }).click();
  // The pinned DSH UI collapses completed turns in Compact mode. Native bash
  // uses data-sample (file tools use data-tool); expand the new turn and card.
  const group = groups.nth(previousGroupCount);
  await group.waitFor({ timeout: 120000 });
  if ((await group.getAttribute("aria-expanded")) !== "true") await group.click();
  const result = page.locator('[data-sample="bash"][data-state="ok"]').nth(previousBashCount);
  await result.waitFor({ timeout: 120000 });
  if ((await result.getAttribute("aria-expanded")) !== "true") await result.click();
  await page.getByRole("button", { name: /stop generating/i }).waitFor({ state: "hidden", timeout: 30000 });
  return result.locator("..");
}

async function assertBashResult(resultCard, { markers, commandFragments }) {
  const renderedToolResult = await resultCard.innerText();
  // Pinned native terminal renders command in its header and stdout in the
  // final direct div. Never use the command echo or assistant reply as stdout.
  const stdout = await resultCard.locator("[data-terminal] > div:last-child").innerText();
  for (const fragment of commandFragments) {
    assert.ok(
      renderedToolResult.includes(fragment),
      `bash tool result card must identify the executed command fragment ${fragment}`,
    );
  }
  for (const marker of markers) {
    assert.ok(
      new RegExp(`(?:^|\\n)${marker}(?:\\r?\\n|$)`).test(stdout),
      `bash tool result card stdout must contain marker on its own line: ${marker}`,
    );
  }
  // dsh-tool-bash renders non-zero exits, signals, and timeouts into the tool
  // result text; absence of these markers plus the stdout marker establishes
  // the expected successful foreground result (the assistant reply is outside
  // this tool-result card and is never used as evidence).
  assert.doesNotMatch(
    renderedToolResult,
    /(?:\[exit code: (?!0\])[^\]]+\]|\bexit code\s*:?\s*[1-9]\d*\b|\[killed by signal: [^\]]+\]|\[timed out after \d+ms\])/i,
    "bash tool result must not report a non-zero exit, signal, or timeout",
  );
  return {
    commandFragments,
    stdoutMarkers: markers,
    exitCode: 0,
    exitCodeEvidence: "native tool stdout matched; DSH reported no non-zero exit, signal or timeout",
  };
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
  await page.locator('[data-composer-input][contenteditable="true"]').first().waitFor({ timeout: 15000 });

  const marker = "CELL_COMMAND_" + crypto.randomBytes(8).toString("hex");
  const successMarker = "CELL_BASH_OK_" + crypto.randomBytes(8).toString("hex");
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
    ', "utf8") + "\\n")\'; status=$?; ' +
    'if [ "$status" -ne 0 ]; then exit "$status"; fi; printf \'%s\\n\' ' +
    JSON.stringify(successMarker);

  const evidence = {
    marker,
    successMarker,
    file,
    tool: "bash",
    operation: "Node child_process.spawnSync wrote a workspace file",
  };
  let bashCount = await page.locator('[data-sample="bash"][data-state="ok"]').count();
  const writeResult = await submit(
    page,
    "Use the native bash command tool only; do not use file tools. Call it with description `Run child Node process and persist marker`, workdir `/var/lib/dsh/data/workspace`, and timeoutMs 30000. Run exactly this command and report its stdout: " +
      command,
    bashCount,
  );
  evidence.write = await assertBashResult(writeResult, {
    markers: [marker, successMarker],
    commandFragments: ["node:child_process", "spawnSync"],
  });

  await page.reload();
  await page.locator('[data-composer-input][contenteditable="true"]').first().waitFor({ timeout: 30000 });
  bashCount = await page.locator('[data-sample="bash"][data-state="ok"]').count();
  const readResult = await submit(
    page,
    "Use the native bash command tool only; do not use file tools. Call it with description `Read marker from workspace file`, workdir `/var/lib/dsh/data/workspace`, and timeoutMs 30000. Run `cat " +
      file +
      "` and report its stdout exactly.",
    bashCount,
  );
  evidence.afterReload = await assertBashResult(readResult, {
    markers: [marker],
    commandFragments: ["cat " + file],
  });

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
