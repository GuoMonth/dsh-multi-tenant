import type { Context } from '@deepseek-ai/cordis'
import { describe, it } from 'vitest'
import { assertRuntimeCapabilityProviderContract } from '../src/testing.ts'

function markerProvider(ctx: Context, marker: string): void {
  ctx.provide('contractCapability', marker)
}

for (const level of ['tenant', 'principal'] as const) {
  describe(`Runtime capability provider contract (${level})`, () => {
    it('accepts a context-scoped provider with clean lifecycle isolation', async () => {
      await assertRuntimeCapabilityProviderContract({
        serviceName: 'contractCapability',
        level,
        mount: async (ctx, marker) => { await ctx.plugin(markerProvider, marker) },
        fingerprint: ctx => ctx.get('contractCapability') as string | undefined,
      })
    })
  })
}
