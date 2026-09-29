import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
const run=(cmd,args)=>execFileSync(cmd,args,{encoding:'utf8',stdio:['ignore','pipe','inherit']}).trim();
const json=(cmd,args)=>JSON.parse(run(cmd,args));
const read=p=>JSON.parse(readFileSync(p,'utf8'));
const env=process.env;
assert.equal(env.GITHUB_REF,'refs/heads/main');
assert.equal(env.GITHUB_REPOSITORY,'GuoMonth/dsh-multi-tenant');
for(const key of ['PLATFORM_RUN','RUNTIME_RUN'])assert.match(env[key]??'',/^\d+$/);
assert.match(env.PACKAGE_INTEGRITY??'',/^sha512-[A-Za-z0-9+/]+={0,2}$/);
assert.match(env.WORKLOAD_DIGEST??'',/^sha256:[a-f0-9]{64}$/);
assert.match(env.RUNTIME_TAG??'',/^v\d+\.\d+\.\d+(?:-[a-z0-9.]+)?$/);
const runtimeRepo='GuoMonth/dsh-isolated-runtime';
for(const [repo,id] of [[env.GITHUB_REPOSITORY,env.PLATFORM_RUN],[runtimeRepo,env.RUNTIME_RUN]]){
 const r=json('gh',['api',`repos/${repo}/actions/runs/${id}`]);
 assert.equal(r.conclusion,'success');assert.equal(r.head_branch,'main');
 assert.equal(r.event,'workflow_dispatch');assert.equal(r.path,'.github/workflows/prepare-release.yml');
 if(repo===env.GITHUB_REPOSITORY)assert.equal(r.head_sha,env.GITHUB_SHA,'Candidate must be built from this exact source');
}
mkdirSync('publication',{recursive:true});
run('gh',['run','download',env.PLATFORM_RUN,'--repo',env.GITHUB_REPOSITORY,'--name','platform-candidate','--dir','publication/platform']);
run('gh',['run','download',env.RUNTIME_RUN,'--repo',runtimeRepo,'--name','runtime-candidate','--dir','publication/runtime']);
const p=read('publication/platform/candidate.json'),r=read('publication/runtime/candidate.json');
const pkg=read('packages/multi-tenant/package.json');
assert.equal(p.commit,env.GITHUB_SHA);assert.equal(p.version,pkg.version);
assert.equal(p.package.name,pkg.name);assert.equal(pkg.publishConfig.tag,'latest');
assert.equal(p.package.filename,`dsh-multi-tenant-${pkg.version}.tgz`);
const artifact=resolve('publication/platform',p.package.filename);
const bytes=readFileSync(artifact);
const integrity='sha512-'+createHash('sha512').update(bytes).digest('base64');
assert.equal(integrity,p.package.integrity);assert.equal(integrity,env.PACKAGE_INTEGRITY);
assert.equal(r.workloadImage,`ghcr.io/guomonth/dsh-isolated-runtime@${env.WORKLOAD_DIGEST}`);
assert.match(p.platformImage,/^ghcr\.io\/guomonth\/dsh-multi-tenant@sha256:[a-f0-9]{64}$/);
const runtimeRun=json('gh',['api',`repos/${runtimeRepo}/actions/runs/${env.RUNTIME_RUN}`]);
assert.equal(r.commit,runtimeRun.head_sha);
const rt=json('gh',['api',`repos/${runtimeRepo}/git/ref/tags/${env.RUNTIME_TAG}`]);
assert.equal(rt.object.type,'commit');assert.equal(rt.object.sha,r.commit);
const runtimeRelease=json('gh',['release','view',env.RUNTIME_TAG,'--repo',runtimeRepo,'--json','isDraft']);
assert.equal(runtimeRelease.isDraft,false);
const tag='v'+pkg.version;
const existingTag=run('git',['ls-remote','--tags','origin',`refs/tags/${tag}`]);
if(existingTag)assert.equal(existingTag.split(/\s/)[0],env.GITHUB_SHA,'Never move a published tag');
const sha256=createHash('sha256').update(bytes).digest('hex');
const release={version:pkg.version,tag,platform:p,runtime:{...r,tag:env.RUNTIME_TAG,release:`https://github.com/${runtimeRepo}/releases/tag/${env.RUNTIME_TAG}`},controller:read('charts/dsh-platform/files/sources.json').core.image,package:{name:pkg.name,version:pkg.version,integrity,sha256},validation:'Local exact-image two-user and model/tool acceptance required before dispatch; see release validation attachment.'};
writeFileSync('publication/release.json',JSON.stringify(release,null,2)+'\n');
writeFileSync('publication/SHA256SUMS',`${sha256}  ${p.package.filename}\n${createHash('sha256').update(readFileSync('publication/release.json')).digest('hex')}  release.json\n`);
const registry=`https://registry.npmjs.org/${pkg.name}/${pkg.version}`;
async function metadata(){const res=await fetch(`${registry}?release-check=${Date.now()}`,{signal:AbortSignal.timeout(20000)});if(res.status===404)return null;if(!res.ok)throw Error('Registry metadata HTTP '+res.status);return res.json();}
let published=await metadata();
if(published)assert.equal(published.dist.integrity,integrity,'Existing npm version differs; never overwrite');
else{
 run('npm',['publish','--dry-run','--ignore-scripts','--access','public','--tag','latest',artifact]);
 run('npm',['publish','--ignore-scripts','--access','public','--provenance','--tag','latest',artifact]);
}
for(let i=0;i<180;i++){
 published=await metadata();
 if(published?.dist?.integrity===integrity)break;
 await new Promise(resolve=>setTimeout(resolve,5000));
}
assert.equal(published?.dist?.integrity,integrity,'Registry publication not yet verified; resume this exact run');
const response=await fetch(published.dist.tarball,{signal:AbortSignal.timeout(60000)});
assert.equal(response.ok,true);
assert.equal('sha512-'+createHash('sha512').update(Buffer.from(await response.arrayBuffer())).digest('base64'),integrity);
const tags=await (await fetch(`https://registry.npmjs.org/-/package/${pkg.name}/dist-tags`)).json();
assert.equal(tags.latest,pkg.version);
if(!existingTag){run('git',['tag',tag,env.GITHUB_SHA]);run('git',['push','origin',tag]);}
const releases=json('gh',['release','list','--limit','100','--json','tagName']);
if(!releases.some(x=>x.tagName===tag))run('gh',['release','create',tag,'--verify-tag','--latest','--title',tag,'--notes-file',`docs/releases/${tag}.md`,artifact,'publication/release.json','publication/SHA256SUMS']);
else{
 const assets=json('gh',['release','view',tag,'--json','assets']).assets;
 const names=new Set(assets.map(x=>x.name));
 const missing=[artifact,'publication/release.json','publication/SHA256SUMS'].filter(x=>!names.has(x.split('/').at(-1)));
 if(missing.length)run('gh',['release','upload',tag,...missing]);
}
console.log(`Verified npm ${pkg.name}@${pkg.version}, lightweight ${tag}, and matching GitHub Release`);
