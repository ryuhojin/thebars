import type { CloudflareDeploymentStatus, PublicationOperation, PublicationStatus } from "../../contracts/publications";

export type PublicationRecord = {
  id: string;
  barId: string;
  status: PublicationStatus;
  operation: PublicationOperation | null;
  revision: number;
  contentHash: string;
  menuPath: string;
  triggerPath: string;
  publishedAt: string | null;
  commitSha: string | null;
  deploymentId: string | null;
  deploymentStatus: CloudflareDeploymentStatus | null;
  deploymentSourceCommitSha: string | null;
  deploymentUrl: string | null;
  deploymentStartedAt: string | null;
  deploymentCheckedAt: string | null;
  deploymentCompletedAt: string | null;
  actorUserId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
};

export type PublicationSnapshotRecord = {
  id: string;
  publicationId: string;
  barId: string;
  revision: number;
  contentHash: string;
  publicJson: string;
  menuPath: string;
  commitSha: string;
  publishedAt: string;
  createdAt: string;
};

export type CreatePublicationInput = {
  id: string;
  barId: string;
  revision: number;
  contentHash: string;
  menuPath: string;
  triggerPath: string;
  actorUserId: string;
  createdAt: string;
};

export type UpdatePublicationInput = {
  id: string;
  status: PublicationStatus;
  operation?: PublicationOperation | null;
  revision?: number;
  publishedAt?: string | null;
  commitSha?: string | null;
  deploymentId?: string | null;
  deploymentStatus?: CloudflareDeploymentStatus | null;
  deploymentSourceCommitSha?: string | null;
  deploymentUrl?: string | null;
  deploymentStartedAt?: string | null;
  deploymentCheckedAt?: string | null;
  deploymentCompletedAt?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  completedAt?: string | null;
};

export type CreatePublicationSnapshotInput = {
  id: string;
  publicationId: string;
  barId: string;
  revision: number;
  contentHash: string;
  publicJson: string;
  menuPath: string;
  commitSha: string;
  publishedAt: string;
  createdAt: string;
};

export interface PublicationRepository {
  createPublication(input: CreatePublicationInput): Promise<PublicationRecord>;
  updatePublication(input: UpdatePublicationInput): Promise<PublicationRecord | null>;
  findPublicationById(publicationId: string): Promise<PublicationRecord | null>;
  listPublications(barId: string, limit: number): Promise<PublicationRecord[]>;
  listWaitingCloudflarePublications(barId: string, limit: number): Promise<PublicationRecord[]>;
  findLatestSuccessfulSnapshot(barId: string): Promise<PublicationSnapshotRecord | null>;
  findSnapshotByPublicationId(barId: string, publicationId: string): Promise<PublicationSnapshotRecord | null>;
  createSnapshot(input: CreatePublicationSnapshotInput): Promise<PublicationSnapshotRecord>;
  previewPublicationHistoryOverflow(successLimit: number, failureLimit: number): Promise<number>;
  prunePublicationHistoryOverflow(successLimit: number, failureLimit: number): Promise<number>;
  prunePublicationHistory(barId: string, successLimit: number, failureLimit: number): Promise<void>;
  acquireBarLock(barId: string, ownerToken: string, leaseExpiresAt: string, now: string): Promise<boolean>;
  releaseBarLock(barId: string, ownerToken: string): Promise<void>;
  acquireRepositoryCommitLock(ownerToken: string, leaseExpiresAt: string, now: string): Promise<boolean>;
  releaseRepositoryCommitLock(ownerToken: string): Promise<void>;
}
