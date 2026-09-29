#!/usr/bin/env node
// One fixed installation path. No per-user templates or runtime implementation here.
import { readFileSync } from 'node:fs';
import { createHash, X509Certificate } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lookup } from 'node:dns/promises';

export const chart = resolve(dirname(fileURLToPath(import.meta.url)), 'dsh-platform');
const files = resolve(chart, 'files');
export const sources = JSON.parse(readFileSync(resolve(files, 'sources.json'), 'utf8'));
const sha = data => createHash('sha256').update(data).digest('hex');

export function verifyAssets() {
  for (const [file, expected] of [
    [sources.core.original, sources.core.originalSha256],
    [sources.core.pinned, sources.core.pinnedSha256],
    [sources.runtimeRole.file, sources.runtimeRole.sha256],
  ]) if (sha(readFileSync(resolve(files, file))) !== expected) throw new Error(`Packaged asset checksum mismatch: ${file}`);
  const original = readFileSync(resolve(files, sources.core.original), 'utf8');
  const pinned = readFileSync(resolve(files, sources.core.pinned), 'utf8');
  const replaced = original.replace('registry.k8s.io/agent-sandbox/agent-sandbox-controller:v1.0.3', sources.core.image);
  if (replaced === original || replaced !== pinned) throw new Error('Core differs beyond the approved image pin');
}

function run(command, args, input) {
  const result = spawnSync(command, args, { encoding: 'utf8', input, timeout: 360_000, maxBuffer: 8 * 1024 * 1024 });
  // Do not echo kubectl/Helm responses: these may include Secret data or credentials.
  if (result.error || result.status !== 0) throw new Error(`${command} ${args[0]} failed; check prerequisites and permissions (command output suppressed)`);
  return result.stdout;
}

