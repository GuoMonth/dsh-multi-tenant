import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { anchors, checkDocs } from "./check-docs.mjs";

function fixture(t, files) {
  const root = mkdtempSync(join(tmpdir(), "dsh-docs-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(join(root, name, ".."), { recursive: true });
    writeFileSync(join(root, name), text);
  }
  return root;
}

test("detects removed files and renamed anchors, ignores code examples", (t) => {
  const root = fixture(t, {
    "guide.md": "# Guide\n[old](removed.md)\n[heading](guide.md#old)\n```sh\n[x](not-a-link.md)\n```\n",
  });
  const { errors } = checkDocs(root);
  assert.equal(errors.length, 2);
  assert.ok(errors.some((e) => e.includes("missing link")));
  assert.ok(errors.some((e) => e.includes("missing heading")));
});

test("checks both sides of a cross-repository link", (t) => {
  const runtime = fixture(t, { "contract.md": "# Identity\n" });
  const platform = fixture(t, {
    "guide.md": "[contract](https://github.com/GuoMonth/dsh-isolated-runtime/blob/main/contract.md#identity)\n[old](https://github.com/GuoMonth/dsh-isolated-runtime/blob/main/deleted.md)\n",
  });
  const { errors } = checkDocs(platform, { "dsh-isolated-runtime": runtime });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /deleted.md/);
});

test("rejects English copied into Chinese and divergent commands/versions", (t) => {
  const root = fixture(t, {
    "docs/en/guide.md": "# Guide\n[简体中文](../zh-CN/guide.md)\nVersion 1.2.3\n```sh\nmake verify\n```\n",
    "docs/zh-CN/guide.md": "# Guide\n[English](../en/guide.md)\nVersion 1.2.4\n```sh\nmake build\n```\n",
  });
  const { errors } = checkDocs(root);
  assert.ok(errors.some((e) => e.includes("Chinese prose")));
  assert.ok(errors.some((e) => e.includes("code examples differ")));
  assert.ok(errors.some((e) => e.includes("versions differ")));
});

test("heading slugs preserve Chinese and distinguish repeated headings", () => {
  assert.deepEqual([...anchors("# 数据与身份\n## Stop / Start\n## Stop / Start\n")], ["数据与身份", "stop--start", "stop--start-1"]);
});
