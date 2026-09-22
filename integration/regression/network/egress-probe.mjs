import assert from "node:assert/strict";
import dns from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import net from "node:net";

const [modelRaw, ...blockedRaw] = process.argv.slice(2);
if (!modelRaw || blockedRaw.length === 0) {
  throw new Error(
    "usage: node - MODEL_HTTPS_URL KNOWN_REACHABLE_BLOCKED_URL [BLOCKED_URL ...]",
  );
}

function addresses(hostname) {
  return net.isIP(hostname)
    ? Promise.resolve([{ address: hostname }])
    : dns.lookup(hostname, { all: true, verbatim: true });
}

function probe(raw, timeoutMs = 5000) {
  const target = new URL(raw);
  if (target.protocol !== "https:" && target.protocol !== "http:") {
    throw new Error("only HTTP(S) probe targets are supported");
  }
  const client = target.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      request.destroy(Object.assign(new Error("probe deadline"), { code: "ETIMEDOUT" }));
    }, timeoutMs);
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(result);
    };
    const request = client.request(
      target,
      { method: "HEAD", headers: { connection: "close" } },
      (response) => {
        response.resume();
        finish(undefined, { status: response.statusCode });
      },
    );
    request.once("error", (error) => finish(error));
    request.end();
  });
}

const model = new URL(modelRaw);
assert.equal(model.protocol, "https:", "the allowed model endpoint must use HTTPS");
const modelAddresses = await addresses(model.hostname);
assert.ok(modelAddresses.length, "model DNS must resolve");
assert.ok(
  modelAddresses.every(({ address }) => isGlobalAddress(address)),
  "replace the policy peer only with globally routable model API addresses",
);
const modelResult = await probe(model.href);

const blocked = [];
for (const raw of blockedRaw) {
  const target = new URL(raw);
  const resolved = await addresses(target.hostname);
  assert.ok(resolved.length, `blocked target ${target.hostname} must resolve/be a literal IP`);
  try {
    const result = await probe(raw);
    throw new Error(`blocked target unexpectedly returned HTTP ${result.status}: ${raw}`);
  } catch (error) {
    if (String(error.message).startsWith("blocked target unexpectedly")) throw error;
    assert.ok(
      ["ETIMEDOUT", "EHOSTUNREACH", "ENETUNREACH", "EACCES"].includes(error.code),
      `blocked target failed for a reason other than an egress drop (${error.code ?? error.message}): ${raw}`,
    );
    blocked.push({ target: target.hostname, result: error.code });
  }
}

console.log(JSON.stringify({
  dns: "resolved",
  modelHttpsStatus: modelResult.status,
  blocked,
  note: "Each blocked URL must be known reachable from a trusted namespace; this script does not infer NetworkPolicy from an unavailable service.",
}, null, 2));

function isGlobalAddress(address) {
  if (net.isIP(address) === 4) {
    const [a, b, c] = address.split(".").map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 0 || b === 2 || b === 168)) ||
      (a === 192 && b === 88 && c === 99) ||
      (a === 198 && (b === 18 || b === 19 || b === 51)) ||
      (a === 203 && b === 0 && c === 113) ||
      a >= 224
    );
  }
  if (net.isIP(address) !== 6) return false;
  const words = expandIPv6(address);
  return (
    words[0] >= 0x2000 &&
    words[0] <= 0x3fff &&
    !(words[0] === 0x2001 && (words[1] === 0x0db8 || words[1] === 0))
  );
}

function expandIPv6(address) {
  const halves = address.split("::");
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves[1] ? halves[1].split(":") : [];
  const missing = 8 - left.length - right.length;
  return [...left, ...Array(Math.max(0, missing)).fill("0"), ...right].map(
    (word) => parseInt(word || "0", 16),
  );
}
