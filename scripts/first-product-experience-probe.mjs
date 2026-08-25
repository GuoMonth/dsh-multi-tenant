#!/usr/bin/env node
/**
 * End-to-end proof for the rc.2 First Product Experience.
 *
 * Packs the current candidate, installs it into a clean pinned DSH Web profile,
 * boots the real `dsh web` server, then drives the opt-in starter over HTTP.
 * The path includes real DSH Agent creation/resume and the official MCP client
 * talking to the starter's real stdio JSON-RPC server.
 */
import { execFileSync, spawn } from 'node:child_process'
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DSH_TARGET } from './dsh-target.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const tmp = mkdtempSync(join(tmpdir(), 'dsh-mt-fpe-'))
const packDir = join(tmp, 'pack')
const consumer = join(tmp, 'consumer')
const dshHome = join(tmp, 'dsh-home')

function assert(condition, message) {
  if (!condition) throw new Error(`ASSERT FAILED: ${message}`)
}

function exec(command, args, options = {}) {
  try {
    return execFileSync(command, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      ...options,
    })
  } catch (error) {
    throw new Error(
      `${command} ${args.join(' ')} failed\n${String(error.stdout ?? '').trim()}\n${String(error.stderr ?? '').trim()}`,
      { cause: error },
    )
  }
}

async function waitForWeb(child, timeoutMs = 45_000) {
  let stdout = ''
  let stderr = ''
  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  child.stdout.on('data', chunk => { stdout += chunk })
  child.stderr.on('data', chunk => { stderr += chunk })

  const started = Date.now()
  for (;;) {
    const match = /dsh web:\s+(http:\/\/127\.0\.0\.1:\d+)/u.exec(stdout)
    if (match?.[1]) return { url: match[1], logs: () => ({ stdout, stderr }) }
    if (child.exitCode !== null) {
      throw new Error(`dsh web exited before startup (${child.exitCode})\n${stdout}\n${stderr}`)
    }
    if (Date.now() - started > timeoutMs) {
      throw new Error(`timed out waiting for dsh web\n${stdout}\n${stderr}`)
    }
    await new Promise(resolve => setTimeout(resolve, 100))
  }
}

async function request(url, options = {}) {
  const response = await fetch(url, options)
  const text = await response.text()
  let body
  try { body = JSON.parse(text) } catch { body = text }
  return { response, body, text }
}

function cookieFrom(response) {
  const raw = response.headers.get('set-cookie')
  assert(typeof raw === 'string' && raw.includes('dsh_mt_demo='), 'login must set the demo HttpOnly cookie')
  return raw.split(';', 1)[0]
}

function jsonPost(body, cookie) {
  return {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(cookie === undefined ? {} : { cookie }),
    },
    body: JSON.stringify(body),
  }
}

