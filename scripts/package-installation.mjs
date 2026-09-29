import { cpSync, rmSync } from "node:fs";
const source = new URL("../charts/", import.meta.url);
const target = new URL("../packages/multi-tenant/charts/", import.meta.url);
rmSync(target, { recursive: true, force: true });
cpSync(source, target, { recursive: true });
