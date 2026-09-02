#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const root = fileURLToPath(new URL('..', import.meta.url))
const errors = []
const names = []

for (const directory of readdirSync(join(root, 'packages'))) {
  const manifest = join(root, 'packages', directory, 'package.json')
  if (!existsSync(manifest)) continue
  let pkg
  try {
    pkg = JSON.parse(readFileSync(manifest, 'utf8'))
  } catch {
    errors.push(`packages/${directory}: missing or invalid package.json`)
    continue
  }
  names.push(pkg.name ?? directory)
  for (const script of ['build', 'typecheck', 'test']) {
    if (typeof pkg.scripts?.[script] !== 'string') errors.push(`${pkg.name}: missing ${script} script`)
  }
  if (pkg.private !== true) {
    if (pkg.main !== 'dist/index.mjs') errors.push(`${pkg.name}: invalid main`)
    if (pkg.types !== 'dist/index.d.mts') errors.push(`${pkg.name}: invalid types entry`)
    if (typeof pkg.engines?.node !== 'string') errors.push(`${pkg.name}: missing Node engine`)
  }
}

if (errors.length > 0) {
  console.error(`package verification failed:\n- ${errors.join('\n- ')}`)
  process.exit(1)
}
console.log(`package verification passed (${names.join(', ')})`)
