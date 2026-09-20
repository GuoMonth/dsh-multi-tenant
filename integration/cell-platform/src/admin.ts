import { createServer, type ServerResponse } from "node:http";
import { chmod, lstat } from "node:fs/promises";
import { dirname, isAbsolute } from "node:path";
import { randomUUID } from "node:crypto";
import { RuntimeAccessError } from "@dsh/cell-connector-internal";
import type { createEnvironmentControl } from "./control.js";

/** Local administrator capability is possession of this socket's private filesystem path. */
export async function listenAdmin(
  path: string,
  control: ReturnType<typeof createEnvironmentControl>,
  shutdown: AbortSignal,
) {
  if (!isAbsolute(path) || Buffer.byteLength(path) > 100)
    throw new Error("Invalid admin socket path");
  const directory = await lstat(dirname(path));
  if (
    !directory.isDirectory() ||
    directory.uid !== process.getuid?.() ||
    (directory.mode & 0o077) !== 0
  )
    throw new Error("Admin socket directory must be owned and private");
  try {
    await lstat(path);
    throw new Error("Admin socket path already exists");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  shutdown.throwIfAborted();
  const pending = new Set<AbortController>();
  const send = (response: ServerResponse, status: number, value: unknown) => {
    if (!response.destroyed) {
      response.writeHead(status, {
        "content-type": "application/json",
        "cache-control": "no-store",
      });
      response.end(JSON.stringify(value));
    }
  };
  const server = createServer((request, response) => {
    const correlationId = randomUUID();
    if (pending.size >= 32 || shutdown.aborted) {
      send(response, 503, { code: "AdminUnavailable", correlationId });
      return;
    }
    const match = /^\/(inspect|delete)\/([A-Za-z0-9_-]{1,80})$/.exec(
      request.url ?? "",
    );
    if (
      !match ||
      request.method !== (match[1] === "delete" ? "POST" : "GET") ||
      request.headers["transfer-encoding"] ||
      Number(request.headers["content-length"] ?? 0) !== 0
    ) {
      send(response, 400, { code: "InvalidAdminRequest", correlationId });
      return;
    }
    const controller = new AbortController();
    pending.add(controller);
    response.once("close", () => controller.abort());
    const allocationKey = request.headers["x-allocation-key"],
      identity = request.headers["x-instance-identity"];
    const expected =
      typeof allocationKey === "string" && typeof identity === "string"
        ? { allocationKey, identity }
        : undefined;
    void control
      .administer(match[2]!, match[1] as "inspect" | "delete", expected, {
        correlationId,
        signal: AbortSignal.any([
          controller.signal,
          shutdown,
          AbortSignal.timeout(15000),
        ]),
      })
      .then((result) => send(response, 200, result))
      .catch((error) => {
        const diagnostic =
          error instanceof RuntimeAccessError
            ? error
            : new RuntimeAccessError(
                "StateUnavailable",
                correlationId,
                "Inspect private state and the original target; do not replay writes",
                {},
                { stage: "state", effect: "unknown" },
              );
        send(
          response,
          diagnostic.code === "AllocationUnresolved" ||
            diagnostic.code === "StaleInstance" ||
            diagnostic.code === "RecordMissing"
            ? 409
            : 503,
          diagnostic,
        );
      })
      .finally(() => pending.delete(controller));
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  const close = async () => {
    for (const controller of pending) controller.abort();
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) =>
        error &&
        (error as NodeJS.ErrnoException).code !== "ERR_SERVER_NOT_RUNNING"
          ? reject(error)
          : resolve(),
      ),
    );
  };
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(path, resolve);
    });
    await chmod(path, 0o600);
    shutdown.throwIfAborted();
  } catch (error) {
    await close();
    throw error;
  }
  return { close };
}
