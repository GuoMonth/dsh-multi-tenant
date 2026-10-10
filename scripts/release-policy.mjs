import assert from "node:assert/strict";

export function releasePolicy(version) {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(alpha|beta|rc)\.(0|[1-9]\d*))?$/.exec(version);
  assert.ok(match, "Use a stable version or alpha/beta/rc.N");
  const stage = match[4] ?? "stable";
  return {
    version,
    tag: `v${version}`,
    stage,
    channel: stage === "stable" ? "latest" : stage === "alpha" ? "alpha" : "next",
    prerelease: stage !== "stable",
  };
}

export function releaseCreateArgs(policy, notes, assets) {
  return ["release", "create", policy.tag, "--verify-tag",
    ...(policy.prerelease ? ["--prerelease", "--latest=false"] : ["--latest"]),
    "--title", policy.tag, "--notes-file", notes, ...assets];
}

export function assertPublishedTags(tags, policy, previousLatest) {
  assert.equal(tags[policy.channel], policy.version, "Published channel must resolve to the accepted version");
  if (policy.prerelease) assert.equal(tags.latest, previousLatest, "Prerelease must preserve the default npm version");
}

export function assertPairedRuntimeRelease(manifest, expected) {
  for (const key of ["version", "tag", "repository", "commit", "workloadImage"])
    assert.equal(manifest[key], expected[key], `Runtime release ${key} differs from the accepted candidate`);
  assert.deepEqual(manifest.dsh, expected.dsh, "Runtime DSH identity differs");
  for (const key of ["repository", "commit", "artifact", "sha256", "integrity"])
    assert.equal(manifest.connector?.[key], expected.connector[key], `Runtime Connector ${key} differs`);
  assert.deepEqual(manifest.platform, expected.platform, "Runtime must name this exact paired platform release");
}
