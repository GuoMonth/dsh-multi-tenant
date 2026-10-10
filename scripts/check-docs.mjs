import { readdirSync, readFileSync, existsSync } from "node:fs";
import { resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

// Keep this dependency-free checker identical in the platform and runtime repos.
const skipped = new Set([".git", "node_modules", "dist", "coverage", "publication"]);
const repoNames = ["dsh-multi-tenant", "dsh-isolated-runtime"];
const generatedDocs = new Set(["packages/multi-tenant/README.md", "packages/multi-tenant/README.zh-CN.md", "packages/multi-tenant/AI.md"]);
const stripFences = (text) => text.replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, "");
const prose = (text) => stripFences(text).replace(/`[^`\n]*`/g, "");
const code = (text) => [...text.matchAll(/^```[^\n]*\n([\s\S]*?)^```/gm)].map((m) => m[1].trim());
const versions = (text) => [...new Set(text.match(/\b\d+\.\d+\.\d+(?:-[a-z]+\.\d+)?\b/g) ?? [])].sort();

export function anchors(text) {
  const counts = new Map();
  return new Set([...stripFences(text).matchAll(/^#{1,6}\s+(.+?)\s*#*$/gm)].map((m) => {
    const slug = m[1].replace(/<[^>]*>/g, "").toLowerCase()
      .replace(/[^\p{L}\p{N}_\-\s]/gu, "").replace(/\s/g, "-");
    const n = counts.get(slug) ?? 0;
    counts.set(slug, n + 1);
    return n ? `${slug}-${n}` : slug;
  }));
}

function documents(root) {
  const result = [];
  function walk(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (skipped.has(entry.name) || entry.isSymbolicLink()) continue;
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (!generatedDocs.has(relative(root, path)) && (entry.name.endsWith(".md") || entry.name === "llms.txt")) result.push(path);
    }
  }
  walk(root);
  return result.sort();
}

export function checkDocs(root, pairedRoots = {}) {
  root = resolve(root);
  const files = documents(root);
  const errors = [], external = new Set();
  let linkCount = 0;
  const read = (path) => readFileSync(path, "utf8");
  for (const path of files) {
    const name = relative(root, path);
    const text = read(path);
    const body = stripFences(text);
    const links = [
      ...[...body.matchAll(/\]\(<?([^\s)>]+)>?(?:\s+"[^"]*")?\)/g)].map((m) => m[1]),
      ...[...body.matchAll(/^\[[^\]]+\]:\s*<?([^\s>]+)>?/gm)].map((m) => m[1]),
      ...[...body.matchAll(/<(https?:\/\/[^>]+)>/g)].map((m) => m[1]),
    ];
    for (const target of links) {
      linkCount++;
      let local, fragment = "";
      if (/^https?:\/\//.test(target)) {
        const url = new URL(target);
        const match = url.hostname === "github.com" && url.pathname.match(/^\/GuoMonth\/(dsh-multi-tenant|dsh-isolated-runtime)\/blob\/main\/(.+)$/);
        if (match && pairedRoots[match[1]]) {
          local = resolve(pairedRoots[match[1]], decodeURIComponent(match[2]));
          fragment = decodeURIComponent(url.hash.slice(1));
        } else external.add(target);
      } else if (!/^[a-z][a-z\d+.-]*:/i.test(target)) {
        const [file, hash = ""] = target.split("#");
        local = file ? resolve(dirname(path), decodeURIComponent(file)) : path;
        fragment = decodeURIComponent(hash);
      }
      if (!local) continue;
      if (!existsSync(local)) errors.push(`${name}: missing link ${target}`);
      else if (fragment && local.endsWith(".md") && !anchors(read(local)).has(fragment))
        errors.push(`${name}: missing heading ${target}`);
    }
    const isZh = name.startsWith("docs/zh-CN/") || name.endsWith(".zh-CN.md");
    const isEn = name.startsWith("docs/en/") || ["README.md", "CONTRIBUTING.md", "CONSTITUTION.md", "compat/dsh/README.md"].includes(name);
    if (!isZh && !isEn) continue;
    const other = isZh
      ? name.replace("docs/zh-CN/", "docs/en/").replace(/\.zh-CN\.md$/, ".md")
      : name.startsWith("docs/en/") ? name.replace("docs/en/", "docs/zh-CN/") : name.replace(/\.md$/, ".zh-CN.md");
    const pair = resolve(root, other);
    if (!existsSync(pair)) { errors.push(`${name}: missing language pair ${other}`); continue; }
    const otherText = read(pair);
    const chinese = isZh ? text : otherText;
    const english = isZh ? otherText : text;
    if ((prose(chinese).match(/[\u4e00-\u9fff]/g) ?? []).length < 20)
      errors.push(`${name}: Chinese page has no substantive Chinese prose`);
    if (chinese === english) errors.push(`${name}: language pages are identical`);
    if (JSON.stringify(code(text)) !== JSON.stringify(code(otherText)))
      errors.push(`${name}: code examples differ between languages`);
    if (JSON.stringify(versions(text)) !== JSON.stringify(versions(otherText)))
      errors.push(`${name}: versions differ between languages`);
    const switchPath = relative(dirname(path), pair).replaceAll("\\", "/");
    const hosted = `https://github.com/GuoMonth/${pairedRoots.currentRepo}/blob/main/${other}`;
    if (!links.includes(switchPath) && !links.includes(hosted))
      errors.push(`${name}: missing link to language pair`);
  }
  return { errors: [...new Set(errors)], external: [...external].sort(), files: files.length, links: linkCount };
}

async function online(urls) {
  const dead = [], uncertain = [];
  let next = 0;
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (next < urls.length) {
      const url = urls[next++];
      try {
        const response = await fetch(url.split("#")[0], { signal: AbortSignal.timeout(15000) });
        await response.body?.cancel();
        if ([404, 410].includes(response.status)) dead.push(`${response.status} ${url}`);
        else if (!response.ok) uncertain.push(`${response.status} ${url}`);
      } catch (error) { uncertain.push(`${error.name} ${url}`); }
    }
  }));
  return { dead, uncertain };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const currentRepo = existsSync(resolve(root, "scripts/dsh-target.mjs")) ? repoNames[0] : repoNames[1];
  const paired = { currentRepo, [currentRepo]: root };
  if (process.env.DSH_PLATFORM_DOCS) paired[repoNames[0]] = resolve(process.env.DSH_PLATFORM_DOCS);
  if (process.env.DSH_RUNTIME_DOCS) paired[repoNames[1]] = resolve(process.env.DSH_RUNTIME_DOCS);
  const result = checkDocs(root, paired);
  const errors = [...result.errors];
  if (process.argv.includes("--online")) {
    const { dead, uncertain } = await online(result.external);
    errors.push(...dead);
    if (uncertain.length) console.warn(`Unverified public URLs (not treated as dead links):\n${uncertain.join("\n")}`);
    console.log(`Public URLs: ${result.external.length}, dead: ${dead.length}, unverified: ${uncertain.length}`);
  }
  if (errors.length) { console.error(errors.join("\n")); process.exitCode = 1; }
  else console.log(`Documentation passed (${result.files} files, ${result.links} links; language pairs, examples and versions)`);
}
