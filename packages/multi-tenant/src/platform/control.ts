import { z } from 'zod'
import { environmentId, type EnvironmentId } from './identity.ts'
import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  refSchema,
  type AgentEnvironmentRuntime,
  type EnvironmentContext,
  type EnvironmentView,
  type AllocationKey,
  type SandboxUID,
} from '../environment-contract.ts'
import {
  EnvironmentBindingStore,
  sameRef,
  type EnvironmentBinding,
} from './bindings.ts'
import { PlatformError, diagnostic } from './errors.ts'
import type { Environment } from './ingress.ts'
import type { Member } from './sessions.ts'
type Operation = 'inspect' | 'enter' | 'start' | 'stop' | 'delete'
const deletionSchema = z.strictObject({ ref: refSchema, dataRetained: z.literal(true),
  effect: z.enum(['accepted', 'not-submitted']), state: z.enum(['Deleting', 'Deleted']) })
export function createEnvironmentControl(
  runtime: AgentEnvironmentRuntime,
  store: EnvironmentBindingStore,
) {
  const active = new Set<EnvironmentId>()
  const environments = new Map<EnvironmentId, Environment>(),
    origins = new Map<EnvironmentId, string>()
  let revoke: ((id: EnvironmentId) => void) | undefined
  function withdraw(id: EnvironmentId) {
    environments.delete(id)
    origins.delete(id)
    revoke?.(id)
  }
  function verify(
    record: EnvironmentBinding,
    view: EnvironmentView,
    ctx: EnvironmentContext,
  ) {
    const ref = view.ref
    if (
      ref.allocationKey !== record.allocationKey ||
      ref.owner.tenantId !== record.owner.tenantId ||
      ref.owner.principalId !== record.owner.principalId ||
      !ref.namespace ||
      !ref.sandbox.name ||
      !ref.sandbox.uid ||
      !ref.data.name ||
      !ref.data.uid ||
      !view.revision ||
      (record.ref && !sameRef(record.ref, ref))
    ) {
      withdraw(record.id)
      throw new PlatformError(
        'StaleInstance',
        ctx.correlationId,
        'Inspect the original owner, Sandbox and PVC identity',
      )
    }
    return view
  }
  function publish(record: EnvironmentBinding, view: EnvironmentView) {
    if (view.state === 'Ready' && record.phase === 'bound' && !record.pending) {
      environments.set(record.id, {
        id: record.id,
        owner: record.owner,
        instance: view.ref,
      })
      origins.set(record.id, view.origin)
    } else withdraw(record.id)
  }
  async function operate(
    id: EnvironmentId,
    operation: Operation,
    ctx: EnvironmentContext,
  ) {
    let record = store.get(id)
    if (!record)
      throw new PlatformError(
        'RecordMissing',
        ctx.correlationId,
        'Use a configured environment',
      )
    if (active.has(id))
      throw new PlatformError(
        'AllocationUnresolved',
        ctx.correlationId,
        'An operation is in flight; inspect after it finishes',
      )
    active.add(id)
    try {
      ctx.signal.throwIfAborted()
      const intent = { allocationKey: record.allocationKey, owner: record.owner }
      let view: EnvironmentView | null
      if (record.phase === 'reserved') {
        if (operation !== 'enter')
          return {
            id,
            phase: record.phase,
            allocationKey: record.allocationKey,
          }
        record = { ...record, phase: 'submitted' }
        store.save(record, ctx.correlationId) // durable before any runtime write
        view = await runtime.create(intent, ctx)
      } else view = await runtime.inspectAllocation(intent, record.ref, ctx)
      if (!view) {
        withdraw(id)
        // A missing unknown create is not authority to replay or replace its allocation.
        throw new PlatformError(
          record.ref ? 'StaleInstance' : 'AllocationUnresolved',
          ctx.correlationId,
          'No exact instance was observed; inspect the original allocation, never recreate or infer termination',
          { allocationKey: record.allocationKey },
          { stage: 'inspect', effect: 'unknown' },
        )
      }
      verify(record, view, ctx)
      if (record.phase === 'delete-requested') {
        withdraw(id)
        return { id, phase: record.phase, instance: view }
      }
      record = { ...record, phase: 'bound', ref: view.ref }
      // Only positive terminal observations release a persisted mutation barrier.
      if (
        (record.pending === 'stop' && view.state === 'Stopped') ||
        (record.pending === 'start' && view.state === 'Ready')
      ) {
        const { pending: _pending, ...resolved } = record
        record = resolved
      }
      store.save(record, ctx.correlationId)
      if (
        operation === 'stop' ||
        operation === 'start' ||
        operation === 'delete'
      ) {
        if (record.pending)
          throw new PlatformError(
            'AllocationUnresolved',
            ctx.correlationId,
            'Inspect the original mutation until its result is positively known',
          )
        if (!revoke) throw new Error('Revocation unavailable')
        if (operation === 'start' && view.state !== 'Stopped')
          throw new PlatformError(
            'StartRejected',
            ctx.correlationId,
            'Start requires positively Stopped with the original PVC',
          )
        if (operation === 'delete' && view.state !== 'Stopped')
          throw new PlatformError(
            'DeleteRejected',
            ctx.correlationId,
            'Stop and verify the exact writer before deleting runtime resources',
          )
        if (operation === 'stop' && view.state === 'Stopped') {
          publish(record, view)
          return { id, phase: record.phase, instance: view }
        }
        if (operation === 'delete')
          record = { ...record, phase: 'delete-requested' }
        else record = { ...record, pending: operation }
        try {
          store.save(record, ctx.correlationId)
        } finally {
          withdraw(id)
        }
        try {
          if (operation === 'delete') {
            const result = deletionSchema.parse(await runtime.delete(view.ref, view.revision, ctx))
            if (
              !sameRef(view.ref, result.ref)
            )
              throw new Error('Invalid deletion identity')
            return { id, phase: record.phase, ...result }
          }
          const result = await runtime[operation](view.ref, view.revision, ctx)
          view = verify(record, result.view, ctx)
          if (
            (operation === 'stop' && view.state === 'Stopped') ||
            (operation === 'start' && view.state === 'Ready') ||
            result.effect === 'not-submitted'
          ) {
            const { pending: _pending, ...resolved } = record
            record = resolved
            store.save(record, ctx.correlationId)
          }
        } catch (error) {
          if (
            diagnostic(error, ctx.correlationId).effect === 'not-submitted' &&
            record.pending
          ) {
            const { pending: _pending, ...resolved } = record
            record = resolved
            store.save(record, ctx.correlationId)
          }
          throw error
        }
      }
      ctx.signal.throwIfAborted()
      publish(record, view)
      return {
        id,
        phase: record.phase,
        pending: record.pending,
        instance: view,
      }
    } catch (error) {
      withdraw(id)
      throw error
    } finally {
      active.delete(id)
    }
  }
  return {
    environments,
    origins,
    setRevoker(fn: (id: EnvironmentId) => void) {
      if (revoke) throw new Error('Revoker already set')
      revoke = fn
    },
    async administer(
      id: EnvironmentId,
      operation: Operation,
      expected: { allocationKey: AllocationKey; identity: SandboxUID } | undefined,
      ctx: EnvironmentContext,
    ) {
      const r = store.get(id)
      if (
        operation !== 'inspect' &&
        operation !== 'enter' &&
        (!r?.ref ||
          !expected ||
          expected.allocationKey !== r.allocationKey ||
          expected.identity !== r.ref.sandbox.uid)
      )
        throw new PlatformError(
          'StaleInstance',
          ctx.correlationId,
          'Supply the persisted allocation key and Sandbox UID',
        )
      return operate(id, operation, ctx)
    },
    async handle(
      request: IncomingMessage,
      response: ServerResponse,
      member: Member,
      ctx: EnvironmentContext,
    ) {
      const url = new URL(request.url ?? '', 'https://platform.invalid')
      const match =
        /^\/api\/environments\/([A-Za-z0-9_-]{1,80})(?:\/(enter|stop|start))?$/.exec(
          url.pathname,
        )
      response.setHeader('content-type', 'application/json')
      response.setHeader('cache-control', 'no-store')
      const record = match && store.get(environmentId(match[1]))
      if (
        !match ||
        !record ||
        record.owner.tenantId !== member.owner.tenantId ||
        record.owner.principalId !== member.owner.principalId
      ) {
        response.writeHead(403)
        response.end('{"code":"Forbidden"}')
        return
      }
      if (
        match[2]
          ? request.method !== 'POST'
          : !['GET', 'POST'].includes(request.method ?? '')
      ) {
        response.writeHead(405)
        response.end()
        return
      }
      if (
        url.search ||
        request.headers['transfer-encoding'] ||
        Number(request.headers['content-length'] ?? 0) !== 0
      ) {
        response.writeHead(400)
        response.end()
        return
      }
      try {
        const operation = match[2] ? z.enum(['enter', 'stop', 'start']).parse(match[2]) :
          (request.method === 'POST' ? 'enter' : 'inspect')
        const result = await operate(record.id, operation, ctx)
        ctx.signal.throwIfAborted()
        response.writeHead(
          result.instance?.state === 'Ready' ||
            result.instance?.state === 'Stopped'
            ? 200
            : 202,
        )
        response.end(JSON.stringify(result))
      } catch (error) {
        if (!response.destroyed) {
          response.writeHead(409)
          response.end(
            JSON.stringify({
              environmentId: record.id,
              diagnostic: diagnostic(error, ctx.correlationId),
            }),
          )
        }
      }
    },
    list(member: Member) {
      const r = store.reserve(member.owner)
      return [
        {
          id: r.id,
          phase: r.phase,
          pending: r.pending,
          origin: origins.get(r.id),
        },
      ]
    },
  }
}
