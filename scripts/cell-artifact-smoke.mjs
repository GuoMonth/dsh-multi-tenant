#!/usr/bin/env node
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { installArtifact } from './installed-package.mjs'
const installed = installArtifact(process.argv[2] ?? '--local')
try {
  const cli = join(installed.packageDirectory, 'dist/cli.mjs')
  const run = args => spawnSync(process.execPath, [cli, ...args], { cwd: installed.directory, encoding: 'utf8', timeout: 10000 })
  const help = run(['--help']); assert.equal(help.status, 0); assert.match(help.stdout, /start --config/)
  const pkg = JSON.parse(readFileSync(join(installed.packageDirectory, 'package.json'), 'utf8'))
  assert.equal(run(['--version']).stdout.trim(), pkg.version)
  const invalid = run(['start', '--config', '/nonexistent/dsh-private-config.json'])
  assert.equal(invalid.status, 1)
  const error = JSON.parse(invalid.stderr.split('\n').find(line => line.startsWith('{')))
  assert.equal(error.code, 'PlatformStartupRejected'); assert.equal(error.stage, 'configuration')
  assert.equal(error.effect, 'not-submitted'); assert.equal(error.retry, 'never')
  assert.equal(run(['start', '--image', 'legacy']).status, 1)
  const admin = run(['inspect', '--socket', '/nonexistent/dsh.sock', '--environment', 'test'])
  assert.equal(admin.status, 1); assert.match(admin.stderr, /Admin request unavailable/)
  const manifest = JSON.parse(readFileSync(join(installed.packageDirectory, 'cell-release.json'), 'utf8'))
  assert.equal(manifest.platformVersion, pkg.version); assert.equal(manifest.runtime.accessMode, 'platform')
  for (const file of ['cell-platform.mjs', 'cell-admin.mjs']) {
    const source = readFileSync(join(installed.packageDirectory, 'dist', file), 'utf8')
    for (const [, module] of source.matchAll(/from ["']([^"']+)["']/g)) assert.ok(module.startsWith('node:'), `unbundled dependency: ${module}`)
  }
  console.log('Installed Cell CLI: help/version, bundled server/admin, redacted startup and removed legacy options passed')
} finally { installed.close() }
