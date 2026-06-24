import { z } from "zod";

export const foundationRouteSchema = z.object({
  path: z.string().min(1),
  label: z.string().min(1),
  area: z.enum(["auth", "operations", "system", "customer"]),
  auth: z.enum(["public", "protected", "system-admin"]),
  status: z.enum(["foundation-only", "implemented", "future-task"])
});

export const foundationManifestSchema = z.object({
  taskId: z.literal("D00"),
  routes: z.array(foundationRouteSchema),
  adapters: z.object({
    github: z.literal("fake-interface-only"),
    cloudflare: z.literal("fake-interface-only")
  }),
  responsiveContract: z.object({
    singleUrl: z.literal(true),
    viewportRedirects: z.literal(false),
    statePreservedOnResize: z.literal(true)
  })
});

export type FoundationRoute = z.infer<typeof foundationRouteSchema>;
export type FoundationManifest = z.infer<typeof foundationManifestSchema>;

export const foundationRoutes: FoundationRoute[] = [
  { path: "/setup", label: "최초 관리자 설정", area: "auth", auth: "public", status: "implemented" },
  { path: "/recovery", label: "관리자 복구", area: "auth", auth: "public", status: "implemented" },
  { path: "/login", label: "로그인", area: "auth", auth: "public", status: "implemented" },
  { path: "/change-password", label: "비밀번호 변경", area: "auth", auth: "protected", status: "implemented" },
  { path: "/dashboard", label: "대시보드", area: "operations", auth: "protected", status: "implemented" },
  { path: "/bars", label: "바 목록", area: "system", auth: "system-admin", status: "implemented" },
  { path: "/bars/new", label: "바 등록", area: "system", auth: "system-admin", status: "implemented" },
  { path: "/bars/{barId}", label: "바 개요", area: "system", auth: "system-admin", status: "implemented" },
  { path: "/bars/{barId}/members", label: "바 회원·권한", area: "system", auth: "system-admin", status: "implemented" },
  { path: "/bars/{barId}/settings", label: "바 기본 정보", area: "system", auth: "protected", status: "implemented" },
  { path: "/bars/{barId}/categories", label: "카테고리", area: "system", auth: "protected", status: "implemented" },
  { path: "/bars/{barId}/menus", label: "메뉴", area: "system", auth: "protected", status: "implemented" },
  { path: "/bars/{barId}/menus/new", label: "메뉴 등록", area: "system", auth: "protected", status: "implemented" },
  { path: "/bars/{barId}/menus/{menuItemId}", label: "메뉴 상세", area: "system", auth: "protected", status: "implemented" },
  { path: "/bars/{barId}/preview", label: "메뉴판 미리보기", area: "system", auth: "protected", status: "implemented" },
  { path: "/bars/{barId}/publications", label: "GitHub 발행", area: "system", auth: "protected", status: "implemented" },
  { path: "/bars/{barId}/orders", label: "주문 탭", area: "operations", auth: "protected", status: "implemented" },
  { path: "/bars/{barId}/orders/{orderTabId}", label: "주문 탭 상세", area: "operations", auth: "protected", status: "implemented" },
  { path: "/system/users", label: "사용자 계정", area: "system", auth: "system-admin", status: "implemented" },
  { path: "/system/audit", label: "감사 로그·보관", area: "system", auth: "system-admin", status: "implemented" },
  { path: "/system/item-types", label: "품목 유형·템플릿", area: "system", auth: "protected", status: "implemented" },
  { path: "/system/badges", label: "배지·색상", area: "system", auth: "protected", status: "implemented" }
];

export const d00FoundationManifest: FoundationManifest = {
  taskId: "D00",
  routes: foundationRoutes,
  adapters: {
    github: "fake-interface-only",
    cloudflare: "fake-interface-only"
  },
  responsiveContract: {
    singleUrl: true,
    viewportRedirects: false,
    statePreservedOnResize: true
  }
};
