import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { connect } from "node:net";
import { createServer, get } from "node:http";
import { connector } from "../../cell-platform/node_modules/@dsh/cell-connector-internal/dist/proxy.js";

// Saturate a task-owned Linux TCP accept queue so the next SYN cannot finish.
// This exercises a real pending connect without altering routes or firewall rules.
test("pending TCP connect expires before the response-header deadline", { timeout: 5000, skip: process.platform !== "linux" }, async t => {
  const address = "127.0.0.30";
  const controller = new AbortController();
  const held = [];
  const target = spawn(process.execPath, ["--input-type=module", "-e", `
    import {createServer} from 'node:net';
    createServer().listen({host:'${address}',port:8080,backlog:1},()=>{
      process.stdout.write('ready');
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0);
    });
  `], { stdio: ["ignore", "pipe", "pipe"] });
  const ingress = createServer((req, res) => {
    void connector("https://cell.cells.test", { signal: controller.signal, correlationId: "tcp-connect-deadline" }, async () => address, { connectMs: 100, headersMs: 4000 }).forward(req, res).catch(() => res.destroy());
  });
  t.after(async () => {
    controller.abort();
    for (const socket of held) socket.destroy();
    ingress.closeAllConnections(); ingress.close();
    if (target.exitCode === null && target.signalCode === null) {
      const exited = once(target, "exit"); target.kill("SIGKILL"); await exited;
    }
  });
  await once(target.stdout, "data");
  for (let i = 0; i < 2; i++) {
    const socket = connect(8080, address); held.push(socket);
    socket.on("error", () => {}); await once(socket, "connect");
  }
  ingress.listen(0, "127.0.0.1"); await once(ingress, "listening");
  const started = performance.now();
  const req = get({ hostname: "127.0.0.1", port: ingress.address().port, headers: { host: "cell.cells.test" } });
  const [response] = await once(req, "response");
  let body = ""; for await (const chunk of response) body += chunk;
  assert.equal(response.statusCode, 502);
  assert.equal(JSON.parse(body).code, "ForwardOutcomeUnknown");
  assert.equal(JSON.parse(body).effect, "unknown");
  const elapsed = performance.now() - started;
  t.diagnostic(`pending connect ended after ${elapsed.toFixed(1)}ms`);
  assert.ok(elapsed >= 90, "must observe a pending connect, not an immediate refusal");
  assert.ok(elapsed < 1000, "connect must expire before the 4s header timer");
});
