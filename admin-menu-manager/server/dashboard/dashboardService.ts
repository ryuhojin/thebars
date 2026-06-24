import type { DashboardActivity, DashboardMetric, DashboardQuickAction, DashboardResponse } from "../../contracts/dashboard";
import { dashboardResponseSchema } from "../../contracts/dashboard";
import { toAuthUser } from "../auth/authService";
import type { AuthRepository, AuthUserRecord } from "../auth/repository";
import { toBarSummary } from "../bars/barService";
import type { BarRepository, BarStatusSummary } from "../bars/repository";
import type { MembershipRepository } from "../memberships/repository";

export class DashboardService {
  constructor(
    private readonly authRepository: AuthRepository,
    private readonly barRepository?: BarRepository,
    private readonly membershipRepository?: MembershipRepository
  ) {}

  async readDashboard(actor: AuthUserRecord, now = new Date()): Promise<DashboardResponse> {
    const mode = actor.isSystemAdmin ? "system-admin" : "bar-user";
    const [userSummary, barSummary, bars, activeMemberships] = await Promise.all([
      this.authRepository.readUserStatusSummary(now.toISOString()),
      this.barRepository?.readBarStatusSummary() ?? Promise.resolve({ totalBars: 0, activeBars: 0, inactiveBars: 0 }),
      actor.isSystemAdmin && this.barRepository ? this.barRepository.listBars() : this.readActorBars(actor),
      actor.isSystemAdmin || !this.membershipRepository
        ? Promise.resolve([])
        : this.membershipRepository.listActiveMembershipsForUser(actor.id)
    ]);
    const roleByBarId = new Map(activeMemberships.map((membership) => [membership.barId, membership.role]));

    const response: DashboardResponse = {
      actor: toAuthUser(actor),
      mode,
      selectedBarId: bars[0]?.id ?? null,
      accessibleBars: bars.map((bar) => {
        const summary = toBarSummary(bar);
        return {
          id: summary.id,
          name: summary.name,
          role: actor.isSystemAdmin ? ("system-admin" as const) : (roleByBarId.get(summary.id) ?? "staff"),
          status: summary.status,
          directPublishEnabled: summary.directPublishEnabled,
          href: `/bars/${summary.id}`
        };
      }),
      metrics: mode === "system-admin" ? systemAdminMetrics(userSummary, barSummary) : barUserMetrics(bars.length),
      quickActions: mode === "system-admin" ? systemAdminActions(this.barRepository !== undefined) : barUserActions(bars[0]?.id ?? null),
      activities: mode === "system-admin" ? systemAdminActivities(userSummary) : barUserActivities(),
      emptyState:
        bars.length === 0
          ? mode === "system-admin"
            ? {
                title: "등록된 바가 없습니다.",
                message: "바 등록을 완료하면 이 목록에 표시됩니다."
              }
            : {
                title: "접근 가능한 바가 없습니다.",
                message: "시스템 관리자가 바 소속을 부여하면 이 목록에 표시됩니다."
              }
          : null
    };

    return dashboardResponseSchema.parse(response);
  }

  private async readActorBars(actor: AuthUserRecord) {
    if (!this.barRepository || !this.membershipRepository) return [];
    const memberships = await this.membershipRepository.listActiveMembershipsForUser(actor.id);
    const bars = await Promise.all(memberships.map((membership) => this.barRepository?.findBarById(membership.barId)));
    return bars.filter((bar): bar is NonNullable<typeof bar> => bar !== null && bar !== undefined);
  }
}

function systemAdminMetrics(
  userSummary: {
    totalUsers: number;
    activeUsers: number;
    inactiveUsers: number;
    lockedUsers: number;
  },
  barSummary: BarStatusSummary
): DashboardMetric[] {
  return [
    {
      id: "bars-total",
      label: "운영 중 바",
      value: String(barSummary.activeBars),
      status: "available",
      tone: barSummary.inactiveBars > 0 ? "warning" : "good",
      description: `전체 ${barSummary.totalBars}개 · 비활성 ${barSummary.inactiveBars}개`,
      href: "/bars"
    },
    {
      id: "users-active",
      label: "활성 사용자",
      value: String(userSummary.activeUsers),
      status: "available",
      tone: userSummary.lockedUsers > 0 || userSummary.inactiveUsers > 0 ? "warning" : "good",
      description: `전체 ${userSummary.totalUsers}명 · 잠김 ${userSummary.lockedUsers}명 · 비활성 ${userSummary.inactiveUsers}명`,
      href: "/system/users"
    },
    {
      id: "publication-attention",
      label: "발행 주의",
      value: "-",
      status: "unavailable",
      tone: "warning",
      description: "주의가 필요한 발행 이력이 있으면 표시됩니다.",
      href: "/dashboard",
      unavailableReason: "주의 항목 없음"
    },
    {
      id: "orders-open",
      label: "열린 주문 탭",
      value: "-",
      status: "unavailable",
      tone: "neutral",
      description: "주문 운영이 시작되면 열린 주문과 계산 요청 수를 집계합니다.",
      href: "/dashboard",
      unavailableReason: "열린 주문 없음"
    }
  ];
}

