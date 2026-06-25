import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { DashboardBar, DashboardResponse } from "../../../contracts/dashboard";
import type { CurrentBarPermissionsResponse } from "../../../contracts/memberships";
import { readDashboard } from "../../features/dashboard/dashboardApi";
import { readCurrentPermissions } from "../../features/memberships/membershipsApi";
import type { AdminRoute } from "../router/routes";
import { adminRoutes } from "../router/routes";

type AppShellProps = {
  route: AdminRoute;
  children: ReactNode;
};

export function AppShell({ route, children }: AppShellProps) {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [shellData, setShellData] = useState<ShellData>({ status: "loading" });
  const [selectedBarId, setSelectedBarId] = useState<string>(() => readStoredSelectedBarId());

  const currentBarId = extractBarId(window.location.pathname);

  useEffect(() => {
    let cancelled = false;
    readDashboard()
      .then((dashboard) => {
        if (cancelled) return;
        const nextSelected =
          currentBarId && dashboard.accessibleBars.some((bar) => bar.id === currentBarId)
            ? currentBarId
            : selectedBarId && dashboard.accessibleBars.some((bar) => bar.id === selectedBarId)
              ? selectedBarId
              : dashboard.selectedBarId ?? dashboard.accessibleBars[0]?.id ?? "";
        setSelectedBarId(nextSelected);
        writeStoredSelectedBarId(nextSelected);
        setShellData({ status: "ready", dashboard, permissions: null });
      })
      .catch(() => {
        if (!cancelled) setShellData({ status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [currentBarId]);

  useEffect(() => {
    let cancelled = false;
    if (shellData.status !== "ready" || !selectedBarId) return undefined;
    readCurrentPermissions(selectedBarId)
      .then((permissions) => {
        if (cancelled) return;
        setShellData((current) => (current.status === "ready" ? { ...current, permissions } : current));
      })
      .catch(() => {
        if (cancelled) return;
        setShellData((current) => (current.status === "ready" ? { ...current, permissions: null } : current));
      });
    return () => {
      cancelled = true;
    };
  }, [selectedBarId, shellData.status]);

  const accessibleBars = shellData.status === "ready" ? shellData.dashboard.accessibleBars : [];
  const selectedBar = accessibleBars.find((bar) => bar.id === selectedBarId) ?? null;
  const actorLabel = shellData.status === "ready" ? shellData.dashboard.actor.username : "확인 중";
  const navGroups = useMemo(
    () => buildNavGroups(route.path, selectedBar, shellData.status === "ready" ? shellData.dashboard : null, shellData.status === "ready" ? shellData.permissions : null),
    [route.path, selectedBar, shellData]
  );

  const updateSelectedBar = (barId: string) => {
    setSelectedBarId(barId);
    writeStoredSelectedBarId(barId);
    setShellData((current) => (current.status === "ready" ? { ...current, permissions: null } : current));
    const nextPath = replaceCurrentBarId(window.location.pathname, barId);
    if (nextPath !== window.location.pathname) navigate(nextPath);
  };

  return (
    <div className="app-shell" data-route={route.path}>
      <header className="topbar">
        <button
          className="icon-button drawer-toggle"
          type="button"
          aria-label="내비게이션 열기"
          aria-expanded={isDrawerOpen}
          onClick={() => setIsDrawerOpen((value) => !value)}
        >
          <span aria-hidden="true">☰</span>
        </button>
        <a className="brand" data-app-link href="/dashboard">
          THE BAR
        </a>
        <div className="route-meta">
          <span>관리자</span>
          <strong>{route.label}</strong>
        </div>
        <label className="bar-switcher">
          <span>현재 작업 바</span>
          <select
            aria-label="현재 작업 바"
            value={selectedBarId}
            disabled={accessibleBars.length === 0}
            onChange={(event) => updateSelectedBar(event.target.value)}
          >
            {accessibleBars.length === 0 ? <option value="">선택 가능한 바 없음</option> : null}
            {accessibleBars.map((bar) => (
              <option key={bar.id} value={bar.id}>
                {bar.name} · {roleLabel(bar.role)}
              </option>
            ))}
          </select>
        </label>
        <div className="account-chip" aria-label={`로그인 계정 ${actorLabel}`} title={actorLabel}>
          {actorLabel}
        </div>
      </header>

      <div className="shell-body">
        <nav className="sidebar" aria-label="관리자 주요 메뉴">
          <NavLinks activePath={route.path} groups={navGroups} />
        </nav>

        {isDrawerOpen ? (
          <div className="drawer-scrim" onClick={() => setIsDrawerOpen(false)}>
            <nav
              className="drawer"
              aria-label="Compact 관리자 주요 메뉴"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="drawer-header">
                <strong>THE BAR</strong>
                <button className="icon-button" type="button" aria-label="내비게이션 닫기" onClick={() => setIsDrawerOpen(false)}>
                  ×
                </button>
              </div>
              <NavLinks activePath={route.path} groups={navGroups} />
            </nav>
          </div>
        ) : null}

        <main className="content-shell">{children}</main>
      </div>
    </div>
  );
}

type ShellData =
  | { status: "loading" }
  | { status: "ready"; dashboard: DashboardResponse; permissions: CurrentBarPermissionsResponse | null }
  | { status: "error" };

type NavLinkItem = {
  key: string;
  path: string;
  href: string;
  label: string;
  status: AdminRoute["status"];
};

type NavGroup = {
  key: "home" | "bar" | "catalog" | "publication" | "orders" | "system";
  label: string;
  links: NavLinkItem[];
};

function NavLinks({ activePath, groups }: { activePath: string; groups: NavGroup[] }) {
  if (groups.length === 0) {
    return <p className="nav-empty">접근 가능한 메뉴가 없습니다.</p>;
  }
  return (
    <div className="nav-groups">
      {groups.map((group) => (
        <div className="nav-group" data-group={group.key} role="group" aria-labelledby={`nav-group-${group.key}`} key={group.key}>
          <p className="nav-group-label" id={`nav-group-${group.key}`}>
            {group.label}
          </p>
          <ul className="nav-list">
            {group.links.map((item) => (
              <li key={item.key}>
                <a
                  data-app-link
                  href={item.href}
                  className={isActiveNavItem(activePath, item.path) ? "nav-link is-active" : "nav-link"}
                  aria-current={isActiveNavItem(activePath, item.path) ? "page" : undefined}
                >
                  <span>{item.label}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function buildNavGroups(
  activePath: string,
  selectedBar: DashboardBar | null,
  dashboard: DashboardResponse | null,
  permissions: CurrentBarPermissionsResponse | null
): NavGroup[] {
  const routeByPath = new Map(adminRoutes.map((route) => [route.path, route]));
  const groups: NavGroup[] = [
    { key: "orders", label: "주문 운영", links: [] },
    { key: "publication", label: "고객 메뉴판", links: [] },
    { key: "catalog", label: "메뉴 관리", links: [] },
    { key: "bar", label: "바 운영", links: [] },
    { key: "system", label: "시스템 관리", links: [] },
    { key: "home", label: "운영 홈", links: [] }
  ];
  const isSystemAdmin = dashboard?.mode === "system-admin";
  const selectedPermissions =
    permissions && selectedBar && permissions.barId === selectedBar.id ? permissions.permissions : fallbackPermissionsForRole(selectedBar?.role);
  const canEditMenu = isSystemAdmin || Boolean(selectedPermissions?.canEditMenu);
  const canManageOrders = isSystemAdmin || Boolean(selectedPermissions?.canManageOrders);
  const canPublish = isSystemAdmin || (selectedBar?.role === "owner" && selectedBar.directPublishEnabled);
  const canReadSelectedBar = Boolean(selectedBar);
  const add = (groupKey: NavGroup["key"], path: string, href = path) => {
    const route = routeByPath.get(path);
    const group = groups.find((item) => item.key === groupKey);
    if (!route) return;
    group?.links.push({ key: `${path}:${href}`, path, href, label: route.label, status: route.status });
  };

  add("home", "/dashboard");
  if (isSystemAdmin) {
    add("bar", "/bars");
    add("system", "/system/users");
    add("system", "/system/audit");
  }

  if (selectedBar && canReadSelectedBar) {
    const barPrefix = `/bars/${encodeURIComponent(selectedBar.id)}`;
    add("bar", "/bars/{barId}", barPrefix);
    if (isSystemAdmin) add("bar", "/bars/{barId}/members", `${barPrefix}/members`);
    add("bar", "/bars/{barId}/settings", `${barPrefix}/settings`);
    if (canEditMenu) add("catalog", "/bars/{barId}/categories", `${barPrefix}/categories`);
    if (canEditMenu) add("catalog", "/bars/{barId}/menus", `${barPrefix}/menus`);
    add("publication", "/bars/{barId}/preview", `${barPrefix}/preview`);
    if (canPublish) add("publication", "/bars/{barId}/publications", `${barPrefix}/publications`);
    if (canManageOrders) {
      add("orders", "/bars/{barId}/orders", `${barPrefix}/orders`);
      add("orders", "/bars/{barId}/settlements", `${barPrefix}/settlements`);
    }
  } else if (activePath.startsWith("/bars/{barId}")) {
    add(groupKeyForPath(activePath), activePath, window.location.pathname);
  }

  if (isSystemAdmin || canEditMenu) {
    add("catalog", "/system/item-types");
    add("catalog", "/system/badges");
  }

  return groups.filter((group) => group.links.length > 0);
}

function groupKeyForPath(path: string): NavGroup["key"] {
  if (path.includes("/orders") || path.includes("/settlements")) return "orders";
  if (path.includes("/preview") || path.includes("/publications")) return "publication";
  if (path.includes("/categories") || path.includes("/menus") || path.includes("/item-types") || path.includes("/badges")) return "catalog";
  if (path.startsWith("/system")) return "system";
  if (path.startsWith("/bars")) return "bar";
  return "home";
}

function fallbackPermissionsForRole(role: DashboardBar["role"] | undefined): CurrentBarPermissionsResponse["permissions"] | null {
  if (!role) return null;
  if (role === "system-admin" || role === "owner" || role === "manager") {
    return {
      canEditMenu: true,
      canManageOrders: true,
      canAddCustomOrderItem: true,
      canApplyOrderAdjustment: true
    };
  }
  return {
    canEditMenu: false,
    canManageOrders: true,
    canAddCustomOrderItem: false,
    canApplyOrderAdjustment: false
  };
}

function roleLabel(role: DashboardBar["role"]): string {
  if (role === "system-admin") return "시스템 관리자";
  if (role === "owner") return "오너";
  if (role === "manager") return "매니저";
  return "스태프";
}

function isActiveNavItem(activePath: string, itemPath: string): boolean {
  if (itemPath === activePath) return true;
  if (itemPath === "/bars/{barId}/orders") {
    return (
      activePath === "/bars/{barId}/orders" ||
      activePath === "/bars/{barId}/orders/new" ||
      activePath === "/bars/{barId}/orders/{orderTabId}"
    );
  }
  if (itemPath === "/bars/{barId}/settlements") {
    return activePath === "/bars/{barId}/settlements";
  }
  if (itemPath === "/bars/{barId}/menus") {
    return (
      activePath === "/bars/{barId}/menus" ||
      activePath === "/bars/{barId}/menus/new" ||
      activePath === "/bars/{barId}/menus/{menuItemId}"
    );
  }
  return (
    itemPath === "/bars" &&
    (activePath === "/bars/{barId}" ||
      activePath === "/bars/{barId}/members" ||
      activePath === "/bars/{barId}/settings" ||
      activePath === "/bars/{barId}/categories" ||
      activePath === "/bars/{barId}/menus" ||
      activePath === "/bars/{barId}/menus/new" ||
      activePath === "/bars/{barId}/menus/{menuItemId}" ||
      activePath === "/bars/{barId}/preview" ||
      activePath === "/bars/{barId}/publications" ||
      activePath === "/bars/{barId}/orders" ||
      activePath === "/bars/{barId}/orders/new" ||
      activePath === "/bars/{barId}/orders/{orderTabId}" ||
      activePath === "/bars/{barId}/settlements")
  );
}

function extractBarId(pathname: string): string {
  const match = pathname.match(/^\/bars\/([^/]+)/);
  if (!match?.[1] || match[1] === "new") return "";
  return decodeURIComponent(match[1]);
}

function replaceCurrentBarId(pathname: string, nextBarId: string): string {
  const match = pathname.match(/^\/bars\/([^/]+)(.*)$/);
  if (!match?.[1] || match[1] === "new") return pathname;
  return `/bars/${encodeURIComponent(nextBarId)}${match[2] ?? ""}`;
}

function navigate(path: string): void {
  window.history.pushState(null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function readStoredSelectedBarId(): string {
  return window.localStorage.getItem("bar_ops_selected_bar_id") ?? "";
}

function writeStoredSelectedBarId(barId: string): void {
  if (barId) window.localStorage.setItem("bar_ops_selected_bar_id", barId);
  else window.localStorage.removeItem("bar_ops_selected_bar_id");
}
