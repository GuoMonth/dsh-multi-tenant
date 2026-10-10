import { cpSync, rmSync } from "node:fs";
import { packageDocumentation } from "./package-docs.mjs";
import { fileURLToPath } from "node:url";
const source = new URL("../charts/", import.meta.url);
const target = new URL("../packages/multi-tenant/charts/", import.meta.url);
rmSync(target, { recursive: true, force: true });
cpSync(source, target, { recursive: true });
packageDocumentation(fileURLToPath(new URL("../", import.meta.url)));
