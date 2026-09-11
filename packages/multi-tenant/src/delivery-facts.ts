import type { SessionReadSnapshot } from './observation.ts'
import type { DeliverySummary } from './delivery-types.ts'
import { DeliveryNotFoundError } from './errors.ts'

interface Fact { readonly seq: number; readonly index: number; readonly path: string; readonly description?: string }

/** Decode only the native event's public file vocabulary, excluding inherited declarations. */
function facts(snapshot: SessionReadSnapshot): Fact[] {
  return snapshot.events.flatMap(event => {
    if ((event.type as string) !== 'deliverables/presented' || event.seq < (snapshot.inheritedEventCount ?? 0)) return []
    const data: unknown = event.data
    const files: unknown = data && typeof data === 'object' ? Reflect.get(data, 'files') : undefined
    if (!Array.isArray(files)) return []
    return files.flatMap((file: unknown, index) => {
      if (!file || typeof file !== 'object') return []
      const path: unknown = Reflect.get(file, 'path')
      const description: unknown = Reflect.get(file, 'description')
      if (typeof path !== 'string' || !path.trim() || (description !== undefined && typeof description !== 'string')) return []
      return [{ seq: event.seq, index, path, ...(description === undefined ? {} : { description }) }]
    })
  })
}

export function deliveryName(path: string): string {
  return (path.split(/[\\/]/).at(-1) || 'download').replace(/[\u0000-\u001f\u007f]/g, '_').slice(0, 180)
}

export function deliverySummaries(target: string, snapshot: SessionReadSnapshot): readonly DeliverySummary[] {
  return facts(snapshot).map(file => ({ ref: `${target}:${file.seq}:${file.index}`, name: deliveryName(file.path), ...(file.description === undefined ? {} : { description: file.description }) }))
}

export function deliveryFact(target: string, snapshot: SessionReadSnapshot, ref: string): Fact {
  const fact = facts(snapshot).find(file => ref === `${target}:${file.seq}:${file.index}`)
  if (!fact) throw new DeliveryNotFoundError()
  return fact
}

/** Active document formats are served as inert text; unknown types download as bytes. */
export function deliveryContentType(name: string): string {
  const extension = name.split('.').at(-1)?.toLowerCase()
  if (extension && ['txt', 'md', 'csv', 'json', 'html', 'htm', 'svg', 'xml', 'js', 'css', 'log'].includes(extension)) return 'text/plain; charset=utf-8'
  return ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' } as Record<string, string>)[extension ?? ''] ?? 'application/octet-stream'
}
