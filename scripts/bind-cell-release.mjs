#!/usr/bin/env node
// Release-time binding: public runtime artifacts must already exist. No image build here.
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { verifyCellRelease } from './cell-release-contract.mjs'
const path = new URL('../packages/multi-tenant/cell-release.json', import.meta.url)
const manifest = JSON.parse(readFileSync(path, 'utf8'))
const tag = process.env.RUNTIME_RELEASE ?? ''
if (!/^v\d+\.\d+\.\d+(?:-alpha\.\d+)?$/.test(tag)) throw new Error('Require an exact runtime GitHub release tag')
const url = `https://github.com/GuoMonth/dsh-isolated-runtime/releases/download/${tag}/release.json`
const response = await fetch(url, { signal: AbortSignal.timeout(20000) })
if (!response.ok) throw new Error('Runtime release manifest unavailable')
const accepted = await response.json()
verifyCellRelease(manifest, accepted, tag, { cell: process.env.CELL_IMAGE, operator: process.env.OPERATOR_IMAGE })
manifest.runtime.release = tag
const directory = mkdtempSync(join(tmpdir(), 'dsh-public-images-'))
try {
  for (const [name, variable] of [['cell', 'CELL_IMAGE'], ['operator', 'OPERATOR_IMAGE']]) {
    const image = process.env[variable] ?? ''
    const prefix = `ghcr.io/guomonth/dsh-isolated-runtime-${name}@sha256:`
    if (!image.startsWith(prefix) || !/^[a-f0-9]{64}$/.test(image.slice(prefix.length))) throw new Error(`Invalid ${variable}: require the runtime-owned immutable public image`)
    execFileSync('docker', ['buildx', 'imagetools', 'inspect', image], { env: { ...process.env, DOCKER_CONFIG: directory }, stdio: 'inherit' })
    manifest.images[name] = image
  }
  manifest.status = 'release-bound'
  writeFileSync(path, JSON.stringify(manifest, null, 2) + '\n')
} finally { rmSync(directory, { recursive: true, force: true }) }
