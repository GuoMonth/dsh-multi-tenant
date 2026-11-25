// Real runtime contracts using the exact Connector bundled by the candidate.
// Requires the dedicated qualification cluster created by qualify-release.ts.
import assert from 'node:assert/strict'
import { execFileSync, type ExecFileSyncOptions } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createRequire } from 'node:module'
import { parseJson, readJson, record, requiredEnv, string } from '../../scripts/json.ts'

const privateRoot = requiredEnv('E_PRIVATE'), evidence = requiredEnv('E_EVIDENCE')
const kubeconfig = requiredEnv('KUBECONFIG'), source = requiredEnv('RUNTIME_SOURCE'), namespace = 'dsh-mvp-b-platform'
type CommandOptions = Pick<ExecFileSyncOptions, 'env' | 'input'>
const run = (command: string, args: readonly string[], options: CommandOptions = {}) => execFileSync(command, args, { encoding: 'utf8', timeout: 720000, maxBuffer: 16 * 1024 * 1024, ...options })
const k = (args: readonly string[], options?: CommandOptions) => run('kubectl', ['--kubeconfig', kubeconfig, ...args], options)
assert.equal(k(['config', 'current-context']).trim(), 'kind-dsh-environment')
const pin = record(readJson('vendor/environment-connector.json'), 'Connector provenance')
const filename = string(pin.artifact, 'Connector filename')
const archive = readFileSync(resolve('vendor', filename))
assert.equal(createHash('sha256').update(archive).digest('hex'), pin.sha256)
const image = string(record(readJson(resolve(evidence, 'images.json')), 'accepted images').workloadImage, 'workload image')
const options = {
  kubernetes: {
    server: 'https://kubernetes.default.svc',
    caFile: '/var/run/secrets/kubernetes.io/serviceaccount/ca.crt',
    tokenFile: '/var/run/secrets/kubernetes.io/serviceaccount/token',
  },
  namespacePrefix: 'dsh-mvp-b-user', domain: 'dsh-environment.test', image,
  storage: { size: '1Gi', storageClassName: 'standard' },
  resources: { requests: { cpu: '100m', memory: '256Mi' }, limits: { cpu: '1', memory: '1Gi' } },
  platformNamespace: namespace,
}
const role = readFileSync(resolve(source, 'config/runtime/cluster-role.yaml'), 'utf8').match(/^  name: (\S+)$/m)?.[1]
assert.ok(role, 'Runtime ClusterRole name is required')
const items = [
  { apiVersion: 'v1', kind: 'Namespace', metadata: { name: namespace } },
  { apiVersion: 'v1', kind: 'ServiceAccount', metadata: { name: 'probe', namespace } },
  {
    apiVersion: 'rbac.authorization.k8s.io/v1', kind: 'ClusterRoleBinding', metadata: { name: 'dsh-mvp-b-probe' },
    roleRef: { apiGroup: 'rbac.authorization.k8s.io', kind: 'ClusterRole', name: role },
    subjects: [{ kind: 'ServiceAccount', name: 'probe', namespace }],
  },
  {
    apiVersion: 'v1', kind: 'Pod', metadata: { name: 'probe', namespace, labels: { 'app.kubernetes.io/name': 'dsh-platform' } },
    spec: {
      serviceAccountName: 'probe', restartPolicy: 'Never',
      securityContext: { runAsUser: 1000, runAsGroup: 1000, fsGroup: 1000, seccompProfile: { type: 'RuntimeDefault' } },
      containers: [{ name: 'probe', image, imagePullPolicy: 'IfNotPresent', command: ['node', '-e', 'setInterval(()=>{},1000)'] }],
    },
  },
]
k(['apply', '-f', '-'], { input: JSON.stringify({ apiVersion: 'v1', kind: 'List', items }) })
k(['wait', '-n', namespace, 'pod/probe', '--for=condition=Ready', '--timeout=180s'])
const exec = (args: readonly string[]) => ['exec', '-n', namespace, 'probe', '--', ...args]
k(exec(['mkdir', '-p', '/tmp/connector', '/tmp/node_modules/zod']))
const unpack = resolve(privateRoot, 'connector')
mkdirSync(unpack)
run('tar', ['-xzf', resolve('vendor', filename), '-C', unpack])
const transfer = (directory: string, target: string) => {
  const bytes = execFileSync('tar', ['-czf', '-', '-C', directory, '.'], { timeout: 720000, maxBuffer: 16 * 1024 * 1024 })
  k(['exec', '-i', '-n', namespace, 'probe', '--', 'tar', '-xzf', '-', '-C', target], { input: bytes })
}
transfer(resolve(unpack, 'package/dist'), '/tmp/connector')
const require = createRequire(new URL('../../packages/multi-tenant/package.json', import.meta.url))
transfer(resolve(require.resolve('zod/package.json'), '..'), '/tmp/node_modules/zod')
const files: Record<string, string | Buffer> = {
  '/tmp/connector/package.json': JSON.stringify({ type: 'module' }),
  '/tmp/options.json': JSON.stringify(options),
  '/tmp/fault.key': readFileSync(resolve(privateRoot, 'tls.key')),
  // The fault client trusts this bundle too; the signed leaf needs its private root.
  '/tmp/fault.crt': Buffer.concat([readFileSync(resolve(privateRoot, 'tls.crt')), readFileSync(resolve(privateRoot, 'ca.crt'))]),
}
for (const name of ['lifecycle', 'scenarios', 'access', 'action'])
  files[`/tmp/${name}.mjs`] = readFileSync(resolve(source, `test/environment/${name}.mjs`))
for (const [path, contents] of Object.entries(files))
  k(['exec', '-i', '-n', namespace, 'probe', '--', 'node', '-e', 'require("node:fs").writeFileSync(process.argv[1],require("node:fs").readFileSync(0),{mode:0o600})', path], { input: contents })
const events: unknown[] = []
const node = (name: string, variables: Record<string, string> = {}) => {
  const output = k(exec(['env', ...Object.entries(variables).map(([key, value]) => `${key}=${value}`), 'node', `/tmp/${name}.mjs`]))
  for (const line of output.trim().split('\n'))
    if (line.startsWith('{')) events.push(parseJson(line))
  writeFileSync(resolve(evidence, 'runtime-events.json'), JSON.stringify(events, null, 2) + '\n')
}
const action = (name: string) => k(exec(['node', '/tmp/action.mjs', name]))
const host = (name: string) => run('python3', [resolve(source, `test/environment/${name}.py`)], { env: { ...process.env, EVIDENCE: evidence } })
node('lifecycle', { ALLOCATION: 'b-lifecycle-release' })
action('stop')
node('scenarios')
node('access')
host('background')
host('rebuild')
host('network')
node('access', { RESUME_SESSION: '1', ASSERT_MODEL_CONFIG: '1' })
action('start')
host('aged-writer')
node('lifecycle', { ALLOCATION: 'b-volume-fault-1' })
action('stop')
host('volume-fault')
console.log(JSON.stringify({ runtimeContracts: 'passed', connector: pin, image }))