export function documents(rendered) {
  return rendered.split(/^---\s*$/m).map(x => x.replace(/^#.*$/gm, '').trim()).filter(Boolean).map(x => JSON.parse(x));
}

export function render(values, namespace) {
  return run('helm', ['template', 'dsh-platform', chart, '--namespace', namespace, '--values', values]);
}

export function inspect(rendered) {
  const objects = documents(rendered);
  const config = JSON.parse(objects.find(x => x.kind === 'ConfigMap').data['config.json']);
  const deployment = objects.find(x => x.kind === 'Deployment');
  const pod = deployment.spec.template.spec;
  const ingress = objects.find(x => x.kind === 'Ingress');
  const secret = pod.volumes.find(x => x.name === 'oidc').secret;
  const memberKeys = new Set();
  for (const member of config.members) {
    const key = JSON.stringify([member.issuer, member.subject]);
    if (memberKeys.has(key)) throw new Error('Duplicate issuer/subject membership');
    memberKeys.add(key);
  }
  return { config, pod, ingress, secret };
}

export function rejectFixture({ config, pod }) {
  for (const value of [config.oidc.issuer, config.oidc.platformOrigin, config.runtime.image, pod.containers[0].image]) {
    if (value.includes('.invalid') || /@sha256:([a-f0-9])\1{63}$/.test(value)) throw new Error('Fixture domain/image cannot be installed; supply real candidate values');
  }
}

export async function main(args) {
  const mode = args.shift();
  if (!['render', 'preflight', 'install'].includes(mode)) throw new Error('Usage: node charts/install.mjs render|preflight|install --values FILE --namespace NAME [--kubeconfig FILE --context NAME]');
  const options = {};
  while (args.length) {
    const key = args.shift();
    if (!['--values', '--namespace', '--kubeconfig', '--context'].includes(key) || !args.length || Object.hasOwn(options, key)) throw new Error('Unknown, duplicate or incomplete argument');
    options[key] = args.shift();
  }
  if (!options['--values'] || !/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/.test(options['--namespace'] ?? '') || options['--namespace'].length > 63) throw new Error('Explicit values file and valid namespace required');
  if (['default', 'kube-system', 'agent-sandbox-system'].includes(options['--namespace'])) throw new Error('Use a dedicated platform namespace');
  verifyAssets();
  const rendered = render(resolve(options['--values']), options['--namespace']);
  const target = inspect(rendered);
  if (mode === 'render') { process.stdout.write(rendered); return; }
  rejectFixture(target);
  if (!options['--kubeconfig'] || !options['--context']) throw new Error('Explicit kubeconfig and context required; no ambient cluster writes');
  const common = ['--kubeconfig', resolve(options['--kubeconfig']), '--context', options['--context'], '--request-timeout=20s'];
  const k = (...argv) => run('kubectl', [...argv, ...common]);
  const namespace = options['--namespace'];
  const get = (...argv) => JSON.parse(k('get', ...argv, '-o', 'json'));
  const { config, pod, ingress, secret } = target;
  // All checks precede any write. Only fixed, redacted diagnostics leave this process.
  get('namespace', namespace);
  get('storageclass', config.runtime.storage.storageClassName);
  get('ingressclass', ingress.spec.ingressClassName);
  const nodes = get('nodes').items;
  if (!nodes.some(n => n.metadata.labels['kubernetes.io/arch'] === 'amd64' && n.metadata.labels['kubernetes.io/os'] === 'linux' && n.status.conditions.some(c => c.type === 'Ready' && c.status === 'True'))) throw new Error('No Ready Linux/amd64 node');
  if (k('get', 'deployment', 'dsh-platform', '-n', namespace, '--ignore-not-found', '-o', 'name').trim()) throw new Error('Platform already exists; this path is a fresh install, not an upgrade');
  const oidcSecret = get('secret', secret.secretName, '-n', namespace);
  if (!Buffer.from(oidcSecret.data?.[secret.items[0].key] ?? '', 'base64').toString('utf8').trim()) throw new Error('OIDC Secret/key missing or empty');
  const tls = get('secret', ingress.spec.tls[0].secretName, '-n', namespace);
  if (tls.type !== 'kubernetes.io/tls' || !tls.data?.['tls.key']) throw new Error('TLS Secret requires tls.crt and tls.key');
  let cert;
  try { cert = new X509Certificate(Buffer.from(tls.data['tls.crt'], 'base64')); } catch { throw new Error('TLS certificate invalid'); }
  const hosts = [config.oidc.siteDomain, `preflight.env.${config.oidc.siteDomain}`];
  if (Date.parse(cert.validFrom) > Date.now() || Date.parse(cert.validTo) <= Date.now() || hosts.some(h => !cert.checkHost(h))) throw new Error('TLS certificate expired/not yet valid or missing platform/wildcard coverage');
  try { await Promise.all(hosts.map(h => lookup(h))); } catch { throw new Error('Platform or wildcard DNS unresolved; configure DNS before install'); }
  try {
    const response = await fetch(`${config.oidc.issuer.replace(/\/$/, '')}/.well-known/openid-configuration`, { signal: AbortSignal.timeout(15000), redirect: 'error' });
    if (!response.ok || (await response.json()).issuer !== config.oidc.issuer) throw new Error();
  } catch { throw new Error('OIDC HTTPS discovery failed or issuer mismatch; check DNS, CA and issuer'); }
  const existingCore = k('get', 'deployment', 'agent-sandbox-controller', '-n', 'agent-sandbox-system', '--ignore-not-found', '-o', 'json').trim();
  if (existingCore && JSON.parse(existingCore).spec.template.spec.containers[0].image !== sources.core.image) throw new Error('Existing core controller differs; owner must resolve the fixed version before installation');
  process.stderr.write('Preflight passed: values/assets, nodes, storage, ingress, Secret keys, TLS, DNS and OIDC discovery. Image availability and browser/HTTP/WS acceptance remain runtime checks.\n');
  if (mode === 'preflight') return;
  k('apply', '--server-side', '--field-manager=dsh-install', '-f', resolve(files, sources.core.pinned));
  k('wait', '--for=condition=Established', 'crd/sandboxes.agents.x-k8s.io', '--timeout=120s');
  k('rollout', 'status', 'deployment/agent-sandbox-controller', '-n', 'agent-sandbox-system', '--timeout=180s');
  k('apply', '-f', resolve(files, sources.runtimeRole.file));
  run('helm', ['install', 'dsh-platform', chart, '--namespace', namespace, '--values', resolve(options['--values']), '--kubeconfig', resolve(options['--kubeconfig']), '--kube-context', options['--context'], '--wait', '--timeout', '5m']);
  process.stderr.write('Platform rollout completed; run the documented two-user acceptance. No user environment was created by the installer.\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
}
