// Dedicated, disposable AMD64 acceptance. Product bytes come from main's
// prepared artifacts; this checkout supplies only the qualification harness.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { releasePolicy } from '../../scripts/release-policy.mjs'

const root = resolve(process.env.QUALIFICATION_ROOT || '')
assert.ok(process.env.QUALIFICATION_ROOT, 'QUALIFICATION_ROOT is required')
const privateRoot = resolve(root, 'private'), evidence = resolve(root, 'evidence')
for (const directory of [root, privateRoot, evidence])
  mkdirSync(directory, { recursive: true, mode: 0o700 })
const env = { ...process.env }
let stage = 'candidate-verification', call = 0
const run = (command, args, options = {}) => {
  try {
    return execFileSync(command, args, {
      encoding: 'utf8', timeout: 720000, maxBuffer: 16 * 1024 * 1024, env, ...options,
      // execFileSync otherwise forwards a failed child's stderr before our redaction.
      stdio: ['pipe', 'pipe', 'pipe'],
    })
  }
  catch (error) {
    const path = resolve(privateRoot, `failure-${++call}-${basename(command)}.log`)
    writeFileSync(path, `${error.stdout || ''}\n${error.stderr || ''}`, { mode: 0o600 })
    throw new Error(`${stage}: ${command} ${args[0] || ''} failed; private diagnostic ${basename(path)}`)
  }
}
const json = path => JSON.parse(readFileSync(path, 'utf8'))
const write = (name, value) => {
  const path = resolve(evidence, name), text = JSON.stringify(value, null, 2) + '\n'
  if (existsSync(path)) assert.equal(readFileSync(path, 'utf8'), text, 'Use a fresh qualification root; evidence is immutable')
  else writeFileSync(path, text)
}
assert.ok(!existsSync(resolve(evidence, 'qualification.json')), 'Choose a new root for each qualification attempt')
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const runIDs = { platform: process.env.PLATFORM_RUN, runtime: process.env.RUNTIME_RUN }
for (const value of Object.values(runIDs))
  assert.match(value || '', /^\d+$/, 'Explicit platform/runtime prepare run IDs are required')
