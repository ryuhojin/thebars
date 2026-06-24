import { readdir, readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";

const root = process.cwd();
const ignored = new Set(["node_modules", "dist", "coverage", "test-results", ".git"]);
const textExtensions = new Set([
  ".css",
  ".html",
  ".js",
  ".json",
  ".md",
  ".mjs",
  ".sql",
  ".ts",
  ".tsx",
  ".toml"
]);
const lintRoots = [
  "admin-menu-manager",
  "customer-menu-board",
  "scripts",
  "package.json",
  "tsconfig.base.json"
];

async function* walk(target) {
  const fullTarget = path.join(root, target);
  const entries = await readdir(fullTarget, { withFileTypes: true }).catch(() => []);
  if (entries.length === 0 && textExtensions.has(path.extname(target))) {
    yield fullTarget;
    return;
  }
  for (const entry of entries) {
    if (ignored.has(entry.name)) continue;
    const fullPath = path.join(fullTarget, entry.name);
    if (entry.isDirectory()) {
      yield* walk(path.relative(root, fullPath));
    } else if (textExtensions.has(path.extname(entry.name))) {
      yield fullPath;
    }
  }
}

const failures = [];
for (const lintRoot of lintRoots) {
  for await (const filePath of walk(lintRoot)) {
    const relative = path.relative(root, filePath);
    const source = await readFile(filePath, "utf8");
    if (source.includes("\t")) failures.push(`${relative}: tab character found`);
    const lines = source.split("\n");
    lines.forEach((line, index) => {
      if (/[ \t]$/.test(line)) failures.push(`${relative}:${index + 1}: trailing whitespace`);
    });
  }
}

const routeCheck = spawnSync(process.execPath, ["scripts/verify-no-device-routes.mjs"], {
  cwd: root,
  encoding: "utf8"
});
if (routeCheck.status !== 0) {
  failures.push(routeCheck.stderr || routeCheck.stdout || "device route verification failed");
}

if (failures.length > 0) {
  console.error("Lint failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Lint passed: formatting guard and single-route responsive guard are clean.");
