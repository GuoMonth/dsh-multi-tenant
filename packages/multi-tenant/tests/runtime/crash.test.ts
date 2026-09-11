import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { SQLiteDomainRepository } from '../../src/domain/sqlite.ts'
import { DomainRuntimeCoordinator } from '../../src/runtime/coordinator.ts'

it('survives coordinator SIGKILL by refusing to replace its still-live runtime', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-wp2-crash-'))
  const controller = spawn(process.execPath, ['--import', import.meta.resolve('tsx'),
    fileURLToPath(new URL('./controller.fixture.mjs', import.meta.url))], {
    cwd: process.cwd(), env: { ...process.env, PROBE_DIRECTORY: directory }, stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
  })
  let diagnostics = ''
  controller.stderr!.on('data', chunk => { diagnostics += String(chunk) })
  let runtimePid: number | undefined
  let coordinator: DomainRuntimeCoordinator | undefined
  const exit = once(controller, 'exit')
  try {
    const message = await Promise.race([
      once(controller, 'message').then(([value]) => value as { domainId: string; endpoint: string }),
      exit.then(() => { throw new Error(`Controller exited: ${diagnostics}`) }),
    ])
    runtimePid = Number(await readFile(join(directory, 'runtime.pid'), 'utf8'))
    expect(() => new SQLiteDomainRepository(directory)).toThrow('Cannot acquire')
    controller.kill('SIGKILL')
    await exit
    expect(await (await fetch(message.endpoint)).text()).toBe(message.domainId)
    const reopened = new SQLiteDomainRepository(directory)
    coordinator = new DomainRuntimeCoordinator(reopened, { acquire: () => { throw new Error('Must never launch') } }, '0.1.5-rc.2')
    expect(reopened.get(message.domainId)).toMatchObject({ state: 'failed', unresolved: true })
    await expect(coordinator.ensure({ tenantId: 'acme', principalId: 'alice' })).rejects.toThrow('verified runtime recovery')
    expect(await (await fetch(message.endpoint)).text()).toBe(message.domainId)
  } finally {
    if (controller.exitCode === null && controller.signalCode === null) controller.kill('SIGKILL')
    await exit
    if (runtimePid === undefined) {
      try { runtimePid = Number(await readFile(join(directory, 'runtime.pid'), 'utf8')) } catch { /* No child acquired. */ }
    }
    if (runtimePid !== undefined && Number.isSafeInteger(runtimePid) && runtimePid > 1) {
      try { process.kill(-runtimePid, 'SIGKILL') }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error }
    }
    await coordinator?.close()
    await rm(directory, { recursive: true, force: true })
  }
}, 15_000)
