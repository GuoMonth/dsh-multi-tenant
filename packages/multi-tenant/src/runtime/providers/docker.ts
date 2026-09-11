import { execFile } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, realpath, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { promisify } from 'node:util'
import type { RuntimeHandle, RuntimeProvider, RuntimeReady, RuntimeSpec } from '../provider.ts'

import { openPrivateSocket, readRuntimeReady } from './private-control.ts'

const exec = promisify(execFile)
export interface DockerRuntimeOptions {
  /** Prebuilt immutable image ID or registry digest; no mutable tags. */
  readonly image: string
  /** Platform-owned local directory, exclusively used by this deployment. */
  readonly directory: string
  /** Trusted read-only native profile assets, separately provisioned per domain. */
  readonly profileDirectory: (domainId: string) => string
  readonly uid: number
  readonly gid: number
  readonly memoryMb?: number
  readonly cpus?: number
  readonly pids?: number
}

/** Offline Linux reference boundary. No network interfaces or published ports;
 * the ingress reaches each runtime through its private Unix socket. Workloads
 * cannot access Docker, other domains, or the platform directory.
 */
export class DockerRuntimeProvider implements RuntimeProvider {
  constructor(private readonly options: DockerRuntimeOptions) {
    if (process.platform !== 'linux') throw new Error('Docker provider requires Linux')
    if (!/^(sha256:[a-f0-9]{64}|[^\s]+@sha256:[a-f0-9]{64})$/.test(options.image)) throw new TypeError('Pin the runtime image by digest')
    for (const id of [options.uid, options.gid]) if (!Number.isSafeInteger(id) || id < 1) throw new TypeError('Runtime requires a non-root uid/gid')
    if (options.uid !== process.getuid!() || options.gid !== process.getgid!()) {
      throw new Error('Local Docker transport requires the non-root coordinator and runtime to use the same uid/gid')
    }
    for (const value of [options.memoryMb ?? 1_024, options.cpus ?? 1, options.pids ?? 160]) {
      if (!Number.isFinite(value) || value <= 0) throw new TypeError('Invalid runtime resource limit')
    }
  }

  private async docker(args: string[]): Promise<string> {
    const result = await exec('docker', args, { maxBuffer: 1_048_576, ...(args[1] === 'wait' ? {} : { timeout: 15_000 }) })
    return result.stdout.trim()
  }

  private async location(spec: RuntimeSpec) {
    if (!/^[a-f0-9-]{36}$/.test(spec.domainId)) throw new TypeError('Invalid domain id')
    await mkdir(resolve(this.options.directory), { recursive: true, mode: 0o700 })
    const root = await realpath(this.options.directory)
    // Linux sockaddr_un reserves one of its 108 bytes for the terminator.
    if (Buffer.byteLength(join(root, 'control', spec.domainId, 'http.sock')) > 107) {
      throw new Error('Runtime directory is too long for a Linux Unix socket; use a shorter platform directory')
    }
    const owner = createHash('sha256').update(root).digest('hex').slice(0, 16)
    return { root, owner, name: `dsh-domain-${owner}-${spec.domainId}`, control: join(root, 'control', spec.domainId), data: join(root, 'data', spec.domainId) }
  }

  private async existing(name: string): Promise<{ Id: string; Config: { Labels: Record<string, string> } } | undefined> {
    const names = await this.docker(['container', 'ls', '-a', '--filter', `name=^/${name}$`, '--format', '{{.Names}}'])
    if (!names.split('\n').includes(name)) return undefined
    const values = JSON.parse(await this.docker(['container', 'inspect', name])) as { Id: string; Config: { Labels: Record<string, string> } }[]
    return values[0]
  }

  private async remove(id: string): Promise<void> {
    const errors: unknown[] = []
    // Give native persistence a bounded graceful exit, then remove the whole cgroup.
    try { await this.docker(['container', 'stop', '--time', '5', id]) } catch (error) { errors.push(error) }
    try { await this.docker(['container', 'rm', '--force', id]) } catch (error) { errors.push(error) }
    if (errors.length) throw new AggregateError(errors, 'Container stop or removal failed')
  }

  async recover(spec: RuntimeSpec): Promise<void> {
    const location = await this.location(spec)
    const found = await this.existing(location.name)
    if (found) {
      const labels = found.Config.Labels
      if (labels['dsh.owner'] !== location.owner || labels['dsh.domain'] !== spec.domainId || labels['dsh.generation'] !== String(spec.generation)) {
        throw new Error('Refusing to recover a foreign runtime generation')
      }
      // Docker removes the complete container cgroup, including setsid descendants.
      await this.remove(found.Id)
    }
    if (await this.existing(location.name)) throw new Error('Runtime remains after recovery')
    await rm(location.control, { recursive: true, force: true })
  }

