// Dedicated, disposable AMD64 acceptance. Product bytes come from main's
// prepared artifacts; this checkout supplies only the qualification harness.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { z } from 'zod'
import { parseJson, readJson, requiredEnv } from '../../scripts/json.ts'
import { assertPrepareRun, readPlatformCandidate, readRuntimeCandidate } from '../../scripts/release-inputs.ts'
import { dockerNodeAddress, readUsers } from './fixture.ts'
import { createHash, randomBytes } from 'node:crypto'
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { releasePolicy } from '../../scripts/release-policy.ts'

const root = resolve(requiredEnv('QUALIFICATION_ROOT'))
const privateRoot = resolve(root, 'private'), evidence = resolve(root, 'evidence')
for (const directory of [root, privateRoot, evidence])
  mkdirSync(directory, { recursive: true, mode: 0o700 })
const env = { ...process.env }
let stage = 'candidate-verification', call = 0
const run = (command: string, args: readonly string[], options: { input?: string } = {}): string => {
  try {
    return execFileSync(command, args, {
      encoding: 'utf8', timeout: 720000, maxBuffer: 16 * 1024 * 1024, env, ...options,
      // execFileSync otherwise forwards a failed child's stderr before our redaction.
      stdio: ['pipe', 'pipe', 'pipe'],
    })
  }
  catch (error) {
    const path = resolve(privateRoot, `failure-${++call}-${basename(command)}.log`)
    const stdout = error instanceof Error && 'stdout' in error && typeof error.stdout === 'string' ? error.stdout : ''
    const stderr = error instanceof Error && 'stderr' in error && typeof error.stderr === 'string' ? error.stderr : ''
    writeFileSync(path, `${stdout}\n${stderr}`, { mode: 0o600 })
    throw new Error(`${stage}: ${command} ${args[0] || ''} failed; private diagnostic ${basename(path)}`)
  }
}
const write = (name: string, value: unknown) => {
  const path = resolve(evidence, name), text = JSON.stringify(value, null, 2) + '\n'
  if (existsSync(path)) assert.equal(readFileSync(path, 'utf8'), text, 'Use a fresh qualification root; evidence is immutable')
  else writeFileSync(path, text)
}
assert.ok(!existsSync(resolve(evidence, 'qualification.json')), 'Choose a new root for each qualification attempt')
const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')
const runIDs = { platform: requiredEnv('PLATFORM_RUN'), runtime: requiredEnv('RUNTIME_RUN') }
for (const value of Object.values(runIDs))
  assert.match(value, /^\d+$/, 'Explicit platform/runtime prepare run IDs are required')
