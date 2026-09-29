import { DatabaseSync } from "node:sqlite";
import { closeSync, openSync, lstatSync } from "node:fs";
import { dirname, isAbsolute } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import type {
  EnvironmentOwner,
  EnvironmentRef,
} from "@dsh/environment-connector-internal";
import { PlatformError } from "./errors.js";
export interface EnvironmentDefinition {
  readonly id: string;
  readonly owner: EnvironmentOwner;
}
export interface EnvironmentBinding extends EnvironmentDefinition {
  readonly allocationKey: string;
  readonly phase: "reserved" | "submitted" | "bound" | "delete-requested";
  readonly ref?: EnvironmentRef;
  readonly pending?: "stop" | "start";
}
export function sameRef(a: EnvironmentRef, b: EnvironmentRef) {
  return (
    a.allocationKey === b.allocationKey &&
    a.owner.tenantId === b.owner.tenantId &&
    a.owner.principalId === b.owner.principalId &&
    a.namespace === b.namespace &&
    a.sandbox.name === b.sandbox.name &&
    a.sandbox.uid === b.sandbox.uid &&
    a.data.name === b.data.name &&
    a.data.uid === b.data.uid
  );
}
/** Private single-process binding journal. It stores authority and uncertainty, never Pod state. */
export class EnvironmentBindingStore {
  private readonly db: DatabaseSync;
  private poisoned = false;
  constructor(filename: string) {
    const parent = lstatSync(dirname(filename));
    if (
      !isAbsolute(filename) ||
      !parent.isDirectory() ||
      parent.uid !== process.getuid?.() ||
      (parent.mode & 0o077) !== 0
    )
      throw new Error("Private state directory required");
    try {
      closeSync(openSync(filename, "wx", 0o600));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
    const info = lstatSync(filename);
    if (
      !info.isFile() ||
      (info.mode & 0o077) !== 0 ||
      info.uid !== process.getuid?.()
    )
      throw new Error("Private state required");
    this.db = new DatabaseSync(filename);
    try {
      this.db.exec(
        "PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; PRAGMA locking_mode=EXCLUSIVE; BEGIN EXCLUSIVE;",
      );
      const version = this.db.prepare("PRAGMA user_version").get()![
        "user_version"
      ];
      if (version === 0) {
        if (
          this.db
            .prepare(
              "SELECT count(*) AS n FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'",
            )
            .get()!["n"] !== 0
        )
          throw new Error("Unsupported state");
        this.db.exec(
          "CREATE TABLE bindings (id TEXT PRIMARY KEY, record TEXT NOT NULL); PRAGMA user_version=20;",
        );
      } else if (version !== 20)
        throw new Error("Unsupported state format; no legacy migration");
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.close();
      throw error;
    }
  }
  reserve(owner: EnvironmentOwner): EnvironmentBinding {
    if (!owner.tenantId || !owner.principalId) throw new Error("Invalid owner");
    const id =
      "env-" +
      createHash("sha256")
        .update(JSON.stringify([owner.tenantId, owner.principalId]))
        .digest("hex");
    const old = this.get(id);
    if (old) {
      if (
        old.owner.tenantId !== owner.tenantId ||
        old.owner.principalId !== owner.principalId
      )
        throw new Error("Owner collision");
      return old;
    }
    const record: EnvironmentBinding = {
      id,
      owner: structuredClone(owner),
      allocationKey: randomUUID(),
      phase: "reserved",
    };
    this.db
      .prepare("INSERT INTO bindings VALUES (?,?)")
      .run(id, JSON.stringify(record));
    return record;
  }
  get(id: string): EnvironmentBinding | undefined {
    if (this.poisoned)
      throw new PlatformError(
        "StateUnavailable",
        randomUUID(),
        "Stop writes and inspect private state",
        {},
        { effect: "unknown" },
      );
    const row = this.db
      .prepare("SELECT record FROM bindings WHERE id=?")
      .get(id);
    return row
      ? (JSON.parse(String(row["record"])) as EnvironmentBinding)
      : undefined;
  }
  save(record: EnvironmentBinding, correlationId: string) {
    try {
      const old = this.get(record.id);
      if (
        !old ||
        old.allocationKey !== record.allocationKey ||
        old.owner.tenantId !== record.owner.tenantId ||
        old.owner.principalId !== record.owner.principalId ||
        (old.ref && (!record.ref || !sameRef(old.ref, record.ref))) ||
        (old.phase !== "reserved" && record.phase === "reserved") ||
        (old.phase === "delete-requested" &&
          record.phase !== "delete-requested") ||
        (old.phase === "bound" &&
          !["bound", "delete-requested"].includes(record.phase)) ||
        ["bound", "delete-requested"].includes(record.phase) !== !!record.ref
      )
        throw new Error("Invalid binding transition");
      this.db
        .prepare("UPDATE bindings SET record=? WHERE id=?")
        .run(JSON.stringify(record), record.id);
    } catch {
      this.poisoned = true;
      throw new PlatformError(
        "StateUnavailable",
        correlationId,
        "Stop writes; inspect private state and original allocation",
        {},
        { effect: "unknown" },
      );
    }
  }
  close() {
    this.db.close();
  }
}
