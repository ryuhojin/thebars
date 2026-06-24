import type { ItemTemplate } from "../../contracts/itemTypes";
import {
  pilotReadinessResponseSchema,
  type PilotBarReadiness,
  type PilotReadinessCheck,
  type PilotReadinessResponse,
  type PilotReadinessSection,
  type PilotReadinessStatus
} from "../../contracts/pilotReadiness";
import { AuthServiceError } from "../auth/errors";
import type { AuthUserRecord } from "../auth/repository";
import type { BarRecord, BarRepository } from "../bars/repository";
import type { CategoryRepository } from "../categories/repository";
import type { MembershipRepository } from "../memberships/repository";
import type { MenuItemRepository } from "../menu-items/repository";
import type { OrderTabRepository } from "../order-tabs/repository";
import type { PublicationRepository } from "../publications/repository";

const representativeTemplates: ItemTemplate[] = ["wine", "whisky", "cocktail", "food", "cigar"];

export class PilotReadinessService {
  private readonly now: () => Date;

  constructor(
    private readonly barRepository: BarRepository,
    private readonly membershipRepository: MembershipRepository,
    private readonly categoryRepository: CategoryRepository,
    private readonly menuItemRepository: MenuItemRepository,
    private readonly orderTabRepository: OrderTabRepository,
    private readonly publicationRepository: PublicationRepository,
    options: { now?: () => Date } = {}
  ) {
    this.now = options.now ?? (() => new Date());
  }

