/**
 * dsh-multi-tenant-web — DSH Web multi-tenant integration.
 *
 * Early spike. Hosts the tenant-bound `ApiProxy` facade (`bindTenant`) and the
 * exhaustive unary-RPC classification table (`CLASSIFICATION`) against the real
 * `@deepseek-ai/dsh-host-apiproxy` contract. No production surface yet.
 *
 * @module dsh-multi-tenant-web
 */

export { bindTenant } from './bind-tenant.ts'
export { CLASSIFICATION, classify, guardSessionKey } from './classification.ts'
export type { Category } from './classification.ts'
