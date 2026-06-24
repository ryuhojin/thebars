import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const scanRoots = ["admin-menu-manager", "customer-menu-board"];
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

const forbiddenRoutePatterns = [
  /["'`]\/(?:app|t|m)\/["'`]/,
  /["'`]\/(?:mobile|tablet|desktop)(?:\/|["'`])/,
  /redirect\([^)]*(?:innerWidth|userAgent|screen\.width)/i,
  /location\.(?:href|replace|assign)[^;\n]*(?:innerWidth|userAgent|screen\.width)/i,
  /\bisMobile\s*\?\s*<\w+Page\b/,
  /\bMobilePage\b/,
  /\bDesktopPage\b/
];

const sourceOnlyViewportPatterns = [
  /window\.innerWidth/,
  /navigator\.userAgent/,
  /screen\.width/
];

async function* walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      yield* walk(fullPath);
    } else if (textExtensions.has(path.extname(entry.name))) {
      yield fullPath;
    }
  }
}

function isRuntimeSource(filePath) {
  const normalized = filePath.split(path.sep).join("/");
  return !normalized.includes("/tests/");
}

const failures = [];
for (const scanRoot of scanRoots) {
  const fullRoot = path.join(root, scanRoot);
  for await (const filePath of walk(fullRoot)) {
    const relative = path.relative(root, filePath);
    const source = await readFile(filePath, "utf8");

    for (const pattern of forbiddenRoutePatterns) {
      if (pattern.test(source)) {
        failures.push(`${relative}: matches forbidden device-route pattern ${pattern}`);
      }
    }

    if (isRuntimeSource(filePath)) {
      for (const pattern of sourceOnlyViewportPatterns) {
        if (pattern.test(source)) {
          failures.push(`${relative}: runtime source must not branch the page by viewport with ${pattern}`);
        }
      }
    }
  }
}

if (failures.length > 0) {
  console.error("Device-route verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("No device-specific routes, viewport redirects, or whole-page mobile/desktop forks were found.");