const candidateRoot = resolve(process.env.CANDIDATE_ROOT || resolve(root, 'candidates'))
const repos = { platform: 'GuoMonth/dsh-multi-tenant', runtime: 'GuoMonth/dsh-isolated-runtime' }
const verifyOnly = process.argv.length === 3 && process.argv[2] === '--verify-only'
assert.ok(process.argv.length === 2 || verifyOnly, 'Only --verify-only is supported')
const commits = new Map<string, string>()
for (const kind of ['platform', 'runtime'] as const) {
  const repository = repos[kind]
  commits.set(kind, assertPrepareRun(parseJson(run('gh', ['api', `repos/${repository}/actions/runs/${runIDs[kind]}`]))))
  if (!verifyOnly)
    run('gh', ['run', 'download', runIDs[kind], '--repo', repository, '--name', `${kind}-candidate`, '--dir', resolve(candidateRoot, kind)])
}
const p = readPlatformCandidate(resolve(candidateRoot, 'platform/candidate.json'))
const r = readRuntimeCandidate(resolve(candidateRoot, 'runtime/candidate.json'))
const pkg = z.object({
  version: z.string(), dshRuntime: z.record(z.string(), z.unknown()),
}).parse(readJson('packages/multi-tenant/package.json'))
for (const kind of ['platform', 'runtime'] as const) {
  const candidate = kind === 'platform' ? p : r
  assert.equal(candidate.repository, repos[kind])
  assert.equal(candidate.runId, runIDs[kind])
  assert.equal(candidate.commit, commits.get(kind))
}
assert.equal(p.version, pkg.version)
assert.deepEqual(p.dsh, pkg.dshRuntime)
assert.deepEqual(r.dsh, p.dsh)
assert.deepEqual(p.connector, readJson('vendor/environment-connector.json'))
assert.equal(releasePolicy(p.version).stage, releasePolicy(r.version).stage)
assert.equal(p.package.filename, `dsh-multi-tenant-${p.version}.tgz`)
assert.match(p.platformImage, /^ghcr\.io\/guomonth\/dsh-multi-tenant@sha256:[a-f0-9]{64}$/)
assert.match(r.workloadImage, /^ghcr\.io\/guomonth\/dsh-isolated-runtime@sha256:[a-f0-9]{64}$/)
const archive = readFileSync(resolve(candidateRoot, 'platform', p.package.filename))
assert.equal('sha512-' + createHash('sha512').update(archive).digest('base64'), p.package.integrity)
const inputs = {
  platform_run: runIDs.platform, runtime_run: runIDs.runtime, package_integrity: p.package.integrity,
  workload_digest: r.workloadImage.split('@')[1], runtime_tag: `v${r.version}`,
}
write('candidate-verification.json', { platform: p, runtime: r, packageSha256: sha(archive), verified: true })
write('release-inputs.json', { ...inputs, releaseReady: false })
if (verifyOnly) {
  console.log(JSON.stringify({ candidateIdentity: 'passed', releaseReady: false, ...inputs }))
  process.exit(0)
}
assert.equal(process.platform, 'linux', 'Kubernetes qualification requires a native Linux/amd64 runner')
assert.equal(process.arch, 'x64', 'Do not relax product seccomp or node architecture for emulation')
const draft = resolve(privateRoot, 'evidence-draft')
const kubeconfig = resolve(privateRoot, 'kubeconfig')
const namespace = 'dsh-mvp-e-platform-final'
mkdirSync(draft, { mode: 0o700 })
Object.assign(env, {
  E_PRIVATE: privateRoot, E_EVIDENCE: draft, E_CLUSTER: 'dsh-environment', E_NAMESPACE: namespace,
  KUBECONFIG: kubeconfig, E_PLATFORM_IMAGE: p.platformImage,
})
const checks: { name: string; status: 'passed' | 'failed' }[] = []
const fixtureImages = {
  dex: 'sha256:f5f9fb373188b0f701b80edd68b3f4745ced69306c9d382999f11b7774335a98',
  traefik: 'sha256:3429c14149401de2ac82fc72ddc6a92642332b90deb3012301ff211b9d2d0f18',
}
let cluster = false
let failure: { stage: string; message: string } | undefined
const execute = (name: string, command: string, args: readonly string[], options?: { input?: string }) => {
  stage = name
  console.log(JSON.stringify({ stage, status: 'running' }))
  const output = run(command, args, options)
  writeFileSync(resolve(privateRoot, `${name}.log`), output, { mode: 0o600 })
  checks.push({ name, status: 'passed' })
  return output
}
const observeColdStart = (moment: 'before' | 'after') => {
  stage = `platform-cold-start-${moment}-login`
  const pods = z.object({ items: z.array(z.object({
    metadata: z.object({ uid: z.string() }),
    status: z.object({ containerStatuses: z.array(z.object({
      name: z.string(), ready: z.boolean(), restartCount: z.number().int().nonnegative(),
    })).optional() }).optional(),
  })) }).parse(parseJson(run('kubectl', [
    'get', 'pods', '-n', namespace, '-l', 'app.kubernetes.io/name=dsh-platform', '-o', 'json',
  ])))
  const observation = pods.items.map(pod => ({
    uid: pod.metadata.uid, platform: pod.status?.containerStatuses?.find(container => container.name === 'platform'),
  }))
  write(`cold-start-${moment}-login.json`, observation)
  const [pod] = observation
  assert.ok(observation.length === 1 && pod?.platform?.ready, 'Expected one Ready platform container')
  assert.equal(pod.platform.restartCount, 0, 'Platform restarted during the first-login qualification')
  return pod.uid
}

