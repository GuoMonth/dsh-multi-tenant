import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'

const engine = vi.hoisted(() => ({ run: vi.fn() }))
vi.mock('node:child_process', async importOriginal => {
  const original = await importOriginal<typeof import('node:child_process')>()
  const { promisify } = await import('node:util')
  return { ...original, execFile: Object.assign(() => {}, { [promisify.custom]: engine.run }) }
})
import { DockerRuntimeProvider } from '../../src/runtime/providers/docker.ts'
const directories: string[] = []
afterEach(async () => { for (const root of directories.splice(0)) await rm(root, { recursive: true, force: true }) })

async function setup({ uncertain = false, failRemoval = false } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'docker-fault-'))
  directories.push(root)
  let current: { Id: string; Config: { Labels: Record<string, string> } } | undefined
  let name = ''
  const calls: string[][] = []
  engine.run.mockReset().mockImplementation(async (_binary: string, args: string[]) => {
    calls.push(args)
    let stdout = ''
    if (args[1] === 'ls') stdout = current ? name : ''
    if (args[1] === 'inspect') stdout = JSON.stringify([current])
    if (args[1] === 'create') {
      name = args[args.indexOf('--name') + 1]!
      const labels = Object.fromEntries(args.flatMap((value, index) => value === '--label' ? [args[index + 1]!.split('=')] : []))
      current = { Id: 'owned-id', Config: { Labels: labels } }
      if (uncertain) throw new Error('create response lost after acquisition')
      stdout = current.Id
    }
    if (args[1] === 'start') throw new Error('native startup failed')
    if (args[1] === 'stop' && failRemoval) throw new Error('stop failed')
    if (args[1] === 'rm') {
      if (failRemoval) throw new Error('remove failed')
      current = undefined
    }
    return { stdout, stderr: '' }
  })
  const provider = new DockerRuntimeProvider({ directory: root, image: `sha256:${'a'.repeat(64)}`, profileDirectory: () => root, uid: process.getuid!(), gid: process.getgid!() })
  return { provider, calls, repair() { failRemoval = false }, get current() { return current } }
}
const spec = { domainId: '00000000-0000-4000-8000-000000000001', generation: 1, version: '0.1.5-rc.2' }

it('attempts removal after graceful stop fails, retains ownership, and retries cleanup', async () => {
  const t = await setup({ failRemoval: true })
  const handle = t.provider.acquire(spec, new AbortController().signal)
  await expect(handle.ready).rejects.toThrow('native startup failed')
  const error = await handle.stop().catch(error => error)
  expect(error).toBeInstanceOf(AggregateError)
  expect(error.errors.map((value: Error) => value.message)).toEqual(['stop failed', 'remove failed'])
  expect(t.calls.filter(args => args[1] === 'rm')).toHaveLength(1)
  expect(t.current).toBeDefined()
  t.repair()
  await handle.stop()
  await handle.exited
  expect(t.current).toBeUndefined()
})

it('reclaims uncertain acquisition only after inspecting its unique claim label', async () => {
  const t = await setup({ uncertain: true })
  const handle = t.provider.acquire(spec, new AbortController().signal)
  await expect(handle.ready).rejects.toThrow('create response lost')
  expect(t.current).toBeDefined()
  await handle.stop()
  expect(t.current).toBeUndefined()
  expect(t.calls.find(args => args[1] === 'rm')).toEqual(['container', 'rm', '--force', 'owned-id'])
})

it('does not remove a foreign claim after an uncertain create response', async () => {
  const t = await setup({ uncertain: true })
  const handle = t.provider.acquire(spec, new AbortController().signal)
  await expect(handle.ready).rejects.toThrow('create response lost')
  t.current!.Config.Labels['dsh.claim'] = 'different-owner'
  await handle.stop()
  expect(t.current).toBeDefined()
  expect(t.calls.filter(args => args[1] === 'rm')).toHaveLength(0)
})

it('refuses recovery when the recorded generation does not own the container', async () => {
  const t = await setup()
  const handle = t.provider.acquire(spec, new AbortController().signal)
  await expect(handle.ready).rejects.toThrow('native startup failed')
  await expect(t.provider.recover({ ...spec, generation: 2 })).rejects.toThrow('foreign runtime generation')
  expect(t.current).toBeDefined()
  await handle.stop()
})
