import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { DockerRuntimeProvider } from '../../src/runtime/providers/docker.ts'

it('rejects an unconnectable Unix socket path before acquiring a container', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-socket-'))
  try {
    const provider = new DockerRuntimeProvider({ image: `sha256:${'a'.repeat(64)}`,
      directory: join(root, 'long-platform-directory-'.repeat(5)),
      profileDirectory: () => { throw new Error('must reject before provisioning') }, uid: 1000, gid: 1000 })
    const handle = provider.acquire({ domainId: '00000000-0000-4000-8000-000000000001', generation: 1, version: '0.1.5-rc.2' }, new AbortController().signal)
    await expect(handle.ready).rejects.toThrow('too long for a Linux Unix socket')
    await handle.stop()
    await handle.exited
  } finally { await rm(root, { recursive: true, force: true }) }
})
