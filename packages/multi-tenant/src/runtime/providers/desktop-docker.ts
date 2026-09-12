import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { setTimeout as delay } from 'node:timers/promises'
import { randomUUID } from 'node:crypto'
import type { RuntimeHandle, RuntimeProvider, RuntimeSpec } from '../provider.ts'

const exec = promisify(execFile)
export interface DesktopDockerOptions {
  readonly image: string
  /** Persisted instance UUID, not a host filesystem path. */
  readonly instance: string
  readonly principal: (domainId: string) => string
}

/** Local Docker contexts, including Desktop. All worker storage lives in named
 * volumes on the daemon; no host socket, path or UID is shared with the worker.
 * Only an authenticated relay is published on host loopback. */
export class DesktopDockerRuntimeProvider implements RuntimeProvider {
  constructor(private readonly options: DesktopDockerOptions) {
    if (!/^(sha256:[a-f0-9]{64}|[^\s]+@sha256:[a-f0-9]{64})$/.test(options.image)) throw new Error('Pin the runtime image by digest')
    if (!/^[a-f0-9-]{36}$/.test(options.instance)) throw new Error('Invalid instance identity')
  }
  private async docker(args: string[]) {
    return (await exec('docker', args, { timeout: args[1] === 'wait' ? 0 : 60_000, maxBuffer: 1_048_576 })).stdout.trim()
  }
  private name(spec: RuntimeSpec) {
    if (!/^[a-f0-9-]{36}$/.test(spec.domainId)) throw new Error('Invalid domain identity')
    return `dsh-experience-${this.options.instance}-${spec.domainId}`
  }
  private async inspect(name: string): Promise<any | undefined> {
    const names = await this.docker(['container', 'ls', '-a', '--filter', `name=^/${name}$`, '--format', '{{.Names}}'])
    return names ? JSON.parse(await this.docker(['container', 'inspect', name]))[0] : undefined
  }
  private verify(container: any, spec: RuntimeSpec) {
    const labels = container.Config.Labels
    if (labels['dsh.instance'] !== this.options.instance || labels['dsh.domain'] !== spec.domainId || labels['dsh.generation'] !== String(spec.generation)) throw new Error('Refusing foreign runtime ownership')
  }
  private async remove(name: string) {
    await this.docker(['container', 'rm', '--force', name])
  }
  async recover(spec: RuntimeSpec) {
    for (const suffix of ['', '-init']) {
      const found = await this.inspect(this.name(spec) + suffix)
      if (found) { this.verify(found, spec); await this.remove(found.Id) }
    }
  }
  acquire(spec: RuntimeSpec, signal: AbortSignal): RuntimeHandle {
    signal.throwIfAborted()
    const name = this.name(spec)
    const claim = randomUUID()
    let owned = false
    let stopped = false
    let stopTask: Promise<void> | undefined
    let exit!: () => void
    const exited = new Promise<void>(resolve => { exit = resolve })
    const labels = ['--label', `dsh.instance=${this.options.instance}`, '--label', `dsh.domain=${spec.domainId}`,
      '--label', `dsh.generation=${spec.generation}`, '--label', `dsh.claim=${claim}`]
    const check = () => { signal.throwIfAborted(); if (stopped) throw new Error('Runtime startup cancelled') }
    const acquisition = (async () => {
      if (await this.inspect(name) || await this.inspect(name + '-init')) throw new Error('Previous runtime needs recovery')
      for (const kind of ['data', 'control']) {
        const volume = `${name}-${kind}`
        const existing = await this.docker(['volume', 'ls', '--filter', `name=^${volume}$`, '--format', '{{.Name}}'])
        if (existing) {
          const metadata = JSON.parse(await this.docker(['volume', 'inspect', volume]))[0]
          if (metadata.Labels?.['dsh.instance'] !== this.options.instance || metadata.Labels?.['dsh.domain'] !== spec.domainId) throw new Error('Refusing foreign data volume')
        } else await this.docker(['volume', 'create', '--label', `dsh.instance=${this.options.instance}`, '--label', `dsh.domain=${spec.domainId}`, volume])
      }
      check()
      const mounts = ['--mount', `type=volume,source=${name}-data,target=/domain,volume-nocopy`, '--mount', `type=volume,source=${name}-control,target=/control,volume-nocopy`]
      // Root exists only for deterministic volume initialization in a short-lived
      // networkless helper. Workloads always run as non-root in another container.
      const initialize = `const fs=require('node:fs');for(const p of ['/domain','/control']){fs.chownSync(p,1000,1000);fs.chmodSync(p,448)};for(const p of ['ready.json','ready.tmp'])fs.rmSync('/control/'+p,{force:true});`
      await this.docker(['container', 'create', '--name', name + '-init', ...labels, '--network', 'none', '--read-only', '--user', '0:0', ...mounts, this.options.image, 'node', '-e', initialize])
      owned = true
      check()
      await this.docker(['container', 'start', '--attach', name + '-init'])
      const helper = await this.inspect(name + '-init')
      if (helper.State.ExitCode !== 0) throw new Error('Could not initialize runtime storage')
      await this.remove(helper.Id)
      check()
      await this.docker(['container', 'create', '--name', name, ...labels, ...mounts,
        '--init', '--read-only', '--user', '1000:1000', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
        '--memory', '1024m', '--memory-swap', '1024m', '--cpus', '1', '--pids-limit', '160',
        '--tmpfs', '/tmp:rw,nosuid,nodev,noexec,size=128m,uid=1000,gid=1000',
        '--publish', '127.0.0.1::3082', '--env', `DSH_DOMAIN_ID=${spec.domainId}`, '--env', `DSH_RUNTIME_GENERATION=${spec.generation}`,
        '--env', `DSH_DEMO_PRINCIPAL=${this.options.principal(spec.domainId)}`, this.options.image,
        'node', '/opt/dsh/experience/start.mjs'])
      check()
      await this.docker(['container', 'start', name])
      void this.docker(['container', 'wait', name]).then(exit, exit)
    })()
    const ready = acquisition.then(async () => {
      for (;;) {
        check()
        const container = await this.inspect(name)
        if (!container?.State.Running) throw new Error('DSH stopped before readiness; run doctor for diagnostics')
        const output = await this.docker(['container', 'exec', name, 'node', '-e', "const f=require('node:fs');const p='/control/ready.json';if(f.existsSync(p)){if(f.statSync(p).size>16384)process.exit(1);process.stdout.write(f.readFileSync(p))}"])
        if (output) {
          const value = JSON.parse(output)
          if (value.domainId !== spec.domainId || value.generation !== spec.generation || value.version !== spec.version || value.endpoint !== 'http://127.0.0.1:3081' || !value.authentication?.cookie || /[\r\n]/.test(value.authentication.cookie)) throw new Error('Runtime readiness mismatch')
          const binding = container.NetworkSettings.Ports['3082/tcp']?.[0]
          if (binding?.HostIp !== '127.0.0.1' || !/^\d+$/.test(binding.HostPort)) throw new Error('Runtime relay must bind only loopback')
          return { ...spec, endpoint: `http://127.0.0.1:${binding.HostPort}`, authentication: { cookie: value.authentication.cookie } }
        }
        await delay(150)
      }
    })
    void ready.catch(() => {})
    return { ready, exited, stop: () => {
      stopped = true
      if (stopTask) return stopTask
      stopTask = (async () => {
        await acquisition.catch(() => {})
        await ready.catch(() => {})
        const errors: unknown[] = []
        for (const suffix of ['', '-init']) {
          try {
            const found = await this.inspect(name + suffix)
            if (found) {
              if (found.Config.Labels['dsh.claim'] !== claim) { if (owned) throw new Error('Runtime ownership changed'); continue }
              if (!suffix && found.State.Running) await this.docker(['container', 'stop', '--time', '5', found.Id]).catch(() => {})
              await this.remove(found.Id)
            }
          } catch (error) { errors.push(error) }
        }
        if (errors.length) throw new AggregateError(errors, 'Runtime cleanup failed; retry stop')
        exit()
      })().catch(error => { stopTask = undefined; throw error })
      return stopTask
    } }
  }
}
