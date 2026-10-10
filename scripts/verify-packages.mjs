import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { DSH_TARGET } from "./dsh-target.mjs";
import { releasePolicy } from "./release-policy.mjs";
const read = (p) => JSON.parse(readFileSync(p, "utf8"));
const pkg = read("packages/multi-tenant/package.json"),
  pin = read("vendor/environment-connector.json");
assert.equal(pkg.publishConfig.tag, releasePolicy(pkg.version).channel);
assert.deepEqual(pkg.dshRuntime, {
  version: DSH_TARGET.version,
  commit: DSH_TARGET.commit,
});
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
