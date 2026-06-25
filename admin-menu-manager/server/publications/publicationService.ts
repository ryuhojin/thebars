import type { PublicMenuPreviewResponse } from "../../contracts/preview";
import {
  publicationListResponseSchema,
  publicationSummarySchema,
  publishCurrentMenuResponseSchema,
  type CloudflareDeployment,
  type PublicationListResponse,
  type PublicationOperation,
  type PublicationStep,
  type PublicationSummary,
  type PublishCurrentMenuRequest,
  type PublishCurrentMenuResponse,
  type RepublishSnapshotResponse
} from "../../contracts/publications";
import type { PublicMenu, PublicMenuConcept } from "../../contracts/publicMenu";
import { calculatePublicMenuContentHash, DEFAULT_PUBLIC_MENU_CONCEPT, parsePublicMenu, stablePublicMenuStringify } from "../../contracts/publicMenu";
import { nowIso } from "../auth/crypto";
import { AuthServiceError } from "../auth/errors";
import type { AuthUserRecord } from "../auth/repository";
import type { BarLifecycleAction, BarLifecycleEventRecord, BarRecord, BarRepository, BarSettingsRecord } from "../bars/repository";
import type {
  CloudflareDeploymentAdapter,
  CloudflareDeploymentRecord,
  GitHubPublicationAdapter,
  PublicationWriteResult
} from "../integrations/publicationAdapters";
import { CloudflareDeploymentAdapterError, GitHubPublicationAdapterError } from "../integrations/publicationAdapters";
import type { MembershipRepository, MembershipRecord } from "../memberships/repository";
import type { PublicationRecord, PublicationRepository, PublicationSnapshotRecord } from "./repository";
import { ZodError } from "zod";

export type PublicationMenuBuilder = (actor: AuthUserRecord, barId: string) => Promise<PublicMenuPreviewResponse>;

export type PublicationServiceOptions = {
  now?: () => Date;
  menuBuilder: PublicationMenuBuilder;
  lockLeaseMs?: number;
  repositoryLockWaitMs?: number;
};

type BarAccess = {
  settings: BarSettingsRecord;
  membership: MembershipRecord | null;
  canPublish: boolean;
};

type BuiltPublicationMenu = {
  menu: PublicMenu;
  canonicalJson: string;
  contentHash: string;
};

const PUBLISH_COMMIT_MESSAGE = "Publish public menu";
const REPUBLISH_COMMIT_MESSAGE = "Republish historical public menu snapshot";
const DELETE_COMMIT_MESSAGE = "Deactivate bar public menu";
const RESTORE_COMMIT_MESSAGE = "Restore bar public menu";
const CLOUDFLARE_POLLING_INTERVAL_MS = 30_000;
const CLOUDFLARE_TIMEOUT_MS = 180_000;
const SUCCESS_HISTORY_LIMIT = 100;
const FAILURE_HISTORY_LIMIT = 100;
const EMPTY_CONTENT_HASH = "0".repeat(64);

type CommitPublicationInput = {
  bar: BarRecord;
  publication: PublicationRecord;
  operation: PublicationOperation;
  canonicalJson: string;
  contentHash: string;
  revision: number;
  publishedAt: string | null;
  snapshot?: {
    publicJson: string;
    publishedAt: string;
  };
  message: string;
};

export type BarLifecycleChangeResult = {
  publication: PublicationSummary;
  event: BarLifecycleEventRecord;
};

export class PublicationService {
  private readonly now: () => Date;
  private readonly lockLeaseMs: number;
  private readonly repositoryLockWaitMs: number;
  private readonly menuBuilder: PublicationMenuBuilder;

  constructor(
    private readonly barRepository: BarRepository,
    private readonly membershipRepository: MembershipRepository,
    private readonly publicationRepository: PublicationRepository,
    private readonly githubAdapter: GitHubPublicationAdapter,
    private readonly cloudflareAdapter: CloudflareDeploymentAdapter,
    options: PublicationServiceOptions
  ) {
    this.now = options.now ?? (() => new Date());
    this.menuBuilder = options.menuBuilder;
    this.lockLeaseMs = options.lockLeaseMs ?? 30_000;
    this.repositoryLockWaitMs = options.repositoryLockWaitMs ?? 1_500;
  }

