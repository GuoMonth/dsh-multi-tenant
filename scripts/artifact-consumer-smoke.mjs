#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { installArtifact } from './installed-package.mjs'
const installed = installArtifact(process.argv[2] ?? '--local')
try {
  const guide = readFileSync(join(installed.packageDirectory, 'AI.md'), 'utf8')
  if (!guide.includes('cell-release.json')) throw new Error('Installed package is missing its AI operating guide')
  execFileSync('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--save-dev', 'typescript@6.0.3', '@types/node@22.20.0'], { cwd: installed.directory, stdio: 'pipe' })
  writeFileSync(join(installed.directory, 'contract.ts'), `
    import { DomainRuntimeCoordinator, SQLiteDomainRepository, createDomainIngress,
      DSH_RUNTIME_VERSION, type DomainAuthenticator, type RuntimeProvider } from 'dsh-multi-tenant'
    declare const authentication: DomainAuthenticator
    declare const provider: RuntimeProvider
    const repository = new SQLiteDomainRepository('/platform/directory')
    const runtime = new DomainRuntimeCoordinator(repository, provider, DSH_RUNTIME_VERSION)
    createDomainIngress({ authenticator: authentication, runtime, originFor: () => 'https://alice.example' })
    // @ts-expect-error No per-root authorization facade remains.
    runtime.revokeRoot('session')
  `)
  execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', '--noEmit', '--strict', '--types', 'node', '--module', 'NodeNext', '--target', 'ES2024', 'contract.ts'], { cwd: installed.directory, stdio: 'inherit' })
  execFileSync(process.execPath, [join(installed.packageDirectory, 'examples/native-domains/smoke.mjs')], { cwd: installed.directory, stdio: 'inherit' })
  console.log('Installed domain lifecycle, ingress, native asset and declaration contract passed')
} finally { installed.close() }
