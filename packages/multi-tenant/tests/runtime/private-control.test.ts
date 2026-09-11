import { mkdtemp, rm, symlink, writeFile, rename } from 'node:fs/promises'
import { createServer, connect } from 'node:net'
import { once } from 'node:events'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { openPrivateSocket, readRuntimeReady } from '../../src/runtime/providers/private-control.ts'

it('does not follow workload links to platform files or oversized readiness', async () => {
  const root = await mkdtemp(join(tmpdir(), 'control-'))
  try {
    await writeFile(join(root, 'secret'), '{"platformSecret":"never-read"}')
    await symlink(join(root, 'secret'), join(root, 'ready'))
    await expect(readRuntimeReady(join(root, 'ready'))).rejects.toThrow()
    await expect(openPrivateSocket(join(root, 'ready'))).rejects.toThrow('not a link')
    await rm(join(root, 'ready'))
    await writeFile(join(root, 'ready'), ' '.repeat(16_385))
    await expect(readRuntimeReady(join(root, 'ready'))).rejects.toThrow('16 KiB')
  } finally { await rm(root, { recursive: true, force: true }) }
})

it('keeps the admitted socket inode when a workload replaces its path with a foreign listener', async () => {
  const root = await mkdtemp(join(tmpdir(), 'socket-'))
  const own = createServer(socket => socket.end('own'))
  const foreign = createServer(socket => socket.end('PLATFORM'))
  let pinned
  try {
    own.listen(join(root, 'own')); foreign.listen(join(root, 'foreign'))
    await Promise.all([once(own, 'listening'), once(foreign, 'listening')])
    pinned = await openPrivateSocket(join(root, 'own'))
    await rename(join(root, 'own'), join(root, 'moved'))
    await symlink(join(root, 'foreign'), join(root, 'own'))
    const client = connect(pinned.path)
    client.setEncoding('utf8')
    const closed = once(client, 'close')
    expect((await once(client, 'data'))[0]).toBe('own')
    await closed
    await expect(openPrivateSocket(join(root, 'own'))).rejects.toThrow('not a link')
  } finally {
    await pinned?.file.close()
    await Promise.all([own, foreign].map(server => new Promise<void>(resolve => server.close(() => resolve()))))
    await rm(root, { recursive: true, force: true })
  }
})
