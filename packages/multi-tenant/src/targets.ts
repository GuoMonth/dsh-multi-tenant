/** Root-bound addresses derived from the native parent catalog, never ownership rows. */
import { AgentNotFoundError } from './errors.ts'
import type { SessionReadSnapshot } from './observation.ts'

export interface NativeChild { readonly id: string; readonly createdAt: number; readonly mode: 'one-shot' | 'continuable'; readonly label?: string }
export interface ChildSummary { readonly ref: string; readonly mode: 'one-shot' | 'continuable'; readonly label?: string; readonly createdAt: number }

export function childPath(root: string, ref: string | undefined): number[] {
  if (ref === undefined) return []
  if (!ref.startsWith(`${root}.`)) throw new AgentNotFoundError()
  const parts = ref.slice(root.length + 1).split('.')
  if (parts.length > 16 || parts.some(part => !/^(0|[1-9]\d{0,8})$/.test(part))) throw new AgentNotFoundError()
  return parts.map(Number)
}

export function childSummaries(target: string, snapshot: SessionReadSnapshot): readonly ChildSummary[] | undefined {
  return snapshot.catalog?.map((child, index) => ({
    ref: `${target}.${index}`, mode: child.mode, createdAt: child.createdAt,
    ...(child.label === undefined ? {} : { label: child.label }),
  }))
}

export function assertChild(snapshot: SessionReadSnapshot, parent: string, expected: NativeChild): void {
  const header = snapshot.header
  const identity = snapshot.identity
  if (!header || header.id !== expected.id || header.parentSession !== parent || header.origin !== 'subagent'
    || header.createdAt !== expected.createdAt || !identity || identity.seq < (snapshot.inheritedEventCount ?? Infinity)
    || identity.mode !== expected.mode || identity.label !== expected.label) throw new AgentNotFoundError()
}
