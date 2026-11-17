import { z } from 'zod'
import { ownerSchema, runtimeOptionsSchema } from '@dsh/environment-connector-internal'

const text = z.string().min(1)
const member = z.strictObject({ issuer: text, subject: text, owner: ownerSchema })
const members = z.array(member).superRefine((values, ctx) => {
  const keys = new Set<string>()
  for (const [index, value] of values.entries()) {
    const key = JSON.stringify([value.issuer, value.subject])
    if (keys.has(key)) ctx.addIssue({ code: 'custom', path: [index], message: 'Duplicate member mapping' })
    keys.add(key)
  }
})
const configuration = z.strictObject({
  runtime: runtimeOptionsSchema,
  stateFile: text,
  adminSocket: text,
  oidc: z.strictObject({
    issuer: text, clientId: text, platformOrigin: text, siteDomain: text,
    clientSecretFile: text.optional(), sessionLifetimeMs: z.number().int().min(60_000).max(3_600_000).optional(),
  }),
  members,
  host: text,
  port: z.number().int().min(1).max(65535),
}).superRefine((value, ctx) => {
  for (const [index, entry] of value.members.entries())
    if (entry.issuer !== value.oidc.issuer)
      ctx.addIssue({ code: 'custom', path: ['members', index, 'issuer'], message: 'Issuer must match configured issuer' })
})
export type Configuration = z.infer<typeof configuration>
export function parseConfiguration(value: unknown): Configuration {
  return configuration.parse(value)
}
/** Reload intentionally admits only membership; all other changes still require restart. */
export function parseMembership(value: unknown, issuer: string) {
  const parsed = z.object({ members }).parse(value).members
  if (parsed.some(entry => entry.issuer !== issuer)) throw new Error('Membership issuer mismatch')
  return parsed
}
