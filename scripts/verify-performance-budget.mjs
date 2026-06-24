import { readdir, stat } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const kib = 1024;
const budgets = [
  {
    name: "admin main entry",
    directory: "admin-menu-manager/dist/assets",
    entryPattern: /^index-[\w-]+\.js$/,
    maxBytes: 350 * kib
  },
  {
    name: "customer main entry",
    directory: "customer-menu-board/dist/assets",
    entryPattern: /^index-[\w-]+\.js$/,
    maxBytes: 320 * kib
  }
];

const failures = [];
const reports = [];

for (const budget of budgets) {
  const directory = path.join(root, budget.directory);
  const files = await readdir(directory);
  const entries = files.filter((file) => budget.entryPattern.test(file));
  if (entries.length !== 1) {
    failures.push(`${budget.name}: expected exactly one entry chunk, found ${entries.length}`);
    continue;
  }
  const file = entries[0];
  const size = (await stat(path.join(directory, file))).size;
  reports.push(`${budget.name}: ${formatBytes(size)} / ${formatBytes(budget.maxBytes)} (${file})`);
  if (size > budget.maxBytes) {
    failures.push(`${budget.name}: ${formatBytes(size)} exceeds ${formatBytes(budget.maxBytes)}`);
  }
}

const adminAssets = await readdir(path.join(root, "admin-menu-manager/dist/assets"));
const adminRouteChunks = adminAssets.filter((file) => file.endsWith(".js") && !/^index-[\w-]+\.js$/.test(file));
if (adminRouteChunks.length < 8) {
  failures.push(`admin route lazy loading: expected at least 8 route chunks, found ${adminRouteChunks.length}`);
}
reports.push(`admin route lazy chunks: ${adminRouteChunks.length}`);

for (const chunk of adminRouteChunks) {
  const size = (await stat(path.join(root, "admin-menu-manager/dist/assets", chunk))).size;
  if (size > 80 * kib) failures.push(`admin route chunk ${chunk}: ${formatBytes(size)} exceeds 80 KiB`);
}

if (failures.length > 0) {
  console.error("Performance budget verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

for (const report of reports) console.log(report);
console.log("Performance budgets verified.");

function formatBytes(bytes) {
  return `${(bytes / kib).toFixed(1)} KiB`;
}
