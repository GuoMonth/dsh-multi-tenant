import { createHash, randomBytes } from "node:crypto";
import type { Environment, AuthorizedSession } from "./ingress.js";

export const randomToken = () => randomBytes(32).toString("base64url");
export const digest = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export interface Member {
  issuer: string;
  subject: string;
  owner: Environment["owner"];
}
interface Parent {
  key: string;
  member: Member;
  expiresAt: number;
  abort: AbortController;
  timer?: ReturnType<typeof setTimeout>;
  children: Set<string>;
}
interface Child {
  key: string;
  parentKey: string;
  environmentId: string;
  expiresAt: number;
  abort: AbortController;
  timer?: ReturnType<typeof setTimeout>;
}
const memberKey = (issuer: string, subject: string) =>
  JSON.stringify([issuer, subject]);
const sameOwner = (a: Environment["owner"], b: Environment["owner"]) =>
  a.tenantId === b.tenantId && a.principalId === b.principalId;

export class Sessions {
  private members = new Map<string, Member>();
  private parents = new Map<string, Parent>();
  private children = new Map<string, Child>();
  private timer: ReturnType<typeof setInterval>;
  constructor(
    members: readonly Member[],
    private readonly lifetimeMs = 60 * 60 * 1000,
  ) {
    if (
      !Number.isSafeInteger(lifetimeMs) ||
      lifetimeMs < 60000 ||
      lifetimeMs > 60 * 60 * 1000
    )
      throw new Error("Invalid session lifetime");
    this.updateMembers(members);
    this.timer = setInterval(() => this.sweep(), 10000);
    this.timer.unref();
  }
  updateMembers(input: readonly Member[]) {
    const next = new Map<string, Member>();
    for (const raw of input) {
      if (
        !raw.issuer ||
        !raw.subject ||
        !raw.owner?.tenantId ||
        !raw.owner.principalId
      )
        throw new Error("Invalid member mapping");
      const key = memberKey(raw.issuer, raw.subject);
      if (next.has(key)) throw new Error("Duplicate member mapping");
      next.set(key, structuredClone(raw));
    }
    this.members = next;
    // Invalidate authority before aborting child connections; no async gap.
    for (const parent of this.parents.values()) {
      const member = next.get(
        memberKey(parent.member.issuer, parent.member.subject),
      );
      if (!member || !sameOwner(member.owner, parent.member.owner))
        this.revoke(parent.key);
    }
  }
  issueParent(issuer: string, subject: string) {
    this.sweep();
    const member = this.members.get(memberKey(issuer, subject));
    if (!member) throw new Error("MemberNotAllowed");
    if (this.parents.size >= 1024) throw new Error("SessionCapacity");
    const token = randomToken(),
      key = digest(token);
    const parent: Parent = {
      key,
      member: structuredClone(member),
      expiresAt: Date.now() + this.lifetimeMs,
      abort: new AbortController(),
      children: new Set(),
    };
    parent.timer = setTimeout(() => this.revoke(key), this.lifetimeMs);
    parent.timer.unref();
    this.parents.set(key, parent);
    return { token, parent };
  }
  parent(token: string | undefined) {
    return token ? this.byKey(digest(token)) : undefined;
  }
  byKey(key: string) {
    const parent = this.parents.get(key);
    if (parent && parent.expiresAt <= Date.now()) {
      this.revoke(key);
      return undefined;
    }
    return parent && !parent.abort.signal.aborted ? parent : undefined;
  }
  issueChild(parentKey: string, environment: Environment) {
    const parent = this.byKey(parentKey);
    if (!parent || !sameOwner(parent.member.owner, environment.owner))
      throw new Error("EnvironmentForbidden");
    this.sweep();
    if (this.children.size >= 2048) throw new Error("SessionCapacity");
    const token = randomToken(),
      key = digest(token);
    const child: Child = {
      key,
      parentKey,
      environmentId: environment.id,
      expiresAt: Math.min(parent.expiresAt, Date.now() + 30 * 60 * 1000),
      abort: new AbortController(),
    };
    child.timer = setTimeout(
      () => this.removeChild(key),
      Math.max(0, child.expiresAt - Date.now()),
    );
    child.timer.unref();
    this.children.set(key, child);
    parent.children.add(key);
    return { token, expiresAt: child.expiresAt };
  }
  child(
    token: string | undefined,
    environment: Environment,
  ): AuthorizedSession | undefined {
    const child = token && this.children.get(digest(token));
    if (!child) return undefined;
    const parent = this.byKey(child.parentKey);
    if (child.expiresAt <= Date.now()) {
      this.removeChild(child.key);
      return undefined;
    }
    if (
      !parent ||
      child.abort.signal.aborted ||
      child.environmentId !== environment.id ||
      !sameOwner(parent.member.owner, environment.owner)
    )
      return undefined;
    return {
      environmentId: environment.id,
      owner: { ...parent.member.owner },
      signal: child.abort.signal,
    };
  }
  logoutChild(token: string | undefined, environment: Environment) {
    if (!this.child(token, environment)) return;
    const child = this.children.get(digest(token!))!;
    this.revoke(child.parentKey);
  }
  revokeEnvironment(environmentId: string) {
    for (const child of this.children.values())
      if (child.environmentId === environmentId) this.removeChild(child.key);
  }
  revoke(key: string) {
    const parent = this.parents.get(key);
    if (!parent) return;
    clearTimeout(parent.timer);
    this.parents.delete(key);
    for (const child of parent.children) this.removeChild(child);
    parent.abort.abort();
  }
  private removeChild(key: string) {
    const child = this.children.get(key);
    if (!child) return;
    clearTimeout(child.timer);
    this.children.delete(key);
    this.parents.get(child.parentKey)?.children.delete(key);
    child.abort.abort();
  }
  private sweep() {
    const now = Date.now();
    for (const parent of this.parents.values())
      if (parent.expiresAt <= now) this.revoke(parent.key);
    for (const child of this.children.values())
      if (child.expiresAt <= now) this.removeChild(child.key);
  }
  close() {
    clearInterval(this.timer);
    for (const key of this.parents.keys()) this.revoke(key);
  }
}

/** Bounded one-shot records. Secrets are hashed, expired records never authorize. */
export class Once<T> {
  private entries = new Map<string, { value: T; expiresAt: number }>();
  put(value: T, ttlMs: number) {
    for (const [key, entry] of this.entries)
      if (entry.expiresAt <= Date.now()) this.entries.delete(key);
    if (this.entries.size >= 1024) throw new Error("LoginCapacity");
    const token = randomToken();
    this.entries.set(digest(token), { value, expiresAt: Date.now() + ttlMs });
    return token;
  }
  take(token: string | undefined) {
    if (!token) return undefined;
    const key = digest(token),
      entry = this.entries.get(key);
    this.entries.delete(key);
    return entry && entry.expiresAt > Date.now() ? entry.value : undefined;
  }
  clear() {
    this.entries.clear();
  }
}
