import { createHash } from 'node:crypto'
import { z } from 'zod'
import type { EnvironmentOwner, Identity } from '@dsh/environment-connector-internal'

export type EnvironmentId = Identity<'EnvironmentId'>
export const environmentIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,80}$/u)
  .transform(value => value as EnvironmentId)
export const environmentId = (value: unknown): EnvironmentId => environmentIdSchema.parse(value)
export function ownerEnvironmentId(owner: EnvironmentOwner): EnvironmentId {
  return environmentId('env-' + createHash('sha256').update(JSON.stringify([owner.tenantId, owner.principalId])).digest('hex'))
}
