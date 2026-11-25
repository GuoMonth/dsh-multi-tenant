// Failure-only resource projection. Never publish Pod env, Secrets, or application logs.
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import { list, parseJson, record, requiredEnv, string } from '../../scripts/json.ts'

const kinds = {
  'sandboxes.agents.x-k8s.io': 'Sandbox',
  persistentvolumeclaims: 'PersistentVolumeClaim',
  serviceaccounts: 'ServiceAccount',
  networkpolicies: 'NetworkPolicy',
  pods: 'Pod',
  services: 'Service',
  endpointslices: 'EndpointSlice',
} as const
type ResourceKind = (typeof kinds)[keyof typeof kinds]

function query(args: readonly string[]): Record<string, unknown>[] {
  const response = record(parseJson(execFileSync('kubectl', args, { encoding: 'utf8', timeout: 20_000 })), 'Kubernetes list')
  return list(response.items, 'Kubernetes list items').map(item => record(item, 'Kubernetes resource'))
}

function metadata(item: Record<string, unknown>) {
  const source = record(item.metadata, 'resource metadata')
  const annotations = record(source.annotations ?? {}, 'resource annotations')
  return {
    name: string(source.name, 'resource name'), namespace: source.namespace, uid: source.uid,
    resourceVersion: source.resourceVersion, generation: source.generation, deletionTimestamp: source.deletionTimestamp,
    annotations: Object.fromEntries(Object.entries(annotations).filter(([key]) => key.startsWith('environment.dsh.io/'))),
    ownerReferences: source.ownerReferences,
  }
}

export function projectResource(item: Record<string, unknown>, kind: ResourceKind): Record<string, unknown> {
  // Typed Kubernetes lists can omit item TypeMeta. The queried kind selects the allowlist.
  assert.ok(item.kind === undefined || item.kind === kind, 'Unexpected resource kind')
  const projected = { kind, metadata: metadata(item), status: item.status }
  if (kind === 'Pod') {
    const spec = record(item.spec, 'Pod spec')
    return {
      ...projected, spec: {
        nodeName: spec.nodeName, serviceAccountName: spec.serviceAccountName, securityContext: spec.securityContext,
        containers: list(spec.containers, 'Pod containers').map((value) => {
          const container = record(value, 'Pod container')
          return { name: container.name, image: container.image }
        }),
      },
    }
  }
  if (kind === 'EndpointSlice') return { ...projected, endpoints: item.endpoints, ports: item.ports }
  if (kind === 'Sandbox') {
    const spec = record(item.spec, 'Sandbox spec')
    return {
      ...projected, spec: {
        operatingMode: spec.operatingMode, shutdownPolicy: spec.shutdownPolicy, service: spec.service,
        podTemplateMetadata: spec.podTemplate === undefined ? undefined : record(spec.podTemplate, 'Sandbox template').metadata,
      },
    }
  }
  return { ...projected, spec: item.spec }
}

function main(): void {
  const namespaces = query(['get', 'namespaces', '-o', 'json']).map(metadata).filter(item => item.name.startsWith('dsh-mvp-'))
  const resources: Record<string, unknown>[] = []
  const errors: { namespace: string; kind: string }[] = []
  for (const namespace of namespaces) {
    for (const [resource, kind] of Object.entries(kinds)) {
      try {
        for (const item of query(['get', resource, '-n', namespace.name, '-o', 'json']))
          resources.push(projectResource(item, kind))
      } catch { errors.push({ namespace: namespace.name, kind: resource }) }
    }
  }
  writeFileSync(resolve(requiredEnv('E_EVIDENCE'), 'failure-resources.json'),
    JSON.stringify({ namespaces, resources, errors }, null, 2) + '\n', { mode: 0o600 })
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
