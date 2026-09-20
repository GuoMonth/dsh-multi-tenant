#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const help = `dsh-multi-tenant — OIDC + Kubernetes Cell alpha
  start --config /absolute/private/config.json
  inspect --socket /absolute/private/admin.sock --environment ID
  delete --socket /absolute/private/admin.sock --environment ID --allocation-key KEY --identity UID
  --version | --help

Requires Node 24+, a configured cluster and platform-mode Cell Operator.
Run inside the cluster (or with API and Pod-IP reachability). No cluster is created.
SIGINT/SIGTERM stop the platform, retaining Cells and data. SIGHUP reloads membership.
Delete targets an exact allocation/UID; acceptance is not proof that its writer stopped.
`
async function main() {
  const { values, positionals } = parseArgs({ options: {
    help: { type: 'boolean', short: 'h' }, version: { type: 'boolean' },
    config: { type: 'string' }, socket: { type: 'string' }, environment: { type: 'string' },
    'allocation-key': { type: 'string' }, identity: { type: 'string' },
  }, allowPositionals: true })
  const [command, ...extra] = positionals
  if (values.help || (!command && !values.version)) { console.log(help); return }
  if (values.version) {
    console.log(JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version)
    return
  }
  const allowed: Record<string, string[]> = {
    start: ['config'], inspect: ['socket', 'environment'],
    delete: ['socket', 'environment', 'allocation-key', 'identity'],
  }
  const required = allowed[command!]
  if (!required || extra.length || required.some(key => !values[key as keyof typeof values]) ||
      Object.keys(values).some(key => !required.includes(key))) throw new Error('Invalid arguments')
  if (values.environment && !/^[A-Za-z0-9_-]{1,80}$/.test(values.environment)) throw new Error('Invalid environment')
  const argv = command === 'start'
    ? ['cell-platform.mjs', resolve(values.config!)]
    : ['cell-admin.mjs', resolve(values.socket!), command!, values.environment!,
      ...(command === 'delete' ? [values['allocation-key']!, values.identity!] : [])]
  const child = spawn(process.execPath, [fileURLToPath(new URL(argv[0]!, import.meta.url)), ...argv.slice(1)], { stdio: 'inherit' })
  const signals = ['SIGINT', 'SIGTERM', 'SIGHUP'] as const
  const handlers = signals.map(signal => () => { child.kill(signal) })
  signals.forEach((signal, i) => process.on(signal, handlers[i]!))
  try {
    await new Promise<void>((accept, reject) => {
      child.once('error', reject)
      child.once('exit', (code, signal) => {
        process.exitCode = code ?? (signal === 'SIGINT' ? 130 : signal === 'SIGHUP' ? 129 : 143)
        accept()
      })
    })
  } finally { signals.forEach((signal, i) => process.off(signal, handlers[i]!)) }
}
main().catch(() => {
  console.error(JSON.stringify({ code: 'CLIStartupFailed', stage: 'cli', observedState: 'not-started',
    effect: 'not-submitted', retry: 'never', correlationId: randomUUID(),
    message: 'Invalid CLI arguments or unavailable Node child process', nextAction: 'Run --help; verify arguments and installed package. No automatic replay.' }))
  process.exitCode = 1
})
