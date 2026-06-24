import type {
  CreatePublicationInput,
  CreatePublicationSnapshotInput,
  PublicationRecord,
  PublicationRepository,
  PublicationSnapshotRecord,
  UpdatePublicationInput
} from "./repository";

type LockRecord = {
  ownerToken: string;
  acquiredAt: string;
  leaseExpiresAt: string;
};

export class MemoryPublicationRepository implements PublicationRepository {
  private readonly publications = new Map<string, PublicationRecord>();
  private readonly snapshots = new Map<string, PublicationSnapshotRecord>();
  private readonly barLocks = new Map<string, LockRecord>();
  private repoLock: LockRecord | null = null;

  reset() {
    this.publications.clear();
    this.snapshots.clear();
    this.barLocks.clear();
    this.repoLock = null;
  }

  async createPublication(input: CreatePublicationInput): Promise<PublicationRecord> {
    const record: PublicationRecord = {
      id: input.id,
      barId: input.barId,
      status: "pending",
      operation: null,
      revision: input.revision,
      contentHash: input.contentHash,
      menuPath: input.menuPath,
      triggerPath: input.triggerPath,
      publishedAt: null,
      commitSha: null,
      deploymentId: null,
      deploymentStatus: null,
      deploymentSourceCommitSha: null,
      deploymentUrl: null,
      deploymentStartedAt: null,
      deploymentCheckedAt: null,
      deploymentCompletedAt: null,
      actorUserId: input.actorUserId,
      errorCode: null,
      errorMessage: null,
      createdAt: input.createdAt,
      completedAt: null
    };
    this.publications.set(record.id, record);
    return clonePublication(record);
  }

  async updatePublication(input: UpdatePublicationInput): Promise<PublicationRecord | null> {
    const current = this.publications.get(input.id);
    if (!current) return null;
    const updated: PublicationRecord = {
      ...current,
      status: input.status,
      operation: input.operation === undefined ? current.operation : input.operation,
      revision: input.revision ?? current.revision,
      publishedAt: input.publishedAt === undefined ? current.publishedAt : input.publishedAt,
      commitSha: input.commitSha === undefined ? current.commitSha : input.commitSha,
      deploymentId: input.deploymentId === undefined ? current.deploymentId : input.deploymentId,
      deploymentStatus: input.deploymentStatus === undefined ? current.deploymentStatus : input.deploymentStatus,
      deploymentSourceCommitSha:
        input.deploymentSourceCommitSha === undefined ? current.deploymentSourceCommitSha : input.deploymentSourceCommitSha,
      deploymentUrl: input.deploymentUrl === undefined ? current.deploymentUrl : input.deploymentUrl,
      deploymentStartedAt: input.deploymentStartedAt === undefined ? current.deploymentStartedAt : input.deploymentStartedAt,
      deploymentCheckedAt: input.deploymentCheckedAt === undefined ? current.deploymentCheckedAt : input.deploymentCheckedAt,
      deploymentCompletedAt: input.deploymentCompletedAt === undefined ? current.deploymentCompletedAt : input.deploymentCompletedAt,
      errorCode: input.errorCode === undefined ? current.errorCode : input.errorCode,
      errorMessage: input.errorMessage === undefined ? current.errorMessage : input.errorMessage,
      completedAt: input.completedAt === undefined ? current.completedAt : input.completedAt
    };
    this.publications.set(updated.id, updated);
    return clonePublication(updated);
  }

  async findPublicationById(publicationId: string): Promise<PublicationRecord | null> {
    const publication = this.publications.get(publicationId);
    return publication ? clonePublication(publication) : null;
  }

