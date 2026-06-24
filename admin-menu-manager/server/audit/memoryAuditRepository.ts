import type { AuditLogQuery } from "../../contracts/audit";
import type {
  AuditFilterOptions,
  AuditLogListResult,
  AuditLogRecord,
  AuditRepository,
  CreateAuditLogInput,
  CreateMaintenanceRunInput,
  MaintenanceRunRecord
} from "./repository";

export class MemoryAuditRepository implements AuditRepository {
  private readonly logs = new Map<string, AuditLogRecord>();
  private readonly maintenanceRuns = new Map<string, MaintenanceRunRecord>();

  reset() {
    this.logs.clear();
    this.maintenanceRuns.clear();
  }

  async createAuditLog(input: CreateAuditLogInput): Promise<AuditLogRecord> {
    const record: AuditLogRecord = { ...input, metadata: { ...input.metadata } };
    this.logs.set(record.id, record);
    return cloneLog(record);
  }

  async listAuditLogs(query: AuditLogQuery): Promise<AuditLogListResult> {
    const filtered = [...this.logs.values()]
      .filter((log) => matchesQuery(log, query))
      .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt) || right.id.localeCompare(left.id));
    return {
      items: filtered.slice(0, query.pageSize).map(cloneLog),
      total: filtered.length,
      success: filtered.filter((log) => log.result === "success").length,
      failure: filtered.filter((log) => log.result === "failure").length
    };
  }

  async listFilterOptions(): Promise<AuditFilterOptions> {
    const actors = new Map<string, string>();
    const bars = new Map<string, string>();
    for (const log of this.logs.values()) {
      if (log.actorUserId) actors.set(log.actorUserId, log.actorUsername || log.actorUserId);
      if (log.barId) bars.set(log.barId, log.barName || log.barId);
    }
    return {
      actors: [...actors.entries()].map(([value, label]) => ({ value, label })).sort((left, right) => left.label.localeCompare(right.label)),
      bars: [...bars.entries()].map(([value, label]) => ({ value, label })).sort((left, right) => left.label.localeCompare(right.label))
    };
  }

  async createMaintenanceRun(input: CreateMaintenanceRunInput): Promise<MaintenanceRunRecord> {
    const record: MaintenanceRunRecord = {
      ...input,
      operation: "retention_cleanup",
      result: { ...input.result }
    };
    this.maintenanceRuns.set(record.id, record);
    return cloneRun(record);
  }

  async getLastMaintenanceRun(): Promise<MaintenanceRunRecord | null> {
    const last = [...this.maintenanceRuns.values()].sort(
      (left, right) => right.startedAt.localeCompare(left.startedAt) || right.id.localeCompare(left.id)
    )[0];
    return last ? cloneRun(last) : null;
  }
}

function matchesQuery(log: AuditLogRecord, query: AuditLogQuery): boolean {
  if (query.actorUserId !== "all" && log.actorUserId !== query.actorUserId) return false;
  if (query.barId !== "all" && log.barId !== query.barId) return false;
  if (query.operation !== "all" && log.operation !== query.operation) return false;
  if (query.result !== "all" && log.result !== query.result) return false;
  if (query.dateFrom && log.occurredAt.slice(0, 10) < query.dateFrom) return false;
  if (query.dateTo && log.occurredAt.slice(0, 10) > query.dateTo) return false;
  if (!query.q) return true;
  const text = `${log.actorUsername} ${log.barName} ${log.operation} ${log.targetType} ${log.targetId} ${log.targetLabel} ${log.requestId} ${log.errorCode ?? ""}`.toLocaleLowerCase("ko");
  return text.includes(query.q.toLocaleLowerCase("ko"));
}

function cloneLog(log: AuditLogRecord): AuditLogRecord {
  return { ...log, metadata: { ...log.metadata } };
}

function cloneRun(run: MaintenanceRunRecord): MaintenanceRunRecord {
  return { ...run, result: { ...run.result } };
}
