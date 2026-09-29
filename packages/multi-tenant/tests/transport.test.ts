import { test, expect } from "vitest";
import { get, type IncomingMessage } from "node:http";
import { once } from "node:events";
import { WebSocket, WebSocketServer } from "ws";
import type { AddressInfo } from "node:net";
import type {
  AgentEnvironmentRuntime,
  EnvironmentRef,
} from "../src/environment-contract.js";
import { createPlatformIngress } from "../src/platform/ingress.js";
import { Sessions } from "../src/platform/sessions.js";
const owner = { tenantId: "t", principalId: "alice" };
const ref: EnvironmentRef = {
  owner,
  allocationKey: "k",
  namespace: "ns",
  sandbox: { name: "env", uid: "s" },
  data: { name: "data", uid: "d" },
};
test("real HTTP stream and WebSocket close when membership revokes authority", async () => {
  const member = { issuer: "https://issuer.example", subject: "alice", owner };
  const sessions = new Sessions([member]);
  const environment = { id: "alice", owner, instance: ref };
  const parent = sessions.issueParent(member.issuer, member.subject),
    child = sessions.issueChild(parent.parent.key, environment);
  const wsServer = new WebSocketServer({ noServer: true });
  const admitted: AbortSignal[] = [];
  // Contract fixture only: verifies ingress connection lifetime, not B native proxy or cluster.
  const runtime = {
    async connect(_ref: EnvironmentRef, ctx: { signal: AbortSignal }) {
      admitted.push(ctx.signal);
      return {
        origin: "https://alice.example",
        async forward(_req: IncomingMessage, res: any) {
          res.writeHead(200, { "content-type": "text/event-stream" });
          res.write("data: native\n\n");
        },
        async upgrade(req: any, socket: any, head: any) {
          wsServer.handleUpgrade(req, socket, head, (ws) => {
            ws.send("native");
            ctx.signal.addEventListener("abort", () => ws.terminate(), {
              once: true,
            });
          });
        },
      };
    },
  } as unknown as AgentEnvironmentRuntime;
  const app = createPlatformIngress(
    runtime,
    {
      async authenticate() {
        return sessions.child(child.token, environment);
      },
    },
    new Map([["alice", environment]]),
  );
  app.server.listen(0, "127.0.0.1");
  await once(app.server, "listening");
  const port = (app.server.address() as AddressInfo).port;
  let response: IncomingMessage | undefined, ws: WebSocket | undefined;
  try {
    const req = get({ hostname: "127.0.0.1", port });
    req.on("error", () => {});
    [response] = (await once(req, "response")) as [IncomingMessage];
    response.on("error", () => {});
    expect((await once(response, "data"))[0].toString()).toBe(
      "data: native\n\n",
    );
    ws = new WebSocket(`ws://127.0.0.1:${port}`);
    expect((await once(ws, "message"))[0].toString()).toBe("native");
    const httpClosed = new Promise<void>((r) => response!.once("close", r)),
      wsClosed = once(ws, "close");
    sessions.updateMembers([]);
    await Promise.all([httpClosed, wsClosed]);
    expect(admitted).toHaveLength(2);
    expect(admitted.every((s) => s.aborted)).toBe(true);
    const denied = await fetch(`http://127.0.0.1:${port}`);
    expect(denied.status).toBe(401);
  } finally {
    response?.destroy();
    ws?.terminate();
    sessions.close();
    await app.close();
    wsServer.close();
  }
});
test("revocation during pending runtime admission never forwards", async () => {
  const invalidation = new AbortController();
  let resolve!: () => void;
  let forwarded = false;
  const runtime = {
    async connect() {
      await new Promise<void>((r) => {
        resolve = r;
      });
      return {
        forward: async () => {
          forwarded = true;
        },
      };
    },
  } as unknown as AgentEnvironmentRuntime;
  const app = createPlatformIngress(
    runtime,
    {
      async authenticate() {
        return { environmentId: "alice", owner, signal: invalidation.signal };
      },
    },
    new Map([["alice", { id: "alice", owner, instance: ref }]]),
  );
  app.server.listen(0, "127.0.0.1");
  await once(app.server, "listening");
  try {
    const req = get({
      hostname: "127.0.0.1",
      port: (app.server.address() as AddressInfo).port,
    });
    const closed = new Promise<void>((r) => req.once("error", () => r()));
    while (!resolve) await new Promise((r) => setTimeout(r, 1));
    invalidation.abort();
    resolve();
    await closed;
    expect(forwarded).toBe(false);
  } finally {
    await app.close();
  }
});

test("readiness is unauthenticated and never calls authentication or runtime", async () => {
  let calls = 0;
  const app = createPlatformIngress(
    {} as AgentEnvironmentRuntime,
    {
      async authenticate() {
        calls++;
        return undefined;
      },
    },
    new Map(),
  );
  app.server.listen(0, "127.0.0.1");
  await once(app.server, "listening");
  try {
    const response = await fetch(
      `http://127.0.0.1:${(app.server.address() as AddressInfo).port}/healthz`,
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("ok");
    expect(calls).toBe(0);
  } finally {
    await app.close();
  }
});
