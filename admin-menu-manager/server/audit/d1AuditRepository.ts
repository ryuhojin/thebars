import type { AuditLogQuery, AuditOperation, AuditResult, MaintenanceRun, RetentionPreview } from "../../contracts/audit";
import type {
  AuditFilterOptions,
  AuditLogListResult,
  AuditLogRecord,
  AuditMetadata,
  AuditRepository,
  CreateAuditLogInput,
  CreateMaintenanceRunInput,
  MaintenanceRunRecord
} from "./repository";

type AuditLogRow = {
  id: string;
  occurred_at: string;
  request_id: string;
  actor_user_id: string | null;
  actor_username: string;
  bar_id: string | null;
  bar_name: string;
  operation: AuditOperation;
  result: AuditResult;
  target_type: string;
  target_id: string;
  target_label: string;
  error_code: string | null;
  external_ref: string | null;
  metadata_json: string;
};

type MaintenanceRunRow = {
  id: string;
  started_at: string;
  finished_at: string;
  actor_user_id: string | null;
  actor_username: string;
  request_id: string;
  status: MaintenanceRun["status"];
  operation: "retention_cleanup";
  dry_run: number;
  result_json: string;
  error_code: string | null;
  error_message: string | null;
};

export class D1AuditRepository implements AuditRepository {
  constructor(private readonly db: D1Database) {}

