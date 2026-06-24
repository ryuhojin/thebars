import { Hono, type Context } from "hono";
import { fail, ok } from "../contracts/apiEnvelope";
import { auditLogQuerySchema, maintenanceRunRequestSchema } from "../contracts/audit";
import {
  changePasswordRequestSchema,
  loginRequestSchema,
  recoveryRequestSchema,
  setupRequestSchema
} from "../contracts/auth";
import { updateBarSettingsRequestSchema } from "../contracts/barSettings";
import { createBarRequestSchema, updateBarLifecycleRequestSchema, updateBarLifecycleResponseSchema } from "../contracts/bars";
import {
  createBadgeColorRequestSchema,
  createBarBadgeRequestSchema,
  createSystemBadgeRequestSchema,
  deleteBarBadgeRequestSchema,
  updateBadgeColorRequestSchema,
  updateBarBadgeRequestSchema,
  updateBarSystemBadgeVisibilityRequestSchema,
  updateSystemBadgeRequestSchema
} from "../contracts/badges";
import {
  createCategoryRequestSchema,
  deleteCategoryRequestSchema,
  moveCategoryRequestSchema,
  reorderCategoriesRequestSchema,
  updateCategoryRequestSchema
} from "../contracts/categories";
import {
  bulkUpdateMenuItemsRequestSchema,
  createMenuItemRequestSchema,
  menuItemListQuerySchema,
  updateMenuItemRequestSchema
} from "../contracts/menuItems";
import {
  addAdjustmentOrderItemRequestSchema,
  addCustomOrderItemRequestSchema,
  addMenuOrderItemRequestSchema,
  cancelOrderTabRequestSchema,
  createOrderTabRequestSchema,
  orderTabListQuerySchema,
  reopenOrderTabRequestSchema,
  requestCheckoutOrderTabRequestSchema,
  settleOrderTabRequestSchema,
  updateOrderItemQuantityRequestSchema,
  updateOrderTabRequestSchema,
  voidOrderItemRequestSchema
} from "../contracts/orderTabs";
import { publishCurrentMenuRequestSchema, republishSnapshotRequestSchema } from "../contracts/publications";
import {
  addBarMembershipRequestSchema,
  currentBarPermissionsQuerySchema,
  updateBarMembershipRequestSchema,
  updateRolePermissionsRequestSchema
} from "../contracts/memberships";
import {
  approveGrapeCandidateRequestSchema,
  createBarItemTypeRequestSchema,
  createSystemItemTypeRequestSchema,
  rejectGrapeCandidateRequestSchema,
  submitGrapeCandidateRequestSchema,
  updateBarItemTypeOverrideRequestSchema,
  updateBarItemTypeRequestSchema,
  updateSystemItemTypeRequestSchema
} from "../contracts/itemTypes";
import { createSystemUserRequestSchema, systemUserListQuerySchema } from "../contracts/systemUsers";
import { createAuthRuntime, type AuthRuntimeOptions } from "./auth/runtime";
import { AuthServiceError } from "./auth/errors";
import {
  authErrorResponse,
  clearSessionCookies,
  getCsrfCookie,
  getCsrfHeader,
  getSessionCookie,
  parseJson,
  parseQuery,
  renewSessionCookies,
  setSessionCookies
} from "./auth/http";
import { requestIdMiddleware, type RequestVariables } from "./middleware/requestId";
import { securityHeadersMiddleware } from "./middleware/securityHeaders";
import { BarService } from "./bars/barService";
import { createBarRuntime, type BarRuntimeOptions } from "./bars/runtime";
import { BadgeService } from "./badges/badgeService";
import { createBadgeRuntime, type BadgeRuntimeOptions } from "./badges/runtime";
import { CategoryService } from "./categories/categoryService";
import { createCategoryRuntime, type CategoryRuntimeOptions } from "./categories/runtime";
import { DashboardService } from "./dashboard/dashboardService";
import { MembershipService } from "./memberships/membershipService";
import { createMembershipRuntime, type MembershipRuntimeOptions } from "./memberships/runtime";
import { ItemTypeService } from "./item-types/itemTypeService";
import { createItemTypeRuntime, type ItemTypeRuntimeOptions } from "./item-types/runtime";
import { MenuItemService } from "./menu-items/menuItemService";
import { createMenuItemRuntime, type MenuItemRuntimeOptions } from "./menu-items/runtime";
import { OrderTabService } from "./order-tabs/orderTabService";
import { createOrderTabRuntime, type OrderTabRuntimeOptions } from "./order-tabs/runtime";
import { PublicMenuPreviewService } from "./preview/publicMenuPreviewService";
import { publicMenuPreviewQuerySchema } from "../contracts/preview";
import { PublicationService, type PublicationMenuBuilder } from "./publications/publicationService";
import { createPublicationRuntime, type PublicationRuntimeOptions } from "./publications/runtime";
import { readFoundationSummary } from "./services/foundationService";
import { SystemUserService } from "./system-users/systemUserService";
import { AuditService } from "./audit/auditService";
import { createAuditRuntime, type AuditRuntimeOptions } from "./audit/runtime";
import { createRateLimitRuntime, type RateLimitRuntimeOptions } from "./rate-limits/runtime";
import { PilotReadinessService } from "./pilot/pilotReadinessService";
import type { RateLimitScope } from "./rate-limits/repository";
import type { AuditOperation } from "../contracts/audit";
import type { AuthUserRecord } from "./auth/repository";

export type AdminBindings = {
  DB?: D1Database;
  SETUP_TOKEN?: string;
  ADMIN_RECOVERY_TOKEN?: string;
};

export type AdminHonoEnv = {
  Bindings: AdminBindings;
  Variables: RequestVariables;
};

export type AdminApiOptions = AuthRuntimeOptions &
  BadgeRuntimeOptions &
  BarRuntimeOptions &
  CategoryRuntimeOptions &
  ItemTypeRuntimeOptions &
  MenuItemRuntimeOptions &
  OrderTabRuntimeOptions &
  PublicationRuntimeOptions &
  AuditRuntimeOptions &
  RateLimitRuntimeOptions &
  MembershipRuntimeOptions & {
    temporaryPasswordGenerator?: () => string;
    publicationMenuBuilder?: PublicationMenuBuilder;
  };