function barUserMetrics(accessibleBarCount: number): DashboardMetric[] {
  return [
    {
      id: "accessible-bars",
      label: "접근 가능한 바",
      value: String(accessibleBarCount),
      status: "available",
      tone: accessibleBarCount > 0 ? "good" : "warning",
      description: accessibleBarCount > 0 ? "활성 바 소속 기준으로 표시됩니다." : "현재 계정에는 아직 바 소속이 없습니다.",
      href: "/dashboard"
    },
    {
      id: "unpublished-changes",
      label: "미발행 변경",
      value: "-",
      status: "unavailable",
      tone: "neutral",
      description: "메뉴 편집본과 최근 공개본이 다르면 표시됩니다.",
      unavailableReason: "비교할 발행본 없음"
    },
    {
      id: "orders-open",
      label: "열린 주문 탭",
      value: "-",
      status: "unavailable",
      tone: "neutral",
      description: "주문 운영이 시작되면 표시됩니다.",
      unavailableReason: "열린 주문 없음"
    },
    {
      id: "publication-latest",
      label: "최근 발행",
      value: "-",
      status: "unavailable",
      tone: "neutral",
      description: "최근 성공한 발행 결과가 있으면 표시됩니다.",
      unavailableReason: "발행 이력 없음"
    }
  ];
}

function systemAdminActions(canCreateBars: boolean): DashboardQuickAction[] {
  return [
    {
      id: "bar-new",
      label: "바 등록",
      href: "/bars/new",
      priority: "primary",
      status: canCreateBars ? "available" : "unavailable",
      unavailableReason: canCreateBars ? undefined : "바 등록 권한 없음"
    },
    {
      id: "user-create",
      label: "사용자 생성",
      href: "/system/users",
      priority: "secondary",
      status: "available"
    }
  ];
}

function barUserActions(selectedBarId: string | null): DashboardQuickAction[] {
  return [
    {
      id: "orders",
      label: "주문 탭 보기",
      href: selectedBarId ? `/bars/${selectedBarId}/orders` : "/dashboard",
      priority: "primary",
      status: selectedBarId ? "available" : "unavailable",
      unavailableReason: selectedBarId ? undefined : "접근 가능한 바 없음"
    },
    {
      id: "menus",
      label: "메뉴 관리",
      href: "/dashboard",
      priority: "secondary",
      status: "unavailable",
      unavailableReason: "작업 바를 먼저 선택하세요"
    }
  ];
}

function systemAdminActivities(userSummary: { inactiveUsers: number; lockedUsers: number }): DashboardActivity[] {
  const activities: DashboardActivity[] = [];
  if (userSummary.lockedUsers > 0) {
    activities.push({
      id: "locked-users",
      label: "잠긴 계정 있음",
      description: `${userSummary.lockedUsers}개 계정이 로그인 실패로 잠겨 있습니다.`,
      tone: "warning"
    });
  }
  if (userSummary.inactiveUsers > 0) {
    activities.push({
      id: "inactive-users",
      label: "비활성 사용자 있음",
      description: `${userSummary.inactiveUsers}개 계정이 비활성 상태입니다.`,
      tone: "neutral"
    });
  }
  if (activities.length === 0) {
    activities.push({
      id: "no-critical-identity-events",
      label: "계정 주의 항목 없음",
      description: "현재 잠긴 계정이나 비활성 사용자 알림이 없습니다.",
      tone: "neutral"
    });
  }
  return activities;
}

function barUserActivities(): DashboardActivity[] {
  return [
    {
      id: "membership-not-ready",
      label: "바 소속 대기",
      description: "시스템 관리자가 바 소속을 부여하면 운영 카드가 활성화됩니다.",
      tone: "neutral"
    }
  ];
}
