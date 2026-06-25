import { foundationRoutes, type FoundationRoute } from "../../../contracts/foundation";

export type AdminRoute = FoundationRoute & {
  description: string;
  wireframe: string;
};

export const adminRoutes: AdminRoute[] = foundationRoutes.map((route) => ({
  ...route,
  wireframe:
    route.path === "/dashboard"
      ? "대시보드"
      : route.path === "/login"
        ? "로그인"
        : route.path === "/bars"
          ? "바 관리"
        : route.path === "/bars/new"
            ? "새 바 등록"
          : route.path === "/bars/{barId}"
              ? "바 상세"
            : route.path === "/bars/{barId}/members"
                ? "멤버 권한"
              : route.path === "/bars/{barId}/settings"
                  ? "바 설정"
                : route.path === "/bars/{barId}/categories"
                    ? "카테고리 관리"
                  : route.path === "/bars/{barId}/menus"
                      ? "메뉴 관리"
                    : route.path === "/bars/{barId}/menus/new" || route.path === "/bars/{barId}/menus/{menuItemId}"
                        ? "메뉴 편집"
                      : route.path === "/bars/{barId}/preview"
                          ? "고객 메뉴판 미리보기"
                        : route.path === "/bars/{barId}/publications"
                            ? "발행 관리"
                          : route.path === "/bars/{barId}/orders"
                              ? "테이블 운영"
                            : route.path === "/bars/{barId}/orders/new"
                                ? "테이블 생성"
                              : route.path === "/bars/{barId}/orders/{orderTabId}"
                                  ? "테이블 상세"
                                : route.path === "/bars/{barId}/settlements"
                                    ? "정산 내역"
                    : route.path === "/system/users"
                      ? "사용자 관리"
                    : route.path === "/system/audit"
                        ? "감사 로그"
                      : route.path === "/system/item-types"
                          ? "메뉴 유형 관리"
                        : route.path === "/system/badges"
                            ? "배지·색상 관리"
                            : "관리자 화면",
  description:
    route.status === "implemented"
      ? "계약, DB, API, 화면이 연결된 운영 화면입니다."
      : route.status === "foundation-only"
      ? "공통 관리자 레이아웃을 사용하는 보호 화면입니다."
      : "구현 전인 관리자 기능입니다."
}));

export function matchAdminRoute(pathname: string): AdminRoute {
  const matchedRoute = adminRoutes.find((route) => route.path === pathname);
  if (matchedRoute) return matchedRoute;

  if (/^\/bars\/[^/]+$/.test(pathname)) {
    const barDetailRoute = adminRoutes.find((route) => route.path === "/bars/{barId}");
    if (barDetailRoute) return barDetailRoute;
  }

  if (/^\/bars\/[^/]+\/members$/.test(pathname)) {
    const membersRoute = adminRoutes.find((route) => route.path === "/bars/{barId}/members");
    if (membersRoute) return membersRoute;
  }

  if (/^\/bars\/[^/]+\/settings$/.test(pathname)) {
    const settingsRoute = adminRoutes.find((route) => route.path === "/bars/{barId}/settings");
    if (settingsRoute) return settingsRoute;
  }

  if (/^\/bars\/[^/]+\/categories$/.test(pathname)) {
    const categoriesRoute = adminRoutes.find((route) => route.path === "/bars/{barId}/categories");
    if (categoriesRoute) return categoriesRoute;
  }

  if (/^\/bars\/[^/]+\/menus$/.test(pathname)) {
    const menusRoute = adminRoutes.find((route) => route.path === "/bars/{barId}/menus");
    if (menusRoute) return menusRoute;
  }

  if (/^\/bars\/[^/]+\/menus\/new$/.test(pathname)) {
    const menuNewRoute = adminRoutes.find((route) => route.path === "/bars/{barId}/menus/new");
    if (menuNewRoute) return menuNewRoute;
  }

  if (/^\/bars\/[^/]+\/menus\/[^/]+$/.test(pathname)) {
    const menuDetailRoute = adminRoutes.find((route) => route.path === "/bars/{barId}/menus/{menuItemId}");
    if (menuDetailRoute) return menuDetailRoute;
  }

  if (/^\/bars\/[^/]+\/preview$/.test(pathname)) {
    const previewRoute = adminRoutes.find((route) => route.path === "/bars/{barId}/preview");
    if (previewRoute) return previewRoute;
  }

  if (/^\/bars\/[^/]+\/publications$/.test(pathname)) {
    const publicationsRoute = adminRoutes.find((route) => route.path === "/bars/{barId}/publications");
    if (publicationsRoute) return publicationsRoute;
  }

  if (/^\/bars\/[^/]+\/orders$/.test(pathname)) {
    const ordersRoute = adminRoutes.find((route) => route.path === "/bars/{barId}/orders");
    if (ordersRoute) return ordersRoute;
  }

  if (/^\/bars\/[^/]+\/orders\/new$/.test(pathname)) {
    const orderNewRoute = adminRoutes.find((route) => route.path === "/bars/{barId}/orders/new");
    if (orderNewRoute) return orderNewRoute;
  }

  if (/^\/bars\/[^/]+\/orders\/[^/]+$/.test(pathname)) {
    const orderDetailRoute = adminRoutes.find((route) => route.path === "/bars/{barId}/orders/{orderTabId}");
    if (orderDetailRoute) return orderDetailRoute;
  }

  if (/^\/bars\/[^/]+\/settlements$/.test(pathname)) {
    const settlementsRoute = adminRoutes.find((route) => route.path === "/bars/{barId}/settlements");
    if (settlementsRoute) return settlementsRoute;
  }

  const fallbackRoute = adminRoutes.find((route) => route.path === "/dashboard") ?? adminRoutes[0];
  if (!fallbackRoute) throw new Error("Admin route manifest is empty");
  return fallbackRoute;
}
