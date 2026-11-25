import { writeFileSync } from 'node:fs'
import { readJson, list, record, requiredEnv, string } from './json.ts'
const pkg = record(readJson('packages/multi-tenant/package.json'), 'platform package')
const pack = record(list(readJson('candidate/pack.json'), 'npm pack result')[0], 'package archive')
const image = record(readJson('candidate/image.json'), 'image build metadata')
writeFileSync('candidate/candidate.json', JSON.stringify({
  repository: requiredEnv('GITHUB_REPOSITORY'),
  commit: requiredEnv('GITHUB_SHA'),
  runId: requiredEnv('GITHUB_RUN_ID'),
  version: pkg.version,
  package: {
    name: pkg.name, filename: pack.filename, integrity: pack.integrity,
  }, platformImage: 'ghcr.io/guomonth/dsh-multi-tenant@' + string(image['containerimage.digest'], 'platform image digest'), dsh: pkg.dshRuntime, connector: readJson('vendor/environment-connector.json'),
}, null, 2) + '\n')
