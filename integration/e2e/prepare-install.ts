// Prepare private fixture inputs; this does not replace charts/install.ts.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { list, parseJson, readJson, record, requiredEnv, string } from '../../scripts/json.ts'
import { dockerNodeAddress, readUsers } from './fixture.ts'
const root = requiredEnv('E_PRIVATE'), evidence = requiredEnv('E_EVIDENCE'), config = requiredEnv('KUBECONFIG')
const k = (args: readonly string[], input?: string) => execFileSync('kubectl', ['--kubeconfig', config, ...args], {
  ...(input === undefined ? {} : { input }), encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
})
const namespace = process.env.E_NAMESPACE || 'dsh-mvp-e-platform'
const cluster = process.env.E_CLUSTER || 'dsh-environment'
const apply = (items: readonly unknown[]) => k(['apply', '-f', '-'], JSON.stringify({
  apiVersion: 'v1', kind: 'List', items,
}))
apply([{
  apiVersion: 'v1', kind: 'Namespace', metadata: {
    name: namespace,
  },
}])
apply([{
  apiVersion: 'v1', kind: 'Secret', metadata: {
    name: 'reference-tls', namespace,
  }, type: 'kubernetes.io/tls', data: {
    'tls.crt': readFileSync(root + '/tls.crt').toString('base64'), 'tls.key': readFileSync(root + '/tls.key').toString('base64'),
  },
}, {
  apiVersion: 'v1', kind: 'Secret', metadata: {
    name: 'reference-oidc', namespace,
  }, data: {
    'client-secret': readFileSync(root + '/client-secret').toString('base64'),
  },
}, {
  apiVersion: 'v1', kind: 'Secret', metadata: {
    name: 'reference-ca', namespace,
  }, data: {
    'ca.crt': readFileSync(root + '/ca.crt').toString('base64'),
  },
}])
const images = record(readJson(evidence + '/images.json'), 'fixture images')
const users = readUsers(root)
// Dex's public subject is its protobuf ID+connector reference encoded base64url.
const subject = (id: string) => Buffer.concat([Buffer.from([10, Buffer.byteLength(id)]), Buffer.from(id), Buffer.from([18, 5]), Buffer.from('local')]).toString('base64url')
const values = {
  platformImage: images.platformImage ?? 'docker.io/library/dsh-environment@' + string(images.platform, 'local platform image'), workloadImage: images.workloadImage || 'docker.io/library/dsh-environment@sha256:338d50f33680b8b1e10c6691596118e2273e48f084a609ea2734143c54a5feff', domain: 'dsh-environment.test', ingressClassName: 'dsh-mvp-e', tlsSecretName: 'reference-tls', oidc: {
    issuer: 'https://idp.dsh-environment.test', clientId: 'dsh-platform', secretName: 'reference-oidc', secretKey: 'client-secret', caSecretName: 'reference-ca', caSecretKey: 'ca.crt',
  }, members: users.map(u => ({
    issuer: 'https://idp.dsh-environment.test', subject: subject(u.userID), owner: {
      tenantId: 'e-reference', principalId: u.name,
    },
  })), storageClassName: 'standard', storageSize: '1Gi', controlStorageSize: '1Gi', namespacePrefix: 'dsh-mvp-e-user', resources: {
    requests: {
      cpu: '100m', memory: '256Mi',
    }, limits: {
      cpu: '1', memory: '1Gi',
    },
  },
}
writeFileSync(root + '/values.json', JSON.stringify(values, null, 2) + '\n', {
  mode: 0o600,
})
const kube = record(parseJson(k(['config', 'view', '--raw', '--minify', '-o', 'json'])), 'test kubeconfig')
const clusterEntry = record(list(kube.clusters, 'kubeconfig clusters')[0], 'kubeconfig cluster entry')
record(clusterEntry.cluster, 'kubeconfig cluster').server = `https://${cluster}-control-plane:6443`
writeFileSync(root + '/container-kubeconfig', JSON.stringify(kube), {
  mode: 0o600,
})
const coredns = record(parseJson(k(['get', 'configmap', 'coredns', '-n', 'kube-system', '-o', 'json'])), 'CoreDNS ConfigMap')
if (!existsSync(root + '/coredns-before.json'))
  writeFileSync(root + '/coredns-before.json', JSON.stringify(coredns), {
    mode: 0o600,
  })
const ingress = record(parseJson(k(['get', 'service', 'traefik', '-n', 'dsh-mvp-e-system', '-o', 'json'])), 'Traefik Service')
const ip = string(record(ingress.spec, 'Traefik Service spec').clusterIP, 'Traefik IP')
const dnsData = record(coredns.data, 'CoreDNS data')
const corefile = string(dnsData.Corefile, 'CoreDNS configuration')
if (!corefile.includes('idp.dsh-environment.test')) {
  dnsData.Corefile = corefile.replace('    kubernetes ', `    hosts {\n        ${ip} idp.dsh-environment.test\n        fallthrough\n    }\n    kubernetes `)
  k(['replace', '-f', '-'], JSON.stringify(coredns))
  // Start both DNS replicas with the fixture record before the platform's first issuer lookup.
  k(['rollout', 'restart', 'deployment/coredns', '-n', 'kube-system'])
}
k(['rollout', 'status', 'deployment/coredns', '-n', 'kube-system', '--timeout=180s'])
const node = dockerNodeAddress(execFileSync('docker', ['inspect', `${cluster}-control-plane`], {
  encoding: 'utf8',
}))
writeFileSync(evidence + '/reference-network.json', JSON.stringify({
  namespace, nodeAddress: node, issuerService: ip, domain: values.domain, issuer: values.oidc.issuer,
}, null, 2) + '\n')
console.log('Prepared private values and reference DNS; no credential values emitted')
