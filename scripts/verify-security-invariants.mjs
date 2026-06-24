import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const appPath = path.join(root, "admin-menu-manager/server/app.ts");
const source = await readFile(appPath, "utf8");
const failures = [];

const publicMutationPaths = new Set(["/setup", "/recovery", "/auth/login"]);
const requiredRateLimits = new Map([
  ["/setup", "auth.setup"],
  ["/recovery", "auth.recovery"],
  ["/auth/login", "auth.login"],
  ["/bars/:barId/publications", "publication.publish"],
  ["/bars/:barId/order-tabs/:tabId/settle", "order.settle"]
]);

for (const route of mutationRoutes(source)) {
  if (!publicMutationPaths.has(route.path) && !route.body.includes("getCsrfHeader(context)")) {
    failures.push(`${route.method.toUpperCase()} ${route.path} does not require x-csrf-token via getCsrfHeader(context)`);
  }

  const requiredScope = requiredRateLimits.get(route.path);
  if (requiredScope && !route.body.includes(`"${requiredScope}"`)) {
    failures.push(`${route.method.toUpperCase()} ${route.path} is missing rate limit scope ${requiredScope}`);
  }
}

if (failures.length > 0) {
  console.error("Security invariant verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Security invariants verified: protected mutations require CSRF and D23 rate-limited routes are wired.");

function mutationRoutes(text) {
  const routes = [];
  const routePattern = /\n\s*app\.(post|patch|delete)\("([^"]+)"/g;
  const matches = [...text.matchAll(routePattern)];
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const next = matches[index + 1];
    const start = match.index ?? 0;
    const end = next?.index ?? text.indexOf("\n  app.notFound", start);
    routes.push({
      method: match[1],
      path: match[2],
      body: text.slice(start, end === -1 ? text.length : end)
    });
  }
  return routes;
}