  async readPublications(actor: AuthUserRecord, barId: string): Promise<PublicationListResponse> {
    const access = await this.readBarAccess(actor, barId);
    await this.reconcileWaitingDeployments(access.settings.bar);
    const built = await this.buildPublicationMenu(actor, barId, 0, null);
    const [publications, latestSuccess] = await Promise.all([
      this.publicationRepository.listPublications(barId, 25),
      this.publicationRepository.findLatestSuccessfulSnapshot(barId)
    ]);
    const hasWaitingCloudflare = publications.some((publication) => publication.status === "waiting_cloudflare");
    return publicationListResponseSchema.parse({
      bar: {
        id: access.settings.bar.id,
        name: access.settings.bar.name,
        encodedSlug: access.settings.bar.encodedSlug,
        customerPath: `/${access.settings.bar.encodedSlug}`,
        directPublishEnabled: access.settings.bar.directPublishEnabled
      },
      canPublish: access.canPublish,
      current: {
        contentHash: built.contentHash,
        schemaVersion: 1,
        menuPath: menuPath(access.settings.bar.encodedSlug),
        triggerPath: triggerPath(access.settings.bar.encodedSlug),
        savedOnlyNotice: "저장된 메뉴와 설정만 발행됩니다. 현재 화면의 미저장 변경은 포함되지 않습니다."
      },
      latestSuccess: latestSuccess ? toSummary(snapshotToPublication(latestSuccess, access.settings.bar.id)) : null,
      publications: publications.map(toSummary),
      polling: {
        active: hasWaitingCloudflare,
        intervalMs: CLOUDFLARE_POLLING_INTERVAL_MS,
        timeoutSeconds: CLOUDFLARE_TIMEOUT_MS / 1000
      },
      editDiff: {
        hasUnpublishedChanges: latestSuccess?.contentHash !== built.contentHash,
        latestContentHash: latestSuccess?.contentHash ?? null,
        currentContentHash: built.contentHash
      }
    });
  }

  async publishCurrent(
    actor: AuthUserRecord,
    barId: string,
    request: PublishCurrentMenuRequest
  ): Promise<PublishCurrentMenuResponse> {
    const access = await this.readBarAccess(actor, barId);
    if (!access.canPublish) {
      throw new AuthServiceError(403, "PUBLICATION_PERMISSION_REQUIRED", "이 바를 발행할 권한이 없습니다.");
    }

    const latestSuccess = await this.publicationRepository.findLatestSuccessfulSnapshot(barId);
    const nextRevision = latestSuccess ? latestSuccess.revision + 1 : 1;
    let built: BuiltPublicationMenu;
    try {
      built = await this.buildPublicationMenu(actor, barId, nextRevision, nowIso(this.now()), request.layoutConcept);
    } catch (error) {
      throw mapPublicationError(error);
    }
    const sameContent = latestSuccess?.contentHash === built.contentHash;
    const revision = sameContent && latestSuccess ? latestSuccess.revision : nextRevision;
    const publishedAt = sameContent && latestSuccess ? latestSuccess.publishedAt : nowIso(this.now());
    const finalMenu = sameContent && latestSuccess
      ? { ...built.menu, revision, publishedAt: latestSuccess.publishedAt }
      : { ...built.menu, revision, publishedAt };
    const finalHash = await calculatePublicMenuContentHash(finalMenu);
    const publicMenu = parsePublicMenu({ ...finalMenu, contentHash: finalHash });
    const canonicalJson = stablePublicMenuStringify(publicMenu);

    const createdAt = nowIso(this.now());
    const publication = await this.publicationRepository.createPublication({
      id: crypto.randomUUID(),
      barId,
      revision,
      contentHash: publicMenu.contentHash,
      menuPath: menuPath(access.settings.bar.encodedSlug),
      triggerPath: triggerPath(access.settings.bar.encodedSlug),
      actorUserId: actor.id,
      createdAt
    });

    const operation: PublicationOperation = sameContent ? "trigger" : "menu_json";
    const result = await this.commitPublicationWithLocks({
      bar: access.settings.bar,
      publication,
      operation,
      canonicalJson,
      contentHash: publicMenu.contentHash,
      revision,
      publishedAt,
      snapshot: {
        publicJson: canonicalJson,
        publishedAt
      },
      message: PUBLISH_COMMIT_MESSAGE
    });
    return publishCurrentMenuResponseSchema.parse(result);
  }

  async republishSnapshot(
    actor: AuthUserRecord,
    barId: string,
    publicationId: string
  ): Promise<RepublishSnapshotResponse> {
    const access = await this.readBarAccess(actor, barId);
    if (!access.canPublish) {
      throw new AuthServiceError(403, "PUBLICATION_PERMISSION_REQUIRED", "이 바를 발행할 권한이 없습니다.");
    }
    const snapshot = await this.publicationRepository.findSnapshotByPublicationId(barId, publicationId);
    if (!snapshot) {
      throw new AuthServiceError(404, "PUBLICATION_SNAPSHOT_NOT_FOUND", "재발행할 성공 공개본을 찾을 수 없습니다.");
    }
    const publicMenu = parsePublicMenu(JSON.parse(snapshot.publicJson));
    const createdAt = nowIso(this.now());
    const publication = await this.publicationRepository.createPublication({
      id: crypto.randomUUID(),
      barId,
      revision: snapshot.revision,
      contentHash: publicMenu.contentHash,
      menuPath: menuPath(access.settings.bar.encodedSlug),
      triggerPath: triggerPath(access.settings.bar.encodedSlug),
      actorUserId: actor.id,
      createdAt
    });
    const result = await this.commitPublicationWithLocks({
      bar: access.settings.bar,
      publication,
      operation: "snapshot_republish",
      canonicalJson: snapshot.publicJson,
      contentHash: publicMenu.contentHash,
      revision: snapshot.revision,
      publishedAt: snapshot.publishedAt,
      snapshot: {
        publicJson: snapshot.publicJson,
        publishedAt: snapshot.publishedAt
      },
      message: REPUBLISH_COMMIT_MESSAGE
    });
    return publishCurrentMenuResponseSchema.parse(result);
  }

