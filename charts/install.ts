#!/usr/bin/env node
// One fixed installation path. No per-user templates or runtime implementation here.
import { readFileSync } from 'node:fs'
import { createHash, createPrivateKey, createPublicKey, X509Certificate } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { lookup } from 'node:dns/promises'
import assert from 'node:assert/strict'
import { z } from 'zod'
import { list, parseJson, readJson, record, string } from '../scripts/json.ts'
import { runtimeOptionsSchema } from '../packages/multi-tenant/src/platform/kubernetes-options.ts'

const text = z.string()
const strings = z.record(text, text)
const metadata = z.looseObject({ name: text, annotations: strings.optional(), labels: strings.optional() })
const document = z.looseObject({ kind: text, metadata })
const secretVolume = z.looseObject({ secretName: text, items: z.array(z.looseObject({ key: text })) })
const container = z.looseObject({
  image: text, env: z.array(z.unknown()).optional(),
  volumeMounts: z.array(z.looseObject({ name: text, readOnly: z.boolean().optional() })).optional(),
  readinessProbe: z.looseObject({ httpGet: z.looseObject({ path: text }) }).optional(),
})
export const deploymentSchema = z.looseObject({ spec: z.looseObject({
  replicas: z.number(), strategy: z.looseObject({ type: text }),
  template: z.looseObject({ metadata: z.looseObject({ labels: strings }), spec: z.looseObject({
    containers: z.array(container), volumes: z.array(z.looseObject({ name: text, secret: secretVolume.optional() })),
    automountServiceAccountToken: z.boolean(),
    securityContext: z.looseObject({ runAsUser: z.number() }),
    initContainers: z.array(z.looseObject({ command: z.array(text) })),
  }) }),
}) })
const ingressSchema = z.looseObject({ spec: z.looseObject({
  ingressClassName: text, tls: z.array(z.looseObject({ secretName: text })), rules: z.array(z.looseObject({ host: text })),
}) })
const configuration = z.looseObject({
  runtime: runtimeOptionsSchema, oidc: z.looseObject({ issuer: text, platformOrigin: text, siteDomain: text }),
  members: z.array(z.looseObject({ issuer: text, subject: text })),
})

function volumeKey(volume: z.infer<typeof secretVolume>): string {
  const item = volume.items[0]
  assert.ok(item, 'Secret volume requires a key')
  return item.key
}

