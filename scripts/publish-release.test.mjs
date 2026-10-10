import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const publisher = fileURLToPath(new URL("./publish-release.mjs", import.meta.url));
function fixture(wrongImage = false) {
  const root = mkdtempSync(join(tmpdir(), "dsh-publication-test-"));
  const write = (path, data) => {
    mkdirSync(resolve(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), data);
  };
  const save = (path, data) => write(path, JSON.stringify(data));
  const commit = "a".repeat(40), runtimeCommit = "b".repeat(40);
  const dsh = { version: "0.2.0-rc.2", commit: "c".repeat(40) };
  const connector = { repository: "GuoMonth/dsh-isolated-runtime", commit: "d".repeat(40), artifact: "connector.tgz", sha256: "e".repeat(64), integrity: "sha512-connector" };
  const bytes = Buffer.from("accepted archive fixture");
  const integrity = "sha512-" + createHash("sha512").update(bytes).digest("base64");
  const platformImage = "ghcr.io/guomonth/dsh-multi-tenant@sha256:" + "e".repeat(64);
  const workloadImage = "ghcr.io/guomonth/dsh-isolated-runtime@sha256:" + "f".repeat(64);
  const platform = { repository: "GuoMonth/dsh-multi-tenant", commit, version: "0.10.0-rc.1", package: { name: "dsh-multi-tenant", filename: "dsh-multi-tenant-0.10.0-rc.1.tgz", integrity }, platformImage, dsh, connector };
  const runtime = { repository: "GuoMonth/dsh-isolated-runtime", commit: runtimeCommit, version: "0.4.0-rc.1", workloadImage, dsh };
  const manifest = { ...runtime, tag: "v0.4.0-rc.1", connector, platform: { version: platform.version, source: commit, release: "https://github.com/GuoMonth/dsh-multi-tenant/releases/tag/v0.10.0-rc.1" } };
  if (wrongImage) manifest.workloadImage = workloadImage.replace(/f/g, "0");
  save("packages/multi-tenant/package.json", { name: "dsh-multi-tenant", version: platform.version, publishConfig: { tag: "next" }, dshRuntime: dsh });
  save("vendor/environment-connector.json", connector);
  save("publication/platform/candidate.json", platform);
  save("publication/runtime/candidate.json", runtime);
  write("publication/platform/" + platform.package.filename, bytes);
  save("charts/dsh-platform/files/sources.json", { core: { image: "controller@sha256:proof" } });
  write("docs/en/release-notes.md", "# 0.10.0-rc.1\n[Guide](https://github.com/GuoMonth/dsh-multi-tenant/blob/main/docs/en/index.md)\n");
  save("runtime-manifest.json", manifest);
  write("runtime-validation.md", [commit, runtimeCommit, integrity, platformImage, workloadImage].join("\n") + "\n");
  save("state.json", { npm: false, release: false });
  const cli = `#!/usr/bin/env node
import {readFileSync,writeFileSync,appendFileSync} from 'node:fs';
import {basename} from 'node:path';
const args=process.argv.slice(2),cmd=basename(process.argv[1]);
appendFileSync('calls.jsonl',JSON.stringify({cmd,args})+'\\n');
const state=JSON.parse(readFileSync('state.json'));
const platform=JSON.parse(readFileSync('publication/platform/candidate.json'));
const runtime=JSON.parse(readFileSync('publication/runtime/candidate.json'));
const emit=value=>process.stdout.write(JSON.stringify(value));
if(cmd==='npm'){if(!args.includes('--dry-run')){state.npm=true;writeFileSync('state.json',JSON.stringify(state));}}
else if(cmd==='git'){if(args[0]==='ls-remote'&&state.release)process.stdout.write(platform.commit+'\\trefs/tags/v0.10.0-rc.1');}
else if(args[0]==='run'){}
else if(args[0]==='release'){
 if(args[1]==='list')emit(state.release?[{tagName:'v0.10.0-rc.1'}]:[]);
 else if(args[1]==='create'){state.release=true;writeFileSync('state.json',JSON.stringify(state));}
 else if(args[1]==='view')emit({assets:[{name:platform.package.filename},{name:'release.json'},{name:'SHA256SUMS'},{name:'validation.md'}]});
}
else if(args[0]==='api'){
 const path=args[1];
 if(path.includes('/actions/runs/'))emit({conclusion:'success',head_branch:'main',event:'workflow_dispatch',path:'.github/workflows/prepare-release.yml',head_sha:path.includes('dsh-isolated-runtime')?runtime.commit:platform.commit});
 else if(path.includes('/git/ref/'))emit({object:{type:'commit',sha:runtime.commit}});
 else if(path.endsWith('/releases/latest'))emit({id:123});
 else if(path.includes('/releases/assets/')){
  const id=path.split('/').at(-1),files={'1':'runtime-manifest.json','2':'runtime-validation.md','3':'publication/platform/'+platform.package.filename,'4':'publication/release.json','5':'publication/SHA256SUMS','6':'publication/validation.md'};
  process.stdout.write(readFileSync(files[id]));
 }
 else if(path.includes('dsh-isolated-runtime'))emit({draft:false,prerelease:true,html_url:'https://github.com/GuoMonth/dsh-isolated-runtime/releases/tag/v0.4.0-rc.1',assets:[{id:1,name:'runtime-release.json'},{id:2,name:'validation.md'}]});
 else emit({draft:false,prerelease:true,assets:[{id:3,name:platform.package.filename},{id:4,name:'release.json'},{id:5,name:'SHA256SUMS'},{id:6,name:'validation.md'}]});
}
`;
  for (const name of ["gh", "git", "npm"]) { write("bin/" + name, cli); execFileSync("chmod", ["+x", join(root, "bin", name)]); }
  write("fetch.mjs", `import {readFileSync} from 'node:fs';
globalThis.fetch=async url=>{
 const state=JSON.parse(readFileSync('state.json'));
 const pkg=JSON.parse(readFileSync('publication/platform/candidate.json'));
 if(url.includes('/dist-tags'))return Response.json({latest:'0.10.0-alpha.1',next:state.npm?pkg.version:'0.1.0-rc.2'});
 if(url==='https://registry.test/archive')return new Response(readFileSync('publication/platform/'+pkg.package.filename));
 return state.npm?Response.json({dist:{integrity:pkg.package.integrity,tarball:'https://registry.test/archive'}}):new Response('',{status:404});
};`);
  return {
    root,
    run: () => execFileSync(process.execPath, ["--import", join(root, "fetch.mjs"), publisher], {
      cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, PATH: join(root, "bin") + ":" + process.env.PATH, GITHUB_REF: "refs/heads/main", GITHUB_REPOSITORY: platform.repository, GITHUB_SHA: commit, PLATFORM_RUN: "1", RUNTIME_RUN: "2", PACKAGE_INTEGRITY: integrity, WORKLOAD_DIGEST: "sha256:" + "f".repeat(64), RUNTIME_TAG: manifest.tag },
    }),
    calls: () => readFileSync(join(root, "calls.jsonl"), "utf8").trim().split("\n").map(line => JSON.parse(line)),
  };
}

test("publisher creates only an opted-in RC and can resume without publishing or overwriting it again", () => {
  const f = fixture();
  try {
    assert.match(f.run(), /on next/);
    const calls = f.calls();
    const publishes = calls.filter(call => call.cmd === "npm" && !call.args.includes("--dry-run"));
    assert.equal(publishes.length, 1);
    assert.equal(publishes[0].args[publishes[0].args.indexOf("--tag") + 1], "next");
    const creation = calls.find(call => call.cmd === "gh" && call.args[0] === "release" && call.args[1] === "create");
    assert.ok(creation.args.includes("--prerelease"));
    assert.ok(creation.args.includes("--latest=false"));
    assert.match(f.run(), /on next/);
    assert.equal(f.calls().filter(call => call.cmd === "npm" && !call.args.includes("--dry-run")).length, 1);
    assert.equal(f.calls().filter(call => call.cmd === "gh" && call.args[1] === "create").length, 1);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("publisher refuses a mismatched runtime release before npm, tag or release writes", () => {
  const f = fixture(true);
  try {
    assert.throws(f.run, /Command failed/);
    assert.ok(!f.calls().some(call => call.cmd === "npm" || call.cmd === "git" || call.args[0] === "release"));
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});
