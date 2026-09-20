import { DatabaseSync } from "node:sqlite";
import { closeSync, openSync, statSync } from "node:fs";
import { randomUUID } from "node:crypto";
import {
  RuntimeAccessError,
  type AllocationIntent,
} from "@dsh/cell-connector-internal";
export interface EnvironmentDefinition {
  readonly id: string;
  readonly owner: AllocationIntent["owner"];
  readonly template: string;
}
export interface AllocationRecord extends EnvironmentDefinition {
  readonly allocationKey: string;
  readonly phase: "reserved" | "submitted" | "bound";
  readonly identity?: string;
}
/** One process owns this private DB. Submitted is a durable uncertainty barrier, not Pod state. */
export class AllocationStore {
  private readonly db: DatabaseSync;
  private poisoned = false;
  constructor(filename: string, definitions: readonly EnvironmentDefinition[]) {
    try {
      closeSync(openSync(filename, "wx", 0o600));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
    const info = statSync(filename);
    if (!info.isFile() || (info.mode & 0o077) !== 0)
      throw new Error("State file must be private");
    this.db = new DatabaseSync(filename);
    try {
      this.db.exec(
        "PRAGMA busy_timeout=0; PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; PRAGMA locking_mode=EXCLUSIVE; BEGIN EXCLUSIVE;",
      );
      const version = this.db.prepare("PRAGMA user_version").get()![
        "user_version"
      ];
      if (version === 0) {
        const count = this.db
          .prepare(
            "SELECT count(*) AS n FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'",
          )
          .get()!["n"];
        if (count !== 0) throw new Error("Unsupported state format");
        this.db.exec(
          "CREATE TABLE allocations (id TEXT PRIMARY KEY, intent TEXT NOT NULL, phase TEXT NOT NULL CHECK(phase IN ('reserved','submitted','bound')), identity TEXT, CHECK((phase='bound')=(identity IS NOT NULL))); PRAGMA user_version=5;",
        );
      } else if (version !== 5) throw new Error("Unsupported state version");
      const existing = this.db.prepare("SELECT id FROM allocations").all();
      if (existing.some((row) => !definitions.some((e) => e.id === row["id"])))
        throw new Error(
          "Configured environment removed; inspect existing allocation first",
        );
      const ids = new Set<string>(),
        owners = new Set<string>();
      for (const definition of definitions) {
        const owner = JSON.stringify([
          definition.owner.tenantId,
          definition.owner.principalId,
        ]);
        if (
          !/^[a-zA-Z0-9_-]{1,80}$/.test(definition.id) ||
          !definition.owner.tenantId ||
          !definition.owner.principalId ||
          !definition.template ||
          ids.has(definition.id) ||
          owners.has(owner)
        )
          throw new Error("Invalid environment definition");
        ids.add(definition.id);
        owners.add(owner);
        const previous = this.get(definition.id);
        if (previous) {
          if (
            previous.owner.tenantId !== definition.owner.tenantId ||
            previous.owner.principalId !== definition.owner.principalId ||
            previous.template !== definition.template
          )
            throw new Error("Immutable environment intent changed");
        } else
          this.db
            .prepare(
              "INSERT INTO allocations(id,intent,phase) VALUES(?,?,'reserved')",
            )
            .run(
              definition.id,
              JSON.stringify({ ...definition, allocationKey: randomUUID() }),
            );
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.close();
      throw error;
    }
  }
  get(id: string): AllocationRecord | undefined {
    if (this.poisoned)
      throw new RuntimeAccessError(
        "StateUnavailable",
        randomUUID(),
        "Stop writes and inspect the private state file and original allocation",
        {},
        { stage: "state", effect: "unknown" },
      );
    const row = this.db
      .prepare("SELECT intent,phase,identity FROM allocations WHERE id=?")
      .get(id);
    if (!row) return undefined;
    const intent = JSON.parse(
      String(row["intent"]),
    ) as EnvironmentDefinition & { allocationKey: string };
    return {
      ...intent,
      phase: row["phase"] as AllocationRecord["phase"],
      ...(typeof row["identity"] === "string"
        ? { identity: row["identity"] }
        : {}),
    };
  }
  save(
    id: string,
    phase: AllocationRecord["phase"],
    identity: string | undefined,
    correlationId: string,
  ) {
    try {
      if (this.poisoned) throw new Error("Poisoned");
      const current = this.get(id);
      if (
        !current ||
        (current.identity && current.identity !== identity) ||
        (current.phase === "bound" && phase !== "bound") ||
        (current.phase === "submitted" && phase === "reserved")
      )
        throw new Error("Invalid allocation transition");
      this.db
        .prepare("UPDATE allocations SET phase=?,identity=? WHERE id=?")
        .run(phase, identity ?? null, id);
    } catch {
      this.poisoned = true;
      throw new RuntimeAccessError(
        "StateUnavailable",
        correlationId,
        "Stop writes; inspect the private state file and original allocation before restarting",
        {},
        { stage: "state", effect: "unknown" },
      );
    }
  }
  close() {
    this.db.close();
  }
}
