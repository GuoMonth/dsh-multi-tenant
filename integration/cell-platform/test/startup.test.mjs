import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

test("invalid configuration fails with a stage and never echoes input credentials", () => {
  const directory = mkdtempSync(join(tmpdir(), "dsh-startup-"));
  try {
    const secret = "never-log-this-credential";
    const filename = join(directory, "config.json");
    writeFileSync(filename, '{"secret":"' + secret + '" INVALID}', {
      mode: 0o600,
    });
    const result = spawnSync(process.execPath, ["dist/main.js", filename], {
      encoding: "utf8",
    });
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr.includes(secret), false);
    const diagnostic = JSON.parse(result.stderr);
    assert.equal(diagnostic.stage, "configuration");
    assert.equal(diagnostic.effect, "not-submitted");
    assert.equal(diagnostic.observedState, "not-listening");
    assert.equal(diagnostic.retry, "never");
    assert.match(diagnostic.correlationId, /^[a-f0-9-]{36}$/);
    assert.ok(diagnostic.nextAction.length > 20);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
