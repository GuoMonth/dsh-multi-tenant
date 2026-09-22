const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const root = path.resolve(process.env.DSH_REGRESSION_HOME || (() => { throw Error("DSH_REGRESSION_HOME required"); })());
const namespace = process.env.DSH_REGRESSION_ALICE_NAMESPACE;
if (!namespace) throw Error("DSH_REGRESSION_ALICE_NAMESPACE required: only recreate the task-owned Alice Pod");
const core = JSON.parse(fs.readFileSync(path.join(root, "evidence/core.json")));
const command = JSON.parse(fs.readFileSync(path.join(root, "evidence/user-command.json")));
const protocol = JSON.parse(fs.readFileSync(path.join(root, "evidence/protocol.json")));
const identity = core.alice.instance.ref.identity;
const base = "cell-" + identity;
const k = (args) => execFileSync("kubectl", ["--kubeconfig", path.join(root, "private/kubeconfig"), "-n", namespace, ...args], { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
const get = (kind, name) => JSON.parse(k(["get", kind, name, "-o", "json"]));
const readMarker = () => k(["exec", base + "-0", "--", "node", "-e", "process.stdout.write(require('node:fs').readFileSync(" + JSON.stringify("/var/lib/dsh/data/workspace/" + command.file) + ",'utf8'))"]);
(async () => {
  const before = get("pod", base + "-0");
  assert.equal(before.metadata.annotations["dsh.isolated.io/cell-uid"], identity);
  const cellName = before.metadata.annotations["dsh.isolated.io/cell-name"];
  assert.equal(get("cell", cellName).metadata.uid, identity);
  const volumes = Object.fromEntries(["data", "private"].map(suffix => [suffix, get("pvc", base + "-" + suffix).metadata.uid]));
  assert.equal(readMarker(), command.marker);
  // Graceful Pod deletion only; never delete a Cell or PVC, force-delete, or reset state.
  k(["delete", "pod", base + "-0", "--wait=true", "--timeout=60s"]);
  let after;
  for (let attempt = 0; attempt < 90; attempt++) {
    const pods = JSON.parse(k(["get", "pods", "--field-selector", "metadata.name=" + base + "-0", "-o", "json"]));
    after = pods.items[0];
    if (after?.metadata.uid !== before.metadata.uid && after?.status?.conditions?.some(c => c.type === "Ready" && c.status === "True")) break;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  assert.ok(after?.status?.conditions?.some(c => c.type === "Ready" && c.status === "True"), "replacement Pod must become Ready");
  assert.notEqual(after.metadata.uid, before.metadata.uid);
  assert.equal(get("cell", cellName).metadata.uid, identity);
  for (const [suffix, uid] of Object.entries(volumes)) assert.equal(get("pvc", base + "-" + suffix).metadata.uid, uid);
  assert.equal(readMarker(), command.marker);
  const browser = await chromium.connectOverCDP("http://127.0.0.1:30444");
  const context = await browser.newContext({ storageState: path.join(root, "private/alice-browser.json") });
  const page = await context.newPage();
  await page.goto(core.alice.instance.origin + "/auth/login");
  await page.waitForURL(core.alice.instance.origin + "/", { timeout: 20000 });
  const sessions = await page.evaluate(async () => {
    const response = await fetch("/api/session/list", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "client-request", rpcId: "pod-recreation", method: "session/list", payload: { args: { _request: {} } } }) });
    if (!response.ok) throw Error("Session read after recreation failed: " + response.status);
    const body = await response.json();
    if (!body.result?.ok) throw Error("Session read rejected after recreation");
    return body.result.value;
  });
  assert.ok(sessions.items.some(item => item.sessionId === protocol.sessionId));
  fs.writeFileSync(path.join(root, "evidence/pod-recreation.json"), JSON.stringify({ cellUID: identity, beforePodUID: before.metadata.uid, afterPodUID: after.metadata.uid, pvcUIDs: volumes, file: command.file, marker: command.marker, sessionId: protocol.sessionId, result: "same Cell/PVCs and file/session preserved after graceful Pod replacement" }, null, 2));
  await context.close(); await browser.close();
  console.log("PASS graceful Pod replacement changed Pod UID, retained Cell/PVCs, workspace marker and native session");
})().catch(error => { console.error(error.message.split("Call log:")[0]); process.exit(1); });