let child
try {
  exec('mkdir', ['-p', packDir, consumer])
  exec('pnpm', ['--filter', 'dsh-multi-tenant', 'build'], { cwd: root })
  exec('pnpm', ['--filter', 'dsh-multi-tenant', 'pack', '--pack-destination', packDir], { cwd: root })
  const tarballName = readdirSync(packDir).find(name => name.endsWith('.tgz'))
  if (!tarballName) throw new Error('FPE probe: pnpm pack produced no tarball')
  const candidate = join(packDir, tarballName)

  writeFileSync(join(consumer, 'package.json'), JSON.stringify({
    name: 'dsh-multi-tenant-fpe-consumer',
    private: true,
    type: 'module',
  }))
  writeFileSync(join(consumer, 'pnpm-workspace.yaml'), [
    'allowBuilds:',
    "  '@deepseek-ai/dsh-subprocess-local': true",
    "  '@google/genai': true",
    '  koffi: true',
    '  node-pty: true',
    '  protobufjs: true',
    '',
  ].join('\n'))

  exec('pnpm', ['add', `@deepseek-ai/dsh@${DSH_TARGET.version}`, candidate], { cwd: consumer })
  const dshBin = join(consumer, 'node_modules', '.bin', 'dsh')
  const baseEnv = {
    ...process.env,
    DSH_HOME: dshHome,
  }

  // Initialize the shipped Web profile and install the candidate as a Bundle.
  // This is the exact product install path documented for users.
  exec(dshBin, ['plugin', '--profile', 'web', 'add', candidate], {
    cwd: consumer,
    env: baseEnv,
  })

  child = spawn(dshBin, ['web', '--port', '0', '--no-open'], {
    cwd: consumer,
    env: {
      ...baseEnv,
      DSH_MULTI_TENANT_STARTER: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  const web = await waitForWeb(child)
  const base = `${web.url}/_dsh-multi-tenant`

  const page = await request(base)
  assert(page.response.status === 200, 'starter page must be served by the real DSH Web server')
  assert(page.text.includes('First Product Experience'), 'starter page must identify the product experience')
  assert(page.text.includes('existing DSH Web app'), 'starter must present itself beside, not instead of, DSH Web')

  const anonymous = await request(`${base}/identity`)
  assert(anonymous.response.status === 401, 'identity endpoint must require a trusted product subject')

  const aliceLogin = await request(`${base}/login`, jsonPost({ identity: 'acme-alice' }))
  assert(aliceLogin.response.status === 200, 'Acme/Alice login must succeed')
  const aliceCookie = cookieFrom(aliceLogin.response)
  assert(JSON.stringify(aliceLogin.body).includes('alice'), 'login must expose the Principal identity')

  const aliceIdentity = await request(`${base}/identity`, { headers: { cookie: aliceCookie } })
  assert(aliceIdentity.response.status === 200, 'Acme/Alice identity must resolve through Product Ingress')
  assert(aliceIdentity.body?.principal?.tenantId === 'acme', 'Alice must resolve to the Acme Tenant')
  assert(aliceIdentity.body?.principal?.userId === 'alice', 'Alice Principal mismatch')

  const sessionId = `fpe-${Date.now()}`
  const toolCall = await request(`${base}/demo-tool`, jsonPost({ sessionId }, aliceCookie))
  assert(toolCall.response.status === 200, `real MCP Tool call must succeed: ${toolCall.text}`)
  assert(!toolCall.text.includes('starter-secret:'), 'raw Principal credential must never cross the starter HTTP boundary')
  const resultText = JSON.stringify(toolCall.body?.result)
  assert(resultText.includes('acme'), 'real MCP result must carry the Tenant marker')
  assert(resultText.includes('alice'), 'real MCP result must carry the Principal marker')
  assert(resultText.includes('credentialAccepted'), 'MCP server must prove credential propagation without exposing it')
  assert(resultText.includes('true'), 'MCP server must accept the injected Principal credential')

  // demo-tool disposes its temporary consumer handle after execution; the DSH
  // session remains persisted and the immutable multi-tenant ownership record
  // remains available, so the owner can resume it.
  const ownerResume = await request(`${base}/agents/resume`, jsonPost({ sessionId }, aliceCookie))
  assert(ownerResume.response.status === 200, `owner resume must succeed: ${ownerResume.text}`)

  const bobLogin = await request(`${base}/login`, jsonPost({ identity: 'acme-bob' }))
  assert(bobLogin.response.status === 200, 'Acme/Bob login must succeed')
  const bobCookie = cookieFrom(bobLogin.response)
  const bobResume = await request(`${base}/agents/resume`, jsonPost({ sessionId }, bobCookie))
  assert(bobResume.response.status === 403, 'Bob must be denied Alice Session resume')
  assert(bobResume.body?.error?.code === 'SESSION_ACCESS_DENIED', 'cross-Principal denial must be structured')
  assert(!bobResume.text.includes('starter-secret:'), 'denial must not leak credentials')

  const globexLogin = await request(`${base}/login`, jsonPost({ identity: 'globex-alice' }))
  assert(globexLogin.response.status === 200, 'Globex/Alice login must succeed')
  const globexCookie = cookieFrom(globexLogin.response)
  const globexIdentity = await request(`${base}/identity`, { headers: { cookie: globexCookie } })
  assert(globexIdentity.response.status === 200, 'second Tenant identity must resolve')
  assert(globexIdentity.body?.principal?.tenantId === 'globex', 'second Tenant must be visibly distinct')

  const logs = web.logs()
  assert(!logs.stdout.includes('starter-secret:'), 'DSH stdout must not print the starter credential')
  assert(!logs.stderr.includes('starter-secret:'), 'DSH stderr must not print the starter credential')

  console.log(JSON.stringify({
    firstProductExperience: 'passed',
    dsh: DSH_TARGET.version,
    web: web.url,
    principal: aliceIdentity.body.principal,
    secondTenant: globexIdentity.body.principal,
    sessionId,
    crossPrincipalResume: bobResume.body.error.code,
    credentialExposed: false,
  }, null, 2))
} finally {
  if (child && child.exitCode === null) {
    child.kill('SIGTERM')
    await Promise.race([
      new Promise(resolve => child.once('exit', resolve)),
      new Promise(resolve => setTimeout(resolve, 5_000)),
    ])
    if (child.exitCode === null) child.kill('SIGKILL')
  }
  rmSync(tmp, { recursive: true, force: true })
}