  async createAuditLog(input: CreateAuditLogInput): Promise<AuditLogRecord> {
    await this.db
      .prepare(
        `INSERT INTO audit_logs (
          id, occurred_at, request_id, actor_user_id, actor_username, bar_id, bar_name,
          operation, result, target_type, target_id, target_label, error_code, external_ref, metadata_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        input.id,
        input.occurredAt,
        input.requestId,
        input.actorUserId,
        input.actorUsername,
        input.barId,
        input.barName,
        input.operation,
        input.result,
        input.targetType,
        input.targetId,
        input.targetLabel,
        input.errorCode,
        input.externalRef,
        JSON.stringify(input.metadata)
      )
      .run();
    return { ...input, metadata: { ...input.metadata } };
  }

  async listAuditLogs(query: AuditLogQuery): Promise<AuditLogListResult> {
    const where: string[] = [];
    const params: unknown[] = [];
    appendWhere(where, params, query);
    const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const rows = await this.db
      .prepare(
        `SELECT *
         FROM audit_logs
         ${whereClause}
         ORDER BY occurred_at DESC, id DESC
         LIMIT ?`
      )
      .bind(...params, query.pageSize)
      .all<AuditLogRow>();
    const summary = await this.db
      .prepare(
        `SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN result = 'success' THEN 1 ELSE 0 END) AS success,
          SUM(CASE WHEN result = 'failure' THEN 1 ELSE 0 END) AS failure
         FROM audit_logs
         ${whereClause}`
      )
      .bind(...params)
      .first<{ total: number | null; success: number | null; failure: number | null }>();
    return {
      items: (rows.results ?? []).map(toAuditLog),
      total: summary?.total ?? 0,
      success: summary?.success ?? 0,
      failure: summary?.failure ?? 0
    };
  }

  async listFilterOptions(): Promise<AuditFilterOptions> {
    const actorRows = await this.db
      .prepare(
        `SELECT actor_user_id AS value, actor_username AS label
         FROM audit_logs
         WHERE actor_user_id IS NOT NULL AND actor_user_id != ''
         GROUP BY actor_user_id, actor_username
         ORDER BY actor_username ASC`
      )
      .all<{ value: string; label: string }>();
    const barRows = await this.db
      .prepare(
        `SELECT bar_id AS value, bar_name AS label
         FROM audit_logs
         WHERE bar_id IS NOT NULL AND bar_id != ''
         GROUP BY bar_id, bar_name
         ORDER BY bar_name ASC`
      )
      .all<{ value: string; label: string }>();
    return {
      actors: (actorRows.results ?? []).map((row) => ({ value: row.value, label: row.label || row.value })),
      bars: (barRows.results ?? []).map((row) => ({ value: row.value, label: row.label || row.value }))
    };
  }

  async createMaintenanceRun(input: CreateMaintenanceRunInput): Promise<MaintenanceRunRecord> {
    await this.db
      .prepare(
        `INSERT INTO maintenance_runs (
          id, started_at, finished_at, actor_user_id, actor_username, request_id, status,
          operation, dry_run, result_json, error_code, error_message
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'retention_cleanup', ?, ?, ?, ?)`
      )
      .bind(
        input.id,
        input.startedAt,
        input.finishedAt,
        input.actorUserId,
        input.actorUsername,
        input.requestId,
        input.status,
        input.dryRun ? 1 : 0,
        JSON.stringify(input.result),
        input.errorCode,
        input.errorMessage
      )
      .run();
    return {
      ...input,
      operation: "retention_cleanup",
      result: { ...input.result }
    };
  }

  async getLastMaintenanceRun(): Promise<MaintenanceRunRecord | null> {
    const row = await this.db
      .prepare("SELECT * FROM maintenance_runs ORDER BY started_at DESC, id DESC LIMIT 1")
      .first<MaintenanceRunRow>();
    return row ? toMaintenanceRun(row) : null;
  }
}

function appendWhere(where: string[], params: unknown[], query: AuditLogQuery): void {
  if (query.actorUserId !== "all") {
    where.push("actor_user_id = ?");
    params.push(query.actorUserId);
  }
  if (query.barId !== "all") {
    where.push("bar_id = ?");
    params.push(query.barId);
  }
  if (query.operation !== "all") {
    where.push("operation = ?");
    params.push(query.operation);
  }
  if (query.result !== "all") {
    where.push("result = ?");
    params.push(query.result);
  }
  if (query.dateFrom) {
    where.push("occurred_at >= ?");
    params.push(`${query.dateFrom}T00:00:00.000Z`);
  }
  if (query.dateTo) {
    where.push("occurred_at <= ?");
    params.push(`${query.dateTo}T23:59:59.999Z`);
  }
  if (query.q) {
    where.push(
      "(LOWER(actor_username) LIKE LOWER(?) OR LOWER(bar_name) LIKE LOWER(?) OR LOWER(operation) LIKE LOWER(?) OR LOWER(target_label) LIKE LOWER(?) OR LOWER(request_id) LIKE LOWER(?))"
    );
    const like = `%${query.q}%`;
    params.push(like, like, like, like, like);
  }
}

function toAuditLog(row: AuditLogRow): AuditLogRecord {
  return {
    id: row.id,
    occurredAt: row.occurred_at,
    requestId: row.request_id,
    actorUserId: row.actor_user_id,
    actorUsername: row.actor_username,
    barId: row.bar_id,
    barName: row.bar_name,
    operation: row.operation,
    result: row.result,
    targetType: row.target_type,
    targetId: row.target_id,
    targetLabel: row.target_label,
    errorCode: row.error_code,
    externalRef: row.external_ref,
    metadata: parseMetadata(row.metadata_json)
  };
}

function toMaintenanceRun(row: MaintenanceRunRow): MaintenanceRunRecord {
  return {
    id: row.id,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    actorUserId: row.actor_user_id,
    actorUsername: row.actor_username,
    requestId: row.request_id,
    status: row.status,
    operation: "retention_cleanup",
    dryRun: Boolean(row.dry_run),
    result: parseRetentionPreview(row.result_json),
    errorCode: row.error_code,
    errorMessage: row.error_message
  };
}

function parseMetadata(value: string): AuditMetadata {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(([, item]) => item === null || ["string", "number", "boolean"].includes(typeof item))
    ) as AuditMetadata;
  } catch {
    return {};
  }
}

function parseRetentionPreview(value: string): RetentionPreview {
  const fallback: RetentionPreview = {
    orderTerminalCutoff: "1970-01-01T00:00:00.000Z",
    dailySummaryCutoffDate: "1970-01-01",
    closedCancelledOrderTabs: 0,
    dailyOrderSummaries: 0,
    publicationHistoryOverflow: 0
  };
  try {
    return { ...fallback, ...(JSON.parse(value) as Partial<RetentionPreview>) };
  } catch {
    return fallback;
  }
}
