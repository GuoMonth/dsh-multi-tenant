import { describe, expect, it } from 'vitest'
import { name } from '../src/index.ts'

describe('dsh-multi-tenant-web', () => {
  it('has a package name', () => {
    expect(name).toBe('dsh-multi-tenant-web')
  })
})
