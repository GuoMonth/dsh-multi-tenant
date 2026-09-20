import test from "node:test";
import assert from "node:assert/strict";
import { createServer, get } from "node:http";
import { once } from "node:events";
import { connector } from "../../cell-platform/node_modules/@dsh/cell-connector-internal/dist/proxy.js";

// Exercises the pinned artifact over real sockets; it is not cluster/DSH evidence.
test("transport strips identity credentials, preserves native cookie, aborts both HTTP stream ends", async (t) => {
  const controller = new AbortController();
  let observed, upstreamClosed;
  const closed = new Promise((resolve) => {
    upstreamClosed = resolve;
  });
  const upstream = createServer((req, res) => {
    observed = req.headers;
    res.on("close", upstreamClosed);
    res.writeHead(200, {
      "content-type": "text/event-stream",
      "set-cookie": [
        "dsh-auth-native=fresh; Path=/; Secure; HttpOnly",
        "__Host-dsh-platform=forged; Path=/; Secure; HttpOnly",
        "dsh-auth-domain=bad; Domain=cells.test; Secure; HttpOnly",
      ],
    });
    res.write("data: first\n\n");
  });
  // Connector uses the fixed Cell port. A dedicated loopback address avoids other services.
  upstream.listen(8080, "127.0.0.2");
  await once(upstream, "listening");
  const ingress = createServer((req, res) => {
    void connector(
      "https://cell.cells.test",
      { signal: controller.signal, correlationId: "transport-test" },
      async () => "127.0.0.2",
    )
      .forward(req, res)
      .catch(() => res.destroy());
  });
  ingress.listen(0, "127.0.0.1");
  await once(ingress, "listening");
  t.after(() => {
    controller.abort();
    ingress.closeAllConnections();
    ingress.close();
    upstream.closeAllConnections();
    upstream.close();
  });
  const request = get({
    hostname: "127.0.0.1",
    port: ingress.address().port,
    path: "/stream",
    headers: {
      host: "cell.cells.test",
      origin: "https://cell.cells.test",
      authorization: "Bearer platform-secret",
      cookie:
        "__Host-dsh-platform=parent; __Host-dsh-environment=child; dsh-auth-native=original",
      "x-dsh-oidc-token": "idp-secret",
      "x-forwarded-host": "forged.cells.test",
      forwarded: "host=forged.cells.test",
    },
  });
  const [response] = await once(request, "response");
  const [chunk] = await once(response, "data");
  assert.equal(chunk.toString(), "data: first\n\n");
  assert.equal(observed.cookie, "dsh-auth-native=original");
  assert.equal(observed.host, "cell.cells.test");
  assert.equal(observed.origin, "https://cell.cells.test");
  for (const name of [
    "authorization",
    "x-dsh-oidc-token",
    "x-forwarded-host",
    "forwarded",
  ])
    assert.equal(observed[name], undefined);
  assert.deepEqual(response.headers["set-cookie"], [
    "dsh-auth-native=fresh; Path=/; Secure; HttpOnly",
  ]);
  const aborted = new Promise((resolve) => response.once("aborted", resolve));
  response.on("error", () => {});
  controller.abort();
  await Promise.race([
    Promise.all([aborted, closed]),
    new Promise((_, reject) =>
      setTimeout(() => reject(Error("stream abort timeout")), 2000).unref(),
    ),
  ]);
});

test("revocation while address validation is pending never opens an upstream request", async () => {
  const controller = new AbortController();
  let release;
  const address = new Promise((resolve) => {
    release = resolve;
  });
  const channel = connector(
    "https://cell.cells.test",
    { signal: controller.signal, correlationId: "late-validation" },
    () => address,
  );
  const request = {
    url: "/stream",
    method: "GET",
    headers: { host: "cell.cells.test" },
  };
  // If forwarding gets past the abort check it will touch the nonexistent response methods.
  const pending = channel.forward(request, {});
  controller.abort();
  release("127.0.0.2");
  await assert.rejects(pending, (error) => error.name === "AbortError");
});
