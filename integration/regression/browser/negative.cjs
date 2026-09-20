const https = require("https"),
  fs = require("fs"),
  path = require("path"),
  assert = require("assert/strict");
const root = path.resolve(
    process.env.DSH_REGRESSION_HOME ||
      (() => {
        throw Error("DSH_REGRESSION_HOME required");
      })(),
  ),
  core = JSON.parse(fs.readFileSync(root + "/evidence/core.json")),
  state = JSON.parse(fs.readFileSync(root + "/private/alice-browser.json")),
  origin = core.alice.instance.origin;
const cookie = state.cookies
  .filter((x) => x.domain === new URL(origin).hostname)
  .map((x) => x.name + "=" + x.value)
  .join("; ");
function request(method, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      origin + "/api/settings/describe",
      {
        method,
        headers,
        ca: fs.readFileSync(root + "/private/ca.crt"),
        lookup: (_h, o, cb) =>
          o.all
            ? cb(null, [{ address: "127.0.0.1", family: 4 }])
            : cb(null, "127.0.0.1", 4),
      },
      (r) => {
        let raw = "";
        r.on("data", (b) => (raw += b));
        r.on("end", () =>
          resolve({ status: r.statusCode, body: raw ? JSON.parse(raw) : null }),
        );
      },
    );
    req.on("error", reject);
    req.end();
  });
}
(async () => {
  const noAuth = await request("GET", {
    "x-dsh-oidc-token": "forged",
    "x-user": "alice",
  });
  assert.equal(noAuth.status, 401);
  const cross = await request("POST", {
    cookie,
    origin: "https://attacker.example",
    "sec-fetch-site": "cross-site",
  });
  assert.equal(cross.status, 403);
  const missing = await request("POST", { cookie });
  assert.equal(missing.status, 403);
  fs.writeFileSync(
    root + "/evidence/negative.json",
    JSON.stringify(
      { forgedHeaders: noAuth, crossOrigin: cross, missingOrigin: missing },
      null,
      2,
    ),
  );
  console.log(
    "PASS forged identity headers, cross-site and missing-Origin writes denied",
  );
})().catch((e) => {
  console.error(e.message.split("Call log:")[0]);
  process.exit(1);
});
