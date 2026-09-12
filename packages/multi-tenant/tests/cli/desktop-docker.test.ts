import { expect, it, vi } from 'vitest'
import { DesktopDockerRuntimeProvider } from '../../src/runtime/providers/desktop-docker.ts'
const instance = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const spec = { domainId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', generation: 1, version: '0.1.5-rc.2' }
const name = `dsh-experience-${instance}-${spec.domainId}`
function setup() {
  const provider = new DesktopDockerRuntimeProvider({ instance, image: `sha256:${'0'.repeat(64)}`, principal: () => 'alice' })
  const containers = new Map<string, any>()
  let loseCreate = false
  const docker = vi.spyOn(provider as any, 'docker').mockImplementation(async (...values: unknown[]) => {
    const args = values[0] as string[]
    if (args[0] === 'volume') return args[1] === 'inspect' ? JSON.stringify([{ Labels: { 'dsh.instance': instance, 'dsh.domain': spec.domainId } }]) : ''
    if (args[1] === 'ls') { const requested = args[args.indexOf('--filter') + 1]!.slice('name=^/'.length,-1); return containers.has(requested) ? requested : '' }
    if (args[1] === 'inspect') return JSON.stringify([containers.get(args[2]!)])
    if (args[1] === 'create') {
      const id = args[args.indexOf('--name') + 1]!
      const labels = Object.fromEntries(args.flatMap((value,index) => value === '--label' ? [args[index+1]!.split('=')] : []))
      containers.set(id, { Id:id, Config:{Labels:labels}, State:{ExitCode:0,Running:false} })
      if (loseCreate) throw new Error('lost Docker response')
      return id
    }
    if (args[1] === 'start') return ''
    if (args[1] === 'wait') return await new Promise(() => {})
    if (args[1] === 'rm') { containers.delete(args.at(-1)!); return '' }
    return ''
  })
  return { provider, containers, docker, loseCreate: () => { loseCreate = true } }
}
it('cleans a helper acquired before a lost create response and keeps persistent data', async () => {
  const {provider, containers, docker, loseCreate} = setup(); loseCreate()
  const handle = provider.acquire(spec,new AbortController().signal)
  await expect(handle.ready).rejects.toThrow('lost Docker response')
  await handle.stop()
  expect(containers.size).toBe(0)
  expect(docker.mock.calls.some(([args]) => (args as string[]).slice(0,2).join(' ') === 'volume rm')).toBe(false)
})
it('refuses to remove another generation during recovery', async () => {
  const {provider,containers} = setup()
  containers.set(name,{Id:name,Config:{Labels:{'dsh.instance':instance,'dsh.domain':spec.domainId,'dsh.generation':'9'}}})
  await expect(provider.recover(spec)).rejects.toThrow('foreign')
  expect(containers.size).toBe(1)
})
it('failed startup never destroys a pre-existing foreign runtime', async () => {
  const {provider,containers} = setup()
  containers.set(name,{Id:name,Config:{Labels:{'dsh.claim':'foreign'}}})
  const handle=provider.acquire(spec,new AbortController().signal)
  await expect(handle.ready).rejects.toThrow('recovery')
  await handle.stop()
  expect(containers.size).toBe(1)
})