export function createAdminApi(options: AdminApiOptions = {}) {
  const app = new Hono<AdminHonoEnv>().basePath("/api");

  app.use("*", requestIdMiddleware());
  app.use("*", securityHeadersMiddleware());
  app.use("*", async (context, next) => {
    await next();
    await safeRecordRouteAudit(context, options);
  });

  app.get("/health", (context) => {
    return context.json(ok({ status: "ok", service: "admin-menu-manager" }, context.get("requestId")));
  });

  app.get("/d00/foundation", async (context) => {
    const summary = await readFoundationSummary(context.env?.DB);
    return context.json(ok(summary, context.get("requestId")));
  });

  app.post("/setup", async (context) => {
    try {
      const runtime = createAuthRuntime(context.env, options);
      const payload = await parseJson(context, setupRequestSchema);
      await consumeRateLimit(context, options, "auth.setup", [clientFingerprint(context)]);
      const data = await runtime.service.setup(payload, runtime.config);
      return context.json(ok(data, context.get("requestId")), 201);
    } catch (error) {
      return authErrorResponse(context, error);
    }
  });

  app.post("/recovery", async (context) => {
    try {
      const runtime = createAuthRuntime(context.env, options);
      const payload = await parseJson(context, recoveryRequestSchema);
      await consumeRateLimit(context, options, "auth.recovery", [clientFingerprint(context)]);
      const data = await runtime.service.recovery(payload, runtime.config);
      return context.json(ok(data, context.get("requestId")));
    } catch (error) {
      return authErrorResponse(context, error);
    }
  });

  app.post("/auth/login", async (context) => {
    let loginUsername = "";
    try {
      const runtime = createAuthRuntime(context.env, options);
      const payload = await parseJson(context, loginRequestSchema);
      loginUsername = payload.username;
      await consumeRateLimit(context, options, "auth.login", [clientFingerprint(context), payload.username.toLowerCase()]);
      const data = await runtime.service.login(payload);
      await safeRecordAudit(context, options, {
        actorUserId: data.user.id,
        actorUsername: data.user.username,
        operation: "auth.login_succeeded",
        result: "success",
        targetType: "user",
        targetId: data.user.id,
        targetLabel: data.user.username,
        metadata: { username: data.user.username }
      });
      setSessionCookies(context, runtime, data);
      return context.json(
        ok(
          {
            user: data.user,
            csrfToken: data.csrfToken,
            nextPath: data.nextPath
          },
          context.get("requestId")
        )
      );
    } catch (error) {
      if (loginUsername) {
        await safeRecordAudit(context, options, {
          actorUserId: null,
          actorUsername: "",
          operation: "auth.login_failed",
          result: "failure",
          targetType: "user",
          targetId: loginUsername,
          targetLabel: loginUsername,
          errorCode: error instanceof AuthServiceError ? error.code : "INTERNAL_ERROR",
          metadata: { username: loginUsername }
        });
      }
      return authErrorResponse(context, error);
    }
  });

  app.get("/auth/session", async (context) => {
    try {
      const runtime = createAuthRuntime(context.env, options);
      const sessionToken = getSessionCookie(context, runtime);
      const csrfToken = getCsrfCookie(context, runtime);
      const data = await runtime.service.session(sessionToken, csrfToken);
      if (sessionToken) renewSessionCookies(context, runtime, sessionToken, data.csrfToken, data.expiresAt);
      return context.json(ok(data, context.get("requestId")));
    } catch (error) {
      return authErrorResponse(context, error);
    }
  });

  app.get("/auth/guard-smoke", async (context) => {
    try {
      const runtime = createAuthRuntime(context.env, options);
      await runtime.service.requireFeatureSession(getSessionCookie(context, runtime), getCsrfCookie(context, runtime));
      return context.json(ok({ allowed: true }, context.get("requestId")));
    } catch (error) {
      return authErrorResponse(context, error);
    }
  });

  app.get("/dashboard", async (context) => {
    try {
      const runtime = createAuthRuntime(context.env, options);
      const barRuntime = createBarRuntime(context.env, options);
      const membershipRuntime = createMembershipRuntime(context.env, options);
      const session = await runtime.service.requireFeatureSession(
        getSessionCookie(context, runtime),
        getCsrfCookie(context, runtime)
      );
      const dashboard = await new DashboardService(
        runtime.repository,
        barRuntime.repository,
        membershipRuntime.repository
      ).readDashboard(
        session.user,
        options.now?.()
      );
      return context.json(ok(dashboard, context.get("requestId")));
    } catch (error) {
      return authErrorResponse(context, error);
    }
  });

  app.get("/bars", async (context) => {
    try {
      const runtime = createAuthRuntime(context.env, options);
      const barRuntime = createBarRuntime(context.env, options);
      const session = await runtime.service.requireFeatureSession(
        getSessionCookie(context, runtime),
        getCsrfCookie(context, runtime)
      );
      const data = await new BarService(barRuntime.repository, {
        now: options.now,
        slugGenerator: options.barSlugGenerator
      }).listBars(session.user);
      return context.json(ok(data, context.get("requestId")));
    } catch (error) {
      return authErrorResponse(context, error);
    }
  });

  app.post("/bars", async (context) => {
    try {
      const runtime = createAuthRuntime(context.env, options);
      const barRuntime = createBarRuntime(context.env, options);
      const session = await runtime.service.requireFeatureSession(getSessionCookie(context, runtime), getCsrfHeader(context));
      const payload = await parseJson(context, createBarRequestSchema);
      const data = await new BarService(barRuntime.repository, {
        now: options.now,
        slugGenerator: options.barSlugGenerator
      }).createBar(session.user, payload);
      return context.json(ok(data, context.get("requestId")), 201);
    } catch (error) {
      return authErrorResponse(context, error);
    }
  });

  app.get("/bars/:barId", async (context) => {
    try {
      const runtime = createAuthRuntime(context.env, options);
      const barRuntime = createBarRuntime(context.env, options);
      const session = await runtime.service.requireFeatureSession(
        getSessionCookie(context, runtime),
        getCsrfCookie(context, runtime)
      );
      const data = await new BarService(barRuntime.repository, {
        now: options.now,
        slugGenerator: options.barSlugGenerator,
        membershipRepository: createMembershipRuntime(context.env, options).repository
      }).readBar(session.user, context.req.param("barId"));
      return context.json(ok(data, context.get("requestId")));
    } catch (error) {
      return authErrorResponse(context, error);
    }
  });

  app.post("/bars/:barId/lifecycle", async (context) => {
    try {
      const runtime = createAuthRuntime(context.env, options);
      const session = await runtime.service.requireFeatureSession(getSessionCookie(context, runtime), getCsrfHeader(context));
      const payload = await parseJson(context, updateBarLifecycleRequestSchema);
      const publicationService = createPublicationService(context.env, options);
      const lifecycle = await publicationService.changeBarLifecycle(session.user, context.req.param("barId"), payload.action);
      const barRuntime = createBarRuntime(context.env, options);
      const bar = await new BarService(barRuntime.repository, {
        now: options.now,
        slugGenerator: options.barSlugGenerator,
        membershipRepository: createMembershipRuntime(context.env, options).repository
      }).readBar(session.user, context.req.param("barId"));
      return context.json(
        ok(updateBarLifecycleResponseSchema.parse({ bar, publication: lifecycle.publication, event: lifecycle.event }), context.get("requestId"))
      );
    } catch (error) {
      return authErrorResponse(context, error);
    }
  });

  app.get("/bars/:barId/settings", async (context) => {
    try {
      const runtime = createAuthRuntime(context.env, options);
      const barRuntime = createBarRuntime(context.env, options);
      const session = await runtime.service.requireFeatureSession(
        getSessionCookie(context, runtime),
        getCsrfCookie(context, runtime)
      );
      const data = await new BarService(barRuntime.repository, {
        now: options.now,
        slugGenerator: options.barSlugGenerator,
        membershipRepository: createMembershipRuntime(context.env, options).repository
      }).readSettings(session.user, context.req.param("barId"));
      return context.json(ok(data, context.get("requestId")));
    } catch (error) {
      return authErrorResponse(context, error);
    }
  });

  app.patch("/bars/:barId/settings", async (context) => {
    try {
      const runtime = createAuthRuntime(context.env, options);
      const barRuntime = createBarRuntime(context.env, options);
      const session = await runtime.service.requireFeatureSession(getSessionCookie(context, runtime), getCsrfHeader(context));
      const payload = await parseJson(context, updateBarSettingsRequestSchema);
      const data = await new BarService(barRuntime.repository, {
        now: options.now,
        slugGenerator: options.barSlugGenerator,
        membershipRepository: createMembershipRuntime(context.env, options).repository
      }).updateSettings(session.user, context.req.param("barId"), payload);
      return context.json(ok(data, context.get("requestId")));
    } catch (error) {
      return authErrorResponse(context, error);
    }
  });

  app.get("/bars/:barId/preview", async (context) => {
    try {
      const runtime = createAuthRuntime(context.env, options);
      const query = parseQuery(context, publicMenuPreviewQuerySchema);
      const session = await runtime.service.requireFeatureSession(
        getSessionCookie(context, runtime),
        getCsrfCookie(context, runtime)
      );
      const data = await new PublicMenuPreviewService(
        createBarRuntime(context.env, options).repository,
        createMembershipRuntime(context.env, options).repository,
        createCategoryRuntime(context.env, options).repository,
        createMenuItemRuntime(context.env, options).repository,
        createBadgeRuntime(context.env, options).repository,
        { now: options.now }
      ).readPreview(session.user, context.req.param("barId"), query.layoutConcept);
      return context.json(ok(data, context.get("requestId")));
    } catch (error) {
      return authErrorResponse(context, error);
    }
  });

  app.get("/bars/:barId/publications", async (context) => {
    try {
      const runtime = createAuthRuntime(context.env, options);
      const session = await runtime.service.requireFeatureSession(
        getSessionCookie(context, runtime),
        getCsrfCookie(context, runtime)
      );
      const data = await createPublicationService(context.env, options).readPublications(
        session.user,
        context.req.param("barId")
      );
      return context.json(ok(data, context.get("requestId")));
    } catch (error) {
      return authErrorResponse(context, error);
    }
  });

  app.get("/bars/:barId/order-tabs", async (context) => {
    try {
      const runtime = createAuthRuntime(context.env, options);
      const session = await runtime.service.requireFeatureSession(
        getSessionCookie(context, runtime),
        getCsrfCookie(context, runtime)
      );
      const query = parseQuery(context, orderTabListQuerySchema);
      const data = await createOrderTabService(context.env, options).readOrderTabs(
        session.user,
        context.req.param("barId"),
        query
      );
      return context.json(ok(data, context.get("requestId")));
    } catch (error) {
      return authErrorResponse(context, error);
    }
  });

  app.post("/bars/:barId/order-tabs", async (context) => {
    try {
      const runtime = createAuthRuntime(context.env, options);
      const session = await runtime.service.requireFeatureSession(getSessionCookie(context, runtime), getCsrfHeader(context));
      const payload = await parseJson(context, createOrderTabRequestSchema);
      const data = await createOrderTabService(context.env, options).createOrderTab(
        session.user,
        context.req.param("barId"),
        payload
      );
      return context.json(ok(data, context.get("requestId")), 201);
    } catch (error) {
      return authErrorResponse(context, error);
    }
  });

  app.get("/bars/:barId/order-tabs/:tabId", async (context) => {
    try {
      const runtime = createAuthRuntime(context.env, options);
      const session = await runtime.service.requireFeatureSession(
        getSessionCookie(context, runtime),
        getCsrfCookie(context, runtime)
      );
      const data = await createOrderTabService(context.env, options).readOrderTab(
        session.user,
        context.req.param("barId"),
        context.req.param("tabId")
      );
      return context.json(ok(data, context.get("requestId")));
    } catch (error) {
      return authErrorResponse(context, error);
    }
  });

  app.patch("/bars/:barId/order-tabs/:tabId", async (context) => {
    try {
      const runtime = createAuthRuntime(context.env, options);
      const session = await runtime.service.requireFeatureSession(getSessionCookie(context, runtime), getCsrfHeader(context));
      const payload = await parseJson(context, updateOrderTabRequestSchema);
      const data = await createOrderTabService(context.env, options).updateOrderTab(
        session.user,
        context.req.param("barId"),
        context.req.param("tabId"),
        payload
      );
      return context.json(ok(data, context.get("requestId")));
    } catch (error) {
      return authErrorResponse(context, error);
    }
  });

  app.post("/bars/:barId/order-tabs/:tabId/checkout-request", async (context) => {
    try {
      const runtime = createAuthRuntime(context.env, options);
      const session = await runtime.service.requireFeatureSession(getSessionCookie(context, runtime), getCsrfHeader(context));
      const payload = await parseJson(context, requestCheckoutOrderTabRequestSchema);
      const data = await createOrderTabService(context.env, options).requestCheckout(
        session.user,
        context.req.param("barId"),
        context.req.param("tabId"),
        payload
      );
      return context.json(ok(data, context.get("requestId")));
    } catch (error) {
      return authErrorResponse(context, error);
    }
  });

  app.post("/bars/:barId/order-tabs/:tabId/reopen", async (context) => {
    try {
      const runtime = createAuthRuntime(context.env, options);
      const session = await runtime.service.requireFeatureSession(getSessionCookie(context, runtime), getCsrfHeader(context));
      const payload = await parseJson(context, reopenOrderTabRequestSchema);
      const data = await createOrderTabService(context.env, options).reopenOrderTab(
        session.user,
        context.req.param("barId"),
        context.req.param("tabId"),
        payload
      );
      return context.json(ok(data, context.get("requestId")));
    } catch (error) {
      return authErrorResponse(context, error);
    }
  });

  app.post("/bars/:barId/order-tabs/:tabId/settle", async (context) => {
    try {
      const runtime = createAuthRuntime(context.env, options);
      const session = await runtime.service.requireFeatureSession(getSessionCookie(context, runtime), getCsrfHeader(context));
      const payload = await parseJson(context, settleOrderTabRequestSchema);
      const existingIdempotency = await createOrderTabRuntime(context.env, options).repository.findIdempotencyRecord(
        context.req.param("barId"),
        session.user.id,
        "order_settle",
        context.req.param("tabId"),
        payload.idempotencyKey
      );
      if (!existingIdempotency) {
        await consumeRateLimit(context, options, "order.settle", [
          clientFingerprint(context),
          session.user.id,
          context.req.param("barId"),
          context.req.param("tabId")
        ]);
      }
      const data = await createOrderTabService(context.env, options).settleOrderTab(
        session.user,
        context.req.param("barId"),
        context.req.param("tabId"),
        payload
      );
      return context.json(ok(data, context.get("requestId")));
    } catch (error) {
      return authErrorResponse(context, error);
    }
  });

  app.post("/bars/:barId/order-tabs/:tabId/cancel", async (context) => {
    try {
      const runtime = createAuthRuntime(context.env, options);
      const session = await runtime.service.requireFeatureSession(getSessionCookie(context, runtime), getCsrfHeader(context));
      const payload = await parseJson(context, cancelOrderTabRequestSchema);
      const data = await createOrderTabService(context.env, options).cancelOrderTab(
        session.user,
        context.req.param("barId"),
        context.req.param("tabId"),
        payload
      );
      return context.json(ok(data, context.get("requestId")));
    } catch (error) {
      return authErrorResponse(context, error);
    }
  });

  app.post("/bars/:barId/order-tabs/:tabId/items", async (context) => {
    try {
      const runtime = createAuthRuntime(context.env, options);
      const session = await runtime.service.requireFeatureSession(getSessionCookie(context, runtime), getCsrfHeader(context));
      const payload = await parseJson(context, addMenuOrderItemRequestSchema);
      const data = await createOrderTabService(context.env, options).addMenuOrderItem(
        session.user,
        context.req.param("barId"),
        context.req.param("tabId"),
        payload
      );
      return context.json(ok(data, context.get("requestId")), 201);
    } catch (error) {
      return authErrorResponse(context, error);
    }
  });

  app.post("/bars/:barId/order-tabs/:tabId/items/custom", async (context) => {
    try {
      const runtime = createAuthRuntime(context.env, options);
      const session = await runtime.service.requireFeatureSession(getSessionCookie(context, runtime), getCsrfHeader(context));
      const payload = await parseJson(context, addCustomOrderItemRequestSchema);
      const data = await createOrderTabService(context.env, options).addCustomOrderItem(
        session.user,
        context.req.param("barId"),
        context.req.param("tabId"),
        payload
      );
      return context.json(ok(data, context.get("requestId")), 201);
    } catch (error) {
      return authErrorResponse(context, error);
    }
  });

  app.post("/bars/:barId/order-tabs/:tabId/items/adjustments", async (context) => {
    try {
      const runtime = createAuthRuntime(context.env, options);
      const session = await runtime.service.requireFeatureSession(getSessionCookie(context, runtime), getCsrfHeader(context));
      const payload = await parseJson(context, addAdjustmentOrderItemRequestSchema);
      const data = await createOrderTabService(context.env, options).addAdjustmentOrderItem(
        session.user,
        context.req.param("barId"),
        context.req.param("tabId"),
        payload
      );
      return context.json(ok(data, context.get("requestId")), 201);
    } catch (error) {
      return authErrorResponse(context, error);
    }
  });

  app.patch("/bars/:barId/order-tabs/:tabId/items/:itemId", async (context) => {
    try {
      const runtime = createAuthRuntime(context.env, options);
      const session = await runtime.service.requireFeatureSession(getSessionCookie(context, runtime), getCsrfHeader(context));
      const payload = await parseJson(context, updateOrderItemQuantityRequestSchema);
      const data = await createOrderTabService(context.env, options).updateOrderItemQuantity(
        session.user,
        context.req.param("barId"),
        context.req.param("tabId"),
        context.req.param("itemId"),
        payload
      );
      return context.json(ok(data, context.get("requestId")));
    } catch (error) {
      return authErrorResponse(context, error);
    }
  });

  app.post("/bars/:barId/order-tabs/:tabId/items/:itemId/void", async (context) => {
    try {
      const runtime = createAuthRuntime(context.env, options);
      const session = await runtime.service.requireFeatureSession(getSessionCookie(context, runtime), getCsrfHeader(context));
      const payload = await parseJson(context, voidOrderItemRequestSchema);
      const data = await createOrderTabService(context.env, options).voidOrderItem(
        session.user,
        context.req.param("barId"),
        context.req.param("tabId"),
        context.req.param("itemId"),
        payload
      );
      return context.json(ok(data, context.get("requestId")));
    } catch (error) {
      return authErrorResponse(context, error);
    }
  });

  app.post("/bars/:barId/publications", async (context) => {
    try {
      const runtime = createAuthRuntime(context.env, options);
      const session = await runtime.service.requireFeatureSession(getSessionCookie(context, runtime), getCsrfHeader(context));
      const payload = await parseJson(context, publishCurrentMenuRequestSchema);
      await consumeRateLimit(context, options, "publication.publish", [
        clientFingerprint(context),
        session.user.id,
        context.req.param("barId")
      ]);
      const data = await createPublicationService(context.env, options).publishCurrent(
        session.user,
        context.req.param("barId"),
        payload
      );
      return context.json(ok(data, context.get("requestId")), 201);
    } catch (error) {
      return authErrorResponse(context, error);
    }
  });

  app.post("/bars/:barId/publications/:publicationId/republish", async (context) => {
    try {
      const runtime = createAuthRuntime(context.env, options);
      const session = await runtime.service.requireFeatureSession(getSessionCookie(context, runtime), getCsrfHeader(context));
      await parseJson(context, republishSnapshotRequestSchema);
      const data = await createPublicationService(context.env, options).republishSnapshot(
        session.user,
        context.req.param("barId"),
        context.req.param("publicationId")
      );
      return context.json(ok(data, context.get("requestId")), 201);
    } catch (error) {
      return authErrorResponse(context, error);
    }
  });

  app.get("/bars/:barId/members", async (context) => {
    try {
      const runtime = createAuthRuntime(context.env, options);
      const barRuntime = createBarRuntime(context.env, options);
      const membershipRuntime = createMembershipRuntime(context.env, options);
      const session = await runtime.service.requireFeatureSession(
        getSessionCookie(context, runtime),
        getCsrfCookie(context, runtime)
      );
      const data = await new MembershipService(runtime.repository, barRuntime.repository, membershipRuntime.repository, {
        now: options.now
      }).readMembers(session.user, context.req.param("barId"));
      return context.json(ok(data, context.get("requestId")));
    } catch (error) {
      return authErrorResponse(context, error);
    }
  });

  app.post("/bars/:barId/members", async (context) => {
    try {
      const runtime = createAuthRuntime(context.env, options);
      const barRuntime = createBarRuntime(context.env, options);
      const membershipRuntime = createMembershipRuntime(context.env, options);
      const session = await runtime.service.requireFeatureSession(getSessionCookie(context, runtime), getCsrfHeader(context));
      const payload = await parseJson(context, addBarMembershipRequestSchema);
      const data = await new MembershipService(runtime.repository, barRuntime.repository, membershipRuntime.repository, {
        now: options.now
      }).addMember(session.user, context.req.param("barId"), payload);
      return context.json(ok(data, context.get("requestId")), 201);
    } catch (error) {
      return authErrorResponse(context, error);
    }
  });

  app.patch("/bars/:barId/members/:membershipId", async (context) => {
    try {
      const runtime = createAuthRuntime(context.env, options);
      const barRuntime = createBarRuntime(context.env, options);
      const membershipRuntime = createMembershipRuntime(context.env, options);
      const session = await runtime.service.requireFeatureSession(getSessionCookie(context, runtime), getCsrfHeader(context));
      const payload = await parseJson(context, updateBarMembershipRequestSchema);
      const data = await new MembershipService(runtime.repository, barRuntime.repository, membershipRuntime.repository, {
        now: options.now
      }).updateMember(session.user, context.req.param("barId"), context.req.param("membershipId"), payload);
      return context.json(ok(data, context.get("requestId")));
    } catch (error) {
      return authErrorResponse(context, error);
    }
  });

  app.post("/bars/:barId/members/:membershipId/deactivate", async (context) => {
    try {
      const runtime = createAuthRuntime(context.env, options);
      const barRuntime = createBarRuntime(context.env, options);
      const membershipRuntime = createMembershipRuntime(context.env, options);
      const session = await runtime.service.requireFeatureSession(getSessionCookie(context, runtime), getCsrfHeader(context));
      const data = await new MembershipService(runtime.repository, barRuntime.repository, membershipRuntime.repository, {
        now: options.now
      }).deactivateMember(session.user, context.req.param("barId"), context.req.param("membershipId"));
      return context.json(ok(data, context.get("requestId")));
    } catch (error) {
      return authErrorResponse(context, error);
    }
  });

  app.get("/bars/:barId/role-permissions", async (context) => {
    try {
      const runtime = createAuthRuntime(context.env, options);
      const barRuntime = createBarRuntime(context.env, options);
      const membershipRuntime = createMembershipRuntime(context.env, options);
      const session = await runtime.service.requireFeatureSession(
        getSessionCookie(context, runtime),
        getCsrfCookie(context, runtime)
      );
      const data = await new MembershipService(runtime.repository, barRuntime.repository, membershipRuntime.repository, {
        now: options.now
      }).readRolePermissions(session.user, context.req.param("barId"));
      return context.json(ok(data, context.get("requestId")));
    } catch (error) {
      return authErrorResponse(context, error);
    }
  });

  app.patch("/bars/:barId/role-permissions", async (context) => {
    try {
      const runtime = createAuthRuntime(context.env, options);
      const barRuntime = createBarRuntime(context.env, options);
      const membershipRuntime = createMembershipRuntime(context.env, options);
      const session = await runtime.service.requireFeatureSession(getSessionCookie(context, runtime), getCsrfHeader(context));
      const payload = await parseJson(context, updateRolePermissionsRequestSchema);
      const data = await new MembershipService(runtime.repository, barRuntime.repository, membershipRuntime.repository, {
        now: options.now
      }).updateRolePermissions(session.user, context.req.param("barId"), payload);
      return context.json(ok(data, context.get("requestId")));
    } catch (error) {
      return authErrorResponse(context, error);
    }
  });

  app.get("/bars/:barId/current-permissions", async (context) => {
    try {
      const runtime = createAuthRuntime(context.env, options);
      const barRuntime = createBarRuntime(context.env, options);
      const membershipRuntime = createMembershipRuntime(context.env, options);
      const session = await runtime.service.requireFeatureSession(
        getSessionCookie(context, runtime),
        getCsrfCookie(context, runtime)
      );
      const query = parseQuery(context, currentBarPermissionsQuerySchema);
      const data = await new MembershipService(runtime.repository, barRuntime.repository, membershipRuntime.repository, {
        now: options.now
      }).readCurrentPermissions(session.user, context.req.param("barId"), query);
      return context.json(ok(data, context.get("requestId")));
    } catch (error) {
      return authErrorResponse(context, error);
    }
  });

  app.get("/bars/:barId/categories", async (context) => {
    try {
      const runtime = createAuthRuntime(context.env, options);
      const session = await runtime.service.requireFeatureSession(
        getSessionCookie(context, runtime),
        getCsrfCookie(context, runtime)
      );
      const data = await new CategoryService(
        runtime.repository,
        createBarRuntime(context.env, options).repository,
        createMembershipRuntime(context.env, options).repository,
        createCategoryRuntime(context.env, options).repository,
        { now: options.now }
      ).readCategories(session.user, context.req.param("barId"));
      return context.json(ok(data, context.get("requestId")));
    } catch (error) {
      return authErrorResponse(context, error);
    }
  });

  app.post("/bars/:barId/categories", async (context) => {
    try {
      const runtime = createAuthRuntime(context.env, options);
      const session = await runtime.service.requireFeatureSession(getSessionCookie(context, runtime), getCsrfHeader(context));
      const payload = await parseJson(context, createCategoryRequestSchema);
      const data = await new CategoryService(
        runtime.repository,
        createBarRuntime(context.env, options).repository,
        createMembershipRuntime(context.env, options).repository,
        createCategoryRuntime(context.env, options).repository,
        { now: options.now }
      ).createCategory(session.user, context.req.param("barId"), payload);
      return context.json(ok(data, context.get("requestId")), 201);
    } catch (error) {
      return authErrorResponse(context, error);
    }
  });

  app.patch("/bars/:barId/categories/reorder", async (context) => {
    try {
      const runtime = createAuthRuntime(context.env, options);
      const session = await runtime.service.requireFeatureSession(getSessionCookie(context, runtime), getCsrfHeader(context));
      const payload = await parseJson(context, reorderCategoriesRequestSchema);
      const data = await new CategoryService(
        runtime.repository,
        createBarRuntime(context.env, options).repository,
        createMembershipRuntime(context.env, options).repository,
        createCategoryRuntime(context.env, options).repository,
        { now: options.now }
      ).reorderCategories(session.user, context.req.param("barId"), payload);
      return context.json(ok(data, context.get("requestId")));
    } catch (error) {
      return authErrorResponse(context, error);
    }
  });

  app.patch("/bars/:barId/categories/:categoryId", async (context) => {
    try {
      const runtime = createAuthRuntime(context.env, options);
      const session = await runtime.service.requireFeatureSession(getSessionCookie(context, runtime), getCsrfHeader(context));
      const payload = await parseJson(context, updateCategoryRequestSchema);
      const data = await new CategoryService(
        runtime.repository,
        createBarRuntime(context.env, options).repository,
        createMembershipRuntime(context.env, options).repository,
        createCategoryRuntime(context.env, options).repository,
        { now: options.now }
      ).updateCategory(session.user, context.req.param("barId"), context.req.param("categoryId"), payload);
      return context.json(ok(data, context.get("requestId")));
    } catch (error) {
      return authErrorResponse(context, error);
    }
  });

  app.patch("/bars/:barId/categories/:categoryId/move", async (context) => {
    try {
      const runtime = createAuthRuntime(context.env, options);
      const session = await runtime.service.requireFeatureSession(getSessionCookie(context, runtime), getCsrfHeader(context));
      const payload = await parseJson(context, moveCategoryRequestSchema);
      const data = await new CategoryService(
        runtime.repository,
        createBarRuntime(context.env, options).repository,
        createMembershipRuntime(context.env, options).repository,
        createCategoryRuntime(context.env, options).repository,
        { now: options.now }
      ).moveCategory(session.user, context.req.param("barId"), context.req.param("categoryId"), payload);
      return context.json(ok(data, context.get("requestId")));
    } catch (error) {
      return authErrorResponse(context, error);
    }
  });

  app.delete("/bars/:barId/categories/:categoryId", async (context) => {
    try {
      const runtime = createAuthRuntime(context.env, options);
      const session = await runtime.service.requireFeatureSession(getSessionCookie(context, runtime), getCsrfHeader(context));
      const payload = await parseJson(context, deleteCategoryRequestSchema);
      const data = await new CategoryService(
        runtime.repository,
        createBarRuntime(context.env, options).repository,
        createMembershipRuntime(context.env, options).repository,
        createCategoryRuntime(context.env, options).repository,
        { now: options.now }
      ).deleteCategory(session.user, context.req.param("barId"), context.req.param("categoryId"), payload);
      return context.json(ok(data, context.get("requestId")));
    } catch (error) {
      return authErrorResponse(context, error);
    }
  });

  app.get("/bars/:barId/menu-items", async (context) => {
    try {
      const runtime = createAuthRuntime(context.env, options);
      const session = await runtime.service.requireFeatureSession(
        getSessionCookie(context, runtime),
        getCsrfCookie(context, runtime)
      );
      const query = parseQuery(context, menuItemListQuerySchema);
      const data = await new MenuItemService(
        runtime.repository,
        createBarRuntime(context.env, options).repository,
        createMembershipRuntime(context.env, options).repository,
        createCategoryRuntime(context.env, options).repository,
        createItemTypeRuntime(context.env, options).repository,
        createMenuItemRuntime(context.env, options).repository,
        { now: options.now, badgeRepository: createBadgeRuntime(context.env, options).repository }
      ).readMenuItems(session.user, context.req.param("barId"), query);
      return context.json(ok(data, context.get("requestId")));
    } catch (error) {
      return authErrorResponse(context, error);
    }
  });

  app.post("/bars/:barId/menu-items", async (context) => {
    try {
      const runtime = createAuthRuntime(context.env, options);
      const session = await runtime.service.requireFeatureSession(getSessionCookie(context, runtime), getCsrfHeader(context));
      const payload = await parseJson(context, createMenuItemRequestSchema);
      const data = await new MenuItemService(
        runtime.repository,
        createBarRuntime(context.env, options).repository,
        createMembershipRuntime(context.env, options).repository,
        createCategoryRuntime(context.env, options).repository,
        createItemTypeRuntime(context.env, options).repository,
        createMenuItemRuntime(context.env, options).repository,
        { now: options.now, badgeRepository: createBadgeRuntime(context.env, options).repository }
      ).createMenuItem(session.user, context.req.param("barId"), payload);
      return context.json(ok(data, context.get("requestId")), 201);
    } catch (error) {
      return authErrorResponse(context, error);
    }
  });

  app.post("/bars/:barId/menu-items/bulk", async (context) => {
    try {
      const runtime = createAuthRuntime(context.env, options);
      const session = await runtime.service.requireFeatureSession(getSessionCookie(context, runtime), getCsrfHeader(context));
      const payload = await parseJson(context, bulkUpdateMenuItemsRequestSchema);
      const data = await new MenuItemService(
        runtime.repository,
        createBarRuntime(context.env, options).repository,
        createMembershipRuntime(context.env, options).repository,
        createCategoryRuntime(context.env, options).repository,
        createItemTypeRuntime(context.env, options).repository,
        createMenuItemRuntime(context.env, options).repository,
        { now: options.now, badgeRepository: createBadgeRuntime(context.env, options).repository }
      ).bulkUpdateMenuItems(session.user, context.req.param("barId"), payload);
      return context.json(ok(data, context.get("requestId")));
    } catch (error) {
      return authErrorResponse(context, error);
    }
  });

  app.get("/bars/:barId/menu-items/:menuItemId", async (context) => {
    try {
      const runtime = createAuthRuntime(context.env, options);
      const session = await runtime.service.requireFeatureSession(
        getSessionCookie(context, runtime),
        getCsrfCookie(context, runtime)
      );
      const data = await new MenuItemService(
        runtime.repository,
        createBarRuntime(context.env, options).repository,
        createMembershipRuntime(context.env, options).repository,
        createCategoryRuntime(context.env, options).repository,
        createItemTypeRuntime(context.env, options).repository,
        createMenuItemRuntime(context.env, options).repository,
        { now: options.now, badgeRepository: createBadgeRuntime(context.env, options).repository }
      ).readMenuItem(session.user, context.req.param("barId"), context.req.param("menuItemId"));
      return context.json(ok(data, context.get("requestId")));
    } catch (error) {
      return authErrorResponse(context, error);
    }
  });

  app.patch("/bars/:barId/menu-items/:menuItemId", async (context) => {
    try {
      const runtime = createAuthRuntime(context.env, options);
      const session = await runtime.service.requireFeatureSession(getSessionCookie(context, runtime), getCsrfHeader(context));
      const payload = await parseJson(context, updateMenuItemRequestSchema);
      const data = await new MenuItemService(
        runtime.repository,
        createBarRuntime(context.env, options).repository,
        createMembershipRuntime(context.env, options).repository,
        createCategoryRuntime(context.env, options).repository,
        createItemTypeRuntime(context.env, options).repository,
        createMenuItemRuntime(context.env, options).repository,
        { now: options.now, badgeRepository: createBadgeRuntime(context.env, options).repository }
      ).updateMenuItem(session.user, context.req.param("barId"), context.req.param("menuItemId"), payload);
      return context.json(ok(data, context.get("requestId")));
    } catch (error) {
      return authErrorResponse(context, error);
    }
  });

  app.delete("/bars/:barId/menu-items/:menuItemId", async (context) => {
    try {
      const runtime = createAuthRuntime(context.env, options);
      const session = await runtime.service.requireFeatureSession(getSessionCookie(context, runtime), getCsrfHeader(context));
      const data = await new MenuItemService(
        runtime.repository,
        createBarRuntime(context.env, options).repository,
        createMembershipRuntime(context.env, options).repository,
        createCategoryRuntime(context.env, options).repository,
        createItemTypeRuntime(context.env, options).repository,
        createMenuItemRuntime(context.env, options).repository,
        { now: options.now, badgeRepository: createBadgeRuntime(context.env, options).repository }
      ).deleteMenuItem(session.user, context.req.param("barId"), context.req.param("menuItemId"));
      return context.json(ok(data, context.get("requestId")));
    } catch (error) {
      return authErrorResponse(context, error);
    }
  });

  app.get("/system/badges", async (context) => {
    try {
      const runtime = createAuthRuntime(context.env, options);
      const session = await runtime.service.requireFeatureSession(
        getSessionCookie(context, runtime),
        getCsrfCookie(context, runtime)
      );
      const data = await new BadgeService(
        runtime.repository,
        createBarRuntime(context.env, options).repository,
        createMembershipRuntime(context.env, options).repository,
        createBadgeRuntime(context.env, options).repository,
        { now: options.now }
      ).readBadges(session.user);
      return context.json(ok(data, context.get("requestId")));
    } catch (error) {
      return authErrorResponse(context, error);
    }
  });

  app.post("/system/badge-colors", async (context) => {
    try {
      const runtime = createAuthRuntime(context.env, options);
      const session = await runtime.service.requireFeatureSession(getSessionCookie(context, runtime), getCsrfHeader(context));
      const payload = await parseJson(context, createBadgeColorRequestSchema);
      const data = await new BadgeService(
        runtime.repository,
        createBarRuntime(context.env, options).repository,
        createMembershipRuntime(context.env, options).repository,
        createBadgeRuntime(context.env, options).repository,
        { now: options.now }
      ).createColor(session.user, payload);
      return context.json(ok(data, context.get("requestId")), 201);
    } catch (error) {
      return authErrorResponse(context, error);
    }
  });

  app.patch("/system/badge-colors/:colorId", async (context) => {
    try {
      const runtime = createAuthRuntime(context.env, options);
      const session = await runtime.service.requireFeatureSession(getSessionCookie(context, runtime), getCsrfHeader(context));
      const payload = await parseJson(context, updateBadgeColorRequestSchema);
      const data = await new BadgeService(
        runtime.repository,
        createBarRuntime(context.env, options).repository,
        createMembershipRuntime(context.env, options).repository,
        createBadgeRuntime(context.env, options).repository,
        { now: options.now }
      ).updateColor(session.user, context.req.param("colorId"), payload);
      return context.json(ok(data, context.get("requestId")));
    } catch (error) {
      return authErrorResponse(context, error);
    }
  });

  app.post("/system/badges", async (context) => {
    try {
      const runtime = createAuthRuntime(context.env, options);
      const session = await runtime.service.requireFeatureSession(getSessionCookie(context, runtime), getCsrfHeader(context));
      const payload = await parseJson(context, createSystemBadgeRequestSchema);
      const data = await new BadgeService(
        runtime.repository,
        createBarRuntime(context.env, options).repository,
        createMembershipRuntime(context.env, options).repository,
        createBadgeRuntime(context.env, options).repository,
        { now: options.now }
      ).createSystemBadge(session.user, payload);
      return context.json(ok(data, context.get("requestId")), 201);
    } catch (error) {
      return authErrorResponse(context, error);
    }
  });

  app.patch("/system/badges/:badgeId", async (context) => {
    try {
      const runtime = createAuthRuntime(context.env, options);
      const session = await runtime.service.requireFeatureSession(getSessionCookie(context, runtime), getCsrfHeader(context));
      const payload = await parseJson(context, updateSystemBadgeRequestSchema);
      const data = await new BadgeService(
        runtime.repository,
        createBarRuntime(context.env, options).repository,
        createMembershipRuntime(context.env, options).repository,
        createBadgeRuntime(context.env, options).repository,
        { now: options.now }
      ).updateSystemBadge(session.user, context.req.param("badgeId"), payload);
      return context.json(ok(data, context.get("requestId")));
    } catch (error) {
      return authErrorResponse(context, error);
    }
  });

  app.get("/bars/:barId/badges", async (context) => {
    try {
      const runtime = createAuthRuntime(context.env, options);
      const session = await runtime.service.requireFeatureSession(
        getSessionCookie(context, runtime),
        getCsrfCookie(context, runtime)
      );
      const data = await new BadgeService(
        runtime.repository,
        createBarRuntime(context.env, options).repository,
        createMembershipRuntime(context.env, options).repository,
        createBadgeRuntime(context.env, options).repository,
        { now: options.now }
      ).readBarBadges(session.user, context.req.param("barId"));
      return context.json(ok(data, context.get("requestId")));
    } catch (error) {
      return authErrorResponse(context, error);
    }
  });

  app.post("/bars/:barId/badges", async (context) => {
    try {
      const runtime = createAuthRuntime(context.env, options);
      const session = await runtime.service.requireFeatureSession(getSessionCookie(context, runtime), getCsrfHeader(context));
      const payload = await parseJson(context, createBarBadgeRequestSchema);
      const data = await new BadgeService(
        runtime.repository,
        createBarRuntime(context.env, options).repository,
        createMembershipRuntime(context.env, options).repository,
        createBadgeRuntime(context.env, options).repository,
        { now: options.now }
      ).createBarBadge(session.user, context.req.param("barId"), payload);
      return context.json(ok(data, context.get("requestId")), 201);
    } catch (error) {
      return authErrorResponse(context, error);
    }
  });

  app.patch("/bars/:barId/badges/visibility/:systemBadgeId", async (context) => {
    try {
      const runtime = createAuthRuntime(context.env, options);
      const session = await runtime.service.requireFeatureSession(getSessionCookie(context, runtime), getCsrfHeader(context));
      const payload = await parseJson(context, updateBarSystemBadgeVisibilityRequestSchema);
      const data = await new BadgeService(
        runtime.repository,
        createBarRuntime(context.env, options).repository,
        createMembershipRuntime(context.env, options).repository,
        createBadgeRuntime(context.env, options).repository,
        { now: options.now }
      ).updateBarSystemBadgeVisibility(session.user, context.req.param("barId"), context.req.param("systemBadgeId"), payload);
      return context.json(ok(data, context.get("requestId")));
    } catch (error) {
      return authErrorResponse(context, error);
    }
  });

  app.patch("/bars/:barId/badges/:badgeId", async (context) => {
    try {
      const runtime = createAuthRuntime(context.env, options);
      const session = await runtime.service.requireFeatureSession(getSessionCookie(context, runtime), getCsrfHeader(context));
      const payload = await parseJson(context, updateBarBadgeRequestSchema);
      const data = await new BadgeService(
        runtime.repository,
        createBarRuntime(context.env, options).repository,
        createMembershipRuntime(context.env, options).repository,
        createBadgeRuntime(context.env, options).repository,
        { now: options.now }
      ).updateBarBadge(session.user, context.req.param("barId"), context.req.param("badgeId"), payload);
      return context.json(ok(data, context.get("requestId")));
    } catch (error) {
      return authErrorResponse(context, error);
    }
  });

  app.delete("/bars/:barId/badges/:badgeId", async (context) => {
    try {
      const runtime = createAuthRuntime(context.env, options);
      const session = await runtime.service.requireFeatureSession(getSessionCookie(context, runtime), getCsrfHeader(context));
      const payload = await parseJson(context, deleteBarBadgeRequestSchema);
      const data = await new BadgeService(
        runtime.repository,
        createBarRuntime(context.env, options).repository,
        createMembershipRuntime(context.env, options).repository,
        createBadgeRuntime(context.env, options).repository,
        { now: options.now }
      ).deleteBarBadge(session.user, context.req.param("barId"), context.req.param("badgeId"), payload);
      return context.json(ok(data, context.get("requestId")));
    } catch (error) {
      return authErrorResponse(context, error);
    }
  });

  app.get("/system/item-types", async (context) => {
    try {
      const runtime = createAuthRuntime(context.env, options);
      const session = await runtime.service.requireFeatureSession(
        getSessionCookie(context, runtime),
        getCsrfCookie(context, runtime)
      );
      const data = await new ItemTypeService(
        runtime.repository,
        createBarRuntime(context.env, options).repository,
        createMembershipRuntime(context.env, options).repository,
        createItemTypeRuntime(context.env, options).repository,
        { now: options.now }
      ).readItemTypes(session.user);
      return context.json(ok(data, context.get("requestId")));
    } catch (error) {
      return authErrorResponse(context, error);
    }
  });

  app.post("/system/item-types", async (context) => {
    try {
      const runtime = createAuthRuntime(context.env, options);
      const session = await runtime.service.requireFeatureSession(getSessionCookie(context, runtime), getCsrfHeader(context));
      const payload = await parseJson(context, createSystemItemTypeRequestSchema);
      const data = await new ItemTypeService(
        runtime.repository,
        createBarRuntime(context.env, options).repository,
        createMembershipRuntime(context.env, options).repository,
        createItemTypeRuntime(context.env, options).repository,
        { now: options.now }
      ).createSystemItemType(session.user, payload);
      return context.json(ok(data, context.get("requestId")), 201);
    } catch (error) {
      return authErrorResponse(context, error);
    }
  });

  app.patch("/system/item-types/:itemTypeId", async (context) => {
    try {
      const runtime = createAuthRuntime(context.env, options);
      const session = await runtime.service.requireFeatureSession(getSessionCookie(context, runtime), getCsrfHeader(context));
      const payload = await parseJson(context, updateSystemItemTypeRequestSchema);
      const data = await new ItemTypeService(
        runtime.repository,
        createBarRuntime(context.env, options).repository,
        createMembershipRuntime(context.env, options).repository,
        createItemTypeRuntime(context.env, options).repository,
        { now: options.now }
      ).updateSystemItemType(session.user, context.req.param("itemTypeId"), payload);
      return context.json(ok(data, context.get("requestId")));
    } catch (error) {
      return authErrorResponse(context, error);
    }
  });

  app.delete("/system/item-types/:itemTypeId", async (context) => {
    try {
      const runtime = createAuthRuntime(context.env, options);
      const session = await runtime.service.requireFeatureSession(getSessionCookie(context, runtime), getCsrfHeader(context));
      const data = await new ItemTypeService(
        runtime.repository,
        createBarRuntime(context.env, options).repository,
        createMembershipRuntime(context.env, options).repository,
        createItemTypeRuntime(context.env, options).repository,
        { now: options.now }
      ).deleteSystemItemType(session.user, context.req.param("itemTypeId"));
      return context.json(ok(data, context.get("requestId")));
    } catch (error) {
      return authErrorResponse(context, error);
    }
  });

  app.get("/bars/:barId/item-types", async (context) => {
    try {
      const runtime = createAuthRuntime(context.env, options);
      const session = await runtime.service.requireFeatureSession(
        getSessionCookie(context, runtime),
        getCsrfCookie(context, runtime)
      );
      const data = await new ItemTypeService(
        runtime.repository,
        createBarRuntime(context.env, options).repository,
        createMembershipRuntime(context.env, options).repository,
        createItemTypeRuntime(context.env, options).repository,
        { now: options.now }
      ).readBarItemTypes(session.user, context.req.param("barId"));
      return context.json(ok(data, context.get("requestId")));
    } catch (error) {
      return authErrorResponse(context, error);
    }
  });

  app.post("/bars/:barId/item-types", async (context) => {
    try {
      const runtime = createAuthRuntime(context.env, options);
      const session = await runtime.service.requireFeatureSession(getSessionCookie(context, runtime), getCsrfHeader(context));
      const payload = await parseJson(context, createBarItemTypeRequestSchema);
      const data = await new ItemTypeService(
        runtime.repository,
        createBarRuntime(context.env, options).repository,
        createMembershipRuntime(context.env, options).repository,
        createItemTypeRuntime(context.env, options).repository,
        { now: options.now }
      ).createBarItemType(session.user, context.req.param("barId"), payload);
      return context.json(ok(data, context.get("requestId")), 201);
    } catch (error) {
      return authErrorResponse(context, error);
    }
  });

  app.patch("/bars/:barId/item-types/overrides/:systemItemTypeId", async (context) => {
    try {
      const runtime = createAuthRuntime(context.env, options);
      const session = await runtime.service.requireFeatureSession(getSessionCookie(context, runtime), getCsrfHeader(context));
      const payload = await parseJson(context, updateBarItemTypeOverrideRequestSchema);
      const data = await new ItemTypeService(
        runtime.repository,
        createBarRuntime(context.env, options).repository,
        createMembershipRuntime(context.env, options).repository,
        createItemTypeRuntime(context.env, options).repository,
        { now: options.now }
      ).updateBarOverride(session.user, context.req.param("barId"), context.req.param("systemItemTypeId"), payload);
      return context.json(ok(data, context.get("requestId")));
    } catch (error) {
      return authErrorResponse(context, error);
    }
  });

  app.patch("/bars/:barId/item-types/:itemTypeId", async (context) => {
    try {
      const runtime = createAuthRuntime(context.env, options);
      const session = await runtime.service.requireFeatureSession(getSessionCookie(context, runtime), getCsrfHeader(context));
      const payload = await parseJson(context, updateBarItemTypeRequestSchema);
      const data = await new ItemTypeService(
        runtime.repository,
        createBarRuntime(context.env, options).repository,
        createMembershipRuntime(context.env, options).repository,
        createItemTypeRuntime(context.env, options).repository,
        { now: options.now }
      ).updateBarItemType(session.user, context.req.param("barId"), context.req.param("itemTypeId"), payload);
      return context.json(ok(data, context.get("requestId")));
    } catch (error) {
      return authErrorResponse(context, error);
    }
  });

  app.delete("/bars/:barId/item-types/:itemTypeId", async (context) => {
    try {
      const runtime = createAuthRuntime(context.env, options);
      const session = await runtime.service.requireFeatureSession(getSessionCookie(context, runtime), getCsrfHeader(context));
      const data = await new ItemTypeService(
        runtime.repository,
        createBarRuntime(context.env, options).repository,
        createMembershipRuntime(context.env, options).repository,
        createItemTypeRuntime(context.env, options).repository,
        { now: options.now }
      ).deleteBarItemType(session.user, context.req.param("barId"), context.req.param("itemTypeId"));
      return context.json(ok(data, context.get("requestId")));
    } catch (error) {
      return authErrorResponse(context, error);
    }
  });

  app.get("/system/grape-varieties", async (context) => {
    try {
      const runtime = createAuthRuntime(context.env, options);
      const session = await runtime.service.requireFeatureSession(
        getSessionCookie(context, runtime),
        getCsrfCookie(context, runtime)
      );
      const data = await new ItemTypeService(
        runtime.repository,
        createBarRuntime(context.env, options).repository,
        createMembershipRuntime(context.env, options).repository,
        createItemTypeRuntime(context.env, options).repository,
        { now: options.now }
      ).readGrapeVarieties(session.user);
      return context.json(ok(data, context.get("requestId")));
    } catch (error) {
      return authErrorResponse(context, error);
    }
  });

  app.get("/system/grape-variety-candidates", async (context) => {
    try {
      const runtime = createAuthRuntime(context.env, options);
      const session = await runtime.service.requireFeatureSession(
        getSessionCookie(context, runtime),
        getCsrfCookie(context, runtime)
      );
      const data = await new ItemTypeService(
        runtime.repository,
        createBarRuntime(context.env, options).repository,
        createMembershipRuntime(context.env, options).repository,
        createItemTypeRuntime(context.env, options).repository,
        { now: options.now }
      ).readGrapeCandidates(session.user);
      return context.json(ok(data, context.get("requestId")));
    } catch (error) {
      return authErrorResponse(context, error);
    }
  });

  app.post("/system/grape-variety-candidates", async (context) => {
    try {
      const runtime = createAuthRuntime(context.env, options);
      const session = await runtime.service.requireFeatureSession(getSessionCookie(context, runtime), getCsrfHeader(context));
      const payload = await parseJson(context, submitGrapeCandidateRequestSchema);
      const data = await new ItemTypeService(
        runtime.repository,
        createBarRuntime(context.env, options).repository,
        createMembershipRuntime(context.env, options).repository,
        createItemTypeRuntime(context.env, options).repository,
        { now: options.now }
      ).submitGrapeCandidate(session.user, payload);
      return context.json(ok(data, context.get("requestId")), 201);
    } catch (error) {
      return authErrorResponse(context, error);
    }
  });

  app.post("/system/grape-variety-candidates/:candidateId/approve", async (context) => {
    try {
      const runtime = createAuthRuntime(context.env, options);
      const session = await runtime.service.requireFeatureSession(getSessionCookie(context, runtime), getCsrfHeader(context));
      const payload = await parseJson(context, approveGrapeCandidateRequestSchema);
      const data = await new ItemTypeService(
        runtime.repository,
        createBarRuntime(context.env, options).repository,
        createMembershipRuntime(context.env, options).repository,
        createItemTypeRuntime(context.env, options).repository,
        { now: options.now }
      ).approveGrapeCandidate(session.user, context.req.param("candidateId"), payload);
      return context.json(ok(data, context.get("requestId")));
    } catch (error) {
      return authErrorResponse(context, error);
    }
  });

  app.post("/system/grape-variety-candidates/:candidateId/reject", async (context) => {
    try {
      const runtime = createAuthRuntime(context.env, options);
      const session = await runtime.service.requireFeatureSession(getSessionCookie(context, runtime), getCsrfHeader(context));
      const payload = await parseJson(context, rejectGrapeCandidateRequestSchema);
      const data = await new ItemTypeService(
        runtime.repository,
        createBarRuntime(context.env, options).repository,
        createMembershipRuntime(context.env, options).repository,
        createItemTypeRuntime(context.env, options).repository,
        { now: options.now }
      ).rejectGrapeCandidate(session.user, context.req.param("candidateId"), payload);
      return context.json(ok(data, context.get("requestId")));
    } catch (error) {
      return authErrorResponse(context, error);
    }
  });

  app.get("/system/users", async (context) => {
    try {
      const runtime = createAuthRuntime(context.env, options);
      const session = await runtime.service.requireFeatureSession(
        getSessionCookie(context, runtime),
        getCsrfCookie(context, runtime)
      );
      const query = parseQuery(context, systemUserListQuerySchema);
      const data = await new SystemUserService(runtime.repository, {
        now: options.now,
        passwordHasher: options.passwordHasher,
        temporaryPasswordGenerator: options.temporaryPasswordGenerator
      }).listUsers(session.user, query);
      return context.json(ok(data, context.get("requestId")));
    } catch (error) {
      return authErrorResponse(context, error);
    }
  });

  app.get("/system/audit", async (context) => {
    try {
      const runtime = createAuthRuntime(context.env, options);
      const session = await runtime.service.requireFeatureSession(
        getSessionCookie(context, runtime),
        getCsrfCookie(context, runtime)
      );
      const query = parseQuery(context, auditLogQuerySchema);
      const data = await createAuditService(context.env, options).listAudit(session.user, query);
      return context.json(ok(data, context.get("requestId")));
    } catch (error) {
      return authErrorResponse(context, error);
    }
  });

  app.get("/system/pilot-readiness", async (context) => {
    try {
      const runtime = createAuthRuntime(context.env, options);
      const session = await runtime.service.requireFeatureSession(
        getSessionCookie(context, runtime),
        getCsrfCookie(context, runtime)
      );
      const data = await createPilotReadinessService(context.env, options).readReadiness(session.user);
      return context.json(ok(data, context.get("requestId")));
    } catch (error) {
      return authErrorResponse(context, error);
    }
  });

  app.post("/system/audit/maintenance-runs", async (context) => {
    try {
      const runtime = createAuthRuntime(context.env, options);
      const session = await runtime.service.requireFeatureSession(getSessionCookie(context, runtime), getCsrfHeader(context));
      const payload = await parseJson(context, maintenanceRunRequestSchema);
      const data = await createAuditService(context.env, options).runMaintenance(
        session.user,
        payload,
        context.get("requestId")
      );
      return context.json(ok(data, context.get("requestId")), 201);
    } catch (error) {
      return authErrorResponse(context, error);
    }
  });

  app.post("/system/users", async (context) => {
    try {
      const runtime = createAuthRuntime(context.env, options);
      const session = await runtime.service.requireFeatureSession(getSessionCookie(context, runtime), getCsrfHeader(context));
      const payload = await parseJson(context, createSystemUserRequestSchema);
      const data = await new SystemUserService(runtime.repository, {
        now: options.now,
        passwordHasher: options.passwordHasher,
        temporaryPasswordGenerator: options.temporaryPasswordGenerator
      }).createUser(session.user, payload);
      return context.json(ok(data, context.get("requestId")), 201);
    } catch (error) {
      return authErrorResponse(context, error);
    }
  });

  app.get("/system/users/:userId", async (context) => {
    try {
      const runtime = createAuthRuntime(context.env, options);
      const session = await runtime.service.requireFeatureSession(
        getSessionCookie(context, runtime),
        getCsrfCookie(context, runtime)
      );
      const data = await new SystemUserService(runtime.repository, {
        now: options.now,
        passwordHasher: options.passwordHasher,
        temporaryPasswordGenerator: options.temporaryPasswordGenerator
      }).readUser(session.user, context.req.param("userId"));
      return context.json(ok(data, context.get("requestId")));
    } catch (error) {
      return authErrorResponse(context, error);
    }
  });

  app.post("/system/users/:userId/activate", async (context) => {
    try {
      const runtime = createAuthRuntime(context.env, options);
      const session = await runtime.service.requireFeatureSession(getSessionCookie(context, runtime), getCsrfHeader(context));
      const data = await new SystemUserService(runtime.repository, {
        now: options.now,
        passwordHasher: options.passwordHasher,
        temporaryPasswordGenerator: options.temporaryPasswordGenerator
      }).activateUser(session.user, context.req.param("userId"));
      return context.json(ok(data, context.get("requestId")));
    } catch (error) {
      return authErrorResponse(context, error);
    }
  });

  app.post("/system/users/:userId/deactivate", async (context) => {
    try {
      const runtime = createAuthRuntime(context.env, options);
      const session = await runtime.service.requireFeatureSession(getSessionCookie(context, runtime), getCsrfHeader(context));
      const data = await new SystemUserService(runtime.repository, {
        now: options.now,
        passwordHasher: options.passwordHasher,
        temporaryPasswordGenerator: options.temporaryPasswordGenerator
      }).deactivateUser(session.user, context.req.param("userId"));
      return context.json(ok(data, context.get("requestId")));
    } catch (error) {
      return authErrorResponse(context, error);
    }
  });

  app.post("/system/users/:userId/unlock", async (context) => {
    try {
      const runtime = createAuthRuntime(context.env, options);
      const session = await runtime.service.requireFeatureSession(getSessionCookie(context, runtime), getCsrfHeader(context));
      const data = await new SystemUserService(runtime.repository, {
        now: options.now,
        passwordHasher: options.passwordHasher,
        temporaryPasswordGenerator: options.temporaryPasswordGenerator
      }).unlockUser(session.user, context.req.param("userId"));
      return context.json(ok(data, context.get("requestId")));
    } catch (error) {
      return authErrorResponse(context, error);
    }
  });

  app.post("/system/users/:userId/reset-password", async (context) => {
    try {
      const runtime = createAuthRuntime(context.env, options);
      const session = await runtime.service.requireFeatureSession(getSessionCookie(context, runtime), getCsrfHeader(context));
      const data = await new SystemUserService(runtime.repository, {
        now: options.now,
        passwordHasher: options.passwordHasher,
        temporaryPasswordGenerator: options.temporaryPasswordGenerator
      }).resetPassword(session.user, context.req.param("userId"));
      return context.json(ok(data, context.get("requestId")));
    } catch (error) {
      return authErrorResponse(context, error);
    }
  });

  app.post("/auth/change-password", async (context) => {
    try {
      const runtime = createAuthRuntime(context.env, options);
      const payload = await parseJson(context, changePasswordRequestSchema);
      const data = await runtime.service.changePassword(payload, getSessionCookie(context, runtime), getCsrfHeader(context));
      return context.json(ok(data, context.get("requestId")));
    } catch (error) {
      return authErrorResponse(context, error);
    }
  });

  app.post("/auth/logout", async (context) => {
    try {
      const runtime = createAuthRuntime(context.env, options);
      const data = await runtime.service.logout(getSessionCookie(context, runtime), getCsrfHeader(context));
      clearSessionCookies(context, runtime);
      return context.json(ok(data, context.get("requestId")));
    } catch (error) {
      return authErrorResponse(context, error);
    }
  });

  app.notFound((context) => {
    return context.json(
      fail(
        {
          code: "NOT_FOUND",
          message: "요청한 API를 찾을 수 없습니다.",
          fieldErrors: {}
        },
        context.get("requestId") ?? crypto.randomUUID()
      ),
      404
    );
  });

  return app;
}

