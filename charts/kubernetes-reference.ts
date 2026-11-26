import { z } from 'zod'
import {
  ENVIRONMENT_CONTRACT_VERSION, EnvironmentError, intentSchema, parseEnvironmentRef,
  type AgentEnvironmentRuntime, type EnvironmentAdapterFactory, type EnvironmentContext, type EnvironmentDeletion,
  type EnvironmentFailure, type EnvironmentIntent, type EnvironmentMutation, type EnvironmentRef,
  type EnvironmentView, type ResourceVersion,
} from '../packages/multi-tenant/src/environment-contract.ts'
import { runtimeOptionsSchema, type EnvironmentRuntimeOptions } from './kubernetes-options.ts'

const identity = z.string().min(1).max(256)
const resource = z.strictObject({ name: identity, uid: identity })
const legacyRefSchema = z.strictObject({ ...intentSchema.shape, namespace: identity, sandbox: resource, data: resource })
const locatorSchema = z.strictObject({ namespace: identity, sandboxName: identity, dataName: identity })
type LegacyRef = z.infer<typeof legacyRefSchema>
type LegacyView = Omit<EnvironmentView, 'ref'> & { ref: LegacyRef }
type LegacyMutation = Omit<EnvironmentMutation, 'view'> & { view: LegacyView }
type LegacyDeletion = Omit<EnvironmentDeletion, 'ref'> & { ref: LegacyRef }
type Mutation = (ref: LegacyRef, revision: ResourceVersion, context: EnvironmentContext) => Promise<LegacyMutation>
interface Connector {
  create(intent: EnvironmentIntent, context: EnvironmentContext): Promise<LegacyView>
  inspectAllocation(intent: EnvironmentIntent, expected: LegacyRef | undefined, context: EnvironmentContext): Promise<LegacyView | null>
  inspect(ref: LegacyRef, context: EnvironmentContext): Promise<LegacyView>
  connect(ref: LegacyRef, context: EnvironmentContext): ReturnType<AgentEnvironmentRuntime['connect']>
  stop: Mutation
  start: Mutation
  delete(ref: LegacyRef, revision: ResourceVersion, context: EnvironmentContext): Promise<LegacyDeletion>
}

const connectorPackage = '@dsh/environment-connector-internal'
const connectorSchema = z.object({
  createAgentEnvironmentRuntime: z.custom<(options: EnvironmentRuntimeOptions) => Connector>(value => typeof value === 'function'),
  EnvironmentError: z.custom<typeof EnvironmentError>(value => typeof value === 'function'),
})

function fromConnector({ allocationKey, owner, namespace, sandbox, data }: LegacyRef): EnvironmentRef {
  return parseEnvironmentRef({
    allocationKey, owner, instanceId: sandbox.uid, storageId: data.uid,
    locator: JSON.stringify({ namespace, sandboxName: sandbox.name, dataName: data.name }),
  })
}

export function toConnector(ref: EnvironmentRef): LegacyRef {
  const location: unknown = JSON.parse(ref.locator ?? 'null')
  const { namespace, sandboxName, dataName } = locatorSchema.parse(location)
  return { allocationKey: ref.allocationKey, owner: ref.owner, namespace,
    sandbox: { name: sandboxName, uid: ref.instanceId }, data: { name: dataName, uid: ref.storageId } }
}

const viewFromConnector = (view: LegacyView): EnvironmentView => ({ ...view, ref: fromConnector(view.ref) })
export const contractVersion = ENVIRONMENT_CONTRACT_VERSION
export const createRuntime: EnvironmentAdapterFactory = async (value, { siteDomain }) => {
  const options = runtimeOptionsSchema.parse(value)
  if (options.domain !== siteDomain && !options.domain.endsWith('.' + siteDomain))
    throw new Error('Environment domain must use the configured OIDC site')
  const imported: unknown = await import(connectorPackage)
  const { createAgentEnvironmentRuntime, EnvironmentError: ConnectorError } = connectorSchema.parse(imported)
  const connector = createAgentEnvironmentRuntime(options)
  async function translate<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation()
    } catch (cause) {
      if (cause instanceof ConnectorError) {
        const failure: EnvironmentFailure = cause.toJSON()
        throw new EnvironmentError(failure, { cause })
      }
      throw cause
    }
  }
  return {
    migrateLegacyReference: value => fromConnector(legacyRefSchema.parse(value)),
    create: (intent, context) => translate(async () => viewFromConnector(await connector.create(intent, context))),
    async inspectAllocation(intent, expected, context) {
      const view = await translate(() => connector.inspectAllocation(intent, expected && toConnector(expected), context))
      return view && viewFromConnector(view)
    },
    inspect: (ref, context) => translate(async () => viewFromConnector(await connector.inspect(toConnector(ref), context))),
    stop: (ref, revision, context) => translate(async () => {
      const result = await connector.stop(toConnector(ref), revision, context)
      return { ...result, view: viewFromConnector(result.view) }
    }),
    start: (ref, revision, context) => translate(async () => {
      const result = await connector.start(toConnector(ref), revision, context)
      return { ...result, view: viewFromConnector(result.view) }
    }),
    delete: (ref, revision, context) => translate(async () => {
      const result = await connector.delete(toConnector(ref), revision, context)
      return { ...result, ref: fromConnector(result.ref) }
    }),
    async connect(ref, context) {
      const connection = await translate(() => connector.connect(toConnector(ref), context))
      return {
        origin: connection.origin,
        forward: (request, response) => translate(() => connection.forward(request, response)),
        upgrade: (request, socket, head) => translate(() => connection.upgrade(request, socket, head)),
      }
    },
  }
}
