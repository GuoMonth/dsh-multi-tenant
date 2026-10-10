import test from "node:test";
import assert from "node:assert/strict";
import { releasePolicy, releaseCreateArgs, assertPublishedTags, assertPairedRuntimeRelease } from "./release-policy.mjs";

test("RC publication opts in through next and cannot become a default GitHub or npm release", () => {
  const policy = releasePolicy("0.10.0-rc.1");
  assert.equal(policy.channel, "next");
  const args = releaseCreateArgs(policy, "notes.md", ["package.tgz"]);
  assert.ok(args.includes("--prerelease"));
  assert.ok(args.includes("--latest=false"));
  assert.ok(!args.includes("--latest"));
  const tags = { next: policy.version, latest: "0.10.0-alpha.1" };
  assert.doesNotThrow(() => assertPublishedTags(tags, policy, tags.latest));
  assert.throws(() => assertPublishedTags({ ...tags, latest: policy.version }, policy, tags.latest));
  assert.throws(() => assertPublishedTags({ ...tags, next: "0.1.0-rc.2" }, policy, tags.latest));
});

test("stable and alpha channels are explicit; malformed or ambiguous versions are rejected", () => {
  const stable = releasePolicy("0.10.0");
  assert.equal(stable.channel, "latest");
  assert.ok(releaseCreateArgs(stable, "notes.md", []).includes("--latest"));
  assert.equal(releasePolicy("0.10.0-alpha.2").channel, "alpha");
  for (const version of ["v0.10.0", "0.10.0-rc", "0.10.0-rc.01", "0.10.0-canary.1", "01.10.0", "0.10.0+build"])
    assert.throws(() => releasePolicy(version));
});

test("a paired source tag alone cannot substitute an incorrect image, upstream, Connector or platform", () => {
  const expected = {
    version: "0.4.0-rc.1", tag: "v0.4.0-rc.1", repository: "GuoMonth/dsh-isolated-runtime",
    commit: "a".repeat(40), workloadImage: `ghcr.io/guomonth/dsh-isolated-runtime@sha256:${"b".repeat(64)}`,
    dsh: { version: "0.2.0-rc.2", commit: "c".repeat(40) },
    connector: { repository: "GuoMonth/dsh-isolated-runtime", commit: "d".repeat(40), artifact: "connector.tgz", sha256: "e".repeat(64), integrity: "sha512-proof" },
    platform: { version: "0.10.0-rc.1", source: "f".repeat(40), release: "https://github.com/GuoMonth/dsh-multi-tenant/releases/tag/v0.10.0-rc.1" },
  };
  assert.doesNotThrow(() => assertPairedRuntimeRelease(structuredClone(expected), expected));
  for (const key of ["version", "commit", "workloadImage"])
    assert.throws(() => assertPairedRuntimeRelease({ ...expected, [key]: "other" }, expected));
  for (const key of ["dsh", "connector", "platform"])
    assert.throws(() => assertPairedRuntimeRelease({ ...expected, [key]: {} }, expected));
});
