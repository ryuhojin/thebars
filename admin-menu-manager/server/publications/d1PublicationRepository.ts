import type {
  CreatePublicationInput,
  CreatePublicationSnapshotInput,
  PublicationRecord,
  PublicationRepository,
  PublicationSnapshotRecord,
  UpdatePublicationInput
} from "./repository";

type PublicationRow = {
  id: string;
  bar_id: string;
  status: PublicationRecord["status"];
  operation: PublicationRecord["operation"];
  revision: number;
  content_hash: string;
  menu_path: string;
  trigger_path: string;
  published_at: string | null;
  commit_sha: string | null;
  deployment_id: string | null;
  deployment_status: PublicationRecord["deploymentStatus"];
  deployment_source_commit_sha: string | null;
  deployment_url: string | null;
  deployment_started_at: string | null;
  deployment_checked_at: string | null;
  deployment_completed_at: string | null;
  actor_user_id: string | null;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
};

type SnapshotRow = {
  id: string;
  publication_id: string;
  bar_id: string;
  revision: number;
  content_hash: string;
  public_json: string;
  menu_path: string;
  commit_sha: string;
  published_at: string;
  created_at: string;
};

export class D1PublicationRepository implements PublicationRepository {
  constructor(private readonly db: D1Database) {}

  async createPublication(input: CreatePublicationInput): Promise<PublicationRecord> {
    await this.db
      .prepare(
        `INSERT INTO publications (
          id, bar_id, status, operation, revision, content_hash, menu_path, trigger_path,
          published_at, commit_sha, deployment_id, deployment_status, deployment_source_commit_sha,
          deployment_url, deployment_started_at, deployment_checked_at, deployment_completed_at,
          actor_user_id, error_code, error_message, created_at, completed_at
        ) VALUES (?, ?, 'pending', NULL, ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ?, NULL, NULL, ?, NULL)`
      )
      .bind(input.id, input.barId, input.revision, input.contentHash, input.menuPath, input.triggerPath, input.actorUserId, input.createdAt)
      .run();
    const created = await this.findPublicationById(input.id);
    if (!created) throw new Error("PUBLICATION_INSERT_FAILED");
    return created;
  }

  async updatePublication(input: UpdatePublicationInput): Promise<PublicationRecord | null> {
    const current = await this.findPublicationById(input.id);
    if (!current) return null;
    await this.db
      .prepare(
        `UPDATE publications
         SET status = ?,
             operation = ?,
             revision = ?,
             published_at = ?,
             commit_sha = ?,
             deployment_id = ?,
             deployment_status = ?,
             deployment_source_commit_sha = ?,
             deployment_url = ?,
             deployment_started_at = ?,
             deployment_checked_at = ?,
             deployment_completed_at = ?,
             error_code = ?,
             error_message = ?,
             completed_at = ?
         WHERE id = ?`
      )
      .bind(
        input.status,
        input.operation === undefined ? current.operation : input.operation,
        input.revision ?? current.revision,
        input.publishedAt === undefined ? current.publishedAt : input.publishedAt,
        input.commitSha === undefined ? current.commitSha : input.commitSha,
        input.deploymentId === undefined ? current.deploymentId : input.deploymentId,
        input.deploymentStatus === undefined ? current.deploymentStatus : input.deploymentStatus,
        input.deploymentSourceCommitSha === undefined ? current.deploymentSourceCommitSha : input.deploymentSourceCommitSha,
        input.deploymentUrl === undefined ? current.deploymentUrl : input.deploymentUrl,
        input.deploymentStartedAt === undefined ? current.deploymentStartedAt : input.deploymentStartedAt,
        input.deploymentCheckedAt === undefined ? current.deploymentCheckedAt : input.deploymentCheckedAt,
        input.deploymentCompletedAt === undefined ? current.deploymentCompletedAt : input.deploymentCompletedAt,
        input.errorCode === undefined ? current.errorCode : input.errorCode,
        input.errorMessage === undefined ? current.errorMessage : input.errorMessage,
        input.completedAt === undefined ? current.completedAt : input.completedAt,
        input.id
      )
      .run();
    return this.findPublicationById(input.id);
  }

