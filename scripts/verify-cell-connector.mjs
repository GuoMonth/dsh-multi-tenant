import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
const root = fileURLToPath(new URL("..", import.meta.url));
const pin = JSON.parse(
  readFileSync(resolve(root, "vendor/cell-connector.json"), "utf8"),
);
if (
  pin.repository !== "GuoMonth/dsh-isolated-runtime" ||
  !/^[a-f0-9]{40}$/.test(pin.commit) ||
  pin.artifact !== "dsh-cell-connector-internal-0.0.0.tgz"
)
  throw new Error("Invalid connector source pin");
const actual = createHash("sha256")
  .update(readFileSync(resolve(root, "vendor", pin.artifact)))
  .digest("hex");
if (actual !== pin.sha256)
  throw new Error("Connector artifact does not match its pinned digest");
console.log(`Connector artifact verified: ${pin.commit}`);
