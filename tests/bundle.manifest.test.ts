import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = resolve(import.meta.dirname, '..')
const packageManifest = JSON.parse(readFileSync(resolve(projectRoot, 'package.json'), 'utf8')) as {
  name?: string
  dsh?: { bundle?: { patch?: string } }
  exports?: Record<string, unknown>
  files?: readonly string[]
}
const patchPath = resolve(projectRoot, 'cordis.patch.yml')

describe('DeepSeek Harness bundle contract', () => {
  it('declares and ships the official dsh.bundle patch path', () => {
    expect(packageManifest.dsh?.bundle?.patch).toBe('./cordis.patch.yml')
    expect(packageManifest.exports?.['./cordis.patch.yml']).toBe('./cordis.patch.yml')
    expect(packageManifest.files).toContain('cordis.patch.yml')
    expect(existsSync(patchPath)).toBe(true)
  })

  it('inserts this package as a Cordis row under a stable id', () => {
    const patch = readFileSync(patchPath, 'utf8')
    expect(patch).toContain('insert:')
    expect(patch).toContain('id: multi-tenant')
    expect(patch).toContain('name: dsh-multi-tenant')
  })
})
