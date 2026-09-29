import { PlatformError, diagnostic } from "./errors.js";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { randomUUID } from "node:crypto";
import {
  type AgentEnvironmentRuntime,
  type EnvironmentRef,
} from "@dsh/environment-connector-internal";

export interface Environment {
  readonly id: string;
  readonly owner: { readonly tenantId: string; readonly principalId: string };
  readonly instance: EnvironmentRef;
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
  runtime: AgentEnvironmentRuntime,
  authenticator: PlatformAuthenticator,
  environments: ReadonlyMap<string, Environment>,
) {
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
      throw new PlatformError(
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
    const deadline = setTimeout(() => controller.abort(), 15000);
    let handle;
    try {
      handle = await until(
        runtime.connect(environment.instance, context),
        controller.signal,
      );
    } finally {
      clearTimeout(deadline);
    }
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
    // Kube probe: local startup completed before listen; no login/runtime/model request.
    if (request.method === "GET" && request.url === "/healthz") {
      response.writeHead(closing ? 503 : 200, {
        "content-type": "text/plain",
        "cache-control": "no-store",
      });
      response.end(closing ? "closing" : "ok");
      return;
    }
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
        const failure = diagnostic(error, correlationId);
        console.warn(JSON.stringify({ code: failure.code, correlationId }));
        if (response.headersSent) response.destroy();
        else {
          response.writeHead(
            failure.code === "Forbidden"
              ? 401
              : failure.code === "AccessRejected"
                ? 403
                : 503,
            {
              "content-type": "application/json",
              "cache-control": "no-store",
            },
          );
          response.end(JSON.stringify(failure));
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
