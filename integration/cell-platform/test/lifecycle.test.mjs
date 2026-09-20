import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { AllocationStore } from "../dist/allocations.js";
import { createEnvironmentControl } from "../dist/control.js";
import { Sessions } from "../dist/sessions.js";
import { RuntimeAccessError } from "@dsh/cell-connector-internal";
const definition = {
  id: "alice",
  owner: { tenantId: "t", principalId: "a" },
  template: "fixed",
};
const member = {
  issuer: "https://issuer.example",
  subject: "alice",
  owner: definition.owner,
};
const context = () => ({
  signal: new AbortController().signal,
  correlationId: randomUUID(),
});
function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), "dsh-r6-"));
  const file = join(dir, "state.sqlite");
  let store = new AllocationStore(file, [definition]);
  t.after(() => {
    store.close();
    rmSync(dir, { recursive: true });
  });
  return {
    get store() {
      return store;
    },
    reopen() {
      store.close();
      store = new AllocationStore(file, [definition]);
      return store;
    },
    file,
  };
}
function resource(record) {
  return {
    ref: {
      allocationKey: record.allocationKey,
      identity: record.identity ?? "11111111-1111-1111-1111-111111111111",
    },
    origin: "https://cell.example.com",
    template: "fixed",
    state: "Ready",
  };
}
function bind(f) {
  const r = f.store.get("alice");
  f.store.save("alice", "bound", resource(r).ref.identity, "seed");
  return f.store.get("alice");
}
async function post(control) {
  let body;
  const response = {
    destroyed: false,
    setHeader() {},
    writeHead() {},
    end(text) {
      body = JSON.parse(text);
    },
  };
  await control.handle(
    { url: "/api/environments/alice", method: "POST", headers: {} },
    response,
    member,
    context(),
  );
  return body;
}

test("submitted create survives restart and repeated POST only reads original key", async (t) => {
  const f = fixture(t);
  let creates = 0,
    reads = 0;
  const runtime = {
    async create() {
      creates++;
      throw new RuntimeAccessError("CreateOutcomeUnknown", "x", "inspect");
    },
    async inspectAllocation(record) {
      reads++;
      assert.equal(record.allocationKey, key);
      throw new RuntimeAccessError("RecordMissing", "x", "inspect");
    },
  };
  const key = f.store.get("alice").allocationKey;
  await post(createEnvironmentControl(runtime, f.store, [definition]));
  assert.equal(f.store.get("alice").phase, "submitted");
  await post(createEnvironmentControl(runtime, f.reopen(), [definition]));
  assert.equal(creates, 1);
  assert.equal(reads, 1);
  assert.equal(f.store.get("alice").allocationKey, key);
});

test("delete barrier and environment revocation precede dispatch, survives restart without replay", async (t) => {
  const f = fixture(t),
    record = bind(f);
  const sessions = new Sessions([member]);
  t.after(() => sessions.close());
  const parent = sessions.issueParent(member.issuer, member.subject);
  const env = {
    id: "alice",
    owner: definition.owner,
    instance: resource(record).ref,
  };
  const child = sessions.issueChild(parent.parent.key, env);
  const authorized = sessions.child(child.token, env);
  let deletes = 0;
  const runtime = {
    async inspectAllocation(r) {
      return resource(r);
    },
    async requestDelete() {
      deletes++;
      assert.equal(f.store.get("alice").phase, "delete-requested");
      assert.equal(authorized.signal.aborted, true);
      throw new RuntimeAccessError("DeleteOutcomeUnknown", "x", "inspect");
    },
  };
  const control = createEnvironmentControl(runtime, f.store, [definition]);
  control.setRevoker((id) => sessions.revokeEnvironment(id));
  await control.administer("alice", "inspect", undefined, context());
  assert.equal(control.environments.size, 1);
  const expected = {
    allocationKey: record.allocationKey,
    identity: record.identity,
  };
  await assert.rejects(
    control.administer("alice", "delete", expected, context()),
    { code: "DeleteOutcomeUnknown" },
  );
  assert.equal(control.environments.size, 0);
  assert.equal(control.origins.size, 0);
  assert.equal(sessions.child(child.token, env), undefined);
  assert.ok(
    sessions.parent(parent.token),
    "parent session is not a deleted environment",
  );
  const resumed = createEnvironmentControl(runtime, f.reopen(), [definition]);
  resumed.setRevoker(() => {});
  await resumed.administer("alice", "delete", expected, context());
  assert.equal(deletes, 1);
  assert.equal(resumed.environments.size, 0);
  assert.equal(f.store.get("alice").deleteEffect, "unknown");
});

