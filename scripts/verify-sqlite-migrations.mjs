import { mkdtemp, readdir, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const migrationsDir = path.join(root, "admin-menu-manager/db/migrations");
const migrations = (await readdir(migrationsDir))
  .filter((file) => file.endsWith(".sql"))
  .sort()
  .map((file) => path.join("admin-menu-manager/db/migrations", file));

const tempDir = await mkdtemp(path.join(tmpdir(), "bar-menu-migrations-"));
const dbPath = path.join(tempDir, "empty.sqlite");

try {
  for (const migration of migrations) {
    const sql = await readFile(path.join(root, migration), "utf8");
    const scriptPath = path.join(tempDir, `${path.basename(migration)}.sql`);
    await writeFile(scriptPath, sql);
    const result = spawnSync("sqlite3", [dbPath, `.read ${scriptPath}`], {
      cwd: root,
      encoding: "utf8"
    });
    if (result.status !== 0) {
      console.error(`Failed to apply ${migration}`);
      console.error(result.stderr || result.stdout);
      process.exit(result.status ?? 1);
    }
  }

  const verify = spawnSync(
    "sqlite3",
    [
      dbPath,
      "SELECT name FROM sqlite_master WHERE type IN ('table','index') ORDER BY name;"
    ],
    { encoding: "utf8" }
  );
  if (verify.status !== 0) {
    console.error(verify.stderr || verify.stdout);
    process.exit(verify.status ?? 1);
  }
  const names = new Set(verify.stdout.trim().split(/\s+/).filter(Boolean));
  for (const required of [
    "users",
    "sessions",
    "bars",
    "bar_public_counters",
    "bar_business_hours",
    "bar_links",
    "bar_memberships",
    "bar_role_permissions",
    "system_item_types",
    "bar_item_types",
    "bar_item_type_overrides",
    "grape_varieties",
    "grape_variety_candidates",
    "badge_colors",
    "system_badges",
    "bar_badge_visibility",
    "bar_badges",
    "menu_item_badges",
    "categories",
    "menu_items",
    "menu_item_prices",
    "menu_item_details",
    "publications",
    "publication_snapshots",
    "publication_locks",
    "repository_commit_lock",
    "bar_lifecycle_events",
    "order_tab_counters",
    "order_tabs",
    "order_tab_events",
    "order_tab_items",
    "idempotency_keys",
    "daily_order_summaries",
    "audit_logs",
    "maintenance_runs",
    "rate_limit_buckets",
    "users_normalized_username_unique",
    "sessions_token_hash_unique",
    "bars_slug_unique",
    "bars_encoded_slug_unique",
    "bar_business_hours_bar_day_idx",
    "bar_links_bar_order_idx",
    "bar_memberships_bar_user_unique",
    "system_item_types_normalized_name_unique",
    "bar_item_types_bar_normalized_name_unique",
    "bar_item_type_overrides_bar_system_unique",
    "grape_varieties_normalized_name_unique",
    "badge_colors_normalized_name_unique",
    "system_badges_normalized_name_unique",
    "bar_badge_visibility_bar_system_unique",
    "bar_badges_bar_normalized_name_unique",
    "menu_item_badges_menu_system_unique",
    "menu_item_badges_menu_bar_unique",
    "menu_item_badges_menu_order_unique",
    "categories_bar_public_id_unique",
    "categories_bar_root_name_unique",
    "categories_bar_parent_name_unique",
    "categories_bar_parent_order_idx",
    "menu_items_bar_public_id_unique",
    "menu_items_bar_normalized_name_unique",
    "menu_items_bar_category_order_idx",
    "menu_item_prices_menu_label_unique",
    "menu_item_prices_menu_order_idx",
    "menu_item_prices_menu_idx",
    "menu_item_details_bar_template_idx",
    "publications_bar_created_idx",
    "publications_bar_status_idx",
    "publications_bar_deployment_idx",
    "publication_snapshots_publication_unique",
    "publication_snapshots_bar_created_idx",
    "publication_snapshots_bar_hash_idx",
    "bar_lifecycle_events_bar_created_idx",
    "order_tabs_bar_tab_number_unique",
    "order_tabs_bar_status_updated_idx",
    "order_tabs_bar_label_idx",
    "order_tab_events_tab_created_idx",
    "order_tab_events_bar_created_idx",
    "order_tab_items_tab_status_idx",
    "order_tab_items_bar_menu_idx",
    "idempotency_keys_scope_unique",
    "idempotency_keys_expiry_idx",
    "daily_order_summaries_bar_date_unique",
    "daily_order_summaries_bar_updated_idx",
    "audit_logs_occurred_idx",
    "audit_logs_actor_idx",
    "audit_logs_bar_idx",
    "audit_logs_operation_idx",
    "audit_logs_request_idx",
    "maintenance_runs_started_idx",
    "maintenance_runs_actor_idx",
    "rate_limit_buckets_scope_key_unique",
    "rate_limit_buckets_expiry_idx"
  ]) {
    if (!names.has(required)) {
      console.error(`Migration verification missing ${required}`);
      process.exit(1);
    }
  }
  console.log(`Applied ${migrations.length} migrations to an empty SQLite database.`);
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
