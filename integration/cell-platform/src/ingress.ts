import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { randomUUID } from "node:crypto";
import {
  RuntimeAccessError,
  type RuntimeAccess,
  type InstanceRef,
} from "@dsh/cell-connector-internal";

export interface Environment {
  readonly id: string;
  readonly owner: { readonly tenantId: string; readonly principalId: string };
  readonly instance: InstanceRef;
}
export interface AuthorizedSession {
  readonly environmentId: string;
  readonly owner: Environment["owner"];
  readonly signal: AbortSignal;
}
export interface PlatformAuthenticator {
  handle?(
    request: IncomingMessage,
    response: ServerResponse,
    signal: AbortSignal,
  ): Promise<boolean>;
  authenticate(
    request: IncomingMessage,
    signal: AbortSignal,
  ): Promise<AuthorizedSession | undefined>;
}

async function until<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  let stop: () => void = () => {};
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        stop = () => reject(signal.reason);
        signal.addEventListener("abort", stop, { once: true });
        if (signal.aborted) stop();
      }),
    ]);
  } finally {
    signal.removeEventListener("abort", stop);
  }
}

export function createPlatformIngress(
  runtime: RuntimeAccess,
  authenticator: PlatformAuthenticator,
  input: readonly Environment[],
) {
  const environments = new Map<string, Environment>();
  const instances = new Set<string>();
  const owners = new Set<string>();
  for (const raw of input) {
    if (
      !raw.id ||
      !raw.owner.tenantId ||
      !raw.owner.principalId ||
      environments.has(raw.id) ||
      !raw.instance.allocationKey ||
      !raw.instance.identity ||
      instances.has(raw.instance.identity) ||
      owners.has(JSON.stringify([raw.owner.tenantId, raw.owner.principalId]))
    )
      throw new Error("Invalid or duplicate Environment");
    environments.set(raw.id, structuredClone(raw));
    instances.add(raw.instance.identity);
    owners.add(JSON.stringify([raw.owner.tenantId, raw.owner.principalId]));
  }
  const active = new Set<AbortController>();
  let closing = false;
  async function admit(
    request: IncomingMessage,
    controller: AbortController,
    correlationId: string,
  ) {
    const authSignal = AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(5000),
    ]);
    const session = await until(
      authenticator.authenticate(request, authSignal),
      authSignal,
    );
    const environment = session && environments.get(session.environmentId);
    if (
      !session ||
      session.signal.aborted ||
      !environment ||
      environment.owner.tenantId !== session.owner.tenantId ||
      environment.owner.principalId !== session.owner.principalId
    )
      throw new RuntimeAccessError(
        "Forbidden",
        correlationId,
        "Authenticate with an authorized environment session",
      );
    // Register parent invalidation before asynchronous runtime admission starts.
    const cancel = () => controller.abort();
    session.signal.addEventListener("abort", cancel, { once: true });
    controller.signal.addEventListener(
      "abort",
      () => session.signal.removeEventListener("abort", cancel),
      { once: true },
    );
    if (session.signal.aborted) controller.abort();
    const context = { signal: controller.signal, correlationId };
    const handle = await until(
      runtime.connect(environment.instance, context),
      controller.signal,
    );
    controller.signal.throwIfAborted();
    return handle;
  }
  function begin() {
    if (closing || active.size >= 1024) return undefined;
    const controller = new AbortController();
    active.add(controller);
    return controller;
  }
  const server = createServer((request, response) => {
    const controller = begin(),
      correlationId = randomUUID();
    if (!controller) {
      response.writeHead(503);
      response.end();
      return;
    }
    controller.signal.addEventListener("abort", () => response.destroy(), {
      once: true,
    });
    response.once("close", () => {
      controller.abort();
      active.delete(controller);
    });
    void (async () => {
      if (await authenticator.handle?.(request, response, controller.signal))
        return;
      const handle = await admit(request, controller, correlationId);
      await handle.forward(request, response);
    })().catch((error) => {
      if (!response.destroyed) {
        const diagnostic =
          error instanceof RuntimeAccessError
            ? error
            : new RuntimeAccessError(
                "ReadUnavailable",
                correlationId,
                "Inspect platform logs with this correlation ID",
              );
        console.warn(JSON.stringify({ code: diagnostic.code, correlationId }));
        if (response.headersSent) response.destroy();
        else {
          response.writeHead(
            diagnostic.code === "Forbidden"
              ? 401
              : diagnostic.code === "AccessRejected"
                ? 403
                : 503,
            {
              "content-type": "application/json",
              "cache-control": "no-store",
            },
          );
          response.end(JSON.stringify(diagnostic));
        }
      }
    });
  });
  server.on("upgrade", (request, socket, head) => {
    socket.on("error", () => socket.destroy());
    const controller = begin(),
      correlationId = randomUUID();
    if (!controller) {
      socket.end("HTTP/1.1 503 Unavailable\r\nConnection: close\r\n\r\n");
      return;
    }
    controller.signal.addEventListener("abort", () => socket.destroy(), {
      once: true,
    });
    socket.once("close", () => {
      controller.abort();
      active.delete(controller);
    });
    void admit(request, controller, correlationId)
      .then((handle) => handle.upgrade(request, socket, head))
      .catch(() => {
        if (!socket.destroyed)
          socket.end(
            "HTTP/1.1 403 Rejected\r\nConnection: close\r\nContent-Length: 0\r\n\r\n",
          );
      });
  });
  return {
    server,
    async close() {
      closing = true;
      for (const controller of active) controller.abort();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => {
          if (
            error &&
            (error as NodeJS.ErrnoException).code !== "ERR_SERVER_NOT_RUNNING"
          )
            reject(error);
          else resolve();
        }),
      );
    },
  };
}
