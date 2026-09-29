import { test, expect, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  EnvironmentError,
  type AgentEnvironmentRuntime,
  type EnvironmentView,
  type EnvironmentIntent,
} from "../src/environment-contract.js";
import { EnvironmentBindingStore } from "../src/platform/bindings.js";
import { createEnvironmentControl } from "../src/platform/control.js";
import { Sessions } from "../src/platform/sessions.js";
const owner = { tenantId: "tenant", principalId: "alice" };
const member = { issuer: "https://id.example", subject: "alice", owner };
const ctx = () => ({
  signal: new AbortController().signal,
  correlationId: "test",
});
const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const f of cleanups.splice(0).reverse()) f();
  vi.useRealTimers();
});
function view(
  intent: EnvironmentIntent,
  state: EnvironmentView["state"] = "Ready",
): EnvironmentView {
  return {
    ref: {
      allocationKey: intent.allocationKey,
      owner: intent.owner,
      namespace: "ns",
      sandbox: { name: "env", uid: "sandbox-uid" },
      data: { name: "data", uid: "pvc-uid" },
    },
    revision: "r1",
    state,
    origin: "https://env.example.test",
  };
}
function failure(
  code:
    | "CreateOutcomeUnknown"
    | "StartOutcomeUnknown"
    | "StopUnverified" = "CreateOutcomeUnknown",
) {
  return new EnvironmentError({
    code,
    stage: "create",
    effect: "unknown",
    observedState: "unverified",
    retry: "read-first",
    allocationKey: "original",
    correlationId: "test",
    nextAction: "Inspect original",
  });
}
function fixture(overrides: Partial<AgentEnvironmentRuntime> = {}) {
  const dir = mkdtempSync(join(tmpdir(), "environment-bindings-"));
  const file = join(dir, "state.sqlite");
  let store = new EnvironmentBindingStore(file);
  cleanups.push(() => {
    store.close();
    rmSync(dir, { recursive: true });
  });
  const record = store.reserve(owner);
  const runtime: AgentEnvironmentRuntime = {
    create: vi.fn(async (i) => view(i)),
    inspectAllocation: vi.fn(async (i) => view(i)),
    inspect: vi.fn(async (r) => view(r)),
    connect: vi.fn(),
    stop: vi.fn(async (r) => ({
      view: view(r, "Stopped"),
      effect: "accepted" as const,
    })),
    start: vi.fn(async (r) => ({ view: view(r), effect: "accepted" as const })),
    delete: vi.fn(async (r) => ({
      ref: r,
      effect: "accepted" as const,
      state: "Deleted" as const,
      dataRetained: true as const,
    })),
    ...overrides,
  };
  const control = createEnvironmentControl(runtime, store);
  const revoke = vi.fn();
  control.setRevoker(revoke);
  return {
    get store() {
      return store;
    },
    record,
    runtime,
    control,
    revoke,
    reopen() {
      store.close();
      store = new EnvironmentBindingStore(file);
      return store;
    },
  };
}
async function api(
  f: ReturnType<typeof fixture>,
  method = "POST",
  suffix = "",
  as = member,
) {
  let status = 0,
    body: any;
  const response = {
    destroyed: false,
    setHeader() {},
    writeHead(s: number) {
      status = s;
    },
    end(s?: string) {
      body = s ? JSON.parse(s) : undefined;
    },
  };
  await f.control.handle(
    {
      url: `/api/environments/${f.record.id}${suffix}`,
      method,
      headers: {},
    } as IncomingMessage,
    response as unknown as ServerResponse,
    as,
    ctx(),
  );
  return { status, body };
}
test("one stable reservation per owner, persistence and exact binding across restart", async () => {
  const f = fixture();
  expect(f.store.reserve(owner)).toEqual(f.record);
  expect(f.store.reserve({ ...owner, principalId: "bob" }).id).not.toBe(
    f.record.id,
  );
  await api(f);
  const bound = f.store.get(f.record.id)!;
  expect(bound.ref?.data.uid).toBe("pvc-uid");
  expect(f.reopen().get(f.record.id)).toEqual(bound);
});
test("concurrent first entry submits create once", async () => {
  let release!: (v: EnvironmentView) => void;
  const f = fixture({
    create: vi.fn(
      () =>
        new Promise<EnvironmentView>((r) => {
          release = r;
        }),
    ),
  });
  const first = api(f);
  const second = await api(f);
  expect(second.status).toBe(409);
  expect(f.runtime.create).toHaveBeenCalledTimes(1);
  release(view(f.record));
  expect((await first).status).toBe(200);
});
test("unknown create survives restart; missing read never replaces key or resubmits", async () => {
  const f = fixture({
    create: vi.fn(async () => {
      throw failure();
    }),
    inspectAllocation: vi.fn(async () => null),
  });
  expect((await api(f)).body.diagnostic.effect).toBe("unknown");
  const old = f.reopen().get(f.record.id)!;
  const control = createEnvironmentControl(f.runtime, f.store);
  control.setRevoker(() => {});
  const result = await control.administer(
    f.record.id,
    "enter",
    undefined,
    ctx(),
  );
  expect(result).toMatchObject({ unresolved: true, phase: "submitted" });
  expect(f.runtime.create).toHaveBeenCalledTimes(1);
  expect(f.store.get(f.record.id)?.allocationKey).toBe(old.allocationKey);
});
test("unbound GET does not create or call runtime", async () => {
  const f = fixture();
  expect((await api(f, "GET")).body.phase).toBe("reserved");
  expect(f.runtime.create).not.toHaveBeenCalled();
  expect(f.runtime.inspectAllocation).not.toHaveBeenCalled();
});
test("cross-owner API rejects before runtime, including mutations", async () => {
  const f = fixture();
  for (const suffix of ["", "/start", "/stop"])
    expect(
      (
        await api(f, "POST", suffix, {
          ...member,
          owner: { ...owner, principalId: "bob" },
        })
      ).status,
    ).toBe(403);
  expect(f.runtime.create).not.toHaveBeenCalled();
  expect(f.runtime.start).not.toHaveBeenCalled();
});
test.each(["owner", "sandbox", "data"] as const)(
  "mismatched %s identity withdraws routing",
  async (field) => {
    const f = fixture();
    await api(f);
    const wrong = structuredClone(view(f.record));
    if (field === "owner")
      (wrong.ref.owner as { principalId: string }).principalId = "mallory";
    else (wrong.ref[field] as { uid: string }).uid = "replaced";
    f.runtime.inspectAllocation = vi.fn(async () => wrong);
    expect((await api(f, "GET")).status).toBe(409);
    expect(f.control.environments.size).toBe(0);
    expect(f.store.get(f.record.id)?.ref?.data.uid).toBe("pvc-uid");
  },
);
test("stop revokes before runtime mutation, persists unknown barrier and requires positive stopped proof", async () => {
  const f = fixture();
  await api(f);
  f.runtime.stop = vi.fn(async () => {
    expect(f.control.environments.size).toBe(0);
    expect(f.revoke).toHaveBeenCalled();
    throw failure("StopUnverified");
  });
  expect((await api(f, "POST", "/stop")).status).toBe(409);
  expect(f.store.get(f.record.id)?.pending).toBe("stop");
  expect((await api(f, "POST", "/start")).status).toBe(409);
  expect(f.runtime.start).not.toHaveBeenCalled();
  expect(f.control.environments.size).toBe(0);
  f.runtime.inspectAllocation = vi.fn(async (i) => view(i, "Stopped"));
  expect((await api(f, "GET")).status).toBe(200);
  expect(f.store.get(f.record.id)?.pending).toBeUndefined();
  expect((await api(f, "POST", "/start")).status).toBe(200);
  expect(f.runtime.start).toHaveBeenCalledWith(
    expect.objectContaining({ data: { name: "data", uid: "pvc-uid" } }),
    "r1",
    expect.anything(),
  );
  expect(f.control.environments.size).toBe(1);
});
test("unknown start blocks replay until Ready is observed", async () => {
  const f = fixture();
  await api(f);
  f.runtime.inspectAllocation = vi.fn(async (i) => view(i, "Stopped"));
  f.runtime.start = vi.fn(async () => {
    throw failure("StartOutcomeUnknown");
  });
  await api(f, "POST", "/start");
  await api(f, "POST", "/start");
  expect(f.runtime.start).toHaveBeenCalledTimes(1);
  f.runtime.inspectAllocation = vi.fn(async (i) => view(i));
  expect((await api(f, "GET")).status).toBe(200);
  expect(f.store.get(f.record.id)?.pending).toBeUndefined();
});
test("delete checks local identity, requires Stopped and never automatically recreates", async () => {
  const f = fixture();
  await api(f);
  const expected = {
    allocationKey: f.record.allocationKey,
    identity: "sandbox-uid",
  };
  await expect(
    f.control.administer(
      f.record.id,
      "delete",
      { ...expected, identity: "wrong" },
      ctx(),
    ),
  ).rejects.toThrow("StaleInstance");
  await expect(
    f.control.administer(f.record.id, "delete", expected, ctx()),
  ).rejects.toThrow("DeleteRejected");
  f.runtime.inspectAllocation = vi.fn(async (i) => view(i, "Stopped"));
  expect(
    await f.control.administer(f.record.id, "delete", expected, ctx()),
  ).toMatchObject({ dataRetained: true as const, state: "Deleted" as const });
  f.runtime.inspectAllocation = vi.fn(async () => null);
  await api(f);
  expect(f.runtime.create).toHaveBeenCalledTimes(1);
  expect(f.store.get(f.record.id)?.phase).toBe("delete-requested");
});
test("membership removal, owner remap, logout and expiration abort child sessions", () => {
  vi.useFakeTimers();
  const s = new Sessions([member], 60000);
  cleanups.push(() => s.close());
  const env = {
    id: "alice",
    owner,
    instance: view({ owner, allocationKey: "k" }).ref,
  };
  const issue = () => {
    const p = s.issueParent(member.issuer, member.subject);
    const child = s.issueChild(p.parent.key, env);
    return { p, child, signal: s.child(child.token, env)!.signal };
  };
  const a = issue();
  s.updateMembers([]);
  expect(a.signal.aborted).toBe(true);
  expect(s.parent(a.p.token)).toBeUndefined();
  s.updateMembers([member]);
  const b = issue();
  s.updateMembers([{ ...member, owner: { ...owner, principalId: "changed" } }]);
  expect(b.signal.aborted).toBe(true);
  s.updateMembers([member]);
  const c = issue();
  s.logoutChild(c.child.token, env);
  expect(c.signal.aborted).toBe(true);
  const d = issue();
  vi.advanceTimersByTime(60000);
  expect(d.signal.aborted).toBe(true);
  expect(s.child(d.child.token, env)).toBeUndefined();
});
test("one owner may have multiple authorized OIDC subjects, each session remains distinct", () => {
  const s = new Sessions([member, { ...member, subject: "alias" }]);
  cleanups.push(() => s.close());
  const a = s.issueParent(member.issuer, "alice"),
    b = s.issueParent(member.issuer, "alias");
  s.revoke(a.parent.key);
  expect(s.parent(b.token)).toBeDefined();
});

test("deleted-resource inspect preserves StaleInstance and durable deletion barrier", async () => {
  const f = fixture();
  await api(f);
  f.runtime.inspectAllocation = vi.fn(async (i) => view(i, "Stopped"));
  await f.control.administer(
    f.record.id,
    "delete",
    { allocationKey: f.record.allocationKey, identity: "sandbox-uid" },
    ctx(),
  );
  f.runtime.inspectAllocation = vi.fn(async () => {
    throw new EnvironmentError({
      code: "StaleInstance",
      stage: "inspect",
      effect: "not-submitted",
      observedState: "Missing",
      retry: "never",
      allocationKey: f.record.allocationKey,
      correlationId: "test",
      nextAction: "Inspect the original resource; absence is not stop proof",
    });
  });
  const result = await api(f, "GET");
  expect(result.body.diagnostic.code).toBe("StaleInstance");
  expect(result.body.diagnostic.observedState).toBe("Missing");
  expect(result.body).not.toHaveProperty("state", "Deleted");
  expect(f.store.get(f.record.id)?.phase).toBe("delete-requested");
  expect(f.runtime.create).toHaveBeenCalledTimes(1);
});
