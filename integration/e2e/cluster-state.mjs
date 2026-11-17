// Failure-only resource projection. Never collect Secrets, ConfigMaps, Pod env,
// browser state or application logs into the public evidence draft.
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const query = args => JSON.parse(execFileSync('kubectl', args, { encoding: 'utf8', timeout: 20000 }))
const namespaces = query(['get', 'namespaces', '-o', 'json']).items
  .filter(item => item.metadata.name.startsWith('dsh-mvp-'))
const metadata = item => ({
  name: item.metadata.name, namespace: item.metadata.namespace, uid: item.metadata.uid,
  resourceVersion: item.metadata.resourceVersion, generation: item.metadata.generation,
  deletionTimestamp: item.metadata.deletionTimestamp,
  annotations: Object.fromEntries(Object.entries(item.metadata.annotations || {}).filter(([key]) => key.startsWith('environment.dsh.io/'))),
  ownerReferences: item.metadata.ownerReferences,
})
const report = { namespaces: namespaces.map(metadata), resources: [], errors: [] }
for (const namespace of namespaces) {
  for (const kind of ['sandboxes.agents.x-k8s.io', 'persistentvolumeclaims', 'serviceaccounts', 'networkpolicies', 'pods', 'services', 'endpointslices']) {
    try {
      for (const item of query(['get', kind, '-n', namespace.metadata.name, '-o', 'json']).items) {
        const projected = { kind: item.kind, metadata: metadata(item), status: item.status }
        if (item.kind === 'Pod') projected.spec = {
          nodeName: item.spec.nodeName, serviceAccountName: item.spec.serviceAccountName,
          securityContext: item.spec.securityContext,
          containers: item.spec.containers.map(container => ({ name: container.name, image: container.image })),
        }
        else if (item.kind !== 'Sandbox') projected.spec = item.spec
        else projected.spec = {
          operatingMode: item.spec.operatingMode, shutdownPolicy: item.spec.shutdownPolicy,
          service: item.spec.service, podTemplateMetadata: item.spec.podTemplate?.metadata,
        }
        report.resources.push(projected)
      }
    }
    catch { report.errors.push({ namespace: namespace.metadata.name, kind }) }
  }
}
writeFileSync(resolve(process.env.E_EVIDENCE, 'failure-resources.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 })
