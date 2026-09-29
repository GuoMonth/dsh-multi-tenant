// Compiles from the installed exact tarball. No fake production constructor.
import type { AgentEnvironmentRuntime, EnvironmentRef, EnvironmentRuntimeOptions } from '../../packages/multi-tenant/src/environment-contract.js'
export const options: EnvironmentRuntimeOptions = {
  kubernetes: {server:'https://kubernetes.default.svc',caFile:'/platform/ca.crt',tokenFile:'/platform/token'},
  namespacePrefix:'dsh-user',platformNamespace:'dsh-platform',domain:'workspaces.example.test',
  image:`example.test/dsh@sha256:${'a'.repeat(64)}`, storage:{size:'10Gi',storageClassName:'standard'},
  resources:{requests:{cpu:'100m',memory:'256Mi'},limits:{cpu:'1',memory:'1Gi'}},
}
export async function authorizedAccess(runtime: AgentEnvironmentRuntime, ref: EnvironmentRef, signal: AbortSignal) {
  // Platform's authorization must already have run before this call.
  const context={signal,correlationId:'test-only'}
  const view=await runtime.inspect(ref,context)
  if(view.state!=='Ready') return view
  return runtime.connect(ref,context)
}