  async findPublicationById(publicationId: string): Promise<PublicationRecord | null> {
    const row = await this.db.prepare("SELECT * FROM publications WHERE id = ?").bind(publicationId).first<PublicationRow>();
    return row ? toPublicationRecord(row) : null;
  }

  async listPublications(barId: string, limit: number): Promise<PublicationRecord[]> {
    const result = await this.db
      .prepare("SELECT * FROM publications WHERE bar_id = ? ORDER BY created_at DESC, id DESC LIMIT ?")
      .bind(barId, limit)
      .all<PublicationRow>();
    return (result.results ?? []).map(toPublicationRecord);
  }

  async listWaitingCloudflarePublications(barId: string, limit: number): Promise<PublicationRecord[]> {
    const result = await this.db
      .prepare("SELECT * FROM publications WHERE bar_id = ? AND status = 'waiting_cloudflare' ORDER BY created_at ASC, id ASC LIMIT ?")
      .bind(barId, limit)
      .all<PublicationRow>();
    return (result.results ?? []).map(toPublicationRecord);
  }

  async findLatestSuccessfulSnapshot(barId: string): Promise<PublicationSnapshotRecord | null> {
    const row = await this.db
      .prepare(
        `SELECT publication_snapshots.*
         FROM publication_snapshots
         INNER JOIN publications ON publications.id = publication_snapshots.publication_id
         WHERE publication_snapshots.bar_id = ? AND publications.status = 'success'
         ORDER BY publication_snapshots.created_at DESC, publication_snapshots.revision DESC
         LIMIT 1`
      )
      .bind(barId)
      .first<SnapshotRow>();
    return row ? toSnapshotRecord(row) : null;
  }

  async findSnapshotByPublicationId(barId: string, publicationId: string): Promise<PublicationSnapshotRecord | null> {
    const row = await this.db
      .prepare(
        `SELECT publication_snapshots.*
         FROM publication_snapshots
         INNER JOIN publications ON publications.id = publication_snapshots.publication_id
         WHERE publication_snapshots.bar_id = ?
           AND publication_snapshots.publication_id = ?
           AND publications.status = 'success'
         LIMIT 1`
      )
      .bind(barId, publicationId)
      .first<SnapshotRow>();
    return row ? toSnapshotRecord(row) : null;
  }

