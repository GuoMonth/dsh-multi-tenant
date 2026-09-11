import { SQLiteDomainRepository } from '../../src/domain/sqlite.ts'
import { DomainRuntimeCoordinator } from '../../src/runtime/coordinator.ts'
import { DockerRuntimeProvider } from '../../src/runtime/providers/docker.ts'
const config = JSON.parse(process.env.PROBE_DOCKER_CONFIG)
const repository = new SQLiteDomainRepository(config.directory)
const provider = new DockerRuntimeProvider({ ...config.provider, profileDirectory: () => config.profile })
const coordinator = new DomainRuntimeCoordinator(repository, provider, '0.1.5-rc.2', 45_000, 20_000)
const admission = await coordinator.ensure({ tenantId: 'probe', principalId: 'crash' })
process.send({ domainId: admission.domainId, generation: admission.generation })
process.on('message', async () => { await coordinator.close(); process.exit(0) })