  async changeBarLifecycle(
    actor: AuthUserRecord,
    barId: string,
    action: BarLifecycleAction
  ): Promise<BarLifecycleChangeResult> {
    assertSystemAdmin(actor);
    const settings = await this.barRepository.readBarSettings(barId);
    if (!settings) throw new AuthServiceError(404, "BAR_NOT_FOUND", "바를 찾을 수 없습니다.");
    if (action === "deactivate") return this.deactivateBar(actor, settings);
    return this.activateBar(actor, settings);
  }

  private async deactivateBar(actor: AuthUserRecord, settings: BarSettingsRecord): Promise<BarLifecycleChangeResult> {
    const bar = settings.bar;
    if (bar.status === "inactive") {
      throw new AuthServiceError(409, "BAR_ALREADY_INACTIVE", "이미 비활성 상태입니다.");
    }
    const latestSnapshot = await this.publicationRepository.findLatestSuccessfulSnapshot(bar.id);
    const createdAt = nowIso(this.now());
    const publication = await this.publicationRepository.createPublication({
      id: crypto.randomUUID(),
      barId: bar.id,
      revision: latestSnapshot?.revision ?? 0,
      contentHash: latestSnapshot?.contentHash ?? EMPTY_CONTENT_HASH,
      menuPath: menuPath(bar.encodedSlug),
      triggerPath: triggerPath(bar.encodedSlug),
      actorUserId: actor.id,
      createdAt
    });
    const result = await this.commitPublicationWithLocks({
      bar,
      publication,
      operation: "delete_menu_json",
      canonicalJson: "",
      contentHash: latestSnapshot?.contentHash ?? EMPTY_CONTENT_HASH,
      revision: latestSnapshot?.revision ?? 0,
      publishedAt: latestSnapshot?.publishedAt ?? null,
      message: DELETE_COMMIT_MESSAGE
    });
    const afterStatus = result.publication.status === "success" ? "inactive" : bar.status;
    if (result.publication.status === "success") {
      await this.barRepository.updateBarStatus(bar.id, "inactive", "preparing", nowIso(this.now()));
    }
    const event = await this.barRepository.createLifecycleEvent({
      id: crypto.randomUUID(),
      barId: bar.id,
      action: "deactivate",
      beforeStatus: bar.status,
      afterStatus,
      publicationId: result.publication.id,
      result:
        result.publication.status === "success"
          ? "고객 메뉴판 데이터를 내리고 배포 성공을 확인했습니다. 고객 경로는 비공개 상태가 됩니다."
          : `고객 메뉴판 비활성화 배포 상태가 ${publicationStatusLabel(result.publication.status)}입니다. 바 상태는 아직 변경하지 않았습니다.`,
      actorUserId: actor.id,
      createdAt: nowIso(this.now())
    });
    return { publication: result.publication, event };
  }

