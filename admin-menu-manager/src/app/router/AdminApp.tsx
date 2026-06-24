import { Suspense, lazy, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { AppShell } from "../layouts/AppShell";
import { matchAdminRoute } from "./routes";
import { useBrowserPath } from "./useBrowserPath";
import { AuthApiError, readSession } from "../../features/auth/authApi";
import { AuthRoutePage } from "../../features/auth/AuthScreens";

const AuditPage = lazy(() => import("../../features/audit/AuditPage").then((module) => ({ default: module.AuditPage })));
const BarSettingsPage = lazy(() => import("../../features/bars/BarSettingsPage").then((module) => ({ default: module.BarSettingsPage })));
const BarCreatePage = lazy(() => import("../../features/bars/BarsPages").then((module) => ({ default: module.BarCreatePage })));
const BarDetailPage = lazy(() => import("../../features/bars/BarsPages").then((module) => ({ default: module.BarDetailPage })));
const BarsListPage = lazy(() => import("../../features/bars/BarsPages").then((module) => ({ default: module.BarsListPage })));
const BadgesPage = lazy(() => import("../../features/badges/BadgesPage").then((module) => ({ default: module.BadgesPage })));
const CategoriesPage = lazy(() => import("../../features/categories/CategoriesPage").then((module) => ({ default: module.CategoriesPage })));
const DashboardPage = lazy(() => import("../../features/dashboard/DashboardPage").then((module) => ({ default: module.DashboardPage })));
const ItemTypesPage = lazy(() => import("../../features/itemTypes/ItemTypesPage").then((module) => ({ default: module.ItemTypesPage })));
const MembersPage = lazy(() => import("../../features/memberships/MembersPage").then((module) => ({ default: module.MembersPage })));
const MenuItemEditorPage = lazy(() => import("../../features/menuItems/MenuItemsPage").then((module) => ({ default: module.MenuItemEditorPage })));
const MenuItemsPage = lazy(() => import("../../features/menuItems/MenuItemsPage").then((module) => ({ default: module.MenuItemsPage })));
const OrderTabsPage = lazy(() => import("../../features/orderTabs/OrderTabsPage").then((module) => ({ default: module.OrderTabsPage })));
const PreviewPage = lazy(() => import("../../features/preview/PreviewPage").then((module) => ({ default: module.PreviewPage })));
const PublicationsPage = lazy(() => import("../../features/publications/PublicationsPage").then((module) => ({ default: module.PublicationsPage })));
const SystemUsersPage = lazy(() => import("../../features/systemUsers/SystemUsersPage").then((module) => ({ default: module.SystemUsersPage })));

export function AdminApp() {
  const rawPathname = useBrowserPath();
  const pathname = rawPathname === "/" ? "/dashboard" : rawPathname;
  const route = useMemo(() => matchAdminRoute(pathname), [pathname]);
  const navigate = useCallback((path: string) => {
    window.history.pushState(null, "", path);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, []);

  useEffect(() => {
    if (rawPathname === "/") replacePath("/dashboard");
  }, [rawPathname]);

  if (["/setup", "/login", "/change-password", "/recovery"].includes(pathname)) {
    return <AuthRoutePage pathname={pathname} navigate={navigate} />;
  }

  let content: ReactNode;

  if (pathname === "/dashboard") {
    content = <DashboardPage navigate={navigate} />;
  } else if (pathname === "/bars") {
    content = <BarsListPage navigate={navigate} />;
  } else if (pathname === "/bars/new") {
    content = <BarCreatePage navigate={navigate} />;
  } else if (pathname === "/system/users") {
    content = <SystemUsersPage navigate={navigate} />;
  } else if (pathname === "/system/audit") {
    content = <AuditPage navigate={navigate} />;
  } else if (pathname === "/system/item-types") {
    content = <ItemTypesPage navigate={navigate} />;
  } else if (pathname === "/system/badges") {
    content = <BadgesPage navigate={navigate} />;
  } else {
    const barMembersMatch = pathname.match(/^\/bars\/([^/]+)\/members$/);
    const barSettingsMatch = pathname.match(/^\/bars\/([^/]+)\/settings$/);
    const barCategoriesMatch = pathname.match(/^\/bars\/([^/]+)\/categories$/);
    const barMenusMatch = pathname.match(/^\/bars\/([^/]+)\/menus$/);
    const newMenuMatch = pathname.match(/^\/bars\/([^/]+)\/menus\/new$/);
    const menuDetailMatch = pathname.match(/^\/bars\/([^/]+)\/menus\/([^/]+)$/);
    const previewMatch = pathname.match(/^\/bars\/([^/]+)\/preview$/);
    const publicationsMatch = pathname.match(/^\/bars\/([^/]+)\/publications$/);
    const ordersMatch = pathname.match(/^\/bars\/([^/]+)\/orders$/);
    const orderDetailMatch = pathname.match(/^\/bars\/([^/]+)\/orders\/([^/]+)$/);
    const barDetailMatch = pathname.match(/^\/bars\/([^/]+)$/);

    if (barMembersMatch?.[1]) {
      content = <MembersPage barId={decodeURIComponent(barMembersMatch[1])} navigate={navigate} />;
    } else if (barSettingsMatch?.[1]) {
      content = <BarSettingsPage barId={decodeURIComponent(barSettingsMatch[1])} navigate={navigate} />;
    } else if (barCategoriesMatch?.[1]) {
      content = <CategoriesPage barId={decodeURIComponent(barCategoriesMatch[1])} navigate={navigate} />;
    } else if (barMenusMatch?.[1]) {
      content = <MenuItemsPage barId={decodeURIComponent(barMenusMatch[1])} navigate={navigate} />;
    } else if (newMenuMatch?.[1]) {
      content = <MenuItemEditorPage barId={decodeURIComponent(newMenuMatch[1])} navigate={navigate} />;
    } else if (menuDetailMatch?.[1] && menuDetailMatch[2]) {
      content = (
        <MenuItemEditorPage
          barId={decodeURIComponent(menuDetailMatch[1])}
          menuItemId={decodeURIComponent(menuDetailMatch[2])}
          navigate={navigate}
        />
      );
    } else if (previewMatch?.[1]) {
      content = <PreviewPage barId={decodeURIComponent(previewMatch[1])} navigate={navigate} />;
    } else if (publicationsMatch?.[1]) {
      content = <PublicationsPage barId={decodeURIComponent(publicationsMatch[1])} navigate={navigate} />;
    } else if (ordersMatch?.[1]) {
      content = <OrderTabsPage barId={decodeURIComponent(ordersMatch[1])} navigate={navigate} />;
    } else if (orderDetailMatch?.[1] && orderDetailMatch[2]) {
      content = (
        <OrderTabsPage
          barId={decodeURIComponent(orderDetailMatch[1])}
          orderTabId={decodeURIComponent(orderDetailMatch[2])}
          navigate={navigate}
        />
      );
    } else if (barDetailMatch?.[1]) {
      content = <BarDetailPage barId={decodeURIComponent(barDetailMatch[1])} navigate={navigate} />;
    } else {
      content = <NotFoundPage navigate={navigate} />;
    }
  }

  return (
    <ProtectedRoute pathname={pathname} navigate={navigate}>
      <ShellRoute route={route}>{content}</ShellRoute>
    </ProtectedRoute>
  );
}

function ProtectedRoute({
  pathname,
  navigate,
  children
}: {
  pathname: string;
  navigate: (path: string) => void;
  children: ReactNode;
}) {
  const [state, setState] = useState<"checking" | "ready" | "error">("checking");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    setState((current) => (current === "ready" ? "ready" : "checking"));
    setMessage("");
    readSession()
      .then((session) => {
        if (cancelled) return;
        if (session.user.forcedPasswordChange) {
          replacePath("/change-password");
          return;
        }
        setState("ready");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (error instanceof AuthApiError && ["AUTH_REQUIRED", "SESSION_EXPIRED"].includes(error.code)) {
          replacePath("/login");
          return;
        }
        setMessage(error instanceof Error ? error.message : "세션을 확인하지 못했습니다.");
        setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [pathname, navigate]);

  if (state === "ready") return <>{children}</>;
  if (state === "error") {
    return (
      <main className="auth-status-screen" aria-live="polite">
        <section className="auth-card auth-status-card">
          <p className="eyebrow">THE BAR</p>
          <h1>세션 확인 오류</h1>
          <p>{message}</p>
          <button className="button primary" type="button" onClick={() => navigate("/login")}>
            로그인으로 이동
          </button>
        </section>
      </main>
    );
  }
  return (
    <main className="auth-status-screen" aria-live="polite">
      <section className="auth-card auth-status-card">
        <p className="eyebrow">THE BAR</p>
        <h1>로그인 상태 확인 중</h1>
      </section>
    </main>
  );
}

function ShellRoute({ route, children }: { route: ReturnType<typeof matchAdminRoute>; children: ReactNode }) {
  return (
    <AppShell route={route}>
      <Suspense fallback={<RouteLoading />}>{children}</Suspense>
    </AppShell>
  );
}

function RouteLoading() {
  return (
    <section className="panel" role="status" aria-live="polite">
      화면을 불러오는 중입니다.
    </section>
  );
}

function NotFoundPage({ navigate }: { navigate: (path: string) => void }) {
  return (
    <div className="page-stack">
      <section className="hero-panel" aria-labelledby="not-found-title">
        <div>
          <p className="eyebrow">THE BAR</p>
          <h1 id="not-found-title">화면을 찾을 수 없습니다</h1>
          <p>주소를 확인하거나 대시보드에서 다시 이동하세요.</p>
        </div>
        <div className="status-box" role="status">
          <span>이동 안내</span>
          <strong>요청한 화면 없음</strong>
        </div>
      </section>

      <button className="button primary" type="button" onClick={() => navigate("/dashboard")}>
        대시보드로 이동
      </button>
    </div>
  );
}

function replacePath(path: string) {
  window.history.replaceState(null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}
