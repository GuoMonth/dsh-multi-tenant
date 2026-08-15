/**
 * dsh-multi-tenant-web — DSH Web multi-tenant integration.
 *
 * SPIKE. This package hosts the tenant-bound ApiProxy facade (principal
 * binding + per-surface authorization). No production surface yet — the Seam
 * Map and ADR are being produced in this milestone.
 *
 * @module dsh-multi-tenant-web
 */

export const name = 'dsh-multi-tenant-web'

export { bindTenant } from './bind-tenant.ts'
export type {
  ApiSurface,
  EventsSurface,
  MuxFrame,
  SessionSummary,
  SessionsSurface,
} from './bind-tenant.ts'