  private async activateBar(actor: AuthUserRecord, settings: BarSettingsRecord): Promise<BarLifecycleChangeResult> {
    const bar = settings.bar;
    if (bar.status === "active") {
      throw new AuthServiceError(409, "BAR_ALREADY_ACTIVE", "이미 활성 상태입니다.");
    }
    const latestSnapshot = await this.publicationRepository.findLatestSuccessfulSnapshot(bar.id);
    const prepared = latestSnapshot
      ? {
          operation: "restore_snapshot" as const,
          canonicalJson: latestSnapshot.publicJson,
          contentHash: latestSnapshot.contentHash,
          revision: latestSnapshot.revision,
          publishedAt: latestSnapshot.publishedAt,
          snapshot: { publicJson: latestSnapshot.publicJson, publishedAt: latestSnapshot.publishedAt },
          message: RESTORE_COMMIT_MESSAGE,
          publicMenuStatus: "published" as const
        }
      : await this.buildPreparingRestore(settings);
    const createdAt = nowIso(this.now());
    const publication = await this.publicationRepository.createPublication({
      id: crypto.randomUUID(),
      barId: bar.id,
      revision: prepared.revision,
      contentHash: prepared.contentHash,
      menuPath: menuPath(bar.encodedSlug),
      triggerPath: triggerPath(bar.encodedSlug),
      actorUserId: actor.id,
      createdAt
    });
    const result = await this.commitPublicationWithLocks({
      bar,
      publication,
      operation: prepared.operation,
      canonicalJson: prepared.canonicalJson,
      contentHash: prepared.contentHash,
      revision: prepared.revision,
      publishedAt: prepared.publishedAt,
      snapshot: prepared.snapshot,
      message: prepared.message
    });
    const afterStatus = result.publication.status === "success" ? "active" : bar.status;
    if (result.publication.status === "success") {
      await this.barRepository.updateBarStatus(bar.id, "active", prepared.publicMenuStatus, nowIso(this.now()));
    }
    const event = await this.barRepository.createLifecycleEvent({
      id: crypto.randomUUID(),
      barId: bar.id,
      action: "activate",
      beforeStatus: bar.status,
      afterStatus,
      publicationId: result.publication.id,
      result:
        result.publication.status === "success"
          ? prepared.operation === "restore_snapshot"
            ? "마지막 성공 공개본을 고객 메뉴판으로 복원했습니다."
            : "성공 공개본이 없어 준비 중 고객 메뉴판으로 복원했습니다."
          : `고객 메뉴판 복원 배포 상태가 ${publicationStatusLabel(result.publication.status)}입니다. 바 상태는 아직 변경하지 않았습니다.`,
      actorUserId: actor.id,
      createdAt: nowIso(this.now())
    });
    return { publication: result.publication, event };
  }

  private async buildPublicationMenu(
    actor: AuthUserRecord,
    barId: string,
    revision: number,
    publishedAt: string | null,
    layoutConcept: PublicMenuConcept = DEFAULT_PUBLIC_MENU_CONCEPT
  ): Promise<BuiltPublicationMenu> {
    const preview = await this.menuBuilder(actor, barId);
    const draft: PublicMenu = {
      ...preview.menu,
      layout: { concept: layoutConcept },
      status: "published",
      revision,
      publishedAt,
      contentHash: preview.menu.contentHash
    };
    const contentHash = await calculatePublicMenuContentHash(draft);
    const menu = parsePublicMenu({ ...draft, contentHash });
    return {
      menu,
      contentHash,
      canonicalJson: stablePublicMenuStringify(menu)
    };
  }

  private async buildPreparingRestore(settings: BarSettingsRecord): Promise<{
    operation: "restore_preparing";
    canonicalJson: string;
    contentHash: string;
    revision: 0;
    publishedAt: null;
    snapshot?: undefined;
    message: string;
    publicMenuStatus: "preparing";
  }> {
    const barInfo: PublicMenu["bar"] = {
      name: settings.bar.name,
      currency: settings.bar.currency,
      businessHours: settings.businessHours.map((range) => ({
        dayOfWeek: range.dayOfWeek,
        opensAt: range.opensAt,
        closesAt: range.closesAt
      })),
      links: settings.links.map((link) => ({ label: link.label, url: link.url }))
    };
    if (settings.bar.description.trim()) barInfo.intro = settings.bar.description.trim();
    if (settings.bar.address.trim()) barInfo.address = settings.bar.address.trim();
    if (settings.bar.mapUrl.trim()) barInfo.mapUrl = settings.bar.mapUrl.trim();
    if (settings.bar.phoneNumberDigits.trim()) barInfo.phoneNumberDisplay = formatKoreanPhoneNumber(settings.bar.phoneNumberDigits);
    if (settings.bar.openingNote.trim()) barInfo.openingNote = settings.bar.openingNote.trim();

    const draft: Omit<PublicMenu, "contentHash"> = {
      schemaVersion: 1,
      status: "preparing",
      layout: { concept: DEFAULT_PUBLIC_MENU_CONCEPT },
      revision: 0,
      publishedAt: null,
      generatedAt: nowIso(this.now()),
      encodedSlug: settings.bar.encodedSlug,
      bar: barInfo,
      categories: []
    };
    const contentHash = await calculatePublicMenuContentHash(draft);
    const menu = parsePublicMenu({ ...draft, contentHash });
    return {
      operation: "restore_preparing",
      canonicalJson: stablePublicMenuStringify(menu),
      contentHash,
      revision: 0,
      publishedAt: null,
      message: RESTORE_COMMIT_MESSAGE,
      publicMenuStatus: "preparing"
    };
  }

