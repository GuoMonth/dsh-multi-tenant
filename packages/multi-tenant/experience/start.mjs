import { mkdir, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
const principal = process.env.DSH_DEMO_PRINCIPAL
if (!['alice', 'bob'].includes(principal)) throw new Error('Unknown demo Principal')
await mkdir('/domain/workspace', { recursive: true })
await writeFile('/domain/.experience-owner', principal, { mode: 0o600 })
await writeFile('/domain/workspace/welcome.md', `# ${principal}'s workspace\n\nThis private sample belongs to ${principal}.\n`, { flag: 'wx' }).catch(error => { if (error.code !== 'EEXIST') throw error })
const child = spawn(process.execPath, ['--expose-internals', '/opt/dsh/node_modules/@deepseek-ai/dsh/lib/bin.js', '--profile', 'web', '--patch', '/opt/dsh/experience/runtime.patch.json', '--host', '127.0.0.1', '--port', '3081', '--no-open'], { cwd: '/domain/workspace', stdio: 'inherit' })
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => child.kill(signal))
child.on('error', () => { process.exitCode = 1 })
child.on('exit', code => { process.exitCode = code ?? 1 })
