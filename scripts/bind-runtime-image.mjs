import { readFileSync, writeFileSync } from 'node:fs'
const path = new URL('../packages/multi-tenant/runtime-manifest.json', import.meta.url)
const manifest = JSON.parse(readFileSync(path, 'utf8'))
const image = process.env.DSH_RUNTIME_IMAGE
if (!/^ghcr\.io\/[^\s]+@sha256:[a-f0-9]{64}$/.test(image ?? '')) throw new Error('Verified runtime digest required before npm publication')
manifest.image = image
writeFileSync(path, JSON.stringify(manifest, null, 2) + '\n')