  private async commitPublicationWithLocks(input: CommitPublicationInput): Promise<PublishCurrentMenuResponse> {
    const barLockToken = `bar:${input.publication.id}:${crypto.randomUUID()}`;
    const repoLockToken = `repo:${input.publication.id}:${crypto.randomUUID()}`;
    let barLockHeld = false;
    let repoLockHeld = false;

    try {
      barLockHeld = await this.publicationRepository.acquireBarLock(
        input.bar.id,
        barLockToken,
        leaseExpiresAt(this.now(), this.lockLeaseMs),
        nowIso(this.now())
      );
      if (!barLockHeld) {
        throw new AuthServiceError(409, "PUBLICATION_LOCKED", "이 바의 발행이 이미 진행 중입니다.");
      }

      await this.publicationRepository.updatePublication({ id: input.publication.id, status: "building_json" });
      await this.publicationRepository.updatePublication({ id: input.publication.id, status: "validating_json" });
      if (input.operation !== "delete_menu_json") parsePublicMenu(JSON.parse(input.canonicalJson));

      repoLockHeld = await this.acquireRepositoryCommitLock(repoLockToken);
      if (!repoLockHeld) {
        throw new AuthServiceError(409, "REPOSITORY_COMMIT_BUSY", "고객 저장소 커밋이 진행 중입니다. 잠시 후 다시 시도하세요.");
      }

      await this.publicationRepository.updatePublication({ id: input.publication.id, status: "committing_github" });
      const commit = await this.commitToGitHub(
        input.operation,
        input.bar.encodedSlug,
        input.canonicalJson,
        input.contentHash,
        input.publication.id,
        input.message
      );
      if (input.snapshot) {
        await this.publicationRepository.createSnapshot({
          id: crypto.randomUUID(),
          publicationId: input.publication.id,
          barId: input.bar.id,
          revision: input.revision,
          contentHash: input.contentHash,
          publicJson: input.snapshot.publicJson,
          menuPath: menuPath(input.bar.encodedSlug),
          commitSha: commit.commitSha,
          publishedAt: input.snapshot.publishedAt,
          createdAt: nowIso(this.now())
        });
      }
      const waiting = await this.publicationRepository.updatePublication({
        id: input.publication.id,
        status: "waiting_cloudflare",
        operation: input.operation,
        revision: input.revision,
        publishedAt: input.publishedAt,
        commitSha: commit.commitSha,
        deploymentStatus: "queued",
        deploymentSourceCommitSha: commit.commitSha,
        deploymentStartedAt: nowIso(this.now()),
        deploymentCheckedAt: null,
        deploymentCompletedAt: null,
        errorCode: null,
        errorMessage: null
      });
      if (!waiting) throw new Error("PUBLICATION_UPDATE_FAILED");
      await this.publicationRepository.releaseRepositoryCommitLock(repoLockToken);
      repoLockHeld = false;
      await this.publicationRepository.releaseBarLock(input.bar.id, barLockToken);
      barLockHeld = false;
      await this.cloudflareAdapter.observeCommit({
        encodedSlug: input.bar.encodedSlug,
        commitSha: commit.commitSha,
        publicationId: input.publication.id
      });
      const checked = await this.reconcilePublicationDeployment(input.bar, waiting);
      return publishCurrentMenuResponseSchema.parse({
        publication: toSummary(checked),
        commit: {
          adapter: commit.adapter,
          operation: commit.operation,
          path: commit.path,
          commitSha: commit.commitSha,
          message: commit.message,
          skippedExternalWrite: commit.skippedExternalWrite
        },
        deployment: toDeployment(checked)
      });
    } catch (error) {
      const mapped = mapPublicationError(error);
      await this.publicationRepository.updatePublication({
        id: input.publication.id,
        status: "failed",
        errorCode: mapped.code,
        errorMessage: mapped.message,
        completedAt: nowIso(this.now())
      });
      throw mapped;
    } finally {
      if (repoLockHeld) await this.publicationRepository.releaseRepositoryCommitLock(repoLockToken);
      if (barLockHeld) await this.publicationRepository.releaseBarLock(input.bar.id, barLockToken);
    }
  }

  private async commitToGitHub(
    operation: PublicationOperation,
    encodedSlug: string,
    canonicalJson: string,
    contentHash: string,
    publicationId: string,
    message: string
  ): Promise<PublicationWriteResult> {
    const path = operation === "trigger" ? triggerPath(encodedSlug) : menuPath(encodedSlug);
    const current = await this.githubAdapter.readFile(path);
    if (operation === "delete_menu_json") {
      return this.githubAdapter.deleteFile({
        operation,
        path,
        expectedSha: current?.sha ?? null,
        message
      });
    }
    const content = operation === "trigger"
      ? stablePublicMenuStringify({
          schemaVersion: 1,
          encodedSlug,
          contentHash,
          publicationId,
          triggeredAt: nowIso(this.now()),
          reason: "same_content_republish"
        })
      : canonicalJson;
    return this.githubAdapter.writeFile({
      operation,
      path,
      content,
      expectedSha: current?.sha ?? null,
      message
    });
  }

  private async acquireRepositoryCommitLock(ownerToken: string): Promise<boolean> {
    const started = Date.now();
    while (Date.now() - started <= this.repositoryLockWaitMs) {
      const acquired = await this.publicationRepository.acquireRepositoryCommitLock(
        ownerToken,
        leaseExpiresAt(this.now(), this.lockLeaseMs),
        nowIso(this.now())
      );
      if (acquired) return true;
      await delay(25);
    }
    return false;
  }

