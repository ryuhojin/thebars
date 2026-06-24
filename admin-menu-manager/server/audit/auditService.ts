import {
  auditListResponseSchema,
  auditOperations,
  maintenanceRunResponseSchema,
  type AuditListResponse,
  type AuditLogQuery,
  type AuditOperation,
  type AuditResult,
  type MaintenanceRunRequest,
  type MaintenanceRunResponse,
  type RetentionPreview
} from "../../contracts/audit";
import { AuthServiceError } from "../auth/errors";
import type { AuthUserRecord } from "../auth/repository";
import type { BarRepository } from "../bars/repository";
import type { OrderTabRepository, OrderRetentionResult } from "../order-tabs/repository";
import type { PublicationRepository } from "../publications/repository";
import type { AuditMetadata, AuditRepository, CreateAuditLogInput } from "./repository";

export const AUDIT_RETENTION_POLICY = {
  closedCancelledOrderDays: 365,
  dailySummaryYears: 3,
  publicationSuccessLimit: 100,
  publicationFailureLimit: 100
} as const;

const operationLabels: Record<AuditOperation, string> = {
  "auth.login_failed": "로그인 실패",
  "auth.login_succeeded": "로그인 성공",
  "user.created": "사용자 생성",
  "user.updated": "사용자 변경",
  "user.unlocked": "사용자 잠금 해제",
  "membership.changed": "회원·권한 변경",
  "permission.changed": "역할 권한 변경",
  "bar.created": "바 생성",
  "bar.lifecycle_changed": "바 상태 변경",
  "bar.settings_updated": "바 기본 정보 변경",
  "publication.requested": "발행 요청",
  "publication.republished": "재발행",
  "order_tab.item_voided": "주문 항목 취소",
  "order_tab.adjusted": "주문 금액 조정",
  "order_tab.settled": "주문 정산",
  "order_tab.cancelled": "주문 취소",
  "category.changed": "카테고리 변경",
  "menu_item.changed": "메뉴 변경",
  "badge.changed": "배지 변경",
  "item_type.changed": "품목 유형 변경",
  "maintenance.retention": "보관 작업"
};

export class AuditService {
  private readonly now: () => Date;

  constructor(
    private readonly auditRepository: AuditRepository,
    private readonly orderTabRepository: OrderTabRepository,
    private readonly publicationRepository: PublicationRepository,
    private readonly barRepository: BarRepository,
    options: { now?: () => Date } = {}
  ) {
    this.now = options.now ?? (() => new Date());
  }

  async listAudit(actor: AuthUserRecord, query: AuditLogQuery): Promise<AuditListResponse> {
    assertSystemAdmin(actor);
    const [logs, filters, lastRun, preview] = await Promise.all([
      this.auditRepository.listAuditLogs(query),
      this.auditRepository.listFilterOptions(),
      this.auditRepository.getLastMaintenanceRun(),
      this.previewRetention()
    ]);
    return auditListResponseSchema.parse({
      items: logs.items,
      summary: {
        total: logs.total,
        success: logs.success,
        failure: logs.failure
      },
      filters: {
        actors: filters.actors,
        bars: filters.bars,
        operations: auditOperations.map((operation) => ({ value: operation, label: operationLabels[operation] })),
        results: [
          { value: "success", label: "성공" },
          { value: "failure", label: "실패" }
        ]
      },
      maintenance: {
        policy: AUDIT_RETENTION_POLICY,
        lastRun,
        preview
      }
    });
  }

  async runMaintenance(
    actor: AuthUserRecord,
    input: MaintenanceRunRequest,
    requestId: string
  ): Promise<MaintenanceRunResponse> {
    assertSystemAdmin(actor);
    const startedAt = this.now().toISOString();
    const deleted = input.dryRun ? await this.previewRetention() : await this.executeRetention();
    const finishedAt = this.now().toISOString();
    const run = await this.auditRepository.createMaintenanceRun({
      id: crypto.randomUUID(),
      startedAt,
      finishedAt,
      actorUserId: actor.id,
      actorUsername: actor.normalizedUsername,
      requestId,
      status: input.dryRun ? "dry_run" : "completed",
      dryRun: input.dryRun,
      result: deleted,
      errorCode: null,
      errorMessage: null
    });
    await this.recordAudit({
      requestId,
      actor,
      barId: null,
      operation: "maintenance.retention",
      result: "success",
      targetType: "retention_cleanup",
      targetId: run.id,
      targetLabel: input.dryRun ? "보관 작업 미리 계산" : "보관 작업 실행",
      metadata: {
        dryRun: input.dryRun,
        closedCancelledOrderTabs: deleted.closedCancelledOrderTabs,
        dailyOrderSummaries: deleted.dailyOrderSummaries,
        publicationHistoryOverflow: deleted.publicationHistoryOverflow
      }
    });
    return maintenanceRunResponseSchema.parse({ run, deleted });
  }