const candidateRoot = resolve(process.env.CANDIDATE_ROOT || resolve(root, 'candidates'))
const repos = { platform: 'GuoMonth/dsh-multi-tenant', runtime: 'GuoMonth/dsh-isolated-runtime' }
const verifyOnly = process.argv.length === 3 && process.argv[2] === '--verify-only'
assert.ok(process.argv.length === 2 || verifyOnly, 'Only --verify-only is supported')
const runs = {}
for (const [name, repository] of Object.entries(repos)) {
  runs[name] = JSON.parse(run('gh', ['api', `repos/${repository}/actions/runs/${runIDs[name]}`]))
  assert.equal(runs[name].conclusion, 'success')
  assert.equal(runs[name].head_branch, 'main')
  assert.equal(runs[name].event, 'workflow_dispatch')
  assert.equal(runs[name].path, '.github/workflows/prepare-release.yml')
  if (!verifyOnly)
    run('gh', ['run', 'download', runIDs[name], '--repo', repository, '--name', `${name}-candidate`, '--dir', resolve(candidateRoot, name)])
}
const p = json(resolve(candidateRoot, 'platform/candidate.json'))
const r = json(resolve(candidateRoot, 'runtime/candidate.json'))
const pkg = json('packages/multi-tenant/package.json'), connector = json('vendor/environment-connector.json')
for (const [name, candidate] of [['platform', p], ['runtime', r]]) {
  assert.equal(candidate.repository, repos[name])
  assert.equal(candidate.runId, runIDs[name])
  assert.equal(candidate.commit, runs[name].head_sha)
}
assert.equal(p.version, pkg.version)
assert.deepEqual(p.dsh, pkg.dshRuntime)
assert.deepEqual(r.dsh, p.dsh)
assert.deepEqual(p.connector, connector)
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
mkdirSync(draft, { mode: 0o700 })
Object.assign(env, {
  E_PRIVATE: privateRoot, E_EVIDENCE: draft, E_CLUSTER: 'dsh-environment', E_NAMESPACE: 'dsh-mvp-e-platform-final',
  KUBECONFIG: resolve(privateRoot, 'kubeconfig'), E_PLATFORM_IMAGE: p.platformImage,
  PLAYWRIGHT_MODULE: resolve(root, 'browser/node_modules/playwright'),
})
const checks = [], fixtureImages = {
  dex: 'sha256:f5f9fb373188b0f701b80edd68b3f4745ced69306c9d382999f11b7774335a98',
  traefik: 'sha256:3429c14149401de2ac82fc72ddc6a92642332b90deb3012301ff211b9d2d0f18',
}
let cluster = false, failure
const execute = (name, command, args, options) => {
  stage = name
  console.log(JSON.stringify({ stage, status: 'running' }))
  const output = run(command, args, options)
  writeFileSync(resolve(privateRoot, `${name}.log`), output, { mode: 0o600 })
  checks.push({ name, status: 'passed' })
  return output
}
try {
  const tools = json(new URL('./fixture-tools.json', import.meta.url))
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
  const image = JSON.parse(run('docker', ['image', 'inspect', r.workloadImage]))[0]
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
  execute('kind-create', 'kind', ['create', 'cluster', '--name', 'dsh-environment', '--image', 'kindest/node@sha256:1aac8018c42eb5d48fae5be507caaee789fc6d9b9b3f560359dd4157ac00d4f6', '--config', config, '--kubeconfig', env.KUBECONFIG, '--wait', '120s'])
  execute('calico-download', 'curl', ['-fsSL', 'https://raw.githubusercontent.com/projectcalico/calico/v3.32.2/manifests/calico.yaml', '-o', resolve(privateRoot, 'calico.yaml')])
  execute('calico-install', 'kubectl', ['apply', '-f', resolve(privateRoot, 'calico.yaml')])
  execute('calico-ready', 'kubectl', ['rollout', 'status', 'daemonset/calico-node', '-n', 'kube-system', '--timeout=240s'])
  execute('node-ready', 'kubectl', ['wait', 'node', '--all', '--for=condition=Ready', '--timeout=180s'])
  execute('storage-ready', 'kubectl', ['rollout', 'status', 'deployment/local-path-provisioner', '-n', 'local-path-storage', '--timeout=180s'])
  const nodes = JSON.parse(run('kubectl', ['get', 'nodes', '-o', 'json']))
  assert.ok(nodes.items.every(n => n.status.nodeInfo.architecture === 'amd64'))
  write('cluster.json', { nodes: nodes.items.map(n => ({ name: n.metadata.name, uid: n.metadata.uid, nodeInfo: n.status.nodeInfo })), calicoManifestSha256: sha(readFileSync(resolve(privateRoot, 'calico.yaml'))) })
  const node = JSON.parse(run('docker', ['inspect', 'dsh-environment-control-plane']))[0]
  env.E_NODE_ADDRESS = node.NetworkSettings.Networks.kind.IPAddress
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
  execute('reference-infrastructure', 'node', ['integration/e2e/reference-infra.mjs'])
  for (const deployment of ['dex', 'traefik'])
    execute(`${deployment}-ready`, 'kubectl', ['rollout', 'status', `deployment/${deployment}`, '-n', 'dsh-mvp-e-system', '--timeout=180s'])
  execute('prepare-install', 'node', ['integration/e2e/prepare-install.mjs'])
  // Node trust is scoped to the installer container; host DNS/trust stay untouched.
  execute('installed-cli-preflight', 'bash', ['integration/e2e/install-reference.sh', 'preflight'])
  execute('installed-cli-install', 'bash', ['integration/e2e/install-reference.sh', 'install'])
  for (const name of ['browser', 'lifecycle', 'revocation', 'performance'])
    execute(`platform-${name}`, 'node', [`integration/e2e/${name}.cjs`])
  execute('runtime-contracts', 'node', ['integration/e2e/runtime-probe.mjs'])
  write('model-tool.json', { status: 'blocked', reason: 'Dedicated provider credential and external CLI authorization have not been supplied', paidCalls: 0 })
}
catch (error) {
  failure = { stage, message: error.message }
  console.error(JSON.stringify(failure))
  process.exitCode = 1
}
finally {
  if (cluster) {
    if (failure) {
      try { run('node', ['integration/e2e/cluster-state.mjs']) }
      catch { checks.push({ name: 'failure-resource-projection', status: 'failed' }) }
    }
    try { run('kind', ['export', 'logs', resolve(privateRoot, 'cluster-logs'), '--name', 'dsh-environment']) }
    catch { checks.push({ name: 'private-diagnostics', status: 'failed' }) }
    try { run('kind', ['delete', 'cluster', '--name', 'dsh-environment', '--kubeconfig', env.KUBECONFIG]); checks.push({ name: 'cluster-cleanup', status: 'passed' }) }
    catch { checks.push({ name: 'cluster-cleanup', status: 'failed' }); process.exitCode = 1 }
  }
  const secrets = []
  for (const name of ['client-secret', 'ca.key', 'tls.key'])
    if (existsSync(resolve(privateRoot, name))) secrets.push(readFileSync(resolve(privateRoot, name), 'utf8').trim())
  if (existsSync(resolve(privateRoot, 'users.json')))
    secrets.push(...json(resolve(privateRoot, 'users.json')).flatMap(u => [u.password, u.hash]))
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
