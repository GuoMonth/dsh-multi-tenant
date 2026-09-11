import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SQLiteDomainRepository } from '../packages/multi-tenant/dist/index.mjs'
const root = mkdtempSync(join(tmpdir(), 'dsh-directory-proof-'))
let repository
try {
  repository = new SQLiteDomainRepository(root)
  const owner = { tenantId: 'tenant', principalId: 'alice' }
  const record = repository.resolve(owner)
  const active = repository.begin(record.id)
  repository.close()
  repository = new SQLiteDomainRepository(root)
  assert.equal(repository.get(record.id).unresolved, true)
  assert.throws(() => repository.begin(record.id), /recovery/)
  repository.finish(record.id, active.generation, true, true)
  repository.setDesired(record.id, 'revoked')
  repository.close()
  repository = new SQLiteDomainRepository(root)
  assert.equal(repository.resolve(owner).desired, 'revoked')
  assert.throws(() => repository.setDesired(record.id, 'enabled'), /cannot be re-enabled/)
  console.log('Domain directory restart, quarantine and durable revocation passed')
} finally { repository?.close(); rmSync(root, { recursive: true, force: true }) }
