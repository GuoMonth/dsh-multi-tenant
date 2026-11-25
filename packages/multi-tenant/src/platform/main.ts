import { randomUUID } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import { startupDiagnostic, type StartupStage } from './startup.ts'
import { createKubernetesRuntime, parseKubernetesConfiguration } from './kubernetes.ts'
import { createPlatformApplication } from './application.ts'

let startupStage: StartupStage = 'configuration'
async function main() {
  const filename = process.argv[2]
  if (!filename) throw new Error('Configuration required')
  const parsed: unknown = JSON.parse(await readFile(filename, 'utf8'))
  const { runtime, ...config } = parseKubernetesConfiguration(parsed)
  startupStage = 'secret'
  let secret: string | undefined
  if (config.oidc.clientSecretFile) {
    const info = await stat(config.oidc.clientSecretFile)
    if (!info.isFile() || (info.mode & 0o077) !== 0) throw new Error('Client secret must be private')
    secret = (await readFile(config.oidc.clientSecretFile, 'utf8')).trim()
    if (!secret) throw new Error('Empty client secret')
  }
  const app = createPlatformApplication(config, secret, () => createKubernetesRuntime(runtime, config.oidc.siteDomain))
  const status = { stopping: false }
  const detach = () => {
    process.off('SIGTERM', stop)
    process.off('SIGINT', stop)
    process.off('SIGHUP', reload)
  }
  const stop = () => {
    if (status.stopping) return
    status.stopping = true
    process.off('SIGHUP', reload)
    void app.close().catch(() => {
      console.error(JSON.stringify({ code: 'PlatformShutdownFailed', nextAction: 'Inspect process shutdown and private state before restarting' }))
      process.exitCode = 1
    }).finally(detach)
  }
  const reload = () => {
    void app.reload(async () => {
      const value: unknown = JSON.parse(await readFile(filename, 'utf8'))
      return value
    }).then((accepted) => {
      if (!accepted && !app.signal.aborted) console.error(JSON.stringify({ code: 'MembershipReloadRejected',
        nextAction: 'Fix members in configuration and send SIGHUP again; all sessions were revoked' }))
    })
  }
  process.on('SIGTERM', stop)
  process.on('SIGINT', stop)
  try {
    await app.start()
    process.on('SIGHUP', reload)
    console.log('Environment platform listening with OIDC authentication')
  } catch (cause) {
    startupStage = app.stage
    await app.close()
    if (!status.stopping) throw cause
  } finally {
    if (app.signal.aborted) detach()
  }
}
main().catch(() => {
  console.error(JSON.stringify(startupDiagnostic(startupStage, randomUUID())))
  process.exitCode = 1
})
