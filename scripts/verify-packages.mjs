import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { DSH_TARGET } from "./dsh-target.mjs";
const read = (p) => JSON.parse(readFileSync(p, "utf8"));
const pkg = read("packages/multi-tenant/package.json"),
  pin = read("vendor/environment-connector.json");
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
assert.equal(
  pkg.devDependencies["@dsh/environment-connector-internal"],
  "file:../../vendor/" + pin.artifact,
);
for (const name of ["README.md", "README.zh-CN.md"])
  assert.equal(
    readFileSync(name, "utf8"),
    readFileSync("packages/multi-tenant/" + name, "utf8"),
  );
assert.ok(!readdirSync("vendor").some((n) => n.includes("cell")));
console.log(
  "Exact DSH/connector pin, public exports and README copies verified",
);
