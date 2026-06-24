import { parsePublicMenu } from "../menu/parser";
import type { PublicMenu } from "../../contracts/publicMenu";

const inFlightReads = new Map<string, Promise<PublicMenu>>();

export type PublicMenuFetchErrorCode =
  | "MENU_NOT_FOUND"
  | "MENU_LOAD_FAILED"
  | "MENU_NETWORK_ERROR"
  | "MENU_SCHEMA_INCOMPATIBLE"
  | "MENU_SCHEMA_INVALID"
  | "MENU_UNSAFE_SOURCE";

export class PublicMenuFetchError extends Error {
  constructor(
    public readonly code: PublicMenuFetchErrorCode,
    message: string
  ) {
    super(message);
    this.name = "PublicMenuFetchError";
  }
}

export async function fetchPublicMenu(encodedSlug: string, jsonBase = import.meta.env.VITE_MENU_JSON_BASE ?? "/menus"): Promise<PublicMenu> {
  const url = buildPublicMenuJsonUrl(encodedSlug, jsonBase);
  const inFlight = inFlightReads.get(url);
  if (inFlight) return inFlight;

  const request = readPublicMenuJson(url).finally(() => {
    inFlightReads.delete(url);
  });
  inFlightReads.set(url, request);
  return request;
}

async function readPublicMenuJson(url: string): Promise<PublicMenu> {
  const response = await fetch(url, {
    cache: "no-cache",
    credentials: "omit",
    headers: { accept: "application/json" }
  }).catch(() => {
    throw new PublicMenuFetchError("MENU_NETWORK_ERROR", "메뉴판 네트워크 요청에 실패했습니다.");
  });

  if (!response.ok) {
    throw new PublicMenuFetchError(
      response.status === 404 ? "MENU_NOT_FOUND" : "MENU_LOAD_FAILED",
      response.status === 404 ? "메뉴판을 찾을 수 없습니다." : "메뉴판 JSON을 불러오지 못했습니다."
    );
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new PublicMenuFetchError("MENU_SCHEMA_INVALID", "메뉴판 JSON 형식이 올바르지 않습니다.");
  }

  if (!body || typeof body !== "object" || (body as { schemaVersion?: unknown }).schemaVersion !== 1) {
    throw new PublicMenuFetchError("MENU_SCHEMA_INCOMPATIBLE", "지원하지 않는 메뉴판 schemaVersion입니다.");
  }

  try {
    return parsePublicMenu(body);
  } catch {
    throw new PublicMenuFetchError("MENU_SCHEMA_INVALID", "메뉴판 JSON 검증에 실패했습니다.");
  }
}

export function buildPublicMenuJsonUrl(encodedSlug: string, jsonBase: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(encodedSlug)) {
    throw new PublicMenuFetchError("MENU_NOT_FOUND", "메뉴판을 찾을 수 없습니다.");
  }
  const normalizedBase = jsonBase.replace(/\/+$/, "");
  if (/\/api(?:\/|$)/.test(normalizedBase)) {
    throw new PublicMenuFetchError("MENU_UNSAFE_SOURCE", "고객 메뉴판은 관리자 API를 호출하지 않습니다.");
  }
  return `${normalizedBase}/${encodeURIComponent(encodedSlug)}.json`;
}
