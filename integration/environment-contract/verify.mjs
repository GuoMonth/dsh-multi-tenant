import { createRequire } from 'node:module'
import { readFileSync, readdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import assert from 'node:assert/strict'
const root = new URL('../../', import.meta.url)
const pin = JSON.parse(readFileSync(new URL('vendor/environment-connector.json', root)))
const archive = readFileSync(new URL('vendor/' + pin.artifact, root))
assert.equal('sha512-' + createHash('sha512').update(archive).digest('base64'), pin.integrity)
assert.equal(createHash('sha256').update(archive).digest('hex'), pin.sha256)
const require = createRequire(new URL('packages/multi-tenant/package.json', root))
execFileSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', `
  import assert from 'node:assert/strict'
  import { environmentTemplate } from '@dsh/environment-connector-internal'
  import { EnvironmentError, identities } from './src/environment-contract.ts'
  import { createKubernetesRuntime } from './src/platform/kubernetes.ts'
  import { options } from '../../integration/environment-contract/consumer.ts'

  const template = environmentTemplate({
    image: options.image, authority: options.domain, dataClaim: 'data', serviceAccount: 'workload', resources: options.resources,
  })
  assert.equal(template.spec.volumes.filter(volume => volume.persistentVolumeClaim).length, 1)
  assert.equal(template.spec.automountServiceAccountToken, false)

  const runtime = createKubernetesRuntime(options, 'example.test')
  const intent = { allocationKey: identities.allocationKey(''), owner: {
    tenantId: identities.tenantId('tenant'), principalId: identities.principalId('member'),
  } }
  await assert.rejects(runtime.inspectAllocation(intent, undefined, {
    correlationId: 'contract-check', signal: new AbortController().signal,
  }), error => {
    assert.ok(error instanceof EnvironmentError)
    assert.equal(error.failure.code, 'InvalidConfiguration')
    assert.equal(error.failure.effect, 'not-submitted')
    return true
  })
`], {
  cwd: new URL('packages/multi-tenant/', root), stdio: 'inherit',
})
execFileSync(process.execPath, [
  require.resolve('typescript/bin/tsc'), '--noEmit', '--strict', '--skipLibCheck', '--allowImportingTsExtensions',
  '--types', 'node', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', '--target', 'ES2024',
  fileURLToPath(new URL('consumer.ts', import.meta.url)),
], {
  stdio: 'inherit',
})
const removed = /ENVIRONMENT_TEMPLATE|dsh-rc2-single-pvc-v1/
const packagePath = fileURLToPath(new URL('packages/multi-tenant/', root))
const adapterPath = join(packagePath, 'src/platform/kubernetes.ts')
const walk = (directory) => {
  for (const entry of readdirSync(directory, {
    withFileTypes: true,
  })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'verify.mjs')
      continue
    const path = join(directory, entry.name)
    if (entry.isDirectory())
      walk(path)
    else if (/\.(?:mjs|cjs|ts|js)$/.test(entry.name)) {
      const source = readFileSync(path, 'utf8')
      assert.ok(!removed.test(source), 'Import environmentTemplate only: ' + path)
      if (path.startsWith(packagePath) && path !== adapterPath)
        assert.ok(!source.includes('@dsh/environment-connector-internal'), 'Connector import outside the reference adapter: ' + path)
    }
  }
}
for (const dir of ['packages/multi-tenant/src', 'packages/multi-tenant/tests', 'integration'])
  walk(fileURLToPath(new URL(dir, root)))
console.log('Standalone platform contract, exact Connector integrity and reference workload template verified')
