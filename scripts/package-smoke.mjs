#!/usr/bin/env node
/**
 * Package smoke (M1.3): prove the kernel's published tarball is a valid
 * distributable. Build → pack → verify tarball contents and exports → run the
 * built dist through a minimal claim/access smoke.
 *
 * Run from the repo root: `node scripts/package-smoke.mjs`.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const pkgDir = join(root, 'packages', 'multi-tenant')

const tmp = mkdtempSync(join(tmpdir(), 'dsh-mt-pack-'))
try {
  // 1. fresh build, then pack.
  execFileSync('pnpm', ['--filter', 'dsh-multi-tenant', 'build'], { cwd: root, stdio: 'ignore' })
  execFileSync('pnpm', ['--filter', 'dsh-multi-tenant', 'pack', '--pack-destination', tmp], {
    cwd: root,
    stdio: 'ignore',
  })
  const tarball = readdirSync(tmp).find(f => f.endsWith('.tgz'))
  if (!tarball) throw new Error('pnpm pack produced no tarball')

  // 2. verify the tarball ships the intended files and no exports target is missing.
  const listing = execFileSync('tar', ['-tzf', join(tmp, tarball)], { encoding: 'utf8' })
  const lines = listing.split('\n')
  const has = f => lines.some(line => line === f || line.endsWith(`/${f}`))

  const required = ['package.json', 'dist/index.mjs', 'dist/store.mjs', 'dist/testing.mjs', 'cordis.patch.yml', 'README.md', 'LICENSE']
  const missing = required.filter(f => !has(f))
  if (missing.length) throw new Error(`tarball is missing: ${missing.join(', ')}`)

  const pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'))
  const targets = [
    pkg.exports?.['.']?.import,
    pkg.exports?.['.']?.types,
    pkg.exports?.['./store']?.import,
    pkg.exports?.['./testing']?.import,
    pkg.exports?.['./cordis.patch.yml'],
  ].filter(Boolean)
  const unresolved = targets.filter(t => !has(t.replace(/^\.\//, '')))
  if (unresolved.length) throw new Error(`exports targets missing from tarball: ${unresolved.join(', ')}`)

  // 3. run the built dist through a claim/access smoke (resolves `@deepseek-ai/cordis`
  //    from the package's own node_modules).
  execFileSync(
    'node',
    [
      '--input-type=module',
      '--eval',
      [
        'const { Context } = await import("@deepseek-ai/cordis");',
        'const { default: Store } = await import("./dist/store.mjs");',
        'const { default: Service } = await import("./dist/index.mjs");',
        'const ctx = new Context();',
        'await ctx.plugin(Store);',
        'await ctx.plugin(Service);',
        'const alice = { tenantId: "acme", userId: "alice", roles: ["member"] };',
        'await ctx.multiTenant.claimSession("s1", alice);',
        'if ((await ctx.multiTenant.canAccessSession(alice, "s1")) !== true) throw new Error("dist smoke: same-user should be allowed");',
        'console.log("dist smoke passed");',
      ].join('\n'),
    ],
    { cwd: pkgDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  )

  console.log(`package smoke passed: ${tarball}`)
} finally {
  rmSync(tmp, { recursive: true, force: true })
}