  acquire(spec: RuntimeSpec, signal: AbortSignal): RuntimeHandle {
    signal.throwIfAborted()
    let id: string | undefined
    let transport: Awaited<ReturnType<typeof openPrivateSocket>> | undefined
    const claim = randomUUID()
    let attemptedCreate = false
    let owned = false
    let stopping = false
    let stopTask: Promise<void> | undefined
    const cancelled = new AbortController()
    let exit!: () => void
    const exited = new Promise<void>(resolve => { exit = resolve })
    let location: Awaited<ReturnType<DockerRuntimeProvider['location']>> | undefined
    const acquisition = Promise.resolve().then(async () => {
      location = await this.location(spec)
      // No earlier generation is adopted by acquire. Recovery is a separate proof step.
      if (await this.existing(location.name)) throw new Error('Runtime already exists; verified recovery required')
      for (const path of [location.data, location.control]) await mkdir(path, { recursive: true, mode: 0o700 })
      if (stopping || signal.aborted) throw new Error('Runtime start cancelled')
      const profile = await realpath(this.options.profileDirectory(spec.domainId))
      const mount = (source: string, target: string, readOnly = false) => {
        if (source.includes(',')) throw new Error('Docker mount path cannot contain a comma')
        return `type=bind,source=${source},target=${target}${readOnly ? ',readonly' : ''}`
      }
      attemptedCreate = true
      id = await this.docker(['container', 'create', '--name', location.name, '--label', `dsh.claim=${claim}`,
        '--label', `dsh.owner=${location.owner}`, '--label', `dsh.domain=${spec.domainId}`, '--label', `dsh.generation=${spec.generation}`,
        '--init', '--network', 'none', '--read-only', '--user', `${this.options.uid}:${this.options.gid}`,
        '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
        '--memory', `${this.options.memoryMb ?? 1_024}m`, '--memory-swap', `${this.options.memoryMb ?? 1_024}m`,
        '--cpus', String(this.options.cpus ?? 1), '--pids-limit', String(this.options.pids ?? 160),
        '--tmpfs', `/tmp:rw,nosuid,nodev,noexec,size=128m,uid=${this.options.uid},gid=${this.options.gid}`,
        '--mount', mount(location.data, '/domain'), '--mount', mount(location.control, '/control'), '--mount', mount(profile, '/profile', true),
        '--env', 'HOME=/domain', '--env', 'DSH_HOME=/domain/dsh-home', '--env', 'DSH_CONTROL_DIR=/control',
        '--env', `DSH_DOMAIN_ID=${spec.domainId}`, '--env', `DSH_RUNTIME_GENERATION=${spec.generation}`,
        '--workdir', '/domain', this.options.image,
        'node', '--expose-internals', '/opt/dsh/node_modules/@deepseek-ai/dsh/lib/bin.js', '--profile', 'web', '--patch', '/profile/runtime.patch.json',
        '--host', '127.0.0.1', '--port', '3081', '--no-open'])
      owned = true
      await rm(join(location.control, 'ready.json'), { force: true })
      await rm(join(location.control, 'http.sock'), { force: true })
      if (stopping || signal.aborted) throw new Error('Runtime start cancelled')
      await this.docker(['container', 'start', id])
      // Wait status is authoritative; a CLI/daemon failure also invalidates readiness.
      void this.docker(['container', 'wait', id]).then(exit, exit)
    })
    const ready: Promise<RuntimeReady> = acquisition.then(async () => {
      for (;;) {
        if (stopping || signal.aborted || cancelled.signal.aborted) throw new Error('Runtime start cancelled')
        let value: unknown
        try { value = await readRuntimeReady(join(location!.control, 'ready.json')) }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
        if (value !== undefined) {
          const candidate = value as RuntimeReady
          if (candidate.domainId !== spec.domainId || candidate.generation !== spec.generation || candidate.version !== spec.version
            || candidate.endpoint !== 'http://127.0.0.1:3081' || !candidate.authentication?.cookie || /[\r\n]/.test(candidate.authentication.cookie)) {
            throw new Error('Isolated runtime readiness mismatch')
          }
          transport = await openPrivateSocket(join(location!.control, 'http.sock'))
          return { ...spec, endpoint: candidate.endpoint, authentication: { cookie: candidate.authentication.cookie }, socketPath: transport.path }
        }
        await delay(25)
      }
    })
    void ready.catch(() => {})
    void exited.then(() => cancelled.abort())
    return { ready, exited, stop: () => {
      stopping = true
      cancelled.abort()
      if (stopTask) return stopTask
      stopTask = Promise.resolve().then(async () => {
        await acquisition.catch(() => {})
        await ready.catch(() => {})
        const errors: unknown[] = []
        const attempt = async (operation: () => Promise<void>) => { try { await operation() } catch (error) { errors.push(error) } }
        await attempt(async () => { if (transport) { await transport.file.close(); transport = undefined } })
        await attempt(async () => {
          if (!id && attemptedCreate && location) {
            const uncertain = await this.existing(location.name)
            if (uncertain?.Config.Labels['dsh.claim'] === claim) { id = uncertain.Id; owned = true }
          }
          if (id) {
            const current = location ? await this.existing(location.name) : undefined
            if (current?.Id === id) await this.remove(id)
            id = undefined
          }
        })
        await attempt(async () => {
          if (owned && location && !await this.existing(location.name)) await rm(location.control, { recursive: true, force: true })
        })
        if (errors.length === 1) throw errors[0]
        if (errors.length) throw new AggregateError(errors, 'Runtime transport and container cleanup failed')
        exit()
      }).catch(error => { stopTask = undefined; throw error })
      return stopTask
    } }
  }
}
