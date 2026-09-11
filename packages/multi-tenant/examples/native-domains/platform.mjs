import { SQLiteDomainRepository, DomainRuntimeCoordinator, DockerRuntimeProvider, createDomainIngress, DSH_RUNTIME_VERSION } from 'dsh-multi-tenant'

/** Called by the trusted embedding server after its IdP/login integration.
 * Provision profiles before admitting users. No platform management RPC is mounted.
 */
export function createPlatform({ directory, runtimeDirectory, image, profileDirectory, authenticator, originFor, uid, gid }) {
  const repository = new SQLiteDomainRepository(directory)
  let runtime
  try {
    runtime = new DomainRuntimeCoordinator(repository,
      new DockerRuntimeProvider({ directory: runtimeDirectory, image, profileDirectory, uid, gid }), DSH_RUNTIME_VERSION, 45_000, 20_000)
    const ingress = createDomainIngress({ authenticator, runtime, originFor })
    return { repository, runtime, server: ingress.server,
      async close() {
        // Always attempt runtime cleanup even if ingress shutdown fails.
        const results = await Promise.allSettled([ingress.close(), runtime.close()])
        const errors = results.filter(item => item.status === 'rejected').map(item => item.reason)
        if (errors.length) throw new AggregateError(errors, 'Platform shutdown failed; repair and retry')
      },
    }
  } catch (error) { repository.close(); throw error }
}