  private async readBarAccess(actor: AuthUserRecord, barId: string): Promise<BarAccess> {
    const settings = await this.barRepository.readBarSettings(barId);
    if (!settings || settings.bar.status !== "active") {
      throw new AuthServiceError(404, "BAR_NOT_FOUND", "바를 찾을 수 없습니다.");
    }
    if (actor.isSystemAdmin) return { settings, membership: null, canPublish: true };
    const membership = await this.membershipRepository.findActiveMembershipForUser(barId, actor.id);
    if (!membership) {
      throw new AuthServiceError(404, "BAR_NOT_FOUND", "바를 찾을 수 없습니다.");
    }
    return {
      settings,
      membership,
      canPublish: membership.role === "owner" && settings.bar.directPublishEnabled
    };
  }

  private async reconcileWaitingDeployments(bar: BarRecord): Promise<void> {
    const waiting = await this.publicationRepository.listWaitingCloudflarePublications(bar.id, 20);
    for (const publication of waiting) {
      await this.reconcilePublicationDeployment(bar, publication);
    }
  }

  private async reconcilePublicationDeployment(bar: BarRecord, publication: PublicationRecord): Promise<PublicationRecord> {
    if (publication.status !== "waiting_cloudflare" || !publication.commitSha) return publication;
    const checkedAt = nowIso(this.now());
    const startedAt = publication.deploymentStartedAt ?? publication.createdAt;
    if (this.now().getTime() - Date.parse(startedAt) >= CLOUDFLARE_TIMEOUT_MS) {
      const timedOut = await this.publicationRepository.updatePublication({
        id: publication.id,
        status: "timeout_unknown",
        deploymentStatus: "timeout_unknown",
        deploymentCheckedAt: checkedAt,
        errorCode: "CLOUDFLARE_TIMEOUT_UNKNOWN",
        errorMessage: "3분 안에 대상 반영 번호의 고객 화면 배포 성공 여부를 확인하지 못했습니다.",
        completedAt: checkedAt
      });
      if (!timedOut) throw new Error("PUBLICATION_UPDATE_FAILED");
      await this.publicationRepository.prunePublicationHistory(bar.id, SUCCESS_HISTORY_LIMIT, FAILURE_HISTORY_LIMIT);
      return timedOut;
    }

    let deployments: CloudflareDeploymentRecord[];
    try {
      deployments = await this.cloudflareAdapter.listRecentDeployments();
    } catch (error) {
      const mapped = mapPublicationError(error);
      const failed = await this.publicationRepository.updatePublication({
        id: publication.id,
        status: "failed",
        deploymentStatus: "failed",
        deploymentCheckedAt: checkedAt,
        errorCode: mapped.code,
        errorMessage: mapped.message,
        completedAt: checkedAt
      });
      if (!failed) throw new Error("PUBLICATION_UPDATE_FAILED");
      await this.publicationRepository.prunePublicationHistory(bar.id, SUCCESS_HISTORY_LIMIT, FAILURE_HISTORY_LIMIT);
      return failed;
    }

    const deployment = deployments.find((candidate) => candidate.sourceCommitSha === publication.commitSha);
    if (!deployment) {
      const queued = await this.publicationRepository.updatePublication({
        id: publication.id,
        status: "waiting_cloudflare",
        deploymentStatus: "queued",
        deploymentSourceCommitSha: publication.commitSha,
        deploymentCheckedAt: checkedAt
      });
      if (!queued) throw new Error("PUBLICATION_UPDATE_FAILED");
      return queued;
    }

    if (deployment.status === "success") {
      await this.barRepository.updatePublicMenuStatus(bar.id, publicMenuStatusAfterSuccess(publication.operation), checkedAt);
      const completed = await this.publicationRepository.updatePublication({
        id: publication.id,
        status: "success",
        deploymentId: deployment.deploymentId,
        deploymentStatus: "success",
        deploymentSourceCommitSha: deployment.sourceCommitSha,
        deploymentUrl: deployment.deploymentUrl,
        deploymentCheckedAt: checkedAt,
        deploymentCompletedAt: deployment.updatedAt,
        errorCode: null,
        errorMessage: null,
        completedAt: checkedAt
      });
      if (!completed) throw new Error("PUBLICATION_UPDATE_FAILED");
      await this.publicationRepository.prunePublicationHistory(bar.id, SUCCESS_HISTORY_LIMIT, FAILURE_HISTORY_LIMIT);
      return completed;
    }

    if (deployment.status === "failed") {
      const failed = await this.publicationRepository.updatePublication({
        id: publication.id,
        status: "failed",
        deploymentId: deployment.deploymentId,
        deploymentStatus: "failed",
        deploymentSourceCommitSha: deployment.sourceCommitSha,
        deploymentUrl: deployment.deploymentUrl,
        deploymentCheckedAt: checkedAt,
        deploymentCompletedAt: deployment.updatedAt,
        errorCode: "CLOUDFLARE_DEPLOYMENT_FAILED",
        errorMessage: "대상 반영 번호의 고객 화면 배포가 실패했습니다.",
        completedAt: checkedAt
      });
      if (!failed) throw new Error("PUBLICATION_UPDATE_FAILED");
      await this.publicationRepository.prunePublicationHistory(bar.id, SUCCESS_HISTORY_LIMIT, FAILURE_HISTORY_LIMIT);
      return failed;
    }

    const waiting = await this.publicationRepository.updatePublication({
      id: publication.id,
      status: "waiting_cloudflare",
      deploymentId: deployment.deploymentId,
      deploymentStatus: deployment.status,
      deploymentSourceCommitSha: deployment.sourceCommitSha,
      deploymentUrl: deployment.deploymentUrl,
      deploymentCheckedAt: checkedAt
    });
    if (!waiting) throw new Error("PUBLICATION_UPDATE_FAILED");
    return waiting;
  }
}