  async listPublications(barId: string, limit: number): Promise<PublicationRecord[]> {
    return [...this.publications.values()]
      .filter((publication) => publication.barId === barId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id))
      .slice(0, limit)
      .map(clonePublication);
  }

  async listWaitingCloudflarePublications(barId: string, limit: number): Promise<PublicationRecord[]> {
    return [...this.publications.values()]
      .filter((publication) => publication.barId === barId && publication.status === "waiting_cloudflare")
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id))
      .slice(0, limit)
      .map(clonePublication);
  }

  async findLatestSuccessfulSnapshot(barId: string): Promise<PublicationSnapshotRecord | null> {
    const snapshot = [...this.snapshots.values()]
      .filter((entry) => entry.barId === barId && this.publications.get(entry.publicationId)?.status === "success")
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.revision - left.revision)[0];
    return snapshot ? cloneSnapshot(snapshot) : null;
  }

  async findSnapshotByPublicationId(barId: string, publicationId: string): Promise<PublicationSnapshotRecord | null> {
    const publication = this.publications.get(publicationId);
    if (!publication || publication.barId !== barId || publication.status !== "success") return null;
    const snapshot = [...this.snapshots.values()].find(
      (entry) => entry.barId === barId && entry.publicationId === publicationId
    );
    return snapshot ? cloneSnapshot(snapshot) : null;
  }

  async createSnapshot(input: CreatePublicationSnapshotInput): Promise<PublicationSnapshotRecord> {
    const snapshot: PublicationSnapshotRecord = { ...input };
    this.snapshots.set(snapshot.id, snapshot);
    return cloneSnapshot(snapshot);
  }

  async previewPublicationHistoryOverflow(successLimit: number, failureLimit: number): Promise<number> {
    return this.countPublicationHistoryOverflow(successLimit, failureLimit);
  }

  async prunePublicationHistoryOverflow(successLimit: number, failureLimit: number): Promise<number> {
    const count = this.countPublicationHistoryOverflow(successLimit, failureLimit);
    const barIds = new Set([...this.publications.values()].map((publication) => publication.barId));
    for (const barId of barIds) await this.prunePublicationHistory(barId, successLimit, failureLimit);
    return count;
  }

  async prunePublicationHistory(barId: string, successLimit: number, failureLimit: number): Promise<void> {
    const successIdsToKeep = new Set(
      [...this.publications.values()]
        .filter((publication) => publication.barId === barId && publication.status === "success")
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id))
        .slice(0, successLimit)
        .map((publication) => publication.id)
    );
    const failureIdsToKeep = new Set(
      [...this.publications.values()]
        .filter((publication) => publication.barId === barId && ["failed", "timeout_unknown"].includes(publication.status))
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id))
        .slice(0, failureLimit)
        .map((publication) => publication.id)
    );

    for (const publication of [...this.publications.values()]) {
      const keepSuccess = publication.status === "success" && successIdsToKeep.has(publication.id);
      const keepFailure = ["failed", "timeout_unknown"].includes(publication.status) && failureIdsToKeep.has(publication.id);
      const pending = !["success", "failed", "timeout_unknown"].includes(publication.status);
      if (publication.barId === barId && !keepSuccess && !keepFailure && !pending) {
        this.publications.delete(publication.id);
        for (const snapshot of [...this.snapshots.values()]) {
          if (snapshot.publicationId === publication.id) this.snapshots.delete(snapshot.id);
        }
      }
    }
  }

  async acquireBarLock(barId: string, ownerToken: string, leaseExpiresAt: string, now: string): Promise<boolean> {
    const current = this.barLocks.get(barId);
    if (current && current.leaseExpiresAt > now && current.ownerToken !== ownerToken) return false;
    this.barLocks.set(barId, { ownerToken, acquiredAt: now, leaseExpiresAt });
    return true;
  }

  async releaseBarLock(barId: string, ownerToken: string): Promise<void> {
    const current = this.barLocks.get(barId);
    if (current?.ownerToken === ownerToken) this.barLocks.delete(barId);
  }

  async acquireRepositoryCommitLock(ownerToken: string, leaseExpiresAt: string, now: string): Promise<boolean> {
    if (this.repoLock && this.repoLock.leaseExpiresAt > now && this.repoLock.ownerToken !== ownerToken) return false;
    this.repoLock = { ownerToken, acquiredAt: now, leaseExpiresAt };
    return true;
  }

  async releaseRepositoryCommitLock(ownerToken: string): Promise<void> {
    if (this.repoLock?.ownerToken === ownerToken) this.repoLock = null;
  }

  private countPublicationHistoryOverflow(successLimit: number, failureLimit: number): number {
    const barIds = new Set([...this.publications.values()].map((publication) => publication.barId));
    let overflow = 0;
    for (const barId of barIds) {
      const successes = [...this.publications.values()].filter((publication) => publication.barId === barId && publication.status === "success").length;
      const failures = [...this.publications.values()].filter(
        (publication) => publication.barId === barId && ["failed", "timeout_unknown"].includes(publication.status)
      ).length;
      overflow += Math.max(0, successes - successLimit) + Math.max(0, failures - failureLimit);
    }
    return overflow;
  }
}

function clonePublication(record: PublicationRecord): PublicationRecord {
  return { ...record };
}

function cloneSnapshot(record: PublicationSnapshotRecord): PublicationSnapshotRecord {
  return { ...record };
}
