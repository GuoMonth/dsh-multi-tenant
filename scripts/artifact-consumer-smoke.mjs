import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import assert from "node:assert/strict";
const dir = mkdtempSync(join(tmpdir(), "dsh-platform-consumer-"));
const run = (cmd, args, cwd = dir) =>
  execFileSync(cmd, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
try {
  run("npm", [
    "pack",
    resolve("packages/multi-tenant"),
    "--pack-destination",
    dir,
    "--ignore-scripts",
  ]);
  const archive = join(
    dir,
    readdirSync(dir).find((n) => n.endsWith(".tgz")),
  );
  const files = run("tar", ["-tzf", archive]);
  assert.doesNotMatch(
    files,
    /cell-platform|cell-admin|runtime\/|src\/native|experience\/|examples\//,
  );
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({ private: true, type: "module" }),
  );
  run("npm", [
    "install",
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
    archive,
  ]);
  run("npm", [
    "install",
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
    "--save-dev",
    "typescript@6.0.3",
    "@types/node@22.20.1",
  ]);
  writeFileSync(
    join(dir, "consumer.mts"),
    `import { type AgentEnvironmentRuntime, type EnvironmentRuntimeOptions, EnvironmentBindingStore, createEnvironmentControl } from 'dsh-multi-tenant';
declare const runtime: AgentEnvironmentRuntime;
declare const options: EnvironmentRuntimeOptions;
const store = new EnvironmentBindingStore('/private/state.sqlite');
createEnvironmentControl(runtime, store);
options.storage.size satisfies string;
`,
  );
  run(process.execPath, [
    join(dir, "node_modules/typescript/bin/tsc"),
    "--noEmit",
    "--strict",
    "--skipLibCheck",
    "--target",
    "ES2024",
    "--module",
    "NodeNext",
    "--moduleResolution",
    "NodeNext",
    "consumer.mts",
  ]);
  const exports = run(process.execPath, [
    "--input-type=module",
    "-e",
    `import * as sdk from 'dsh-multi-tenant'; import assert from 'node:assert/strict'; assert.equal(sdk.DSH_RUNTIME_VERSION,'0.2.0-rc.2'); assert.equal(typeof sdk.EnvironmentBindingStore,'function'); assert.ok(!('DockerRuntimeProvider' in sdk)); assert.ok(!('DomainRuntimeCoordinator' in sdk)); console.log(Object.keys(sdk).join(','));`,
  ]);
  const cli = join(dir, "node_modules/dsh-multi-tenant/dist/cli.mjs");
  assert.match(run(process.execPath, [cli, "--help"]), /resume/);
  assert.match(run(process.execPath, [cli, "--version"]), /^0\./);
  assert.match(run(process.execPath, [cli, "--help"]), /preflight \| install/);
  const rendered = run(process.execPath, [cli, "render", "--values", resolve("integration/installation/fixture.values.json"), "--namespace", "dsh-package-smoke"]);
  assert.match(rendered, /"kind": "Deployment"/);
  assert.match(rendered, /"kind": "PersistentVolumeClaim"/);
  let rejected = false;
  try {
    run(process.execPath, [cli, "docker"]);
  } catch (e) {
    rejected = true;
    assert.match(e.stderr, /CLIStartupFailed/);
  }
  assert.ok(rejected);
  console.log(
    "Clean installed tarball import, bundled dependencies, CLI and deleted-backend rejection passed: " +
      exports.trim(),
  );
} finally {
  rmSync(dir, { recursive: true, force: true });
}
