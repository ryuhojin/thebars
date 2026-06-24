import { index, integer, sqliteTable, text, uniqueIndex, type AnySQLiteColumn } from "drizzle-orm/sqlite-core";

export const d00FoundationSmoke = sqliteTable("_d00_foundation_smoke", {
  id: integer("id").primaryKey(),
  createdAt: text("created_at").notNull()
});

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    username: text("username").notNull(),
    normalizedUsername: text("normalized_username").notNull(),
    passwordHash: text("password_hash").notNull(),
    isSystemAdmin: integer("is_system_admin", { mode: "boolean" }).notNull().default(false),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    forcedPasswordChange: integer("forced_password_change", { mode: "boolean" }).notNull().default(false),
    loginFailedCount: integer("login_failed_count").notNull().default(0),
    lockedUntil: text("locked_until"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    passwordChangedAt: text("password_changed_at")
  },
  (table) => ({
    normalizedUsernameUnique: uniqueIndex("users_normalized_username_unique").on(table.normalizedUsername),
    systemAdminIndex: index("users_system_admin_idx").on(table.isSystemAdmin)
  })
);

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    csrfTokenHash: text("csrf_token_hash").notNull(),
    createdAt: text("created_at").notNull(),
    lastTouchedAt: text("last_touched_at").notNull(),
    expiresAt: text("expires_at").notNull(),
    revokedAt: text("revoked_at")
  },
  (table) => ({
    tokenHashUnique: uniqueIndex("sessions_token_hash_unique").on(table.tokenHash),
    userActiveSessionIndex: index("sessions_user_active_idx").on(table.userId, table.revokedAt, table.expiresAt)
  })
);

export const bars = sqliteTable(
  "bars",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    encodedSlug: text("encoded_slug").notNull(),
    status: text("status", { enum: ["active", "inactive"] }).notNull().default("active"),
    currency: text("currency").notNull(),
    description: text("description").notNull().default(""),
    address: text("address").notNull().default(""),
    mapUrl: text("map_url").notNull().default(""),
    phoneNumberDigits: text("phone_number_digits").notNull().default(""),
    openingNote: text("opening_note").notNull().default(""),
    settingsDraftHash: text("settings_draft_hash").notNull().default(""),
    publicMenuStatus: text("public_menu_status", { enum: ["preparing", "published"] }).notNull().default("preparing"),
    directPublishEnabled: integer("direct_publish_enabled", { mode: "boolean" }).notNull().default(false),
    createdByUserId: text("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull()
  },
  (table) => ({
    slugUnique: uniqueIndex("bars_slug_unique").on(table.slug),
    encodedSlugUnique: uniqueIndex("bars_encoded_slug_unique").on(table.encodedSlug),
    statusIndex: index("bars_status_idx").on(table.status)
  })
);

export const barPublicCounters = sqliteTable("bar_public_counters", {
  barId: text("bar_id")
    .primaryKey()
    .references(() => bars.id, { onDelete: "cascade" }),
  nextCategoryPublicId: integer("next_category_public_id").notNull().default(1),
  nextMenuItemPublicId: integer("next_menu_item_public_id").notNull().default(1),
  nextPublicationRevision: integer("next_publication_revision").notNull().default(1),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});

export const barBusinessHours = sqliteTable(
  "bar_business_hours",
  {
    id: text("id").primaryKey(),
    barId: text("bar_id")
      .notNull()
      .references(() => bars.id, { onDelete: "cascade" }),
    dayOfWeek: integer("day_of_week").notNull(),
    opensAt: text("opens_at").notNull(),
    closesAt: text("closes_at").notNull(),
    sortOrder: integer("sort_order").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull()
  },
  (table) => ({
    barDayIndex: index("bar_business_hours_bar_day_idx").on(table.barId, table.dayOfWeek, table.sortOrder)
  })
);

