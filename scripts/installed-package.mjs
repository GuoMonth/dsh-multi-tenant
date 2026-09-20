import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertExportFiles } from './artifact-contract.mjs'

export const repositoryRoot = fileURLToPath(new URL('..', import.meta.url))
/** Real installation, no workspace links. Caller owns cleanup, including on failure. */
export function installArtifact(requested = '--local') {
  const directory = mkdtempSync(join(tmpdir(), 'dsh-installed-'))
  try {
    // Resolve local tarballs before npm runs in the isolated consumer directory.
    let spec = requested !== '--local' && existsSync(requested) ? resolve(requested) : requested
    if (spec === '--local') {
      execFileSync('pnpm', ['--filter', 'dsh-multi-tenant', 'build'], { cwd: repositoryRoot, stdio: 'pipe' })
      execFileSync('pnpm', ['--filter', 'dsh-multi-tenant', 'pack', '--pack-destination', directory], { cwd: repositoryRoot, stdio: 'pipe' })
      spec = join(directory, readdirSync(directory).find(file => file.endsWith('.tgz')))
    }
    writeFileSync(join(directory, 'package.json'), JSON.stringify({ name: 'installed-domain-consumer', private: true, type: 'module' }))
    execFileSync('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', spec], { cwd: directory, stdio: 'pipe' })
    const packageDirectory = join(directory, 'node_modules/dsh-multi-tenant')
    const pkg = JSON.parse(readFileSync(join(packageDirectory, 'package.json'), 'utf8'))
    assertExportFiles(pkg.exports, path => { try { readFileSync(join(packageDirectory, path)); return true } catch { return false } })
    if (pkg.dsh || pkg.peerDependencies || Object.keys(pkg.exports).some(key => ['./starter', './web', './mcp', './deliveries'].includes(key))) {
      throw new Error('Installed artifact still declares the shared-host plugin contract')
    }
    if (pkg.dshRuntime?.version !== '0.1.5-rc.2') throw new Error('Installed runtime baseline mismatch')
    return { directory, packageDirectory, close: () => rmSync(directory, { recursive: true, force: true }) }
  } catch (error) { rmSync(directory, { recursive: true, force: true }); throw error }
}
