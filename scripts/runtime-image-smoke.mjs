import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { installArtifact } from './installed-package.mjs'

const exec = promisify(execFile)
const docker = async args => (await exec('docker', args, { timeout: 600_000, maxBuffer: 16_000_000 })).stdout.trim()
const installed = installArtifact()
const root = await mkdtemp(join(tmpdir(), 'dsh-img-'))
const imageTag = `dsh-image-smoke:${process.pid}`
let built = false
try {
  await docker(['build', '-f', join(installed.packageDirectory, 'runtime/Dockerfile'), '-t', imageTag, installed.packageDirectory])
  built = true
  const image = await docker(['image', 'inspect', imageTag, '--format', '{{.Id}}'])
  const { DockerRuntimeProvider } = await import(pathToFileURL(join(installed.packageDirectory, 'dist/index.mjs')))
  const profile = join(root, 'profile')
  await mkdir(profile)
  await writeFile(join(profile, 'runtime.patch.json'), JSON.stringify([
    { id: 'web-runtime', config: { printUrl: false, openBrowser: false } },
    { insert: [{ id: 'domain-runtime-control', name: '/opt/dsh/runtime-control.mjs', config: { runtimeManifest: '/opt/dsh/node_modules/@deepseek-ai/dsh/package.json' } }] },
  ]))
  for (const network of [undefined, 'none']) {
    const domainId = network ? '00000000-0000-4000-8000-000000000002' : '00000000-0000-4000-8000-000000000001'
    const provider = new DockerRuntimeProvider({ ...(network ? { network } : {}), image, directory: join(root, 'run'),
      profileDirectory: () => profile, uid: process.getuid(), gid: process.getgid() })
    const handle = provider.acquire({ domainId, generation: 1, version: '0.1.5-rc.2' }, AbortSignal.timeout(45_000))
    try {
      const ready = await handle.ready
      assert.equal(ready.domainId, domainId)
      const id = await docker(['container', 'ls', '--filter', `label=dsh.domain=${domainId}`, '--format', '{{.ID}}'])
      const [container] = JSON.parse(await docker(['container', 'inspect', id]))
      assert.equal(container.HostConfig.NetworkMode, network ?? 'bridge')
      assert.equal(Object.keys(container.HostConfig.PortBindings ?? {}).length, 0)
      assert.equal(container.HostConfig.ReadonlyRootfs, true)
      await docker(['exec', id, 'bash', '-ec', 'for tool in bash git ssh curl wget jq rg python3 pip3 cc c++ make patch tar unzip node npm; do command -v "$tool"; done; python3 -m venv /domain/venv; /domain/venv/bin/python -c "print(42)"'])
      const request = ['exec', id, 'curl', '--fail', '--silent', '--show-error', '--connect-timeout', '5', '--max-time', '15', 'https://registry.npmjs.org/-/ping']
      if (network === 'none') await assert.rejects(docker(request))
      else assert.ok(JSON.parse(await docker(request)))
      console.log(`Installed runtime image: native DSH ready, tools usable, ${network ?? 'default bridge'} network verified`)
    } finally { await handle.stop() }
  }
} finally {
  if (built) await docker(['image', 'rm', imageTag])
  await rm(root, { recursive: true, force: true })
  installed.close()
}
