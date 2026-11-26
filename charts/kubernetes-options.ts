import { z } from 'zod'

interface ResourceQuantities {
  readonly cpu: string
  readonly memory: string
}

/** Administrator-only configuration for the bundled Kubernetes adapter. */
export interface EnvironmentRuntimeOptions {
  readonly kubernetes: {
    readonly server: string
    readonly caFile: string
    readonly tokenFile: string
  }
  readonly namespacePrefix: string
  readonly domain: string
  readonly image: string
  readonly storage: {
    readonly size: string
    readonly storageClassName: string
  }
  readonly resources: {
    readonly requests: ResourceQuantities
    readonly limits: ResourceQuantities
  }
  readonly platformNamespace: string
}

const text = z.string().min(1)
const quantities = z.strictObject({ cpu: text, memory: text })
export const runtimeOptionsSchema = z.strictObject({
  kubernetes: z.strictObject({ server: text, caFile: text, tokenFile: text }),
  namespacePrefix: text,
  domain: text,
  image: z.string().regex(/^\S+@sha256:[a-f0-9]{64}$/u),
  storage: z.strictObject({ size: text, storageClassName: text }),
  resources: z.strictObject({ requests: quantities, limits: quantities }),
  platformNamespace: text,
})