function createPublicationService(env: AdminBindings | undefined, options: AdminApiOptions): PublicationService {
  const publicationRuntime = createPublicationRuntime(env, options);
  const menuBuilder: PublicationMenuBuilder =
    options.publicationMenuBuilder ??
    ((actor, barId) =>
      new PublicMenuPreviewService(
        createBarRuntime(env, options).repository,
        createMembershipRuntime(env, options).repository,
        createCategoryRuntime(env, options).repository,
        createMenuItemRuntime(env, options).repository,
        createBadgeRuntime(env, options).repository,
        { now: options.now }
      ).readPreview(actor, barId));
  return new PublicationService(
    createBarRuntime(env, options).repository,
    createMembershipRuntime(env, options).repository,
    publicationRuntime.repository,
    publicationRuntime.githubAdapter,
    publicationRuntime.cloudflareAdapter,
    {
      now: options.now,
      menuBuilder
    }
  );
}

async function consumeRateLimit(
  context: Context<AdminHonoEnv>,
  options: AdminApiOptions,
  scope: RateLimitScope,
  keyParts: string[]
): Promise<void> {
  await createRateLimitRuntime(context.env, options).service.enforce(scope, keyParts);
}

function clientFingerprint(context: Context<AdminHonoEnv>): string {
  const forwarded = context.req.header("cf-connecting-ip") ?? context.req.header("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || "local";
}

function createOrderTabService(env: AdminBindings | undefined, options: AdminApiOptions): OrderTabService {
  return new OrderTabService(
    createBarRuntime(env, options).repository,
    createMembershipRuntime(env, options).repository,
    createOrderTabRuntime(env, options).repository,
    {
      now: options.now,
      categoryRepository: createCategoryRuntime(env, options).repository,
      menuItemRepository: createMenuItemRuntime(env, options).repository
    }
  );
}

function createAuditService(env: AdminBindings | undefined, options: AdminApiOptions): AuditService {
  return new AuditService(
    createAuditRuntime(env, options).repository,
    createOrderTabRuntime(env, options).repository,
    createPublicationRuntime(env, options).repository,
    createBarRuntime(env, options).repository,
    { now: options.now }
  );
}

function createPilotReadinessService(env: AdminBindings | undefined, options: AdminApiOptions): PilotReadinessService {
  return new PilotReadinessService(
    createBarRuntime(env, options).repository,
    createMembershipRuntime(env, options).repository,
    createCategoryRuntime(env, options).repository,
    createMenuItemRuntime(env, options).repository,
    createOrderTabRuntime(env, options).repository,
    createPublicationRuntime(env, options).repository,
    { now: options.now }
  );
}

async function safeRecordRouteAudit(context: Context<AdminHonoEnv>, options: AdminApiOptions): Promise<void> {
  const intent = auditIntentFor(context.req.method, apiPath(context));
  if (!intent) return;
  const actor = await readAuditActor(context, options);
  const status = context.res.status;
  await safeRecordAudit(context, options, {
    actorUserId: actor?.id ?? null,
    actorUsername: actor?.username ?? "",
    barId: intent.barId,
    operation: intent.operation,
    result: status >= 200 && status < 400 ? "success" : "failure",
    targetType: intent.targetType,
    targetId: intent.targetId,
    targetLabel: intent.targetLabel,
    errorCode: status >= 400 ? await readResponseErrorCode(context) : null,
    metadata: {
      method: context.req.method,
      status,
      path: intent.pathTemplate
    }
  });
}

async function safeRecordAudit(
  context: Context<AdminHonoEnv>,
  options: AdminApiOptions,
  input: {
    actorUserId?: string | null;
    actorUsername?: string;
    actor?: AuthUserRecord | null;
    barId?: string | null;
    operation: AuditOperation;
    result: "success" | "failure";
    targetType?: string;
    targetId?: string;
    targetLabel?: string;
    errorCode?: string | null;
    externalRef?: string | null;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  try {
    await createAuditService(context.env, options).recordAudit({
      requestId: context.get("requestId"),
      ...input
    });
  } catch {
    // Audit failure must not change the business response.
  }
}

type AuditRouteIntent = {
  operation: AuditOperation;
  barId: string | null;
  targetType: string;
  targetId: string;
  targetLabel: string;
  pathTemplate: string;
};

function auditIntentFor(method: string, path: string): AuditRouteIntent | null {
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return null;
  if (path === "/auth/login" || path.startsWith("/system/audit")) return null;

  const barMatch = path.match(/^\/bars\/([^/]+)/);
  const barId = barMatch?.[1] ? decodeURIComponent(barMatch[1]) : null;
  const withBar = (
    operation: AuditOperation,
    targetType: string,
    targetId: string,
    pathTemplate: string
  ): AuditRouteIntent => ({
    operation,
    barId,
    targetType,
    targetId,
    targetLabel: targetId || barId || pathTemplate,
    pathTemplate
  });

  if (method === "POST" && path === "/bars") return withBar("bar.created", "bar", "", "/bars");
  if (path.match(/^\/bars\/[^/]+\/lifecycle$/)) return withBar("bar.lifecycle_changed", "bar", barId ?? "", "/bars/{barId}/lifecycle");
  if (path.match(/^\/bars\/[^/]+\/settings$/)) return withBar("bar.settings_updated", "bar", barId ?? "", "/bars/{barId}/settings");
  if (path.match(/^\/bars\/[^/]+\/members(\/[^/]+\/deactivate|\/[^/]+)?$/)) {
    return withBar("membership.changed", "membership", lastPathSegment(path), "/bars/{barId}/members");
  }
  if (path.match(/^\/bars\/[^/]+\/role-permissions$/)) return withBar("permission.changed", "role_permissions", barId ?? "", "/bars/{barId}/role-permissions");
  if (path.match(/^\/bars\/[^/]+\/publications$/)) return withBar("publication.requested", "publication", barId ?? "", "/bars/{barId}/publications");
  if (path.match(/^\/bars\/[^/]+\/publications\/[^/]+\/republish$/)) {
    return withBar("publication.republished", "publication", segment(path, 4), "/bars/{barId}/publications/{publicationId}/republish");
  }
  if (path.match(/^\/bars\/[^/]+\/order-tabs\/[^/]+\/items\/[^/]+\/void$/)) {
    return withBar("order_tab.item_voided", "order_tab_item", segment(path, 6), "/bars/{barId}/order-tabs/{tabId}/items/{itemId}/void");
  }
  if (path.match(/^\/bars\/[^/]+\/order-tabs\/[^/]+\/items\/adjustments$/)) {
    return withBar("order_tab.adjusted", "order_tab", segment(path, 4), "/bars/{barId}/order-tabs/{tabId}/items/adjustments");
  }
  if (path.match(/^\/bars\/[^/]+\/order-tabs\/[^/]+\/settle$/)) {
    return withBar("order_tab.settled", "order_tab", segment(path, 4), "/bars/{barId}/order-tabs/{tabId}/settle");
  }
  if (path.match(/^\/bars\/[^/]+\/order-tabs\/[^/]+\/cancel$/)) {
    return withBar("order_tab.cancelled", "order_tab", segment(path, 4), "/bars/{barId}/order-tabs/{tabId}/cancel");
  }
  if (path.match(/^\/bars\/[^/]+\/categories/)) return withBar("category.changed", "category", lastPathSegment(path), "/bars/{barId}/categories");
  if (path.match(/^\/bars\/[^/]+\/menu-items/)) return withBar("menu_item.changed", "menu_item", lastPathSegment(path), "/bars/{barId}/menu-items");
  if (path.match(/^\/bars\/[^/]+\/badges/)) return withBar("badge.changed", "badge", lastPathSegment(path), "/bars/{barId}/badges");
  if (path.match(/^\/bars\/[^/]+\/item-types/)) return withBar("item_type.changed", "item_type", lastPathSegment(path), "/bars/{barId}/item-types");
  if (path.match(/^\/system\/badge/)) return withBar("badge.changed", "badge", lastPathSegment(path), "/system/badges");
  if (path.match(/^\/system\/item-types/)) return withBar("item_type.changed", "item_type", lastPathSegment(path), "/system/item-types");
  if (path.match(/^\/system\/grape-variety/)) return withBar("item_type.changed", "grape_variety", lastPathSegment(path), "/system/grape-varieties");
  if (path.match(/^\/system\/users$/) && method === "POST") return withBar("user.created", "user", "", "/system/users");
  if (path.match(/^\/system\/users\/[^/]+\/unlock$/)) return withBar("user.unlocked", "user", segment(path, 3), "/system/users/{userId}/unlock");
  if (path.match(/^\/system\/users\/[^/]+\/(activate|deactivate|reset-password)$/)) {
    return withBar("user.updated", "user", segment(path, 3), "/system/users/{userId}");
  }
  return null;
}

async function readAuditActor(context: Context<AdminHonoEnv>, options: AdminApiOptions): Promise<{ id: string; username: string } | null> {
  try {
    const runtime = createAuthRuntime(context.env, options);
    const session = await runtime.service.session(getSessionCookie(context, runtime), getCsrfCookie(context, runtime));
    return { id: session.user.id, username: session.user.username };
  } catch {
    return null;
  }
}

async function readResponseErrorCode(context: Context<AdminHonoEnv>): Promise<string> {
  try {
    const data = (await context.res.clone().json()) as { error?: { code?: string } };
    return data.error?.code ?? `HTTP_${context.res.status}`;
  } catch {
    return `HTTP_${context.res.status}`;
  }
}

function apiPath(context: Context<AdminHonoEnv>): string {
  return new URL(context.req.url).pathname.replace(/^\/api/, "") || "/";
}

function segment(path: string, index: number): string {
  return decodeURIComponent(path.split("/")[index] ?? "");
}

function lastPathSegment(path: string): string {
  return decodeURIComponent(path.split("/").filter(Boolean).at(-1) ?? "");
}

export const adminApi = createAdminApi();
