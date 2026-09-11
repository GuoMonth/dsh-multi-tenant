import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SQLiteDomainRepository } from '../../src/domain/sqlite.ts'
import { DomainRuntimeCoordinator } from '../../src/runtime/coordinator.ts'
import { LocalProcessRuntimeProvider } from '../../src/runtime/providers/local-process.ts'

const repository = new SQLiteDomainRepository(process.env.PROBE_DIRECTORY)
const provider = new LocalProcessRuntimeProvider(() => ({
  executable: process.execPath,
  args: [fileURLToPath(new URL('./host.fixture.mjs', import.meta.url))],
  cwd: process.cwd(),
  env: { PROBE_PID_FILE: join(process.env.PROBE_DIRECTORY, 'runtime.pid') },
}))
const coordinator = new DomainRuntimeCoordinator(repository, provider, '0.1.5-rc.2')
const admission = await coordinator.ensure({ tenantId: 'acme', principalId: 'alice' })
process.send({ domainId: admission.domainId, endpoint: admission.endpoint })
process.on('message', async () => { await coordinator.close(); process.exit(0) })