try {
  const tools = z.record(z.string(), z.object({
    version: z.string(), url: z.string(), sha256: z.string(), archivePath: z.string().optional(),
  })).parse(readJson(new URL('./fixture-tools.json', import.meta.url)))
  env.E_LINUX_TOOLS = resolve(privateRoot, 'linux-tools')
  mkdirSync(env.E_LINUX_TOOLS)
  for (const [name, tool] of Object.entries(tools)) {
    const download = resolve(privateRoot, `${name}.download`)
    execute(`fixture-${name}`, 'curl', ['-fsSL', tool.url, '-o', download])
    assert.equal(sha(readFileSync(download)), tool.sha256, `${name} checksum`)
    const destination = resolve(env.E_LINUX_TOOLS, name)
    if (tool.archivePath)
      run('tar', ['-xzf', download, '--strip-components=1', '-C', env.E_LINUX_TOOLS, tool.archivePath])
    else copyFileSync(download, destination)
    chmodSync(destination, 0o755)
  }
  env.PATH = `${env.E_LINUX_TOOLS}:${env.PATH}`
  write('fixture-tools.json', tools)
  execute('anonymous-platform-pull', 'docker', ['--config', resolve(privateRoot, 'docker'), 'pull', '--platform', 'linux/amd64', p.platformImage])
  execute('anonymous-workload-pull', 'docker', ['--config', resolve(privateRoot, 'docker'), 'pull', '--platform', 'linux/amd64', r.workloadImage])
  const [image] = z.tuple([z.object({
    Architecture: z.string(), Id: z.string(), Config: z.object({ Labels: z.record(z.string(), z.string()) }),
  })]).parse(parseJson(run('docker', ['image', 'inspect', r.workloadImage])))
  assert.equal(image.Architecture, 'amd64')
  assert.equal(image.Config.Labels['org.opencontainers.image.revision'], r.commit)
  assert.equal(image.Config.Labels['io.dsh.isolated.dsh.version'], p.dsh.version)
  write('workload-image.json', { id: image.Id, architecture: image.Architecture, labels: image.Config.Labels })
  execute('npm-publication-dry-run', 'npm', ['publish', '--dry-run', '--ignore-scripts', '--access', 'public', '--tag', releasePolicy(p.version).channel, resolve(candidateRoot, 'platform', p.package.filename)])
  execute('runtime-source-download', 'curl', ['-fsSL', `https://codeload.github.com/${repos.runtime}/tar.gz/${r.commit}`, '-o', resolve(privateRoot, 'runtime.tar.gz')])
  env.RUNTIME_SOURCE = resolve(privateRoot, 'runtime-source')
  mkdirSync(env.RUNTIME_SOURCE)
  run('tar', ['-xzf', resolve(privateRoot, 'runtime.tar.gz'), '--strip-components=1', '-C', env.RUNTIME_SOURCE])
  const existing = run('kind', ['get', 'clusters']).trim()
  assert.ok(!existing.split(/\s+/).includes('dsh-environment'), 'Refuse to adopt an existing test cluster')
  const config = resolve(privateRoot, 'kind.yaml')
  writeFileSync(config, 'kind: Cluster\napiVersion: kind.x-k8s.io/v1alpha4\nnetworking:\n  disableDefaultCNI: true\n  podSubnet: "192.168.0.0/16"\nnodes:\n  - role: control-plane\n')
  // Mark ownership before creation so a partial cluster is also cleaned up.
  cluster = true
  execute('kind-create', 'kind', ['create', 'cluster', '--name', 'dsh-environment', '--image', 'kindest/node@sha256:1aac8018c42eb5d48fae5be507caaee789fc6d9b9b3f560359dd4157ac00d4f6', '--config', config, '--kubeconfig', kubeconfig, '--wait', '120s'])
  execute('calico-download', 'curl', ['-fsSL', 'https://raw.githubusercontent.com/projectcalico/calico/v3.32.2/manifests/calico.yaml', '-o', resolve(privateRoot, 'calico.yaml')])
  execute('calico-install', 'kubectl', ['apply', '-f', resolve(privateRoot, 'calico.yaml')])
  execute('calico-ready', 'kubectl', ['rollout', 'status', 'daemonset/calico-node', '-n', 'kube-system', '--timeout=240s'])
  execute('node-ready', 'kubectl', ['wait', 'node', '--all', '--for=condition=Ready', '--timeout=180s'])
  execute('storage-ready', 'kubectl', ['rollout', 'status', 'deployment/local-path-provisioner', '-n', 'local-path-storage', '--timeout=180s'])
  const nodes = z.object({ items: z.array(z.object({
    metadata: z.object({ name: z.string(), uid: z.string() }),
    status: z.object({ nodeInfo: z.looseObject({ architecture: z.string() }) }),
  })) }).parse(parseJson(run('kubectl', ['get', 'nodes', '-o', 'json'])))
  assert.ok(nodes.items.every(n => n.status.nodeInfo.architecture === 'amd64'))
  write('cluster.json', { nodes: nodes.items.map(n => ({ name: n.metadata.name, uid: n.metadata.uid, nodeInfo: n.status.nodeInfo })), calicoManifestSha256: sha(readFileSync(resolve(privateRoot, 'calico.yaml'))) })
  env.E_NODE_ADDRESS = dockerNodeAddress(run('docker', ['inspect', 'dsh-environment-control-plane']))
  assert.ok(env.E_NODE_ADDRESS)
  write('images.json', { ...fixtureImages, platformImage: p.platformImage, workloadImage: r.workloadImage })
  copyFileSync(resolve(evidence, 'images.json'), resolve(draft, 'images.json'))
  // Generate new fixture credentials only in this attempt's private directory.
  stage = 'fixture-credentials'
  assert.ok(!existsSync(resolve(privateRoot, 'users.json')))
  const users = []
  for (const name of ['alice', 'bob']) {
    const password = randomBytes(24).toString('hex')
    const hash = run('htpasswd', ['-niBC', '10', name], { input: password + '\n' }).trim().split(':')[1]
    assert.ok(hash, 'Missing fixture password hash')
    users.push({ name, email: `${name}@release.test`, password, hash, userID: `e-${name}` })
  }
  writeFileSync(resolve(privateRoot, 'users.json'), JSON.stringify(users), { mode: 0o600 })
  writeFileSync(resolve(privateRoot, 'client-secret'), randomBytes(32).toString('hex'), { mode: 0o600 })
  run('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '3', '-subj', '/CN=DSH release test CA', '-keyout', resolve(privateRoot, 'ca.key'), '-out', resolve(privateRoot, 'ca.crt')])
  run('openssl', ['req', '-newkey', 'rsa:2048', '-nodes', '-subj', '/CN=dsh-environment.test', '-keyout', resolve(privateRoot, 'tls.key'), '-out', resolve(privateRoot, 'tls.csr')])
  writeFileSync(resolve(privateRoot, 'tls.ext'), 'subjectAltName=DNS:dsh-environment.test,DNS:*.env.dsh-environment.test,DNS:idp.dsh-environment.test,DNS:localhost,IP:127.0.0.1\nextendedKeyUsage=serverAuth\n')
  run('openssl', ['x509', '-req', '-in', resolve(privateRoot, 'tls.csr'), '-CA', resolve(privateRoot, 'ca.crt'), '-CAkey', resolve(privateRoot, 'ca.key'), '-CAcreateserial', '-days', '3', '-extfile', resolve(privateRoot, 'tls.ext'), '-out', resolve(privateRoot, 'tls.crt')])
  for (const name of readdirSync(privateRoot))
    if (/\.(?:key|crt|csr|srl|ext)$/.test(name)) chmodSync(resolve(privateRoot, name), 0o600)
  execute('reference-infrastructure', 'node', ['integration/e2e/reference-infra.ts'])
  for (const deployment of ['dex', 'traefik'])
    execute(`${deployment}-ready`, 'kubectl', ['rollout', 'status', `deployment/${deployment}`, '-n', 'dsh-mvp-e-system', '--timeout=180s'])
  execute('prepare-install', 'node', ['integration/e2e/prepare-install.ts'])
  // Node trust is scoped to the installer container; host DNS/trust stay untouched.
  execute('installed-cli-preflight', 'bash', ['integration/e2e/install-reference.sh', 'preflight'])
  execute('installed-cli-install', 'bash', ['integration/e2e/install-reference.sh', 'install'])
  const coldPod = observeColdStart('before')
  checks.push({ name: stage, status: 'passed' })
  execute('platform-browser', 'node', ['integration/e2e/browser.ts'])
  assert.equal(observeColdStart('after'), coldPod, 'The platform Pod changed during first login')
  checks.push({ name: stage, status: 'passed' })
  for (const name of ['lifecycle', 'revocation', 'performance'])
    execute(`platform-${name}`, 'node', [`integration/e2e/${name}.ts`])
  execute('runtime-contracts', 'node', ['integration/e2e/runtime-probe.ts'])
  write('model-tool.json', { status: 'blocked', reason: 'Dedicated provider credential and external CLI authorization have not been supplied', paidCalls: 0 })
}
catch (error) {
  failure = { stage, message: error instanceof Error ? error.message : 'Qualification failed' }
  console.error(JSON.stringify(failure))
  process.exitCode = 1
}
finally {
  if (cluster) {
    if (failure) {
      try { run('node', ['integration/e2e/cluster-state.ts']) }
      catch { checks.push({ name: 'failure-resource-projection', status: 'failed' }) }
    }
    try { run('kind', ['export', 'logs', resolve(privateRoot, 'cluster-logs'), '--name', 'dsh-environment']) }
    catch { checks.push({ name: 'private-diagnostics', status: 'failed' }) }
    try { run('kind', ['delete', 'cluster', '--name', 'dsh-environment', '--kubeconfig', kubeconfig]); checks.push({ name: 'cluster-cleanup', status: 'passed' }) }
    catch { checks.push({ name: 'cluster-cleanup', status: 'failed' }); process.exitCode = 1 }
  }
  const secrets = []
  for (const name of ['client-secret', 'ca.key', 'tls.key'])
    if (existsSync(resolve(privateRoot, name))) secrets.push(readFileSync(resolve(privateRoot, name), 'utf8').trim())
  if (existsSync(resolve(privateRoot, 'users.json')))
    secrets.push(...readUsers(privateRoot).flatMap(user => [user.password, user.hash]))
  const allowed = new Set(['images.json', 'reference-network.json', 'browser.json', 'lifecycle.json', 'revocation.json', 'performance.json', 'runtime-events.json', 'background.json', 'rebuild-final.json', 'network.json', 'aged-writer.json', 'volume-identity.json', 'failure-resources.json'])
  // Child scripts write only to private staging. Failed safety checks leave
  // their output private even though the workflow uploads evidence on failure.
  for (const name of readdirSync(draft)) {
    if (!allowed.has(name)) continue
    const bytes = readFileSync(resolve(draft, name))
    if (secrets.some(secret => bytes.includes(secret)) || /BEGIN .*PRIVATE KEY|Bearer\s+\S+|dsh-auth-[^=\s]+=/i.test(bytes.toString())) {
      failure = { stage: 'evidence-safety', message: 'Credential-shaped output retained privately' }
      process.exitCode = 1
      continue
    }
    copyFileSync(resolve(draft, name), resolve(evidence, name))
  }
  if (failure) {
    let diagnostic = readdirSync(privateRoot).filter(name => name.startsWith('failure-')).map(name => readFileSync(resolve(privateRoot, name), 'utf8')).join('\n')
    for (const secret of secrets) diagnostic = diagnostic.replaceAll(secret, '<redacted>')
    diagnostic = diagnostic.replace(/-----BEGIN[\s\S]*?PRIVATE KEY-----[\s\S]*?-----END[\s\S]*?PRIVATE KEY-----/g, '<private-key>')
      .replace(/dsh-auth-[^=;\s]+=[^;\s"']+/g, 'dsh-auth=<redacted>')
      .replace(/([?&](?:token|ticket|code|state|entry)=)[^&\s"']+/g, '$1<redacted>')
      .replace(/\b(?:v1|v2)\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '<signed-cookie>')
      .replace(/[A-Za-z0-9+/_=-]{80,}/g, '<long-value>')
    writeFileSync(resolve(evidence, 'failure-diagnostics.log'), diagnostic.slice(-60000))
  }
  write('qualification.json', { harnessCommit: process.env.GITHUB_SHA || null, qualificationRun: process.env.GITHUB_RUN_ID || null, platform: p, runtime: r, checks, failure: failure || null, releaseReady: false, modelTool: 'requires separate authorization and evidence', limits: ['fresh single-node Linux/amd64 installation', 'fixture Dex, not enterprise SSO', 'no in-place upgrade or production capacity claim'] })
  const sums = readdirSync(evidence).map(name => `${sha(readFileSync(resolve(evidence, name)))}  ${name}`).join('\n')
  writeFileSync(resolve(evidence, 'SHA256SUMS'), sums + '\n')
}