  async createSnapshot(input: CreatePublicationSnapshotInput): Promise<PublicationSnapshotRecord> {
    await this.db
      .prepare(
        `INSERT INTO publication_snapshots (
          id, publication_id, bar_id, revision, content_hash, public_json, menu_path,
          commit_sha, published_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        input.id,
        input.publicationId,
        input.barId,
        input.revision,
        input.contentHash,
        input.publicJson,
        input.menuPath,
        input.commitSha,
        input.publishedAt,
        input.createdAt
      )
      .run();
    return { ...input };
  }

  async previewPublicationHistoryOverflow(successLimit: number, failureLimit: number): Promise<number> {
    return this.countPublicationHistoryOverflow(successLimit, failureLimit);
  }

  async prunePublicationHistoryOverflow(successLimit: number, failureLimit: number): Promise<number> {
    const count = await this.countPublicationHistoryOverflow(successLimit, failureLimit);
    const result = await this.db.prepare("SELECT DISTINCT bar_id FROM publications").all<{ bar_id: string }>();
    for (const row of result.results ?? []) {
      await this.prunePublicationHistory(row.bar_id, successLimit, failureLimit);
    }
    return count;
  }

  async prunePublicationHistory(barId: string, successLimit: number, failureLimit: number): Promise<void> {
    await this.db
      .prepare(
        `DELETE FROM publications
         WHERE bar_id = ?
           AND status = 'success'
           AND id NOT IN (
             SELECT id FROM publications
             WHERE bar_id = ? AND status = 'success'
             ORDER BY created_at DESC, id DESC
             LIMIT ?
           )`
      )
      .bind(barId, barId, successLimit)
      .run();
    await this.db
      .prepare(
        `DELETE FROM publications
         WHERE bar_id = ?
           AND status IN ('failed', 'timeout_unknown')
           AND id NOT IN (
             SELECT id FROM publications
             WHERE bar_id = ? AND status IN ('failed', 'timeout_unknown')
             ORDER BY created_at DESC, id DESC
             LIMIT ?
           )`
      )
      .bind(barId, barId, failureLimit)
      .run();
  }

  async acquireBarLock(barId: string, ownerToken: string, leaseExpiresAt: string, now: string): Promise<boolean> {
    await this.db.prepare("DELETE FROM publication_locks WHERE bar_id = ? AND lease_expires_at <= ?").bind(barId, now).run();
    try {
      await this.db
        .prepare("INSERT INTO publication_locks (bar_id, owner_token, acquired_at, lease_expires_at) VALUES (?, ?, ?, ?)")
        .bind(barId, ownerToken, now, leaseExpiresAt)
        .run();
      return true;
    } catch (error) {
      if (error instanceof Error && /UNIQUE|constraint/i.test(error.message)) return false;
      throw error;
    }
  }

  async releaseBarLock(barId: string, ownerToken: string): Promise<void> {
    await this.db.prepare("DELETE FROM publication_locks WHERE bar_id = ? AND owner_token = ?").bind(barId, ownerToken).run();
  }

  async acquireRepositoryCommitLock(ownerToken: string, leaseExpiresAt: string, now: string): Promise<boolean> {
    await this.db.prepare("DELETE FROM repository_commit_lock WHERE id = 'customer-repo' AND lease_expires_at <= ?").bind(now).run();
    try {
      await this.db
        .prepare("INSERT INTO repository_commit_lock (id, owner_token, acquired_at, lease_expires_at) VALUES ('customer-repo', ?, ?, ?)")
        .bind(ownerToken, now, leaseExpiresAt)
        .run();
      return true;
    } catch (error) {
      if (error instanceof Error && /UNIQUE|constraint/i.test(error.message)) return false;
      throw error;
    }
  }

  async releaseRepositoryCommitLock(ownerToken: string): Promise<void> {
    await this.db.prepare("DELETE FROM repository_commit_lock WHERE id = 'customer-repo' AND owner_token = ?").bind(ownerToken).run();
  }

  private async countPublicationHistoryOverflow(successLimit: number, failureLimit: number): Promise<number> {
    const result = await this.db
      .prepare(
        `SELECT
          bar_id,
          SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS success_count,
          SUM(CASE WHEN status IN ('failed', 'timeout_unknown') THEN 1 ELSE 0 END) AS failure_count
         FROM publications
         GROUP BY bar_id`
      )
      .all<{ bar_id: string; success_count: number | null; failure_count: number | null }>();
    return (result.results ?? []).reduce(
      (total, row) =>
        total +
        Math.max(0, (row.success_count ?? 0) - successLimit) +
        Math.max(0, (row.failure_count ?? 0) - failureLimit),
      0
    );
  }
}

function toPublicationRecord(row: PublicationRow): PublicationRecord {
  return {
    id: row.id,
    barId: row.bar_id,
    status: row.status,
    operation: row.operation,
    revision: row.revision,
    contentHash: row.content_hash,
    menuPath: row.menu_path,
    triggerPath: row.trigger_path,
    publishedAt: row.published_at,
    commitSha: row.commit_sha,
    deploymentId: row.deployment_id,
    deploymentStatus: row.deployment_status,
    deploymentSourceCommitSha: row.deployment_source_commit_sha,
    deploymentUrl: row.deployment_url,
    deploymentStartedAt: row.deployment_started_at,
    deploymentCheckedAt: row.deployment_checked_at,
    deploymentCompletedAt: row.deployment_completed_at,
    actorUserId: row.actor_user_id,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    completedAt: row.completed_at
  };
}

function toSnapshotRecord(row: SnapshotRow): PublicationSnapshotRecord {
  return {
    id: row.id,
    publicationId: row.publication_id,
    barId: row.bar_id,
    revision: row.revision,
    contentHash: row.content_hash,
    publicJson: row.public_json,
    menuPath: row.menu_path,
    commitSha: row.commit_sha,
    publishedAt: row.published_at,
    createdAt: row.created_at
  };
}
