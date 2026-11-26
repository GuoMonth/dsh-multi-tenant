// Compile the standalone platform API from source. The tarball smoke exercises the installed API.
import {
  createPlatformApplication, parsePlatformConfiguration,
  type AgentEnvironmentRuntime, type EnvironmentRef,
} from '../../packages/multi-tenant/src/index.ts'
export function platform(value: unknown, runtime: AgentEnvironmentRuntime) {
  return createPlatformApplication(parsePlatformConfiguration(value), undefined, () => runtime)
}
export async function authorizedAccess(runtime: AgentEnvironmentRuntime, ref: EnvironmentRef, signal: AbortSignal) {
  // Platform's authorization must already have run before this call.
  const context={ signal,correlationId:'test-only' }
  const view=await runtime.inspect(ref,context)
  if(view.state!=='Ready') return view
  return runtime.connect(ref,context)
}
