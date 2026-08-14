import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('real Cordis Loader composition', () => {
  it('loads dsh-multi-tenant through the Loader and authorizes via ctx.multiTenant', async () => {
    const projectRoot = resolve(import.meta.dirname, '..')
    const demoScript = resolve(projectRoot, 'demo/run-loader.ts')
    const child = spawn(process.execPath, ['--import', 'tsx', demoScript], {
      cwd: resolve(projectRoot, 'demo'),
      env: { ...process.env, FORCE_COLOR: '0' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []
    child.stdout.on('data', (chunk) => stdout.push(Buffer.from(chunk)))
    child.stderr.on('data', (chunk) => stderr.push(Buffer.from(chunk)))
    const [code] = (await once(child, 'close')) as [number | null]
    const output = Buffer.concat(stdout).toString('utf8')
    const errorOutput = Buffer.concat(stderr).toString('utf8')

    expect(code, errorOutput).toBe(0)
    expect(output).toContain('"owner":{"tenantId":"acme","userId":"alice"}')
    expect(output).toContain('"sameAllowed":true')
    expect(output).toContain('"crossTenantAllowed":false')
    expect(output).toContain('"denialName":"SessionAccessDeniedError"')
    expect(output).toContain('"denialMessage":"Access to session denied."')
  }, 30_000)
})
