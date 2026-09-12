#!/usr/bin/env node
import { parseArgs } from 'node:util'
import { request } from 'node:http'
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { spawn, execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { startExperience } from './app.ts'

const exec = promisify(execFile)
const root = fileURLToPath(new URL('../', import.meta.url))
const options = parseArgs({ allowPositionals: true, options: { 'data-dir': { type: 'string' }, port: { type: 'string' }, image: { type: 'string' }, 'no-open': { type: 'boolean' }, help: { type: 'boolean', short: 'h' } } })
const command = options.positionals[0] ?? 'start'
const directory = resolve(options.values['data-dir'] ?? join(homedir(), '.dsh-experience'))
const infoPath = join(directory, 'running.json')
const configPath = join(directory, 'instance.json')
let child: ReturnType<typeof spawn> | undefined
let cancelled = false
let stopping = false
let close: (() => Promise<void>) | undefined

function browser(url: string) {
  const bin = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'rundll32' : 'xdg-open'
  const args = process.platform === 'win32' ? ['url.dll,FileProtocolHandler', url] : [url]
  const processHandle = spawn(bin, args, { detached: true, stdio: 'ignore', shell: false })
  processHandle.on('error', () => console.log('Open the URL above in your browser. / 请在浏览器中打开上方链接。'))
  processHandle.unref()
}
async function control(action: string): Promise<any | undefined> {
  let info
  try { info = JSON.parse(await readFile(infoPath, 'utf8')) } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error }
  try {
    return await new Promise((resolve, reject) => {
      const req = request({ hostname: '127.0.0.1', port: info.port, path: '/control', method: 'POST', headers: { host: info.host, authorization: `Bearer ${info.control}` }, signal: AbortSignal.timeout(2000) }, res => {
        let value = ''; res.on('data', chunk => { value += chunk; if (value.length > 16384) req.destroy(new Error('Invalid control response')) });
        res.on('end', () => { try { resolve(res.statusCode === 200 ? JSON.parse(value) : undefined) } catch (error) { reject(error) } })
      }); req.on('error', reject); req.end(action)
    })
  } catch { return }
}
async function stop() {
  if (stopping) return
  stopping = true; cancelled = true
  child?.kill('SIGTERM')
  try {
    if (close) { console.log('\nStopping workspaces; retaining data… / 正在停止，数据将保留。'); await close(); await rm(infoPath, { force: true }) }
  } catch (error) { console.error('Cleanup incomplete. Run start again for verified recovery. / 清理未完成，下次启动将核验恢复。'); process.exitCode = 1 }
  finally { stopping = false }
}
async function dockerCheck() {
  const value = JSON.parse((await exec('docker', ['info', '--format', '{{json .}}'], { timeout: 10_000 })).stdout)
  if (value.OSType !== 'linux') throw new Error('Switch Docker Desktop to Linux containers. / 请切换为 Linux 容器。')
  const context = JSON.parse((await exec('docker', ['context', 'inspect'], { timeout: 10_000 })).stdout)[0]
  const endpoint = process.env.DOCKER_HOST ?? context.Endpoints.docker.Host
  if (!/^(unix:\/\/|npipe:\/\/)/.test(endpoint)) throw new Error('Use a local Docker Engine or Docker Desktop context; remote Docker is not supported.')
  return value
}
async function run() {
  if (options.values.help || command === 'help') {
    console.log('dsh-multi-tenant <start|status|stop|doctor>\n\nstart [--no-open] [--port 3080] [--data-dir PATH] [--image DIGEST]\nRequires Node 22.19+/24+ and local Docker with Linux containers.\nDefault demo is local-only, keyless and preserves data.'); return
  }
  if (!['start','status','stop','doctor'].includes(command) || options.positionals.length > 1) throw new Error('Unknown command. Run --help.')
  if (command === 'status') { console.log(await control('status') ?? { running: false, directory }); return }
  if (command === 'stop') { console.log(await control('stop') ?? 'No active instance. Retained data has not been deleted.'); return }
  if (command === 'doctor') {
    console.log(`Node ${process.version}; ${process.platform}/${process.arch}\nData: ${directory}`)
    const docker = await dockerCheck()
    console.log(`Docker ${docker.ServerVersion}; ${docker.Architecture}\nRuntime:`, await control('status') ?? 'Stopped')
    console.log('Data and credentials are not included in diagnostic output.'); return
  }
  const existing = await control('open')
  if (existing?.url) { console.log(existing.url); if (!options.values['no-open']) browser(existing.url); return }
  process.on('SIGINT', () => { void stop() })
  process.on('SIGTERM', () => { void stop() })
  console.log('1/4 Checking local Docker… / 检查 Docker')
  await dockerCheck().catch(error => { throw new Error(`Docker is unavailable. Start Docker Desktop or your local Docker Engine, then retry. ${error.message}`) })
  if (cancelled) return
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const manifest = JSON.parse(await readFile(join(root, 'runtime-manifest.json'), 'utf8'))
  let config: { instance: string; image: string; dsh: string; profile: number } | undefined
  try { config = JSON.parse(await readFile(configPath, 'utf8')) } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  if (config && (config.dsh !== manifest.dsh || config.profile !== manifest.profile)) throw new Error('Existing data uses a different runtime/profile. Use its original CLI version or a new --data-dir; no automatic migration was performed.')
  const image = options.values.image ?? config?.image ?? manifest.image
  if (!image || !/^(sha256:[a-f0-9]{64}|[^\s]+@sha256:[a-f0-9]{64})$/.test(image)) throw new Error('This source build has no published runtime digest. For development build runtime/Dockerfile and pass --image sha256:…; published packages include the verified image automatically.')
  if (config && config.image !== image) throw new Error('This instance is pinned to another image. Use a new --data-dir to evaluate a different image.')
  console.log('2/4 Preparing runtime image… / 准备运行镜像')
  try { await exec('docker', ['image', 'inspect', image], { timeout: 10_000 }) }
  catch {
    if (image.startsWith('sha256:')) throw new Error('Local image missing. Restore the pinned image or use a new data directory with a published digest.')
    await new Promise<void>((resolve, reject) => {
      child = spawn('docker', ['pull', image], { stdio: 'inherit', shell: false })
      child.on('error', reject); child.on('exit', code => code === 0 ? resolve() : reject(new Error('Image download interrupted or failed. Retry start; downloaded layers remain cached.')))
    })
    child = undefined
  }
  if (cancelled) return
  if (!config) {
    config = { instance: randomUUID(), image, dsh: manifest.dsh, profile: manifest.profile }
    try { await writeFile(configPath, JSON.stringify(config), { flag: 'wx', mode: 0o600 }) }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; config = JSON.parse(await readFile(configPath, 'utf8')) }
  }
  const port = Number(options.values.port ?? 3080)
  if (!Number.isSafeInteger(port) || port < 0 || port > 65535) throw new Error('Port must be 0–65535.')
  console.log('3/4 Preparing your local workbench… / 准备本机工作台')
  const app = await startExperience({ directory, instance: config!.instance, image: config!.image, port, onStop: () => { void stop() } })
  close = app.close
  await writeFile(infoPath, JSON.stringify({ port: app.port, host: app.portalHost, control: app.control }), { mode: 0o600 })
  if (cancelled) { await stop(); return }
  const url = app.openUrl()
  console.log(`4/4 Ready / 已就绪\n\n${url}\n\nChoose Alice or Bob. The first visit starts their native DSH Host.\n选择用户后首次启动原生工作台。Ctrl-C stops it; your data is retained.\nData: ${directory}`)
  if (!options.values['no-open']) browser(url)
}
run().catch(async error => { if (!cancelled) { console.error(`\n${error.message}\nRun dsh-multi-tenant doctor for environment checks.`); process.exitCode = 1 } await stop() })
