import type {
  AuditLog,
  AuditLogQuery,
  AuditOperation,
  AuditResult,
  MaintenanceRun,
  RetentionPreview
} from "../../contracts/audit";

export type AuditMetadataValue = string | number | boolean | null;
export type AuditMetadata = Record<string, AuditMetadataValue>;

export type AuditLogRecord = AuditLog;
export type MaintenanceRunRecord = MaintenanceRun;

export type CreateAuditLogInput = {
  id: string;
  occurredAt: string;
  requestId: string;
  actorUserId: string | null;
  actorUsername: string;
  barId: string | null;
  barName: string;
  operation: AuditOperation;
  result: AuditResult;
  targetType: string;
  targetId: string;
  targetLabel: string;
  errorCode: string | null;
  externalRef: string | null;
  metadata: AuditMetadata;
};

export type AuditLogListResult = {
  items: AuditLogRecord[];
  total: number;
  success: number;
  failure: number;
};

export type AuditFilterOptions = {
  actors: Array<{ value: string; label: string }>;
  bars: Array<{ value: string; label: string }>;
};

export type RetentionPolicy = {
  orderTerminalCutoff: string;
  dailySummaryCutoffDate: string;
  publicationSuccessLimit: number;
  publicationFailureLimit: number;
};

export type CreateMaintenanceRunInput = {
  id: string;
  startedAt: string;
  finishedAt: string;
  actorUserId: string | null;
  actorUsername: string;
  requestId: string;
  status: MaintenanceRunRecord["status"];
  dryRun: boolean;
  result: RetentionPreview;
  errorCode: string | null;
  errorMessage: string | null;
};

export interface AuditRepository {
  createAuditLog(input: CreateAuditLogInput): Promise<AuditLogRecord>;
  listAuditLogs(query: AuditLogQuery): Promise<AuditLogListResult>;
  listFilterOptions(): Promise<AuditFilterOptions>;
  createMaintenanceRun(input: CreateMaintenanceRunInput): Promise<MaintenanceRunRecord>;
  getLastMaintenanceRun(): Promise<MaintenanceRunRecord | null>;
}
