import {readFileSync, writeFileSync} from 'node:fs';
const json=p=>JSON.parse(readFileSync(p,'utf8'));
const pkg=json('packages/multi-tenant/package.json');
const pack=json('candidate/pack.json')[0];
const image=json('candidate/image.json');
writeFileSync('candidate/candidate.json',JSON.stringify({repository:process.env.GITHUB_REPOSITORY,commit:process.env.GITHUB_SHA,runId:process.env.GITHUB_RUN_ID,version:pkg.version,package:{name:pkg.name,filename:pack.filename,integrity:pack.integrity},platformImage:'ghcr.io/guomonth/dsh-multi-tenant@'+image['containerimage.digest'],dsh:pkg.dshRuntime,connector:json('vendor/environment-connector.json')},null,2)+'\n');
