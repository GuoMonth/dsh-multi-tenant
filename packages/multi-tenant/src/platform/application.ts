import { createAgentEnvironmentRuntime } from '@dsh/environment-connector-internal'
import { EnvironmentBindingStore } from './bindings.ts'
import { createEnvironmentControl } from './control.ts'
import { createOIDCAuthentication } from './oidc.ts'
import { createPlatformIngress } from './ingress.ts'
import { listenAdmin } from './admin.ts'
import { listenServer, settleCleanup } from './work.ts'
import { parseMembership, type Configuration } from './configuration.ts'
import type { StartupStage } from './startup.ts'

const defaults = {
  createAgentEnvironmentRuntime,
  openStore: (path: string) => new EnvironmentBindingStore(path),
  createEnvironmentControl,
  createOIDCAuthentication,
  createPlatformIngress,
  listenAdmin,
  listenServer,
}

/** The process owns startup, reload and reverse-order resource disposal. */
export function createPlatformApplication(config: Configuration, secret: string | undefined, dependencies = defaults) {
  const lifecycle = new AbortController()
  let stage: StartupStage = 'runtime'
  let store: EnvironmentBindingStore | undefined
  let authentication: Awaited<ReturnType<typeof createOIDCAuthentication>> | undefined
  let ingress: ReturnType<typeof createPlatformIngress> | undefined
  let admin: Awaited<ReturnType<typeof listenAdmin>> | undefined
  let starting: Promise<void> | undefined
  let reloading: Promise<boolean> | undefined
  let closing: Promise<void> | undefined
  async function acquire() {
    lifecycle.signal.throwIfAborted()
    if (config.runtime.domain !== config.oidc.siteDomain && !config.runtime.domain.endsWith('.' + config.oidc.siteDomain))
      throw new Error('Environment domain must use the configured OIDC site')
    const runtime = dependencies.createAgentEnvironmentRuntime(config.runtime)
    stage = 'state'
    store = dependencies.openStore(config.stateFile)
    const control = dependencies.createEnvironmentControl(runtime, store)
    stage = 'oidc'
    authentication = await dependencies.createOIDCAuthentication(
      config.oidc, secret, control.environments, control.origins, config.members, lifecycle.signal, control,
    )
    lifecycle.signal.throwIfAborted()
    ingress = dependencies.createPlatformIngress(runtime, authentication.authenticator, control.environments)
    stage = 'admin'
    admin = await dependencies.listenAdmin(config.adminSocket, control, lifecycle.signal)
    lifecycle.signal.throwIfAborted()
    stage = 'listen'
    await dependencies.listenServer(ingress.server, { port: config.port, host: config.host, signal: lifecycle.signal })
    lifecycle.signal.throwIfAborted()
  }
  function close(): Promise<void> {
    if (closing) return closing
    lifecycle.abort()
    closing = (async () => {
      // Startup may still acquire a resource before observing cancellation.
      await Promise.allSettled([starting, reloading])
      const failures: unknown[] = []
      try {
        await settleCleanup([ingress?.close() ?? Promise.resolve(), admin?.close() ?? Promise.resolve()])
      } catch (cause) {
        failures.push(cause)
      }
      try {
        authentication?.close()
      } catch (cause) {
        failures.push(cause)
      }
      try {
        store?.close()
      } catch (cause) {
        failures.push(cause)
      }
      if (failures.length) throw new AggregateError(failures, 'Platform cleanup failed')
    })()
    return closing
  }
  return {
    get stage() {
      return stage
    },
    get signal() {
      return lifecycle.signal
    },
    start() {
      starting ??= acquire()
      return starting.catch(async (cause: unknown) => {
        try {
          await close()
        } catch (cleanupCause) {
          throw new AggregateError([cause, cleanupCause], 'Startup and cleanup failed')
        }
        throw cause
      })
    },
    reload(read: () => Promise<unknown>): Promise<boolean> {
      if (reloading) return reloading
      const current = authentication
      if (lifecycle.signal.aborted || !current) return Promise.resolve(false)
      reloading = (async () => {
        try {
          const members = parseMembership(await read(), config.oidc.issuer)
          if (lifecycle.signal.aborted) return false
          current.updateMembers(members)
          return true
        } catch {
          if (!lifecycle.signal.aborted) current.updateMembers([])
          return false
        }
      })().finally(() => {
        reloading = undefined
      })
      return reloading
    },
    close,
  }
}
