import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

test("release notes keep valid snapshot links when copied out of the source tree", () => {
  const commit = "b".repeat(40);
  for (const language of ["en", "zh-CN"]) {
    const notes = readFileSync(new URL(`../docs/${language}/release-notes.md`, import.meta.url), "utf8");
    const pinned = pinDocumentation(notes, commit);
    const targets = [...pinned.matchAll(/\]\(([^)]+)\)/g)].map(match => match[1]);
    assert.ok(targets.length > 0);
    assert.ok(targets.every(target => target.startsWith("https://")), "Release links must not depend on the Markdown file location");
    assert.ok(pinned.includes(`/blob/${commit}/docs/${language}/installation.md`));
    assert.ok(!pinned.includes("/blob/main/"));
  }
});
