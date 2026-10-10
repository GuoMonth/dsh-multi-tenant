import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

export function pinDocumentation(text, commit) {
  if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error("Documentation requires a source commit");
  return text.replaceAll(
    "https://github.com/GuoMonth/dsh-multi-tenant/blob/main/",
    `https://github.com/GuoMonth/dsh-multi-tenant/blob/${commit}/`,
  );
}

export function packageDocumentation(root) {
  const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  for (const name of ["README.md", "README.zh-CN.md", "AI.md"])
    writeFileSync(resolve(root, "packages/multi-tenant", name), pinDocumentation(readFileSync(resolve(root, name), "utf8"), commit));
}
