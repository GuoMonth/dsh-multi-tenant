import { isAbsolute } from 'node:path'
import { pathToFileURL } from 'node:url'
import { z } from 'zod'
import { ENVIRONMENT_CONTRACT_VERSION, type AgentEnvironmentRuntime, type EnvironmentAdapterFactory } from '../environment-contract.ts'
import { platformConfiguration } from './configuration.ts'

const moduleSchema = z.object({
  contractVersion: z.literal(ENVIRONMENT_CONTRACT_VERSION),
  createRuntime: z.custom<EnvironmentAdapterFactory>(value => typeof value === 'function'),
})
const runtimeSchema = z.custom<AgentEnvironmentRuntime>((value) => {
  if (typeof value !== 'object' || value === null) return false
  const methods = ['create', 'inspectAllocation', 'inspect', 'connect', 'start', 'stop', 'delete'] as const
  const migration: unknown = Reflect.get(value, 'migrateLegacyReference')
  return methods.every(method => typeof Reflect.get(value, method) === 'function') &&
    (migration === undefined || typeof migration === 'function')
})

export const startupConfiguration = platformConfiguration.safeExtend({
  runtime: z.strictObject({ modulePath: z.string().refine(isAbsolute), options: z.unknown() }),
})

export async function loadRuntime(config: z.infer<typeof startupConfiguration>['runtime'], siteDomain: string) {
  const imported: unknown = await import(pathToFileURL(config.modulePath).href)
  const adapter = moduleSchema.parse(imported)
  return runtimeSchema.parse(await adapter.createRuntime(config.options, { siteDomain }))
}