  async readReadiness(actor: AuthUserRecord): Promise<PilotReadinessResponse> {
    assertSystemAdmin(actor);
    const bars = await this.barRepository.listBars();
    const pilotBars = await Promise.all(
      bars
        .filter((bar) => bar.status === "active")
        .slice(0, 2)
        .map((bar) => this.toPilotBar(bar))
    );
    const templateCoverage = new Set(pilotBars.flatMap((bar) => bar.representativeTemplates));
    const missingTemplates = representativeTemplates.filter((template) => !templateCoverage.has(template));
    const hasTwoBars = pilotBars.length >= 2;
    const hasRoleCoverage = pilotBars.length > 0 && pilotBars.every((bar) => bar.roleCoverage.owner && bar.roleCoverage.manager && bar.roleCoverage.staff);
    const hasRepresentativeData = missingTemplates.length === 0;
    const hasOrderScenario = pilotBars.some(
      (bar) => bar.orderSummary.open > 0 && bar.orderSummary.checkoutRequested > 0 && bar.orderSummary.closed > 0
    );

    const sections: PilotReadinessSection[] = [
      section("environment", "환경·배포", [
        check("d1-separation", "검증·운영 데이터베이스 분리", "manual_required", "운영", "검증 환경과 운영 환경의 데이터베이스 이름과 연결 정보를 운영 문서에서 분리 확인합니다.", "docs/operations/pilot-runbook.md#previewproduction-d1"),
        check("secret-checklist", "비밀값 점검표", "manual_required", "운영", "필수 비밀값은 이름만 점검하고 실제 값은 저장하지 않습니다.", "docs/operations/pilot-runbook.md#secret-checklist"),
        check("customer-pages", "고객 저장소·Pages 연결 절차", "manual_required", "운영", "고객 저장소와 Pages 연결 절차를 운영 문서에 고정했습니다.", "docs/operations/pilot-runbook.md#customer-repo-pages"),
        check("backup-rollback", "마이그레이션 백업·복구 절차", "manual_required", "운영", "데이터 내보내기, 사전 검증, 복구 절차를 운영 문서에 고정했습니다.", "docs/operations/pilot-runbook.md#migration-backup-rollback"),
        check("token-rotation", "GitHub·Cloudflare 토큰 교체 절차", "manual_required", "운영", "토큰 교체와 폐기 순서를 운영 문서에 고정했습니다.", "docs/operations/pilot-runbook.md#token-rotation"),
        check("monitoring-contact", "모니터링과 장애 연락 절차", "manual_required", "운영", "장애 등급과 연락 절차를 운영 문서에 고정했습니다.", "docs/operations/pilot-runbook.md#monitoring-incident")
      ]),
      section("pilot-data", "파일럿 데이터", [
        check("two-bars", "테스트 바와 실제 바 등록 절차", hasTwoBars ? "pass" : "action_required", "시스템 관리자", hasTwoBars ? `${pilotBars.length}개 활성 바가 준비되었습니다.` : "활성 바 2개 이상이 필요합니다.", "docs/operations/pilot-runbook.md#pilot-data"),
        check("role-coverage", "오너·매니저·스태프 권한 검증", hasRoleCoverage ? "pass" : "action_required", "시스템 관리자", hasRoleCoverage ? "파일럿 후보 바에 오너·매니저·스태프 활성 멤버가 있습니다." : "각 파일럿 바에 오너·매니저·스태프 활성 멤버가 필요합니다.", "docs/operations/operator-training.md#roles"),
        check("representative-menu", "대표 와인·위스키·칵테일·푸드·시가 데이터", hasRepresentativeData ? "pass" : "action_required", "메뉴 담당자", hasRepresentativeData ? "대표 품목 유형 5종이 샘플 데이터와 저장소 상태에서 확인됩니다." : `누락 유형: ${missingTemplates.map(templateLabel).join(", ")}`, "docs/operations/pilot-runbook.md#representative-menu-data"),
        check("publication-scenario", "준비·발행·재발행·비활성화 시나리오", "manual_required", "시스템 관리자", "자동 검증된 흐름을 검증용 고객 화면에서 다시 실행해야 합니다.", "docs/operations/pilot-runbook.md#publication-lifecycle"),
        check("order-scenario", "주문 생성·추가·조정·정산 시나리오", hasOrderScenario ? "pass" : "action_required", "매니저", hasOrderScenario ? "열린 주문, 계산 요청, 정산 완료 주문 샘플이 준비되었습니다." : "열린 주문, 계산 요청, 정산 완료 주문 샘플이 필요합니다.", "docs/operations/operator-training.md#orders")
      ]),
      section("device-acceptance", "실제 기기 인수", [
        check("phones", "최소 2종 휴대폰", "manual_required", "파일럿 담당자", "390px 자동 검증 후 실제 휴대폰 2종에서 같은 URL을 확인해야 합니다.", "docs/operations/pilot-runbook.md#device-acceptance"),
        check("tablet", "최소 1종 태블릿 세로/가로", "manual_required", "파일럿 담당자", "768px 자동 검증 후 실제 태블릿 회전 확인이 필요합니다.", "docs/operations/pilot-runbook.md#device-acceptance"),
        check("desktop", "데스크톱 브라우저", "manual_required", "파일럿 담당자", "1440px 자동 검증 후 현장 데스크톱 브라우저 확인이 필요합니다.", "docs/operations/pilot-runbook.md#device-acceptance"),
        check("same-url", "동일 URL과 화면 회전 확인", "manual_required", "파일럿 담당자", "자동 검증과 현장 회전 점검을 함께 기록합니다.", "docs/operations/pilot-runbook.md#device-acceptance"),
        check("network-delay", "현장 네트워크 지연 시 오류 메시지", "manual_required", "파일럿 담당자", "발행·주문·고객 메뉴 지연 메시지를 현장 네트워크에서 확인합니다.", "docs/operations/pilot-runbook.md#network-delay"),
        check("operator-training", "운영자 교육 문서", "manual_required", "파일럿 담당자", "운영자 교육 문서를 따라 역할별 핵심 흐름을 리허설합니다.", "docs/operations/operator-training.md")
      ]),
      section("release-gate", "출시 Gate", [
        check("p0-p1", "P0/P1 결함 0건", "manual_required", "파일럿 담당자", "파일럿 피드백 문서의 결함 기록에서 P0/P1 열린 항목 0건을 확인합니다.", "docs/operations/pilot-feedback.md#defect-ledger"),
        check("security-approval", "보안 체크 승인", "manual_required", "보안 담당자", "보안 검증 통과 후 사람 승인 서명이 필요합니다.", "docs/operations/pilot-runbook.md#release-gate"),
        check("backup-restore", "백업·복구 연습", "manual_required", "운영", "검증 환경에서 백업과 복구 리허설을 완료해야 합니다.", "docs/operations/pilot-runbook.md#migration-backup-rollback"),
        check("last-success-menu", "마지막 성공 고객 메뉴판 보존 확인", "manual_required", "운영", "발행 실패 후 마지막 성공 공개본 복원 가능성을 확인해야 합니다.", "docs/operations/pilot-runbook.md#publication-lifecycle"),
        check("feedback-backlog", "파일럿 피드백 기록과 후속 과제", "manual_required", "파일럿 담당자", "피드백 문서에 결함과 후속 과제를 기록합니다.", "docs/operations/pilot-feedback.md"),
        check("human-production-approval", "사람의 운영 배포 승인", "manual_required", "오너", "Codex는 운영 배포를 수행하지 않고 승인 전 대기합니다.", "docs/operations/pilot-runbook.md#release-gate")
      ])
    ];

    return pilotReadinessResponseSchema.parse({
      generatedAt: this.now().toISOString(),
      overallStatus: sections.some((item) => item.status === "action_required") ? "action_required" : "ready_for_pilot",
      humanApprovalRequired: true,
      pilotBars,
      sections,
      runbooks: [
        { id: "pilot-runbook", label: "파일럿 운영 runbook", href: "docs/operations/pilot-runbook.md" },
        { id: "operator-training", label: "운영자 교육 문서", href: "docs/operations/operator-training.md" },
        { id: "pilot-feedback", label: "파일럿 피드백·backlog", href: "docs/operations/pilot-feedback.md" }
      ]
    });
  }

