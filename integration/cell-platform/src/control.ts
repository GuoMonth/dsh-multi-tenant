import type { IncomingMessage, ServerResponse } from "node:http";
import {
  RuntimeAccessError,
  type AllocationRuntime,
  type AccessContext,
} from "@dsh/cell-connector-internal";
import { AllocationStore, type EnvironmentDefinition } from "./allocations.js";
import type { Environment } from "./ingress.js";
import type { Member } from "./sessions.js";
export function createEnvironmentControl(
  runtime: AllocationRuntime,
  store: AllocationStore,
  definitions: readonly EnvironmentDefinition[],
) {
  const active = new Set<string>();
  let revokeEnvironment: ((id: string) => void) | undefined;
  const environments = new Map<string, Environment>();
  const origins = new Map<string, string>();
  function authorized(id: string, member: Member) {
    const record = store.get(id);
    return record &&
      record.owner.tenantId === member.owner.tenantId &&
      record.owner.principalId === member.owner.principalId
      ? record
      : undefined;
  }
  async function refresh(id: string, create: boolean, context: AccessContext) {
    const record = store.get(id)!;
    if (active.has(id))
      throw new RuntimeAccessError(
        "AllocationUnresolved",
        context.correlationId,
        "A request is already in flight; query this environment after it returns",
        { allocationKey: record.allocationKey },
        { stage: "create" },
      );
    active.add(id);
    try {
      context.signal.throwIfAborted();
      let view;
      if (create && record.phase === "reserved") {
        // Commit uncertainty barrier before the first runtime write. Never reset it automatically.
        store.save(id, "submitted", undefined, context.correlationId);
        view = await runtime.create(record, context);
      } else {
        view = await runtime.inspectAllocation(
          record,
          record.identity,
          context,
        );
      }
      if (record.phase === "delete-requested")
        return {
          id,
          phase: record.phase,
          deleteEffect: record.deleteEffect,
          instance: view,
          writerState: "unverified",
        };
      store.save(id, "bound", view.ref.identity, context.correlationId);
      // Publish a route only after durable identity binding. Fresh runtime validation still gates access.
      environments.set(id, { id, owner: record.owner, instance: view.ref });
      origins.set(id, view.origin);
      return { id, phase: "bound", instance: view };
    } finally {
      active.delete(id);
    }
  }
  return {
    environments,
    origins,
    setRevoker(revoke: (id: string) => void) {
      if (revokeEnvironment) throw new Error("Revoker already set");
      revokeEnvironment = revoke;
    },
    async administer(
      id: string,
      operation: "inspect" | "delete",
      expected: { allocationKey: string; identity: string } | undefined,
      context: AccessContext,
    ) {
      const record = store.get(id);
      if (!record)
        throw new RuntimeAccessError(
          "RecordMissing",
          context.correlationId,
          "Use a configured environment",
        );
      if (operation === "inspect") {
        if (record.phase === "reserved")
          return {
            id,
            phase: record.phase,
            allocationKey: record.allocationKey,
          };
        return refresh(id, false, context);
      }
      if (
        !expected ||
        record.allocationKey !== expected.allocationKey ||
        record.identity !== expected.identity
      )
        throw new RuntimeAccessError(
          "StaleInstance",
          context.correlationId,
          "Inspect and supply the exact persisted allocation and identity",
        );
      if (
        active.has(id) ||
        !record.identity ||
        (record.phase !== "bound" && record.phase !== "delete-requested")
      )
        throw new RuntimeAccessError(
          "AllocationUnresolved",
          context.correlationId,
          "Resolve the original create before deleting this environment",
        );
      if (record.phase === "delete-requested")
        return refresh(id, false, context);
      if (!revokeEnvironment) throw new Error("Revocation unavailable");
      active.add(id);
      try {
        context.signal.throwIfAborted();
        // A failed commit is uncertain: revoke locally even when persistence fails.
        try {
          store.save(
            id,
            "delete-requested",
            record.identity,
            context.correlationId,
            "unknown",
          );
        } finally {
          environments.delete(id);
          origins.delete(id);
          revokeEnvironment(id);
        }
        const result = await runtime.requestDelete(
          record,
          record.identity,
          context,
        );
        store.save(
          id,
          "delete-requested",
          record.identity,
          context.correlationId,
          result.effect,
        );
        return { id, phase: "delete-requested", ...result };
      } catch (error) {
        // The barrier remains after every outcome, including explicit rejection.
        if (
          error instanceof RuntimeAccessError &&
          error.code !== "StateUnavailable"
        )
          store.save(
            id,
            "delete-requested",
            record.identity,
            context.correlationId,
            error.effect,
          );
        throw error;
      } finally {
        active.delete(id);
      }
    },
    async handle(
      request: IncomingMessage,
      response: ServerResponse,
      member: Member,
      context: AccessContext,
    ) {
      const url = new URL(request.url!, "https://platform.invalid");
      const match = /^\/api\/environments\/([a-zA-Z0-9_-]{1,80})$/.exec(
        url.pathname,
      );
      response.setHeader("content-type", "application/json");
      response.setHeader("cache-control", "no-store");
      if (!match || !authorized(match[1]!, member)) {
        response.writeHead(403);
        response.end(
          JSON.stringify(
            new RuntimeAccessError(
              "Forbidden",
              context.correlationId,
              "Use an environment assigned to this identity",
            ),
          ),
        );
        return;
      }
      if (request.method !== "GET" && request.method !== "POST") {
        response.writeHead(405, { allow: "GET, POST" });
        response.end();
        return;
      }
      // No browser-owned key, template, namespace or endpoint; request bodies are not consumed as intent.
      if (
        url.search ||
        request.headers["transfer-encoding"] ||
        Number(request.headers["content-length"] ?? 0) !== 0
      ) {
        response.writeHead(400);
        response.end();
        return;
      }
      try {
        const result = await refresh(
          match[1]!,
          request.method === "POST",
          context,
        );
        context.signal.throwIfAborted();
        response.writeHead(result.instance.state === "Ready" ? 200 : 202);
        response.end(JSON.stringify(result));
      } catch (error) {
        let phase: string = "unknown";
        try {
          phase = store.get(match[1]!)?.phase ?? "unknown";
        } catch {
          /* Poisoned storage must not mask the original diagnostic. */
        }
        const diagnostic =
          error instanceof RuntimeAccessError
            ? error
            : new RuntimeAccessError(
                "StateUnavailable",
                context.correlationId,
                "Inspect private state and query the original allocation; do not recreate",
                {},
                { stage: "state", effect: "unknown" },
              );
        if (!response.destroyed) {
          response.writeHead(
            diagnostic.code === "RecordMissing" ||
              diagnostic.code === "AllocationUnresolved" ||
              diagnostic.code === "IntentConflict" ||
              diagnostic.code === "StaleInstance"
              ? 409
              : 503,
          );
          response.end(
            JSON.stringify({ environmentId: match[1], phase, diagnostic }),
          );
        }
      }
    },
    list(member: Member) {
      return definitions
        .filter(
          (d) =>
            d.owner.tenantId === member.owner.tenantId &&
            d.owner.principalId === member.owner.principalId,
        )
        .map((d) => ({
          id: d.id,
          phase: store.get(d.id)!.phase,
          origin: origins.get(d.id),
        }));
    },
  };
}