export const barLinks = sqliteTable(
  "bar_links",
  {
    id: text("id").primaryKey(),
    barId: text("bar_id")
      .notNull()
      .references(() => bars.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    url: text("url").notNull(),
    sortOrder: integer("sort_order").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull()
  },
  (table) => ({
    barOrderIndex: index("bar_links_bar_order_idx").on(table.barId, table.sortOrder)
  })
);

export const barMemberships = sqliteTable(
  "bar_memberships",
  {
    id: text("id").primaryKey(),
    barId: text("bar_id")
      .notNull()
      .references(() => bars.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["owner", "manager", "staff"] }).notNull(),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    createdByUserId: text("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull()
  },
  (table) => ({
    barUserUnique: uniqueIndex("bar_memberships_bar_user_unique").on(table.barId, table.userId),
    barActiveIndex: index("bar_memberships_bar_active_idx").on(table.barId, table.isActive),
    userActiveIndex: index("bar_memberships_user_active_idx").on(table.userId, table.isActive)
  })
);

export const barRolePermissions = sqliteTable(
  "bar_role_permissions",
  {
    barId: text("bar_id")
      .notNull()
      .references(() => bars.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["owner", "manager", "staff"] }).notNull(),
    canEditMenu: integer("can_edit_menu", { mode: "boolean" }).notNull(),
    canManageOrders: integer("can_manage_orders", { mode: "boolean" }).notNull(),
    canAddCustomOrderItem: integer("can_add_custom_order_item", { mode: "boolean" }).notNull(),
    canApplyOrderAdjustment: integer("can_apply_order_adjustment", { mode: "boolean" }).notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull()
  },
  (table) => ({
    primary: uniqueIndex("bar_role_permissions_bar_role_unique").on(table.barId, table.role)
  })
);

export const systemItemTypes = sqliteTable(
  "system_item_types",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    template: text("template", {
      enum: ["general", "wine", "whisky", "spirit", "beer", "cocktail", "food", "cigar"]
    }).notNull(),
    defaultPriceLabelsJson: text("default_price_labels_json").notNull(),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull()
  },
  (table) => ({
    normalizedNameUnique: uniqueIndex("system_item_types_normalized_name_unique").on(table.normalizedName),
    activeIndex: index("system_item_types_active_idx").on(table.isActive)
  })
);

export const barItemTypes = sqliteTable(
  "bar_item_types",
  {
    id: text("id").primaryKey(),
    barId: text("bar_id")
      .notNull()
      .references(() => bars.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    template: text("template", {
      enum: ["general", "wine", "whisky", "spirit", "beer", "cocktail", "food", "cigar"]
    }).notNull(),
    defaultPriceLabelsJson: text("default_price_labels_json").notNull(),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull()
  },
  (table) => ({
    barNameUnique: uniqueIndex("bar_item_types_bar_normalized_name_unique").on(table.barId, table.normalizedName),
    barActiveIndex: index("bar_item_types_bar_active_idx").on(table.barId, table.isActive)
  })
);

export const barItemTypeOverrides = sqliteTable(
  "bar_item_type_overrides",
  {
    barId: text("bar_id")
      .notNull()
      .references(() => bars.id, { onDelete: "cascade" }),
    systemItemTypeId: text("system_item_type_id")
      .notNull()
      .references(() => systemItemTypes.id, { onDelete: "cascade" }),
    isHidden: integer("is_hidden", { mode: "boolean" }).notNull().default(false),
    defaultPriceLabelsJson: text("default_price_labels_json").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull()
  },
  (table) => ({
    barSystemUnique: uniqueIndex("bar_item_type_overrides_bar_system_unique").on(table.barId, table.systemItemTypeId)
  })
);

export const grapeVarieties = sqliteTable(
  "grape_varieties",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    createdAt: text("created_at").notNull()
  },
  (table) => ({
    normalizedNameUnique: uniqueIndex("grape_varieties_normalized_name_unique").on(table.normalizedName)
  })
);

