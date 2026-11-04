import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DSH_TARGET } from "./dsh-target.mjs";
import { releasePolicy } from "./release-policy.mjs";

const text = (root, path) => readFileSync(resolve(root, path), "utf8");
const scalar = (body, key) =>
  body.match(new RegExp(`^${key}:\\s*(\\S+)\\s*$`, "m"))?.[1]?.replace(/^["']|["']$/g, "");

/** Source text the consumer smoke must use so its expected version cannot diverge. */
export const DSH_SMOKE_ASSERT =
  "assert.equal(sdk.DSH_RUNTIME_VERSION,${JSON.stringify(DSH_TARGET.version)})";

export function assertDshPin(root = process.cwd()) {
  const pkg = JSON.parse(text(root, "packages/multi-tenant/package.json"));
  const pin = { version: DSH_TARGET.version, commit: DSH_TARGET.commit };
  assert.deepEqual(pkg.dshRuntime, pin, "package dshRuntime must match scripts/dsh-target.mjs");
  const sources = JSON.parse(text(root, "charts/dsh-platform/files/sources.json"));
  assert.deepEqual(sources.dsh, pin, "sources.json dsh must match scripts/dsh-target.mjs");
  const chart = text(root, "charts/dsh-platform/Chart.yaml");
  assert.equal(scalar(chart, "appVersion"), DSH_TARGET.version, "Chart appVersion is the DSH pin");
  const chartVersion = scalar(chart, "version");
  assert.ok(chartVersion, "Chart version is required");
  assert.notEqual(chartVersion, DSH_TARGET.version, "Chart version is the chart revision, not the DSH pin");
  assert.notEqual(chartVersion, pkg.version, "Chart version is not the platform npm version");
  const exported = text(root, "packages/multi-tenant/src/index.ts").match(
    /export const DSH_RUNTIME_VERSION = "([^"]*)"/,
  )?.[1];
  assert.equal(exported, DSH_TARGET.version, "DSH_RUNTIME_VERSION must match scripts/dsh-target.mjs");
  const smoke = text(root, "scripts/artifact-consumer-smoke.mjs");
  assert.equal(smoke.includes(DSH_TARGET.version), false, "smoke must not copy the DSH version literal");
  assert.equal(smoke.includes(DSH_TARGET.commit), false, "smoke must not copy the DSH commit literal");
  assert.ok(smoke.includes(DSH_SMOKE_ASSERT), "smoke must assert sdk.DSH_RUNTIME_VERSION from scripts/dsh-target.mjs");
  return pkg;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const pkg = assertDshPin();
  const pin = JSON.parse(text(process.cwd(), "vendor/environment-connector.json"));
  assert.equal(pkg.publishConfig.tag, releasePolicy(pkg.version).channel);
  assert.deepEqual(Object.keys(pkg.exports), ["."]);
  assert.deepEqual(pkg.bin, { "dsh-multi-tenant": "dist/cli.mjs" });
  const archive = readFileSync("vendor/" + pin.artifact);
  assert.equal(createHash("sha256").update(archive).digest("hex"), pin.sha256);
  assert.equal(
    "sha512-" + createHash("sha512").update(archive).digest("base64"),
    pin.integrity,
  );
  const source = JSON.parse(
    execFileSync(
      "tar",
      ["-xOf", "vendor/" + pin.artifact, "package/source.json"],
      { encoding: "utf8" },
    ),
  );
  assert.equal(source.repository, pin.repository);
  assert.equal(source.commit, pin.commit);
  assert.equal(
    pkg.devDependencies["@dsh/environment-connector-internal"],
    "file:../../vendor/" + pin.artifact,
  );
  assert.ok(readFileSync("docs/en/release-notes.md", "utf8").startsWith(`# ${pkg.version}\n`));
  assert.ok(!readdirSync("vendor").some((n) => n.includes("cell")));
  console.log(
    "Exact DSH/connector pin, public exports and release-note version verified",
  );
}
