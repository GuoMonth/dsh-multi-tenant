#!/usr/bin/env node
import { readFileSync } from 'node:fs'
const manifest = JSON.parse(readFileSync(new URL('../packages/multi-tenant/cell-release.json', import.meta.url)))
const pkg = JSON.parse(readFileSync(new URL('../packages/multi-tenant/package.json', import.meta.url)))
if (manifest.status !== 'release-bound' || manifest.platformVersion !== pkg.version || !manifest.runtime.release) throw new Error('Bind the accepted public Cell release before publication')
for (const name of ['cell', 'operator']) {
  const prefix = `ghcr.io/guomonth/dsh-isolated-runtime-${name}@sha256:`
  if (!manifest.images[name]?.startsWith(prefix) || !/^[a-f0-9]{64}$/.test(manifest.images[name].slice(prefix.length))) throw new Error('Missing runtime-owned immutable image')
}
console.log('Cell publication identity is bound')
