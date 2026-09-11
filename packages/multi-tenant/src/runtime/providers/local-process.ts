import { spawn } from 'node:child_process'
import { readdir, readFile } from 'node:fs/promises'
import { isAbsolute } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import type { RuntimeHandle, RuntimeProvider, RuntimeReady, RuntimeSpec } from '../provider.ts'

export interface LocalRuntimeCommand {
  readonly executable: string
  readonly args: readonly string[]
  readonly cwd: string
  /** Explicit environment; platform process.env is never implicitly copied. */
  readonly env: Readonly<Record<string, string>>
}

/** Excludes zombies: they own no open files/listeners and may await a host reaper.
 * This /proc check is for trusted local workloads. setsid/daemon escape is NOT contained.
 */
async function groupAlive(group: number): Promise<boolean> {
  for (const name of await readdir('/proc')) {
    if (!/^\d+$/.test(name)) continue
    let stat: string
    try { stat = await readFile(`/proc/${name}/stat`, 'utf8') }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT' || (error as NodeJS.ErrnoException).code === 'ESRCH') continue
      throw error
    }
    const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ')
    if (Number(fields[2]) === group && fields[0] !== 'Z' && fields[0] !== 'X') return true
  }
  return false
}

function signalGroup(group: number, signal: NodeJS.Signals): void {
  try { process.kill(-group, signal) }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error }
}

/** Linux development provider, not a security sandbox. The trusted entrypoint
 * must send runtime-ready over Node IPC only after native services are usable.
 * This provider owns the whole process group, including normal MCP descendants.
 */
export class LocalProcessRuntimeProvider implements RuntimeProvider {
  constructor(
    private readonly command: (spec: RuntimeSpec) => LocalRuntimeCommand,
    private readonly graceMs = 1_000,
  ) {
    if (process.platform !== 'linux') throw new Error('Local process provider requires Linux /proc')
    if (!Number.isSafeInteger(graceMs) || graceMs <= 0 || graceMs > 60_000) throw new TypeError('Invalid process grace period')
  }

  acquire(spec: RuntimeSpec, signal: AbortSignal): RuntimeHandle {
    signal.throwIfAborted()
    const command = this.command(spec)
    if (!isAbsolute(command.executable) || !isAbsolute(command.cwd)) throw new Error('Runtime executable and cwd must be absolute')
    const child = spawn(command.executable, [...command.args], {
      cwd: command.cwd,
      env: {
        ...command.env,
        DSH_DOMAIN_ID: spec.domainId,
        DSH_RUNTIME_GENERATION: String(spec.generation),
        DSH_RUNTIME_VERSION: spec.version,
      },
      shell: false,
      detached: true,
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    })
    let resolveReady: (ready: RuntimeReady) => void
    let rejectReady: (reason: unknown) => void
    const ready = new Promise<RuntimeReady>((resolve, reject) => { resolveReady = resolve; rejectReady = reject })
    // A stop before the coordinator awaits readiness must never create an unhandled rejection.
    void ready.catch(() => {})
    let exit: () => void
    const exited = new Promise<void>(resolve => { exit = resolve })
    child.once('error', error => { rejectReady(error); exit() })
    child.once('exit', (code, exitSignal) => {
      rejectReady(new Error(`Runtime exited before readiness (${code ?? exitSignal})`))
      exit()
    })
    let receivedReady = false
    child.on('message', message => {
      if (typeof message !== 'object' || message === null || Reflect.get(message, 'type') !== 'runtime-ready') return
      if (receivedReady) return
      receivedReady = true
      const value = message as Record<string, unknown>
      if (value.domainId !== spec.domainId || value.generation !== spec.generation || value.version !== spec.version
        || typeof value.endpoint !== 'string') {
        rejectReady(new Error('Child readiness identity mismatch'))
        return
      }
      let endpoint: URL
      try { endpoint = new URL(value.endpoint) } catch (error) { rejectReady(error); return }
      if (endpoint.hostname !== '127.0.0.1' || endpoint.protocol !== 'http:' || !endpoint.port
        || endpoint.username || endpoint.password || endpoint.pathname !== '/' || endpoint.search || endpoint.hash) {
        rejectReady(new Error('Local runtime must expose a loopback HTTP origin'))
        return
      }
      const authentication = value.authentication
      if (authentication !== undefined && (typeof authentication !== 'object' || authentication === null
        || typeof Reflect.get(authentication, 'cookie') !== 'string'
        || /[\r\n]/.test(Reflect.get(authentication, 'cookie')))) {
        rejectReady(new Error('Invalid internal runtime authentication'))
        return
      }
      resolveReady({ ...spec, endpoint: endpoint.origin,
        ...(authentication === undefined ? {} : { authentication: { cookie: Reflect.get(authentication, 'cookie') as string } }),
      })
    })
    let stopping: Promise<void> | undefined
    let stopped = false
    const waitGone = async (group: number) => {
      const until = Date.now() + this.graceMs
      do {
        if (!await groupAlive(group)) return true
        await delay(15)
      } while (Date.now() < until)
      return !await groupAlive(group)
    }
    return {
      ready,
      exited,
      stop: () => {
        if (stopped) return Promise.resolve()
        if (stopping) return stopping
        rejectReady(new Error('Runtime stopped before readiness'))
        stopping = Promise.resolve().then(async () => {
          const group = child.pid
          if (group !== undefined) {
            signalGroup(group, 'SIGTERM')
            if (!await waitGone(group)) {
              signalGroup(group, 'SIGKILL')
              if (!await waitGone(group)) throw new Error('Runtime process group remains alive after SIGKILL')
            }
          }
          await exited
          if (child.connected) child.disconnect()
          stopped = true
        }).catch(error => { stopping = undefined; throw error })
        return stopping
      },
    }
  }
}