export function toSummary(record: PublicationRecord): PublicationSummary {
  return publicationSummarySchema.parse({
    id: record.id,
    barId: record.barId,
    status: record.status,
    operation: record.operation,
    revision: record.revision,
    contentHash: record.contentHash,
    menuPath: record.menuPath,
    triggerPath: record.triggerPath,
    publishedAt: record.publishedAt,
    commitSha: record.commitSha,
    deployment: toDeployment(record),
    createdAt: record.createdAt,
    completedAt: record.completedAt,
    error: record.errorCode && record.errorMessage ? { code: record.errorCode, message: record.errorMessage } : null,
    steps: stepsFor(record)
  });
}

function stepsFor(record: PublicationRecord): PublicationStep[] {
  const failedStep = record.status === "failed" || record.status === "timeout_unknown" ? failedStepFor(record.errorCode) : null;
  return [
    {
      id: "building_json",
      label: "저장 데이터 수집",
      status: stepStatus(record, "building_json", failedStep),
      at: record.status === "pending" ? null : record.createdAt
    },
    {
      id: "validating_json",
      label: "공개 데이터 검증",
      status: stepStatus(record, "validating_json", failedStep),
      at: ["validating_json", "committing_github", "success", "failed", "timeout_unknown"].includes(record.status)
        ? record.createdAt
        : null
    },
    {
      id: "committing_github",
      label: "고객 메뉴판 반영",
      status: stepStatus(record, "committing_github", failedStep),
      at: ["committing_github", "waiting_cloudflare", "success", "failed", "timeout_unknown"].includes(record.status)
        ? record.createdAt
        : null
    },
    {
      id: "waiting_cloudflare",
      label: "고객 화면 배포 확인",
      status: cloudflareStepStatus(record, failedStep),
      at: record.deploymentStartedAt
    },
    {
      id: "completed",
      label: "배포 상태 기록",
      status: record.status === "success" ? "completed" : ["failed", "timeout_unknown"].includes(record.status) ? "failed" : "pending",
      at: record.completedAt
    }
  ];
}

function stepStatus(
  record: PublicationRecord,
  step: "building_json" | "validating_json" | "committing_github",
  failedStep: "building_json" | "validating_json" | "committing_github" | "waiting_cloudflare" | null
): PublicationStep["status"] {
  if (["waiting_cloudflare", "success", "timeout_unknown"].includes(record.status)) return "completed";
  if (record.status === "failed" && failedStep === "waiting_cloudflare") return "completed";
  if (record.status === "success") return "completed";
  if (failedStep === step) return "failed";
  const order = ["building_json", "validating_json", "committing_github"] as const;
  const currentIndex = order.indexOf(record.status as (typeof order)[number]);
  const stepIndex = order.indexOf(step);
  if (currentIndex === stepIndex) return "active";
  if (currentIndex > stepIndex || record.status === "failed") return "completed";
  return "pending";
}

function cloudflareStepStatus(
  record: PublicationRecord,
  failedStep: "building_json" | "validating_json" | "committing_github" | "waiting_cloudflare" | null
): PublicationStep["status"] {
  if (record.status === "success") return "completed";
  if (failedStep === "waiting_cloudflare" || record.status === "timeout_unknown") return "failed";
  if (record.status === "waiting_cloudflare") return "active";
  if (record.status === "failed") return "pending";
  return "pending";
}

function failedStepFor(errorCode: string | null): "building_json" | "validating_json" | "committing_github" | "waiting_cloudflare" {
  if (errorCode === "PUBLIC_SCHEMA_INVALID") return "validating_json";
  if (errorCode?.startsWith("GITHUB") || errorCode === "REPOSITORY_COMMIT_BUSY") return "committing_github";
  if (errorCode?.startsWith("CLOUDFLARE")) return "waiting_cloudflare";
  return "building_json";
}

