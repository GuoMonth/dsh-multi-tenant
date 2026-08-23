#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const root = fileURLToPath(new URL('..', import.meta.url))
const ledgerPath = join(root, 'docs/specs/v0.3-assumptions.json')
const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const errors = []

for (const required of [
  'docs/specs/v0.3-foundation.md',
  'docs/specs/v0.3-foundation.zh-CN.md',
  'docs/specs/saas-composition.md',
  'docs/specs/saas-composition.zh-CN.md',
  'docs/specs/operation-lifecycle.md',
  'docs/specs/operation-lifecycle.zh-CN.md',
  'docs/specs/v0.3-assumptions.json',
]) {
  if (!existsSync(join(root, required))) errors.push(`missing v0.3 foundation artifact: ${required}`)
}

if (!existsSync(ledgerPath)) {
  errors.push('missing v0.3 assumption ledger')
} else {
  const ledger = JSON.parse(readFileSync(ledgerPath, 'utf8'))
  const allowedStatus = new Set(ledger.policy?.allowedStatus ?? [])
  const proofKinds = new Set(ledger.policy?.proofKinds ?? [])
  const seen = new Set()

  for (const assumption of ledger.assumptions ?? []) {
    const label = assumption.id ?? '<missing-id>'
    if (!assumption.id || seen.has(assumption.id)) errors.push(`assumption ${label}: id must be unique and non-empty`)
    seen.add(assumption.id)
    if (!allowedStatus.has(assumption.status)) errors.push(`assumption ${label}: unsupported status ${String(assumption.status)}`)
    if (!assumption.owner || !assumption.claim) errors.push(`assumption ${label}: owner and claim are required`)

    if (assumption.status === 'proven') {
      if (!assumption.proof) {
        errors.push(`assumption ${label}: proven assumptions require executable proof`)
        continue
      }
      if (!proofKinds.has(assumption.proof.kind)) errors.push(`assumption ${label}: unsupported proof kind ${String(assumption.proof.kind)}`)
      if (!assumption.proof.path || !existsSync(join(root, assumption.proof.path))) {
        errors.push(`assumption ${label}: proof artifact does not exist: ${String(assumption.proof.path)}`)
      }
      const command = assumption.proof.command
      const scriptName = typeof command === 'string' && command.match(/^pnpm\s+([\w:-]+)$/)?.[1]
      if (!scriptName || !packageJson.scripts?.[scriptName]) {
        errors.push(`assumption ${label}: proof command must name an existing root pnpm script; got ${String(command)}`)
      }
    }

    if (assumption.status === 'open' && assumption.blocking === true) {
      if (!assumption.gate) errors.push(`assumption ${label}: blocking open assumptions require an explicit gate`)
      if (assumption.proof !== null) errors.push(`assumption ${label}: open assumption proof must be null until evidence exists`)
    }
  }
}

if (errors.length) {
  console.error('v0.3 foundation verification failed:\n- ' + errors.join('\n- '))
  process.exit(1)
}

console.log('v0.3 foundation verification passed: specs + assumption ledger are structurally valid')
