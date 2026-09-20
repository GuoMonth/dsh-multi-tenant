import { readFile, stat } from "node:fs/promises";
import {
  createCellAllocationRuntime,
  type CellAllocationOptions,
  type KubernetesOptions,
} from "@dsh/cell-connector-internal";
import { createPlatformIngress } from "./ingress.js";
import { createOIDCAuthentication, type OIDCOptions } from "./oidc.js";
import { AllocationStore, type EnvironmentDefinition } from "./allocations.js";
import { createEnvironmentControl } from "./control.js";
import { listenAdmin } from "./admin.js";
import type { Member } from "./sessions.js";
interface Configuration {
  kubernetes: KubernetesOptions;
  allocation: CellAllocationOptions;
  stateFile: string;
  adminSocket: string;
  environments: EnvironmentDefinition[];
  oidc: OIDCOptions & { clientSecretFile?: string };
  members: Member[];
  host: string;
  port: number;
}
async function main() {
  const filename = process.argv[2];
  if (!filename) throw new Error("Configuration required");
  const config = JSON.parse(await readFile(filename, "utf8")) as Configuration;
  if (
    "fixtureSessions" in config ||
    "bindings" in config ||
    !config.host ||
    !Number.isSafeInteger(config.port) ||
    config.port < 1 ||
    config.port > 65535
  )
    throw new Error("Invalid configuration");
  const validateMembers = (members: Member[]) => {
    if (
      !Array.isArray(members) ||
      members.some(
        (m) =>
          m.issuer !== config.oidc.issuer ||
          !config.environments.some(
            (e) =>
              e.owner.tenantId === m.owner?.tenantId &&
              e.owner.principalId === m.owner.principalId,
          ),
      )
    )
      throw new Error("Invalid membership");
    return members;
  };
  validateMembers(config.members);
  let secret: string | undefined;
  if (config.oidc.clientSecretFile) {
    const info = await stat(config.oidc.clientSecretFile);
    if (!info.isFile() || (info.mode & 0o077) !== 0)
      throw new Error("Client secret must be private");
    secret = (await readFile(config.oidc.clientSecretFile, "utf8")).trim();
    if (!secret) throw new Error("Empty client secret");
  }
  if (
    config.allocation.domain !== config.oidc.siteDomain &&
    !config.allocation.domain.endsWith("." + config.oidc.siteDomain)
  )
    throw new Error("Cell domain must use the configured OIDC site");
  const runtime = createCellAllocationRuntime(
    config.kubernetes,
    config.allocation,
  );
  const store = new AllocationStore(config.stateFile, config.environments);
  const control = createEnvironmentControl(runtime, store, config.environments);
  const lifecycle = new AbortController();
  let authentication:
    | Awaited<ReturnType<typeof createOIDCAuthentication>>
    | undefined;
  let app: ReturnType<typeof createPlatformIngress> | undefined;
  let admin: Awaited<ReturnType<typeof listenAdmin>> | undefined;
  const stop = () => {
    lifecycle.abort();
    authentication?.close();
    void admin?.close().catch(() => {
      process.exitCode = 1;
    });
    void app?.close().catch(() => {
      process.exitCode = 1;
    });
  };
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
  try {
    authentication = await createOIDCAuthentication(
      config.oidc,
      secret,
      control.environments,
      control.origins,
      config.members,
      lifecycle.signal,
      control,
    );
    lifecycle.signal.throwIfAborted();
    app = createPlatformIngress(
      runtime,
      authentication.authenticator,
      control.environments,
    );
    admin = await listenAdmin(config.adminSocket, control, lifecycle.signal);
    // Reload only membership. Other configuration changes require a restart.
    let reloading = false;
    process.on("SIGHUP", () => {
      if (reloading || lifecycle.signal.aborted) return;
      reloading = true;
      void readFile(filename, "utf8")
        .then((text) => {
          if (!lifecycle.signal.aborted)
            authentication!.updateMembers(
              validateMembers((JSON.parse(text) as Configuration).members),
            );
        })
        .catch(() => {
          authentication!.updateMembers([]);
          console.error(
            JSON.stringify({
              code: "MembershipReloadRejected",
              nextAction:
                "Fix members in configuration and send SIGHUP again; all sessions were revoked",
            }),
          );
        })
        .finally(() => {
          reloading = false;
        });
    });
    await new Promise<void>((resolve, reject) => {
      app!.server.once("error", reject);
      app!.server.listen(config.port, config.host, resolve);
    });
    console.log("Cell platform listening with OIDC authentication");
  } catch (error) {
    stop();
    throw error;
  }
}
main().catch(() => {
  console.error(
    JSON.stringify({
      code: "PlatformStartupRejected",
      nextAction:
        "Check fixed configuration, HTTPS OIDC discovery, secret permissions and pinned connector",
    }),
  );
  process.exitCode = 1;
});