function snapshotToPublication(snapshot: PublicationSnapshotRecord, barId: string): PublicationRecord {
  return {
    id: snapshot.publicationId,
    barId,
    status: "success",
    operation: "menu_json",
    revision: snapshot.revision,
    contentHash: snapshot.contentHash,
    menuPath: snapshot.menuPath,
    triggerPath: triggerPath(snapshot.menuPath.replace(/^public\/menus\/(.+)\.json$/, "$1")),
    publishedAt: snapshot.publishedAt,
    commitSha: snapshot.commitSha,
    deploymentId: `snapshot-${snapshot.publicationId}`,
    deploymentStatus: "success",
    deploymentSourceCommitSha: snapshot.commitSha,
    deploymentUrl: `https://fake-cloudflare.example.test/snapshots/${snapshot.publicationId}`,
    deploymentStartedAt: snapshot.createdAt,
    deploymentCheckedAt: snapshot.createdAt,
    deploymentCompletedAt: snapshot.createdAt,
    actorUserId: null,
    errorCode: null,
    errorMessage: null,
    createdAt: snapshot.createdAt,
    completedAt: snapshot.createdAt
  };
}

function toDeployment(record: PublicationRecord): CloudflareDeployment {
  if (!record.deploymentStatus && !record.deploymentId && !record.commitSha) return null;
  return {
    adapter: "fake-cloudflare",
    deploymentId: record.deploymentId,
    status: record.deploymentStatus ?? "queued",
    sourceCommitSha: record.deploymentSourceCommitSha ?? record.commitSha,
    deploymentUrl: record.deploymentUrl,
    startedAt: record.deploymentStartedAt,
    checkedAt: record.deploymentCheckedAt,
    completedAt: record.deploymentCompletedAt,
    skippedExternalRead: true
  };
}

function mapPublicationError(error: unknown): AuthServiceError {
  if (error instanceof AuthServiceError) return error;
  if (error instanceof GitHubPublicationAdapterError) {
    if (error.code === "GITHUB_CONFIG_MISSING") {
      return new AuthServiceError(500, "GITHUB_PUBLICATION_NOT_CONFIGURED", "고객 저장소 발행 설정이 완료되지 않았습니다.");
    }
    if (error.code === "GITHUB_FILE_SHA_CONFLICT") {
      return new AuthServiceError(409, "GITHUB_FILE_SHA_CONFLICT", "고객 저장소 파일이 변경되었습니다. 다시 발행하세요.");
    }
    return new AuthServiceError(502, "GITHUB_COMMIT_FAILED", "고객 메뉴판 반영 단계에서 실패했습니다.");
  }
  if (error instanceof CloudflareDeploymentAdapterError) {
    return new AuthServiceError(502, "CLOUDFLARE_DEPLOYMENT_LOOKUP_FAILED", "고객 화면 배포 상태를 확인하지 못했습니다.");
  }
  if (error instanceof ZodError || (error instanceof Error && /Forbidden public menu field|Invalid|schema|Zod/i.test(error.message))) {
    return new AuthServiceError(422, "PUBLIC_SCHEMA_INVALID", "공개 데이터 검증에 실패했습니다.");
  }
  return new AuthServiceError(500, "PUBLICATION_FAILED", "발행을 완료하지 못했습니다.");
}

function assertSystemAdmin(actor: AuthUserRecord): void {
  if (!actor.isSystemAdmin) {
    throw new AuthServiceError(403, "SYSTEM_ADMIN_REQUIRED", "시스템 관리자만 사용할 수 있습니다.");
  }
}

function publicMenuStatusAfterSuccess(operation: PublicationOperation | null): "preparing" | "published" {
  if (operation === "delete_menu_json" || operation === "restore_preparing") return "preparing";
  return "published";
}

function publicationStatusLabel(status: PublicationSummary["status"]): string {
  if (status === "success") return "완료";
  if (status === "failed") return "실패";
  if (status === "timeout_unknown") return "확인 필요";
  if (status === "waiting_cloudflare") return "배포 확인 중";
  if (status === "committing_github") return "반영 중";
  if (status === "validating_json") return "검증 중";
  if (status === "building_json") return "데이터 준비";
  return "대기";
}

function formatKoreanPhoneNumber(digits: string): string {
  if (!digits) return "";
  if (digits.startsWith("02")) {
    if (digits.length === 9) return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`;
    if (digits.length === 10) return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 8) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  return digits;
}

function menuPath(encodedSlug: string): string {
  return `public/menus/${encodedSlug}.json`;
}

function triggerPath(encodedSlug: string): string {
  return `public/publish-triggers/${encodedSlug}.json`;
}

function leaseExpiresAt(now: Date, leaseMs: number): string {
  return new Date(now.getTime() + leaseMs).toISOString();
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
