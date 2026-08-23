import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('real Cordis Loader composition', () => {
  it('loads the shared kernel and context-native tenant runtime', async () => {
    // Boundary: this exercises the REAL Cordis Loader + Include path over
    // `demo/cordis.yml`, proving the store, kernel, and runtime are genuine
    // loadable Cordis services rather than only direct test constructions.
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
    expect(output).toContain('"acmeAuth":"auth-acme"')
    expect(output).toContain('"evilcorpAuth":"auth-evilcorp"')
    // JSON.stringify omits undefined, so a leaked rootAuth would add this key.
    expect(output).not.toContain('"rootAuth"')
  }, 30_000)
})
