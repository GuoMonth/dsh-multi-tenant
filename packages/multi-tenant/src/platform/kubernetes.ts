import { createAgentEnvironmentRuntime, EnvironmentError as ConnectorError } from '@dsh/environment-connector-internal'
import { EnvironmentError, type AgentEnvironmentRuntime } from '../environment-contract.ts'
import { platformConfiguration } from './configuration.ts'
import { runtimeOptionsSchema, type EnvironmentRuntimeOptions } from './kubernetes-options.ts'

const configuration = platformConfiguration.safeExtend({ runtime: runtimeOptionsSchema })
export const parseKubernetesConfiguration = (value: unknown) => configuration.parse(value)

async function translateFailure<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    if (error instanceof ConnectorError) throw new EnvironmentError(error.toJSON(), { cause: error })
    throw error
  }
}

export function createKubernetesRuntime(options: EnvironmentRuntimeOptions, siteDomain: string): AgentEnvironmentRuntime {
  if (options.domain !== siteDomain && !options.domain.endsWith('.' + siteDomain))
    throw new Error('Environment domain must use the configured OIDC site')
  const runtime = createAgentEnvironmentRuntime(options)
  return {
    create: (intent, context) => translateFailure(() => runtime.create(intent, context)),
    inspectAllocation: (intent, expected, context) => translateFailure(() => runtime.inspectAllocation(intent, expected, context)),
    inspect: (ref, context) => translateFailure(() => runtime.inspect(ref, context)),
    stop: (ref, revision, context) => translateFailure(() => runtime.stop(ref, revision, context)),
    start: (ref, revision, context) => translateFailure(() => runtime.start(ref, revision, context)),
    delete: (ref, revision, context) => translateFailure(() => runtime.delete(ref, revision, context)),
    async connect(ref, context) {
      const connection = await translateFailure(() => runtime.connect(ref, context))
      return {
        origin: connection.origin,
        forward: (request, response) => translateFailure(() => connection.forward(request, response)),
        upgrade: (request, socket, head) => translateFailure(() => connection.upgrade(request, socket, head)),
      }
    },
  }
}
