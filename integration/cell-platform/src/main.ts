import { readFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import {
  createCellRuntime,
  type CellBinding,
  type KubernetesOptions,
} from "@dsh/cell-connector-internal";
import {
  createPlatformIngress,
  type Environment,
  type PlatformAuthenticator,
} from "./ingress.js";

interface Configuration {
  kubernetes: KubernetesOptions;
  bindings: CellBinding[];
  environments: Environment[];
  fixtureSessions: Array<{ environmentId: string; tokenFile: string }>;
  host: string;
  port: number;
}
const cookieName = "__Host-dsh-platform-fixture";
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");

async function main() {
  const filename = process.argv[2];
  if (!filename)
    throw new Error(
      "Usage: node dist/main.js PRIVATE_CONFIGURATION.json (R2 fixture only)",
    );
  const config = JSON.parse(await readFile(filename, "utf8")) as Configuration;
  if (
    !config.host ||
    !Number.isSafeInteger(config.port) ||
    config.port < 1 ||
    config.port > 65535
  )
    throw new Error("Invalid listener");
  const lifecycle = new AbortController();
  // This is explicit test authentication, not an OIDC implementation.
  const sessions = new Map<string, Environment>();
  for (const fixture of config.fixtureSessions) {
    const environment = config.environments.find(
      (e) => e.id === fixture.environmentId,
    );
    const info = await stat(fixture.tokenFile);
    if (!environment || !info.isFile() || (info.mode & 0o077) !== 0)
      throw new Error(
        "Fixture token file must be private and reference an Environment",
      );
    const token = (await readFile(fixture.tokenFile, "utf8")).trim();
    if (!/^[A-Za-z0-9_-]{43,}$/.test(token) || sessions.has(hash(token)))
      throw new Error("Invalid or duplicate fixture token");
    sessions.set(hash(token), environment);
  }
  const authenticator: PlatformAuthenticator = {
    async authenticate(request, signal) {
      signal.throwIfAborted();
      const values = (request.headers.cookie ?? "")
        .split(";")
        .map((x) => x.trim())
        .filter((x) => x.startsWith(cookieName + "="))
        .map((x) => x.slice(cookieName.length + 1));
      if (values.length !== 1 || lifecycle.signal.aborted) return undefined;
      const environment = sessions.get(hash(values[0]!));
      return environment
        ? {
            environmentId: environment.id,
            owner: environment.owner,
            signal: lifecycle.signal,
          }
        : undefined;
    },
  };
  for (const environment of config.environments) {
    if (
      !config.bindings.some(
        (b) =>
          b.ref.allocationKey === environment.instance.allocationKey &&
          b.ref.identity === environment.instance.identity,
      )
    )
      throw new Error("Environment has no pinned runtime binding");
  }
  const runtime = createCellRuntime(config.kubernetes, config.bindings);
  const app = createPlatformIngress(
    runtime,
    authenticator,
    config.environments,
  );
  const expiry = setTimeout(() => lifecycle.abort(), 60 * 60 * 1000);
  expiry.unref();
  const stop = () => {
    lifecycle.abort();
    clearTimeout(expiry);
    void app.close().catch(() => {
      process.exitCode = 1;
    });
  };
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
  await new Promise<void>((resolve, reject) => {
    app.server.once("error", reject);
    app.server.listen(config.port, config.host, resolve);
  });
  console.log(
    "R2 fixture platform listening; session tokens are never printed",
  );
}
main().catch(() => {
  console.error(
    "Platform startup failed: check private configuration, file permissions, and the pinned connector build",
  );
  process.exitCode = 1;
});
