import { expect, it } from 'vitest'
import { SessionSeq, type SessionEvent } from '@deepseek-ai/dsh-session'
import { historyPage, observeLease, type SessionReadLease, type SessionReadSnapshot, type ObservationFrame } from '../src/observation.ts'

const event = (seq: number): SessionEvent => ({ type: 'user/message', seq: SessionSeq(seq), data: { content: [{ type: 'text', text: `message ${seq}` }] } } as SessionEvent)

it('subscribes before opening, catches opening gaps, paginates deltas, and releases on revocation', async () => {
  const opening = Promise.withResolvers<SessionReadSnapshot>()
  let changed = () => {}
  let reads = 0
  let disposed = 0
  let detached = 0
  const controller = new AbortController()
  const lease: SessionReadLease = {
    signal: controller.signal,
    subscribe(notify) { changed = notify; return () => { detached++ } },
    async read() { return reads++ === 0 ? opening.promise : { events: Array.from({ length: 402 }, (_, i) => event(i)), cursor: 401, active: false } },
    dispose() { disposed++ },
  }
  const pending = observeLease('root', lease, new AbortController().signal)
  changed()
  opening.resolve({ events: [event(0)], cursor: 0, active: true })
  const stream = await pending
  const iterator = stream[Symbol.asyncIterator]()
  expect((await iterator.next()).value?.type).toBe('replace')
  const items: number[] = []
  for (let i = 0; i < 3; i++) {
    const frame = (await iterator.next()).value as ObservationFrame
    expect(frame.type).toBe('append')
    if (frame.type === 'append') items.push(...frame.page.items.map(item => item.seq))
  }
  expect(items).toEqual(Array.from({ length: 401 }, (_, i) => i + 1))
  await iterator.next() // final status
  const waiting = iterator.next()
  const rejection = expect(waiting).rejects.toThrow('revoked')
  controller.abort(new Error('revoked'))
  await rejection
  await stream.dispose()
  expect(disposed).toBe(1)
  expect(detached).toBe(1)
})

it('binds paging cursors to the authorized target', () => {
  expect(() => historyPage('bob', { events: [event(0)], cursor: 0, active: false }, { before: 'alice:1' })).toThrow('target')
})

it('fails visibly when a client stops consuming instead of silently dropping events', async () => {
  let changed: Parameters<SessionReadLease['subscribe']>[0] = () => {}
  let disposed = 0
  const stream = await observeLease('root', {
    subscribe(notify) { changed = notify; return () => {} },
    async read() { return { events: [], cursor: -1, active: false } },
    dispose() { disposed++ },
  }, new AbortController().signal)
  for (let i = 0; i < 130; i++) changed({ attempt: 'a', text: 'x', reset: false })
  await expect(stream[Symbol.asyncIterator]().next()).rejects.toThrow('too slow')
  expect(disposed).toBe(1)
})
