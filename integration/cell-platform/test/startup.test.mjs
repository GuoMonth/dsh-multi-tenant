import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { validateCellMvpBinding } from "../dist/startup.js";

const validAllocation = () => ({
  template: "cell-mvp-v1",
  image: `ghcr.io/guomonth/dsh-isolated-runtime-cell@sha256:${"a".repeat(64)}`,
  storage: { size: "20Gi", retentionPolicy: "Retain" },
  resources: {
    requests: { cpu: "1", memory: "1Gi" },
    limits: { cpu: "2", memory: "2Gi" },
  },
  namespaces: { "tenant-a": "tenant-a" },
  domain: "cells.example.com",
});

test("platform binds environments to the one fixed runtime template", () => {
  assert.doesNotThrow(() =>
    validateCellMvpBinding(validAllocation(), [{ template: "cell-mvp-v1" }]),
  );
  assert.throws(
    () => validateCellMvpBinding(validAllocation(), [{ template: "other" }]),
    /Environment template must match allocation template/,
  );
  assert.throws(
    () =>
      validateCellMvpBinding(
        { ...validAllocation(), template: "other" },
        [{ template: "other" }],
      ),
    /Unsupported allocation template/,
  );
  assert.throws(
    () =>
      validateCellMvpBinding(
        { ...validAllocation(), securityClass: "standard" },
        [{ template: "cell-mvp-v1" }],
      ),
    /securityClass is runtime-fixed/,
  );
});

test("platform rejects manually calibrated profiles and unbound image identities", () => {
  assert.throws(
    () =>
      validateCellMvpBinding(
        { template: "approved-v1", profiles: [{ expectedSpec: {} }] },
        [{ template: "approved-v1" }],
      ),
    /Legacy allocation profiles are unsupported/,
  );
  assert.throws(
    () =>
      validateCellMvpBinding(
        { ...validAllocation(), image: null },
        [{ template: "cell-mvp-v1" }],
      ),
    /Runtime image digest is required/,
  );
  const candidate = JSON.parse(
    readFileSync(
      new URL("../../distribution/config.candidate.example.json", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(candidate.allocation.template, "cell-mvp-v1");
  assert.deepEqual(
    candidate.environments.map((item) => item.template),
    ["cell-mvp-v1", "cell-mvp-v1"],
  );
  assert.throws(
    () => validateCellMvpBinding(candidate.allocation, candidate.environments),
    /Runtime image digest is required/,
  );
});

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

test("legacy calibration config fails before startup with a redacted diagnostic", () => {
  const directory = mkdtempSync(join(tmpdir(), "dsh-startup-"));
  try {
    const secret = "never-log-this-profile-credential";
    const filename = join(directory, "config.json");
    writeFileSync(
      filename,
      JSON.stringify({
        host: "0.0.0.0",
        port: 8080,
        allocation: {
          domain: "cells.example.com",
          profiles: [{ template: "approved-v1", expectedSpec: { secret } }],
        },
        environments: [{ template: "approved-v1" }],
      }),
      { mode: 0o600 },
    );
    const result = spawnSync(process.execPath, ["dist/main.js", filename], {
      encoding: "utf8",
    });
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.equal(result.stderr.includes(secret), false);
    const diagnostic = JSON.parse(result.stderr);
    assert.equal(diagnostic.code, "PlatformStartupRejected");
    assert.equal(diagnostic.stage, "configuration");
    assert.equal(diagnostic.effect, "not-submitted");
    assert.match(diagnostic.nextAction, /environment template/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