  async recordAudit(input: {
    requestId: string;
    actor?: AuthUserRecord | null;
    actorUserId?: string | null;
    actorUsername?: string;
    barId?: string | null;
    operation: AuditOperation;
    result: AuditResult;
    targetType?: string;
    targetId?: string;
    targetLabel?: string;
    errorCode?: string | null;
    externalRef?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    const bar = input.barId ? await this.barRepository.findBarById(input.barId) : null;
    const actorUserId = input.actor?.id ?? input.actorUserId ?? null;
    const actorUsername = input.actor?.normalizedUsername ?? input.actorUsername ?? "";
    const record: CreateAuditLogInput = {
      id: crypto.randomUUID(),
      occurredAt: this.now().toISOString(),
      requestId: input.requestId,
      actorUserId,
      actorUsername,
      barId: input.barId ?? null,
      barName: bar?.name ?? "",
      operation: input.operation,
      result: input.result,
      targetType: input.targetType ?? "",
      targetId: input.targetId ?? "",
      targetLabel: input.targetLabel ?? "",
      errorCode: input.errorCode ?? null,
      externalRef: input.externalRef ?? null,
      metadata: sanitizeMetadata(input.metadata ?? {})
    };
    await this.auditRepository.createAuditLog(record);
  }

  private async previewRetention(): Promise<RetentionPreview> {
    const policy = createRetentionPolicy(this.now());
    const [order, publicationHistoryOverflow] = await Promise.all([
      this.orderTabRepository.previewRetention({
        orderTerminalCutoff: policy.orderTerminalCutoff,
        dailySummaryCutoffDate: policy.dailySummaryCutoffDate
      }),
      this.publicationRepository.previewPublicationHistoryOverflow(
        AUDIT_RETENTION_POLICY.publicationSuccessLimit,
        AUDIT_RETENTION_POLICY.publicationFailureLimit
      )
    ]);
    return toRetentionPreview(policy, order, publicationHistoryOverflow);
  }

  private async executeRetention(): Promise<RetentionPreview> {
    const policy = createRetentionPolicy(this.now());
    const [order, publicationHistoryOverflow] = await Promise.all([
      this.orderTabRepository.pruneRetention({
        orderTerminalCutoff: policy.orderTerminalCutoff,
        dailySummaryCutoffDate: policy.dailySummaryCutoffDate
      }),
      this.publicationRepository.prunePublicationHistoryOverflow(
        AUDIT_RETENTION_POLICY.publicationSuccessLimit,
        AUDIT_RETENTION_POLICY.publicationFailureLimit
      )
    ]);
    return toRetentionPreview(policy, order, publicationHistoryOverflow);
  }
}

function assertSystemAdmin(actor: AuthUserRecord): void {
  if (!actor.isSystemAdmin) {
    throw new AuthServiceError(403, "SYSTEM_ADMIN_REQUIRED", "시스템 관리자만 사용할 수 있습니다.");
  }
}

function createRetentionPolicy(now: Date) {
  const orderCutoff = new Date(now);
  orderCutoff.setUTCDate(orderCutoff.getUTCDate() - AUDIT_RETENTION_POLICY.closedCancelledOrderDays);
  const dailySummaryCutoff = new Date(now);
  dailySummaryCutoff.setUTCFullYear(dailySummaryCutoff.getUTCFullYear() - AUDIT_RETENTION_POLICY.dailySummaryYears);
  return {
    orderTerminalCutoff: orderCutoff.toISOString(),
    dailySummaryCutoffDate: dailySummaryCutoff.toISOString().slice(0, 10)
  };
}

function toRetentionPreview(
  policy: { orderTerminalCutoff: string; dailySummaryCutoffDate: string },
  order: OrderRetentionResult,
  publicationHistoryOverflow: number
): RetentionPreview {
  return {
    orderTerminalCutoff: policy.orderTerminalCutoff,
    dailySummaryCutoffDate: policy.dailySummaryCutoffDate,
    closedCancelledOrderTabs: order.closedCancelledOrderTabs,
    dailyOrderSummaries: order.dailyOrderSummaries,
    publicationHistoryOverflow
  };
}

function sanitizeMetadata(input: Record<string, unknown>): AuditMetadata {
  const metadata: AuditMetadata = {};
  for (const [key, value] of Object.entries(input).slice(0, 24)) {
    if (isBlockedMetadataKey(key)) continue;
    if (value === null || typeof value === "boolean" || typeof value === "number") {
      metadata[key] = value;
    } else if (typeof value === "string") {
      metadata[key] = value.slice(0, 200);
    }
  }
  return metadata;
}

function isBlockedMetadataKey(key: string): boolean {
  return /(password|token|secret|session|csrf|memo|description|publicjson|body|raw)/i.test(key);
}