export const grapeVarietyCandidates = sqliteTable(
  "grape_variety_candidates",
  {
    id: text("id").primaryKey(),
    barId: text("bar_id").references(() => bars.id, { onDelete: "set null" }),
    proposedName: text("proposed_name").notNull(),
    normalizedProposedName: text("normalized_proposed_name").notNull(),
    status: text("status", { enum: ["pending", "approved", "rejected"] }).notNull().default("pending"),
    standardName: text("standard_name"),
    submittedByUserId: text("submitted_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    reviewedByUserId: text("reviewed_by_user_id").references(() => users.id, { onDelete: "set null" }),
    rejectionReason: text("rejection_reason"),
    createdAt: text("created_at").notNull(),
    reviewedAt: text("reviewed_at")
  },
  (table) => ({
    statusIndex: index("grape_variety_candidates_status_idx").on(table.status, table.createdAt),
    normalizedIndex: index("grape_variety_candidates_normalized_idx").on(table.normalizedProposedName)
  })
);

export const categories = sqliteTable(
  "categories",
  {
    id: text("id").primaryKey(),
    barId: text("bar_id")
      .notNull()
      .references(() => bars.id, { onDelete: "cascade" }),
    publicId: text("public_id").notNull(),
    parentId: text("parent_id").references((): AnySQLiteColumn => categories.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    description: text("description").notNull().default(""),
    showDescription: integer("show_description", { mode: "boolean" }).notNull().default(false),
    isVisible: integer("is_visible", { mode: "boolean" }).notNull().default(true),
    sortOrder: integer("sort_order").notNull(),
    createdByUserId: text("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    updatedByUserId: text("updated_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull()
  },
  (table) => ({
    barPublicUnique: uniqueIndex("categories_bar_public_id_unique").on(table.barId, table.publicId),
    barParentOrderIndex: index("categories_bar_parent_order_idx").on(table.barId, table.parentId, table.sortOrder),
    barParentIndex: index("categories_bar_parent_idx").on(table.barId, table.parentId)
  })
);

export const menuItems = sqliteTable(
  "menu_items",
  {
    id: text("id").primaryKey(),
    barId: text("bar_id")
      .notNull()
      .references(() => bars.id, { onDelete: "cascade" }),
    publicId: text("public_id").notNull(),
    categoryId: text("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "restrict" }),
    systemItemTypeId: text("system_item_type_id").references(() => systemItemTypes.id, { onDelete: "restrict" }),
    barItemTypeId: text("bar_item_type_id").references(() => barItemTypes.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    description: text("description").notNull().default(""),
    internalMemo: text("internal_memo").notNull().default(""),
    saleStatus: text("sale_status", { enum: ["available", "sold_out"] }).notNull().default("available"),
    isVisible: integer("is_visible", { mode: "boolean" }).notNull().default(true),
    abvBasisPoints: integer("abv_basis_points"),
    sortOrder: integer("sort_order").notNull(),
    createdByUserId: text("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    updatedByUserId: text("updated_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull()
  },
  (table) => ({
    barPublicUnique: uniqueIndex("menu_items_bar_public_id_unique").on(table.barId, table.publicId),
    barNameUnique: uniqueIndex("menu_items_bar_normalized_name_unique").on(table.barId, table.normalizedName),
    barCategoryOrderIndex: index("menu_items_bar_category_order_idx").on(table.barId, table.categoryId, table.sortOrder),
    barSaleVisibilityIndex: index("menu_items_bar_sale_visibility_idx").on(table.barId, table.saleStatus, table.isVisible),
    systemTypeIndex: index("menu_items_system_type_idx").on(table.systemItemTypeId),
    barTypeIndex: index("menu_items_bar_type_idx").on(table.barItemTypeId)
  })
);

export const menuItemPrices = sqliteTable(
  "menu_item_prices",
  {
    id: text("id").primaryKey(),
    barId: text("bar_id")
      .notNull()
      .references(() => bars.id, { onDelete: "cascade" }),
    menuItemId: text("menu_item_id")
      .notNull()
      .references(() => menuItems.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    normalizedLabel: text("normalized_label").notNull(),
    volumeText: text("volume_text").notNull().default(""),
    amountMinor: integer("amount_minor").notNull(),
    displayOrder: integer("display_order").notNull(),
    createdByUserId: text("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    updatedByUserId: text("updated_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull()
  },
  (table) => ({
    menuLabelUnique: uniqueIndex("menu_item_prices_menu_label_unique").on(table.barId, table.menuItemId, table.normalizedLabel),
    menuOrderIndex: index("menu_item_prices_menu_order_idx").on(table.barId, table.menuItemId, table.displayOrder),
    menuIndex: index("menu_item_prices_menu_idx").on(table.menuItemId)
  })
);

export const menuItemDetails = sqliteTable(
  "menu_item_details",
  {
    menuItemId: text("menu_item_id")
      .primaryKey()
      .references(() => menuItems.id, { onDelete: "cascade" }),
    barId: text("bar_id")
      .notNull()
      .references(() => bars.id, { onDelete: "cascade" }),
    template: text("template", {
      enum: ["general", "wine", "whisky", "spirit", "beer", "cocktail", "food", "cigar"]
    }).notNull(),
    schemaVersion: integer("schema_version").notNull().default(1),
    detailsJson: text("details_json").notNull(),
    createdByUserId: text("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    updatedByUserId: text("updated_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull()
  },
  (table) => ({
    barTemplateIndex: index("menu_item_details_bar_template_idx").on(table.barId, table.template)
  })
);

export const badgeColors = sqliteTable(
  "badge_colors",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    backgroundHex: text("background_hex").notNull(),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull()
  },
  (table) => ({
    normalizedNameUnique: uniqueIndex("badge_colors_normalized_name_unique").on(table.normalizedName),
    activeIndex: index("badge_colors_active_idx").on(table.isActive)
  })
);

export const systemBadges = sqliteTable(
  "system_badges",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    colorId: text("color_id")
      .notNull()
      .references(() => badgeColors.id, { onDelete: "restrict" }),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull()
  },
  (table) => ({
    normalizedNameUnique: uniqueIndex("system_badges_normalized_name_unique").on(table.normalizedName),
    colorIndex: index("system_badges_color_idx").on(table.colorId),
    activeIndex: index("system_badges_active_idx").on(table.isActive)
  })
);

export const barBadgeVisibility = sqliteTable(
  "bar_badge_visibility",
  {
    barId: text("bar_id")
      .notNull()
      .references(() => bars.id, { onDelete: "cascade" }),
    systemBadgeId: text("system_badge_id")
      .notNull()
      .references(() => systemBadges.id, { onDelete: "cascade" }),
    isHidden: integer("is_hidden", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull()
  },
  (table) => ({
    barSystemUnique: uniqueIndex("bar_badge_visibility_bar_system_unique").on(table.barId, table.systemBadgeId),
    barHiddenIndex: index("bar_badge_visibility_bar_hidden_idx").on(table.barId, table.isHidden)
  })
);

export const barBadges = sqliteTable(
  "bar_badges",
  {
    id: text("id").primaryKey(),
    barId: text("bar_id")
      .notNull()
      .references(() => bars.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    colorId: text("color_id")
      .notNull()
      .references(() => badgeColors.id, { onDelete: "restrict" }),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull()
  },
  (table) => ({
    barNameUnique: uniqueIndex("bar_badges_bar_normalized_name_unique").on(table.barId, table.normalizedName),
    barActiveIndex: index("bar_badges_bar_active_idx").on(table.barId, table.isActive),
    colorIndex: index("bar_badges_color_idx").on(table.colorId)
  })
);

export const menuItemBadges = sqliteTable(
  "menu_item_badges",
  {
    id: text("id").primaryKey(),
    barId: text("bar_id")
      .notNull()
      .references(() => bars.id, { onDelete: "cascade" }),
    menuItemId: text("menu_item_id")
      .notNull()
      .references(() => menuItems.id, { onDelete: "cascade" }),
    systemBadgeId: text("system_badge_id").references(() => systemBadges.id, { onDelete: "cascade" }),
    barBadgeId: text("bar_badge_id").references(() => barBadges.id, { onDelete: "cascade" }),
    displayOrder: integer("display_order").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull()
  },
  (table) => ({
    menuOrderUnique: uniqueIndex("menu_item_badges_menu_order_unique").on(table.barId, table.menuItemId, table.displayOrder),
    menuOrderIndex: index("menu_item_badges_menu_order_idx").on(table.barId, table.menuItemId, table.displayOrder),
    systemBadgeIndex: index("menu_item_badges_system_badge_idx").on(table.systemBadgeId),
    barBadgeIndex: index("menu_item_badges_bar_badge_idx").on(table.barBadgeId)
  })
);

export const publications = sqliteTable(
  "publications",
  {
    id: text("id").primaryKey(),
    barId: text("bar_id")
      .notNull()
      .references(() => bars.id, { onDelete: "cascade" }),
    status: text("status", {
      enum: [
        "pending",
        "building_json",
        "validating_json",
        "committing_github",
        "waiting_cloudflare",
        "success",
        "failed",
        "timeout_unknown"
      ]
    }).notNull(),
    operation: text("operation", {
      enum: ["menu_json", "trigger", "snapshot_republish", "delete_menu_json", "restore_snapshot", "restore_preparing"]
    }),
    revision: integer("revision").notNull(),
    contentHash: text("content_hash").notNull(),
    menuPath: text("menu_path").notNull(),
    triggerPath: text("trigger_path").notNull(),
    publishedAt: text("published_at"),
    commitSha: text("commit_sha"),
    deploymentId: text("deployment_id"),
    deploymentStatus: text("deployment_status", { enum: ["queued", "building", "success", "failed", "timeout_unknown"] }),
    deploymentSourceCommitSha: text("deployment_source_commit_sha"),
    deploymentUrl: text("deployment_url"),
    deploymentStartedAt: text("deployment_started_at"),
    deploymentCheckedAt: text("deployment_checked_at"),
    deploymentCompletedAt: text("deployment_completed_at"),
    actorUserId: text("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    createdAt: text("created_at").notNull(),
    completedAt: text("completed_at")
  },
  (table) => ({
    barCreatedIndex: index("publications_bar_created_idx").on(table.barId, table.createdAt),
    barStatusIndex: index("publications_bar_status_idx").on(table.barId, table.status, table.createdAt),
    barDeploymentIndex: index("publications_bar_deployment_idx").on(table.barId, table.deploymentStatus, table.createdAt)
  })
);

export const publicationSnapshots = sqliteTable(
  "publication_snapshots",
  {
    id: text("id").primaryKey(),
    publicationId: text("publication_id")
      .notNull()
      .references(() => publications.id, { onDelete: "cascade" }),
    barId: text("bar_id")
      .notNull()
      .references(() => bars.id, { onDelete: "cascade" }),
    revision: integer("revision").notNull(),
    contentHash: text("content_hash").notNull(),
    publicJson: text("public_json").notNull(),
    menuPath: text("menu_path").notNull(),
    commitSha: text("commit_sha").notNull(),
    publishedAt: text("published_at").notNull(),
    createdAt: text("created_at").notNull()
  },
  (table) => ({
    publicationUnique: uniqueIndex("publication_snapshots_publication_unique").on(table.publicationId),
    barCreatedIndex: index("publication_snapshots_bar_created_idx").on(table.barId, table.createdAt),
    barHashIndex: index("publication_snapshots_bar_hash_idx").on(table.barId, table.contentHash)
  })
);

export const publicationLocks = sqliteTable("publication_locks", {
  barId: text("bar_id")
    .primaryKey()
    .references(() => bars.id, { onDelete: "cascade" }),
  ownerToken: text("owner_token").notNull(),
  acquiredAt: text("acquired_at").notNull(),
  leaseExpiresAt: text("lease_expires_at").notNull()
});

export const repositoryCommitLock = sqliteTable("repository_commit_lock", {
  id: text("id").primaryKey(),
  ownerToken: text("owner_token").notNull(),
  acquiredAt: text("acquired_at").notNull(),
  leaseExpiresAt: text("lease_expires_at").notNull()
});

export const barLifecycleEvents = sqliteTable(
  "bar_lifecycle_events",
  {
    id: text("id").primaryKey(),
    barId: text("bar_id")
      .notNull()
      .references(() => bars.id, { onDelete: "cascade" }),
    action: text("action", { enum: ["deactivate", "activate"] }).notNull(),
    beforeStatus: text("before_status", { enum: ["active", "inactive"] }).notNull(),
    afterStatus: text("after_status", { enum: ["active", "inactive"] }).notNull(),
    publicationId: text("publication_id").references(() => publications.id, { onDelete: "set null" }),
    result: text("result").notNull(),
    actorUserId: text("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: text("created_at").notNull()
  },
  (table) => ({
    barCreatedIndex: index("bar_lifecycle_events_bar_created_idx").on(table.barId, table.createdAt)
  })
);

export const orderTabCounters = sqliteTable("order_tab_counters", {
  barId: text("bar_id")
    .primaryKey()
    .references(() => bars.id, { onDelete: "cascade" }),
  nextTabNumber: integer("next_tab_number").notNull().default(1),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});

export const orderTabs = sqliteTable(
  "order_tabs",
  {
    id: text("id").primaryKey(),
    barId: text("bar_id")
      .notNull()
      .references(() => bars.id, { onDelete: "cascade" }),
    tabNumber: integer("tab_number").notNull(),
    tableLabel: text("table_label").notNull(),
    guestDescription: text("guest_description").notNull().default(""),
    status: text("status", { enum: ["open", "checkout_requested", "closed", "cancelled"] }).notNull(),
    totalAmountMinor: integer("total_amount_minor").notNull().default(0),
    currency: text("currency").notNull(),
    activeItemCount: integer("active_item_count").notNull().default(0),
    version: integer("version").notNull().default(1),
    openedAt: text("opened_at").notNull(),
    checkoutRequestedAt: text("checkout_requested_at"),
    closedAt: text("closed_at"),
    cancelledAt: text("cancelled_at"),
    finalTotalAmountMinor: integer("final_total_amount_minor"),
    settledAt: text("settled_at"),
    settledByUserId: text("settled_by_user_id").references(() => users.id, { onDelete: "set null" }),
    cancelledReason: text("cancelled_reason"),
    cancelledByUserId: text("cancelled_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdByUserId: text("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    updatedByUserId: text("updated_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull()
  },
  (table) => ({
    barNumberUnique: uniqueIndex("order_tabs_bar_tab_number_unique").on(table.barId, table.tabNumber),
    barStatusUpdatedIndex: index("order_tabs_bar_status_updated_idx").on(table.barId, table.status, table.updatedAt),
    barLabelIndex: index("order_tabs_bar_label_idx").on(table.barId, table.tableLabel)
  })
);

export const orderTabEvents = sqliteTable(
  "order_tab_events",
  {
    id: text("id").primaryKey(),
    barId: text("bar_id")
      .notNull()
      .references(() => bars.id, { onDelete: "cascade" }),
    orderTabId: text("order_tab_id")
      .notNull()
      .references(() => orderTabs.id, { onDelete: "cascade" }),
    eventType: text("event_type", {
      enum: [
        "tab_created",
        "tab_updated",
        "menu_item_added",
        "custom_item_added",
        "adjustment_added",
        "item_quantity_updated",
        "item_voided",
        "checkout_requested",
        "tab_reopened",
        "tab_settled",
        "tab_cancelled"
      ]
    }).notNull(),
    beforeStatus: text("before_status", { enum: ["open", "checkout_requested", "closed", "cancelled"] }),
    afterStatus: text("after_status", { enum: ["open", "checkout_requested", "closed", "cancelled"] }).notNull(),
    expectedVersion: integer("expected_version"),
    resultingVersion: integer("resulting_version").notNull(),
    note: text("note").notNull().default(""),
    actorUserId: text("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: text("created_at").notNull()
  },
  (table) => ({
    tabCreatedIndex: index("order_tab_events_tab_created_idx").on(table.orderTabId, table.createdAt),
    barCreatedIndex: index("order_tab_events_bar_created_idx").on(table.barId, table.createdAt)
  })
);

export const orderTabItems = sqliteTable(
  "order_tab_items",
  {
    id: text("id").primaryKey(),
    barId: text("bar_id")
      .notNull()
      .references(() => bars.id, { onDelete: "cascade" }),
    orderTabId: text("order_tab_id")
      .notNull()
      .references(() => orderTabs.id, { onDelete: "cascade" }),
    itemType: text("item_type", { enum: ["menu", "custom", "adjustment"] }).notNull(),
    status: text("status", { enum: ["active", "voided"] }).notNull(),
    menuItemId: text("menu_item_id").references(() => menuItems.id, { onDelete: "set null" }),
    menuItemPublicId: text("menu_item_public_id"),
    menuItemName: text("menu_item_name").notNull(),
    menuItemPriceId: text("menu_item_price_id").references(() => menuItemPrices.id, { onDelete: "set null" }),
    priceLabel: text("price_label").notNull(),
    volumeText: text("volume_text").notNull().default(""),
    unitAmountMinor: integer("unit_amount_minor").notNull(),
    quantity: integer("quantity").notNull(),
    lineTotalAmountMinor: integer("line_total_amount_minor").notNull(),
    currency: text("currency").notNull(),
    reason: text("reason"),
    version: integer("version").notNull().default(1),
    voidReason: text("void_reason"),
    createdByUserId: text("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    updatedByUserId: text("updated_by_user_id").references(() => users.id, { onDelete: "set null" }),
    voidedByUserId: text("voided_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    voidedAt: text("voided_at")
  },
  (table) => ({
    tabStatusIndex: index("order_tab_items_tab_status_idx").on(table.orderTabId, table.status, table.createdAt),
    barMenuIndex: index("order_tab_items_bar_menu_idx").on(table.barId, table.menuItemId)
  })
);

export const idempotencyKeys = sqliteTable(
  "idempotency_keys",
  {
    id: text("id").primaryKey(),
    barId: text("bar_id")
      .notNull()
      .references(() => bars.id, { onDelete: "cascade" }),
    actorUserId: text("actor_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    operation: text("operation", { enum: ["order_item_add", "order_custom_item_add", "order_adjustment_add", "order_settle"] }).notNull(),
    scopeId: text("scope_id").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    requestHash: text("request_hash").notNull(),
    responseStatus: integer("response_status").notNull(),
    responseJson: text("response_json").notNull(),
    createdAt: text("created_at").notNull(),
    expiresAt: text("expires_at").notNull()
  },
  (table) => ({
    scopeUnique: uniqueIndex("idempotency_keys_scope_unique").on(table.barId, table.actorUserId, table.operation, table.scopeId, table.idempotencyKey),
    expiryIndex: index("idempotency_keys_expiry_idx").on(table.expiresAt)
  })
);

export const dailyOrderSummaries = sqliteTable(
  "daily_order_summaries",
  {
    id: text("id").primaryKey(),
    barId: text("bar_id")
      .notNull()
      .references(() => bars.id, { onDelete: "cascade" }),
    businessDate: text("business_date").notNull(),
    currency: text("currency").notNull(),
    settledTabCount: integer("settled_tab_count").notNull().default(0),
    cancelledTabCount: integer("cancelled_tab_count").notNull().default(0),
    settledTotalAmountMinor: integer("settled_total_amount_minor").notNull().default(0),
    settledItemCount: integer("settled_item_count").notNull().default(0),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull()
  },
  (table) => ({
    barDateUnique: uniqueIndex("daily_order_summaries_bar_date_unique").on(table.barId, table.businessDate),
    barUpdatedIndex: index("daily_order_summaries_bar_updated_idx").on(table.barId, table.updatedAt)
  })
);

export const auditLogs = sqliteTable(
  "audit_logs",
  {
    id: text("id").primaryKey(),
    occurredAt: text("occurred_at").notNull(),
    requestId: text("request_id").notNull(),
    actorUserId: text("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    actorUsername: text("actor_username").notNull().default(""),
    barId: text("bar_id").references(() => bars.id, { onDelete: "set null" }),
    barName: text("bar_name").notNull().default(""),
    operation: text("operation", {
      enum: [
        "auth.login_failed",
        "auth.login_succeeded",
        "user.created",
        "user.updated",
        "user.unlocked",
        "membership.changed",
        "permission.changed",
        "bar.created",
        "bar.lifecycle_changed",
        "bar.settings_updated",
        "publication.requested",
        "publication.republished",
        "order_tab.item_voided",
        "order_tab.adjusted",
        "order_tab.settled",
        "order_tab.cancelled",
        "category.changed",
        "menu_item.changed",
        "badge.changed",
        "item_type.changed",
        "maintenance.retention"
      ]
    }).notNull(),
    result: text("result", { enum: ["success", "failure"] }).notNull(),
    targetType: text("target_type").notNull().default(""),
    targetId: text("target_id").notNull().default(""),
    targetLabel: text("target_label").notNull().default(""),
    errorCode: text("error_code"),
    externalRef: text("external_ref"),
    metadataJson: text("metadata_json").notNull().default("{}")
  },
  (table) => ({
    occurredIndex: index("audit_logs_occurred_idx").on(table.occurredAt),
    actorIndex: index("audit_logs_actor_idx").on(table.actorUserId, table.occurredAt),
    barIndex: index("audit_logs_bar_idx").on(table.barId, table.occurredAt),
    operationIndex: index("audit_logs_operation_idx").on(table.operation, table.occurredAt),
    requestIndex: index("audit_logs_request_idx").on(table.requestId)
  })
);

export const maintenanceRuns = sqliteTable(
  "maintenance_runs",
  {
    id: text("id").primaryKey(),
    startedAt: text("started_at").notNull(),
    finishedAt: text("finished_at").notNull(),
    actorUserId: text("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    actorUsername: text("actor_username").notNull().default(""),
    requestId: text("request_id").notNull(),
    status: text("status", { enum: ["dry_run", "completed", "failed"] }).notNull(),
    operation: text("operation", { enum: ["retention_cleanup"] }).notNull().default("retention_cleanup"),
    dryRun: integer("dry_run", { mode: "boolean" }).notNull().default(true),
    resultJson: text("result_json").notNull().default("{}"),
    errorCode: text("error_code"),
    errorMessage: text("error_message")
  },
  (table) => ({
    startedIndex: index("maintenance_runs_started_idx").on(table.startedAt),
    actorIndex: index("maintenance_runs_actor_idx").on(table.actorUserId, table.startedAt)
  })
);

export const rateLimitBuckets = sqliteTable(
  "rate_limit_buckets",
  {
    id: text("id").primaryKey(),
    scope: text("scope", {
      enum: ["auth.login", "auth.setup", "auth.recovery", "publication.publish", "order.settle"]
    }).notNull(),
    keyHash: text("key_hash").notNull(),
    windowStart: text("window_start").notNull(),
    windowExpiresAt: text("window_expires_at").notNull(),
    attempts: integer("attempts").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull()
  },
  (table) => ({
    scopeKeyUnique: uniqueIndex("rate_limit_buckets_scope_key_unique").on(table.scope, table.keyHash),
    expiryIndex: index("rate_limit_buckets_expiry_idx").on(table.windowExpiresAt)
  })
);
