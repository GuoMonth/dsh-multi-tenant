import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { LocalProcessRuntimeProvider } from '../../src/runtime/providers/local-process.ts'

const fixture = fileURLToPath(new URL('./host.fixture.mjs', import.meta.url))
function provider(mode = '') {
  return new LocalProcessRuntimeProvider(() => ({
    executable: process.execPath, args: [fixture], cwd: process.cwd(), env: { PROBE_MODE: mode },
  }), 150)
}
const spec = { domainId: 'test-domain', generation: 1, version: '0.1.5-rc.2' }

describe('Linux local runtime provider', () => {
  it('starts a real loopback server and releases its listening socket on idempotent stop', async () => {
    const handle = provider().acquire(spec, new AbortController().signal)
    try {
      const ready = await handle.ready
      expect(await (await fetch(ready.endpoint)).text()).toBe(spec.domainId)
      await Promise.all([handle.stop(), handle.stop()])
      await handle.exited
      await expect(fetch(ready.endpoint)).rejects.toThrow()
    } finally { await handle.stop() }
  })

  it('escalates to kill an uncooperative process group including a descendant', async () => {
    const handle = provider('stubborn-tree').acquire(spec, new AbortController().signal)
    try {
      const ready = await handle.ready
      await handle.stop()
      await expect(fetch(ready.endpoint)).rejects.toThrow()
    } finally { await handle.stop() }
  })

  it('rejects a mismatched child version and still disposes the child', async () => {
    const handle = provider('wrong-version').acquire(spec, new AbortController().signal)
    try { await expect(handle.ready).rejects.toThrow('identity mismatch') }
    finally { await handle.stop() }
  })

  it('owns spawn failure and stopping before readiness', async () => {
    const missing = new LocalProcessRuntimeProvider(() => ({
      executable: '/does-not-exist/dsh', args: [], cwd: process.cwd(), env: {},
    })).acquire(spec, new AbortController().signal)
    await expect(missing.ready).rejects.toThrow('ENOENT')
    await missing.stop()
    const pending = provider('never-ready').acquire(spec, new AbortController().signal)
    const rejected = expect(pending.ready).rejects.toThrow('stopped before readiness')
    await pending.stop()
    await rejected
  })
})