  private async toPilotBar(bar: BarRecord): Promise<PilotBarReadiness> {
    const [memberships, categories, menuItems, orderSummary, publications, latestSnapshot] = await Promise.all([
      this.membershipRepository.listMemberships(bar.id),
      this.categoryRepository.listCategories(bar.id),
      this.menuItemRepository.listMenuItems(bar.id),
      this.orderTabRepository.readOrderTabSummary(bar.id),
      this.publicationRepository.listPublications(bar.id, 20),
      this.publicationRepository.findLatestSuccessfulSnapshot(bar.id)
    ]);
    const representativeTemplateSet = new Set<ItemTemplate>();
    await Promise.all(
      menuItems.map(async (item) => {
        const details = await this.menuItemRepository.findMenuItemDetails(bar.id, item.id);
        if (details) representativeTemplateSet.add(details.template);
      })
    );
    const activeRoles = new Set(memberships.filter((membership) => membership.isActive).map((membership) => membership.role));
    return {
      id: bar.id,
      name: bar.name,
      status: bar.status,
      encodedSlug: bar.encodedSlug,
      roleCoverage: {
        owner: activeRoles.has("owner"),
        manager: activeRoles.has("manager"),
        staff: activeRoles.has("staff")
      },
      categoryCount: categories.length,
      menuItemCount: menuItems.length,
      visibleMenuItemCount: menuItems.filter((item) => item.isVisible).length,
      representativeTemplates: representativeTemplates.filter((template) => representativeTemplateSet.has(template)),
      orderSummary,
      latestSuccessfulPublicationAt: latestSnapshot?.publishedAt ?? null,
      lastPublicationStatus: publications[0]?.status ?? null
    };
  }
}

function section(id: string, label: string, checks: PilotReadinessCheck[]): PilotReadinessSection {
  return {
    id,
    label,
    status: summarizeStatus(checks.map((checkItem) => checkItem.status)),
    checks
  };
}

function check(
  id: string,
  label: string,
  status: PilotReadinessStatus,
  owner: string,
  evidence: string,
  runbookHref: string
): PilotReadinessCheck {
  return { id, label, status, owner, evidence, runbookHref };
}

function summarizeStatus(statuses: PilotReadinessStatus[]): PilotReadinessStatus {
  if (statuses.includes("action_required")) return "action_required";
  if (statuses.includes("manual_required")) return "manual_required";
  return "pass";
}

function templateLabel(template: ItemTemplate): string {
  const labels: Record<ItemTemplate, string> = {
    general: "일반",
    wine: "와인",
    whisky: "위스키",
    cocktail: "칵테일",
    food: "푸드",
    cigar: "시가",
    beer: "맥주",
    spirit: "증류주"
  };
  return labels[template];
}

function assertSystemAdmin(actor: AuthUserRecord): void {
  if (!actor.isSystemAdmin) {
    throw new AuthServiceError(403, "SYSTEM_ADMIN_REQUIRED", "시스템 관리자만 사용할 수 있습니다.");
  }
}