export const chart = resolve(dirname(fileURLToPath(import.meta.url)), 'dsh-platform')
const files = resolve(chart, 'files')
export const sources = z.looseObject({
  core: z.looseObject({ original: text, originalSha256: text, pinned: text, pinnedSha256: text, image: text }),
  runtimeRole: z.looseObject({ file: text, sha256: text }),
}).parse(readJson(resolve(files, 'sources.json')))
const sha = (data: Buffer) => createHash('sha256').update(data).digest('hex')
export function verifyAssets() {
  for (const [file, expected] of [
    [sources.core.original, sources.core.originalSha256],
    [sources.core.pinned, sources.core.pinnedSha256],
    [sources.runtimeRole.file, sources.runtimeRole.sha256],
  ] as const)
    if (sha(readFileSync(resolve(files, file))) !== expected)
      throw new Error(`Packaged asset checksum mismatch: ${file}`)
  const original = readFileSync(resolve(files, sources.core.original), 'utf8')
  const pinned = readFileSync(resolve(files, sources.core.pinned), 'utf8')
  const replaced = original.replace('registry.k8s.io/agent-sandbox/agent-sandbox-controller:v1.0.3', sources.core.image)
  if (replaced === original || replaced !== pinned)
    throw new Error('Core differs beyond the approved image pin')
}
function run(command: string, args: readonly string[], input?: string): string {
  const result = spawnSync(command, args, {
    encoding: 'utf8', ...(input === undefined ? {} : { input }), timeout: 360000, maxBuffer: 8 * 1024 * 1024,
  })
  // Do not echo kubectl/Helm responses: these may include Secret data or credentials.
  if (result.error || result.status !== 0)
    throw new Error(`${command} ${args[0]} failed; check prerequisites and permissions (command output suppressed)`)
  return result.stdout
}
export function documents(rendered: string) {
  return rendered.split(/^---\s*$/m).map(x => x.replace(/^#.*$/gm, '').trim()).filter(Boolean).map(source => document.parse(parseJson(source)))
}
export function render(values: string, namespace: string): string {
  return run('helm', ['template', 'dsh-platform', chart, '--namespace', namespace, '--values', values])
}
export function inspect(rendered: string) {
  const objects = documents(rendered)
  const configMap = objects.find(resource => resource.kind === 'ConfigMap')
  const data = record(configMap?.data, 'platform ConfigMap data')
  const config = configuration.parse(parseJson(string(data['config.json'], 'platform configuration')))
  const deployment = deploymentSchema.parse(objects.find(resource => resource.kind === 'Deployment'))
  const pod = deployment.spec.template.spec
  const ingress = ingressSchema.parse(objects.find(resource => resource.kind === 'Ingress'))
  const secret = pod.volumes.find(volume => volume.name === 'oidc')?.secret
  assert.ok(secret, 'Platform OIDC Secret volume is required')
  const memberKeys = new Set()
  for (const member of config.members) {
    const key = JSON.stringify([member.issuer, member.subject])
    if (memberKeys.has(key))
      throw new Error('Duplicate issuer/subject membership')
    memberKeys.add(key)
  }
  return {
    config, pod, ingress, secret,
  }
}
export function rejectFixture({ config, pod }: ReturnType<typeof inspect>): void {
  const container = pod.containers[0]
  assert.ok(container, 'Platform container is required')
  for (const value of [config.oidc.issuer, config.oidc.platformOrigin, config.runtime.image, container.image]) {
    if (value.includes('.invalid') || /@sha256:([a-f0-9])\1{63}$/.test(value))
      throw new Error('Fixture domain/image cannot be installed; supply real candidate values')
  }
}
export async function main(args: string[]): Promise<void> {
  const mode = args.shift()
  if (mode !== 'render' && mode !== 'preflight' && mode !== 'install')
    throw new Error('Usage: node charts/install.ts render|preflight|install --values FILE --namespace NAME [--kubeconfig FILE --context NAME]')
  const options: Record<string, string> = {}
  while (args.length) {
    const key = args.shift()
    const value = args.shift()
    if (key === undefined || value === undefined || !['--values', '--namespace', '--kubeconfig', '--context'].includes(key) || Object.hasOwn(options, key))
      throw new Error('Unknown, duplicate or incomplete argument')
    options[key] = value
  }
  const namespace = options['--namespace']
  if (!options['--values'] || !namespace || !/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/.test(namespace) || namespace.length > 63)
    throw new Error('Explicit values file and valid namespace required')
  if (['default', 'kube-system', 'agent-sandbox-system'].includes(namespace))
    throw new Error('Use a dedicated platform namespace')
  verifyAssets()
  const rendered = render(resolve(options['--values']), namespace)
  const target = inspect(rendered)
  if (mode === 'render') {
    process.stdout.write(rendered)
    return
  }
  rejectFixture(target)
  if (!options['--kubeconfig'] || !options['--context'])
    throw new Error('Explicit kubeconfig and context required; no ambient cluster writes')
  const common = ['--kubeconfig', resolve(options['--kubeconfig']), '--context', options['--context'], '--request-timeout=20s']
  const k = (...argv: string[]) => run('kubectl', [...argv, ...common])
  const get = (...argv: string[]) => {
    try {
      return record(parseJson(k('get', ...argv, '-o', 'json')), 'Kubernetes object')
    }
    catch {
      throw new Error(`Cannot read ${argv[0]} ${argv[1] ?? ''}; check existence, cluster reachability and administrator permissions`)
    }
  }
  const { config, pod, ingress, secret } = target
  // All checks precede any write. Only fixed, redacted diagnostics leave this process.
  get('namespace', namespace)
  get('storageclass', config.runtime.storage.storageClassName)
  get('ingressclass', ingress.spec.ingressClassName)
  const nodes = list(get('nodes').items, 'cluster nodes').map(node => z.looseObject({
    metadata: z.looseObject({ labels: strings }),
    status: z.looseObject({ conditions: z.array(z.looseObject({ type: text, status: text })) }),
  }).parse(node))
  if (!nodes.some(n => n.metadata.labels['kubernetes.io/arch'] === 'amd64' && n.metadata.labels['kubernetes.io/os'] === 'linux' && n.status.conditions.some(c => c.type === 'Ready' && c.status === 'True')))
    throw new Error('No Ready Linux/amd64 node')
  if (k('get', 'deployment', 'dsh-platform', '-n', namespace, '--ignore-not-found', '-o', 'name').trim())
    throw new Error('Platform already exists; this path is a fresh install, not an upgrade')
  if (k('get', 'clusterrolebinding', 'dsh-platform-runtime', '--ignore-not-found', '-o', 'name').trim())
    throw new Error('Platform role binding already exists; do not create a second installation or adopt partial state')
  if (k('get', 'pvc', 'dsh-platform-state', '-n', namespace, '--ignore-not-found', '-o', 'name').trim())
    throw new Error('Control PVC already exists; preserve it and inspect the original installation, do not adopt it as new state')
  const oidcSecret = get('secret', secret.secretName, '-n', namespace)
  if (!Buffer.from(strings.parse(oidcSecret.data ?? {})[volumeKey(secret)] ?? '', 'base64').toString('utf8').trim())
    throw new Error('OIDC Secret/key missing or empty')
  const caVolume = pod.volumes.find(v => v.name === 'oidc-ca')
  if (caVolume) {
    assert.ok(caVolume.secret, 'CA volume requires a Secret')
    const ca = get('secret', caVolume.secret.secretName, '-n', namespace)
    try {
      new X509Certificate(Buffer.from(strings.parse(ca.data ?? {})[volumeKey(caVolume.secret)] ?? '', 'base64'))
    }
    catch {
      throw new Error('OIDC CA Secret/key missing or invalid PEM certificate')
    }
  }
  const tlsReference = ingress.spec.tls[0]
  assert.ok(tlsReference, 'Platform TLS Secret is required')
  const tls = get('secret', tlsReference.secretName, '-n', namespace)
  const tlsData = strings.parse(tls.data ?? {})
  if (tls.type !== 'kubernetes.io/tls' || !tlsData['tls.key'])
    throw new Error('TLS Secret requires tls.crt and tls.key')
  let cert
  try {
    cert = new X509Certificate(Buffer.from(tlsData['tls.crt'] ?? '', 'base64'))
  }
  catch {
    throw new Error('TLS certificate invalid')
  }
  try {
    const key = createPrivateKey(Buffer.from(tlsData['tls.key'], 'base64'))
    const publicKey = createPublicKey(key).export({
      type: 'spki', format: 'der',
    })
    if (!publicKey.equals(cert.publicKey.export({
      type: 'spki', format: 'der',
    })))
      throw new Error()
  }
  catch {
    throw new Error('TLS private key invalid or does not match certificate')
  }
  const hosts = [config.oidc.siteDomain, `preflight.env.${config.oidc.siteDomain}`]
  if (Date.parse(cert.validFrom) > Date.now() || Date.parse(cert.validTo) <= Date.now() || hosts.some(h => !cert.checkHost(h)))
    throw new Error('TLS certificate expired/not yet valid or missing platform/wildcard coverage')
  try {
    await Promise.all(hosts.map(h => lookup(h)))
  }
  catch {
    throw new Error('Platform or wildcard DNS unresolved; configure DNS before install')
  }
  try {
    const response = await fetch(`${config.oidc.issuer.replace(/\/$/, '')}/.well-known/openid-configuration`, {
      signal: AbortSignal.timeout(15000), redirect: 'error',
    })
    const discovery: unknown = await response.json()
    if (!response.ok || record(discovery, 'OIDC discovery').issuer !== config.oidc.issuer)
      throw new Error()
  }
  catch {
    throw new Error('OIDC HTTPS discovery failed or issuer mismatch; check DNS, CA and issuer')
  }
  const existingCore = k('get', 'deployment', 'agent-sandbox-controller', '-n', 'agent-sandbox-system', '--ignore-not-found', '-o', 'json').trim()
  if (existingCore) {
    const core = record(parseJson(existingCore), 'core controller Deployment')
    const spec = record(core.spec, 'core Deployment spec')
    const template = record(spec.template, 'core Pod template')
    const podSpec = record(template.spec, 'core Pod spec')
    const coreContainer = record(list(podSpec.containers, 'core containers')[0], 'core controller container')
    if (coreContainer.image !== sources.core.image)
      throw new Error('Existing core controller differs; owner must resolve the fixed version before installation')
  }
  process.stderr.write('Preflight passed: values/assets, nodes, storage, ingress, Secret keys, TLS, DNS and OIDC discovery. Image availability and browser/HTTP/WS acceptance remain runtime checks.\n')
  if (mode === 'preflight')
    return
  k('apply', '--server-side', '--field-manager=dsh-install', '-f', resolve(files, sources.core.pinned))
  k('wait', '--for=condition=Established', 'crd/sandboxes.agents.x-k8s.io', '--timeout=120s')
  k('rollout', 'status', 'deployment/agent-sandbox-controller', '-n', 'agent-sandbox-system', '--timeout=180s')
  k('apply', '-f', resolve(files, sources.runtimeRole.file))
  run('helm', ['install', 'dsh-platform', chart, '--namespace', namespace, '--values', resolve(options['--values']), '--kubeconfig', resolve(options['--kubeconfig']), '--kube-context', options['--context'], '--wait', '--timeout', '5m'])
  process.stderr.write('Platform rollout completed; run the documented two-user acceptance. No user environment was created by the installer.\n')
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof z.ZodError ? 'Invalid installation input' : error instanceof Error ? error.message : 'Installation failed')
    process.exitCode = 1
  })
}
