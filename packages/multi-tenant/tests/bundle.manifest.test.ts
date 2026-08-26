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

  it('exposes kernel, runtime, and both store seams as package entry points', () => {
    const main = packageManifest.exports?.['.'] as { import?: string; types?: string } | undefined
    const runtime = packageManifest.exports?.['./runtime'] as { import?: string; types?: string } | undefined
    const store = packageManifest.exports?.['./store'] as { import?: string; types?: string } | undefined
    const sqliteStore = packageManifest.exports?.['./sqlite-store'] as { import?: string; types?: string } | undefined
    expect(main?.import).toBe('./dist/index.mjs')
    expect(main?.types).toBe('./dist/index.d.mts')
    expect(runtime?.import).toBe('./dist/runtime.mjs')
    expect(runtime?.types).toBe('./dist/runtime.d.mts')
    expect(store?.import).toBe('./dist/store.mjs')
    expect(store?.types).toBe('./dist/store.d.mts')
    expect(sqliteStore?.import).toBe('./dist/sqlite-store.mjs')
    expect(sqliteStore?.types).toBe('./dist/sqlite-store.d.mts')
  })

  it('assembles the durable local store and shared kernel before the runtime', () => {
    const patch = readFileSync(patchPath, 'utf8')
    expect(patch).toContain('insert:')
    expect(patch).toContain('id: tenant-session-store')
    expect(patch).toContain('name: dsh-multi-tenant/sqlite-store')
    expect(patch).toContain('id: multi-tenant')
    expect(patch).toContain('name: dsh-multi-tenant')
    expect(patch).toContain('id: tenant-runtime')
    expect(patch).toContain('name: dsh-multi-tenant/runtime')
    expect(patch.indexOf('id: tenant-session-store')).toBeLessThan(patch.indexOf('id: multi-tenant'))
    expect(patch.indexOf('id: multi-tenant')).toBeLessThan(patch.indexOf('id: tenant-runtime'))
  })
})
