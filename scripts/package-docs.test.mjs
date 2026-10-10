import test from "node:test";
import assert from "node:assert/strict";
import { pinDocumentation } from "./package-docs.mjs";

test("package links use the source snapshot while releases and upstream links retain their identity", () => {
  const commit = "a".repeat(40);
  const text = "[中文](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/docs/zh-CN/index.md)\n[release](https://github.com/GuoMonth/dsh-multi-tenant/releases/tag/v0.10.0-alpha.1)\n[runtime](https://github.com/GuoMonth/dsh-isolated-runtime)\n";
  const pinned = pinDocumentation(text, commit);
  assert.match(pinned, new RegExp(`/blob/${commit}/docs/zh-CN/index.md`));
  assert.ok(pinned.includes("/releases/tag/v0.10.0-alpha.1"));
  assert.ok(pinned.includes("https://github.com/GuoMonth/dsh-isolated-runtime"));
  assert.throws(() => pinDocumentation(text, "main"));
});
