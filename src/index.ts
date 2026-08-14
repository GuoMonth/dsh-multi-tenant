/**
 * dsh-multi-tenant — Multi-tenant SaaS extension for DeepSeek Harness (DSH).
 *
 * Exposes a single Cordis service, `ctx.multiTenant`, that owns the mapping
 * between DSH sessions and the tenant/user that may access them. This first
 * milestone is the fail-closed core; auth, RPC, MCP, and audit layers build on
 * top of it.
 *
 * @module dsh-multi-tenant
 */

import { MultiTenantService } from './service.ts'

// Augment the Cordis context so consumers can type `ctx.multiTenant`.
declare module '@deepseek-ai/cordis' {
  interface Context {
    multiTenant: MultiTenantService
  }
}

export { MultiTenantService }
export default MultiTenantService

export type {
  TenantPrincipal,
  SessionOwner,
  MultiTenantService as MultiTenantServiceContract,
} from './types.ts'
export { MultiTenantError, UnknownSessionError, SessionAccessDeniedError } from './errors.ts'
