import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DSH_TARGET } from "./dsh-target.mjs";
import { assertDshPin, DSH_SMOKE_ASSERT } from "./verify-packages.mjs";

function tree(mutate) {
  const root = mkdtempSync(join(tmpdir(), "dsh-pin-"));
  const pin = { version: DSH_TARGET.version, commit: DSH_TARGET.commit };
  const files = {
    "packages/multi-tenant/package.json": JSON.stringify({ version: "0.12.0-rc.1", dshRuntime: pin }),
    "charts/dsh-platform/files/sources.json": JSON.stringify({ dsh: pin }),
    "charts/dsh-platform/Chart.yaml": `apiVersion: v2\nname: dsh-platform\nversion: 0.1.0\nappVersion: ${pin.version}\n`,
    "packages/multi-tenant/src/index.ts": `export const DSH_RUNTIME_VERSION = "${pin.version}";\n`,
    "scripts/artifact-consumer-smoke.mjs": `import { DSH_TARGET } from "./dsh-target.mjs";\n${DSH_SMOKE_ASSERT};\n`,
  };
  mutate?.(files);
  for (const [name, body] of Object.entries(files)) {
    mkdirSync(join(root, name, ".."), { recursive: true });
    writeFileSync(join(root, name), body);
  }
  return root;
}

test("DSH copies match the single dsh-target pin", () => {
  const root = tree();
  try {
    assert.equal(assertDshPin(root).dshRuntime.commit, DSH_TARGET.commit);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Chart appVersion, the public constant and smoke cannot drift from dsh-target", () => {
  const drifted = [
    [(files) => { files["charts/dsh-platform/Chart.yaml"] = "version: 0.1.0\nappVersion: 0.0.0-rc.9\n"; }, /Chart appVersion/],
    [(files) => {
      const sources = JSON.parse(files["charts/dsh-platform/files/sources.json"]);
      sources.dsh.commit = "0".repeat(40);
      files["charts/dsh-platform/files/sources.json"] = JSON.stringify(sources);
    }, /sources\.json/],
    [(files) => { files["packages/multi-tenant/src/index.ts"] = 'export const DSH_RUNTIME_VERSION = "0.0.0-rc.9";\n'; }, /DSH_RUNTIME_VERSION/],
    [(files) => { files["scripts/artifact-consumer-smoke.mjs"] = `assert.equal(sdk.DSH_RUNTIME_VERSION,'${DSH_TARGET.version}');\n`; }, /smoke must not copy/],
    [(files) => { files["charts/dsh-platform/Chart.yaml"] = `version: ${DSH_TARGET.version}\nappVersion: ${DSH_TARGET.version}\n`; }, /chart revision/],
    [(files) => {
      const pkg = JSON.parse(files["packages/multi-tenant/package.json"]);
      files["charts/dsh-platform/Chart.yaml"] = `version: ${pkg.version}\nappVersion: ${DSH_TARGET.version}\n`;
    }, /platform npm version/],
  ];
  for (const [mutate, message] of drifted) {
    const root = tree(mutate);
    try {
      assert.throws(() => assertDshPin(root), message);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});