test("wrong identity and in-flight inspection cannot dispatch deletion", async (t) => {
  const f = fixture(t),
    record = bind(f);
  let finish;
  let deletes = 0;
  const runtime = {
    inspectAllocation: () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
    async requestDelete() {
      deletes++;
    },
  };
  const control = createEnvironmentControl(runtime, f.store, [definition]);
  control.setRevoker(() => {});
  await assert.rejects(
    control.administer(
      "alice",
      "delete",
      { allocationKey: record.allocationKey, identity: "wrong" },
      context(),
    ),
    { code: "StaleInstance" },
  );
  const pending = control.administer("alice", "inspect", undefined, context());
  await assert.rejects(
    control.administer(
      "alice",
      "delete",
      { allocationKey: record.allocationKey, identity: record.identity },
      context(),
    ),
    { code: "AllocationUnresolved" },
  );
  finish(resource(record));
  await pending;
  assert.equal(deletes, 0);
  assert.equal(f.store.get("alice").phase, "bound");
});

test("accepted deletion remains blocked and new POST never creates or reopens it", async (t) => {
  const f = fixture(t),
    record = bind(f);
  let creates = 0,
    deletes = 0;
  const runtime = {
    async create() {
      creates++;
    },
    async inspectAllocation() {
      throw new RuntimeAccessError("RecordMissing", "x", "writer unverified");
    },
    async requestDelete() {
      deletes++;
      return {
        ref: resource(record).ref,
        effect: "accepted",
        observedState: "Deleting",
        writerState: "unverified",
      };
    },
  };
  const control = createEnvironmentControl(runtime, f.store, [definition]);
  control.setRevoker(() => {});
  const result = await control.administer(
    "alice",
    "delete",
    { allocationKey: record.allocationKey, identity: record.identity },
    context(),
  );
  assert.equal(result.writerState, "unverified");
  await post(control);
  assert.equal(f.store.get("alice").phase, "delete-requested");
  assert.equal(f.store.get("alice").deleteEffect, "accepted");
  assert.equal(creates, 0);
  assert.equal(deletes, 1);
  assert.equal(control.environments.size, 0);
});

test("private database rejects a second writer and immutable identity changes", (t) => {
  const f = fixture(t);
  assert.throws(() => new AllocationStore(f.file, [definition]));
  const record = bind(f);
  assert.throws(() => f.store.save("alice", "bound", "different", "x"), {
    code: "StateUnavailable",
  });
  assert.equal(record.identity, resource(record).ref.identity);
});

test("administrator socket enforces exact target while public API refuses DELETE", async (t) => {
  const { listenAdmin } = await import("../dist/admin.js");
  const { request } = await import("node:http");
  const f = fixture(t),
    record = bind(f);
  let deletes = 0;
  const control = createEnvironmentControl(
    {
      async requestDelete() {
        deletes++;
        return {
          ref: resource(record).ref,
          effect: "accepted",
          observedState: "Deleting",
          writerState: "unverified",
        };
      },
    },
    f.store,
    [definition],
  );
  control.setRevoker(() => {});
  let status;
  await control.handle(
    { url: "/api/environments/alice", method: "DELETE", headers: {} },
    {
      setHeader() {},
      writeHead(value) {
        status = value;
      },
      end() {},
    },
    member,
    context(),
  );
  assert.equal(status, 405);
  const socket = join(f.file.slice(0, f.file.lastIndexOf("/")), "admin.sock");
  const admin = await listenAdmin(
    socket,
    control,
    new AbortController().signal,
  );
  t.after(() => admin.close());
  const call = (headers) =>
    new Promise((resolve, reject) => {
      const req = request(
        { socketPath: socket, path: "/delete/alice", method: "POST", headers },
        (res) => {
          const chunks = [];
          res.on("data", (c) => chunks.push(c));
          res.on("end", () =>
            resolve({
              status: res.statusCode,
              body: JSON.parse(Buffer.concat(chunks).toString()),
            }),
          );
        },
      );
      req.on("error", reject);
      req.end();
    });
  assert.equal((await call({})).status, 409);
  assert.equal(deletes, 0);
  const result = await call({
    "x-allocation-key": record.allocationKey,
    "x-instance-identity": record.identity,
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.writerState, "unverified");
  assert.equal(deletes, 1);
});
