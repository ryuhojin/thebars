import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CustomerApp } from "../../src/app/router/CustomerApp";

const menuFixture = {
  schemaVersion: 1,
  status: "published",
  revision: 12,
  publishedAt: "2026-06-23T00:00:00.000Z",
  generatedAt: "2026-06-23T00:00:00.000Z",
  contentHash: "0000000000000000000000000000000000000000000000000000000000000000",
  encodedSlug: "YmFyLWE3azJtOQ",
  bar: {
    name: "Sample Bar",
    intro: "공개 메뉴",
    currency: "KRW",
    address: "서울시 마포구 와우산로 00",
    phoneNumberDisplay: "02-1234-5678",
    businessHours: [],
    links: [{ label: "Instagram", url: "https://example.com/sample-bar" }]
  },
  categories: [
    {
      id: "cat_1",
      name: "Wine",
      children: [],
      items: [
        {
          id: "menu_1",
          name: "House Red",
          description: "Berry",
          soldOut: false,
          abv: null,
          prices: [{ label: "Glass", amountMinor: 12000, currency: "KRW" }],
          badges: [{ label: "추천", backgroundHex: "#725A3D", textColor: "#FFFFFF" }],
          fields: [{ label: "생산자", value: "Sample Winery" }]
        }
      ]
    },
    {
      id: "cat_2",
      name: "Empty",
      children: [],
      items: []
    }
  ]
};

function setViewport(width: number, height: number) {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: height });
  window.dispatchEvent(new Event("resize"));
}

function mockFetch(body: unknown, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(body), { status }))
  );
}

describe("customer menu single route shell", () => {
  it("loads public JSON and preserves search and expanded state during resize", async () => {
    mockFetch(menuFixture);
    window.history.pushState(null, "", "/YmFyLWE3azJtOQ");
    setViewport(1440, 900);

    render(<CustomerApp />);

    await waitFor(() => expect(screen.getByRole("heading", { level: 1, name: "Sample Bar" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "바 정보" }));
    expect(screen.getByText("02-1234-5678")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("메뉴 검색"), { target: { value: "House" } });
    fireEvent.click(screen.getByRole("button", { name: /House Red/ }));
    setViewport(390, 844);

    expect(window.location.pathname).toBe("/YmFyLWE3azJtOQ");
    expect(screen.getByLabelText("메뉴 검색")).toHaveValue("House");
    expect(screen.getByText("House Red")).toBeInTheDocument();
    expect(screen.getByText("생산자")).toBeInTheDocument();
  });

  it("resets only UI state after five idle minutes without changing the URL", async () => {
    mockFetch(menuFixture);
    window.history.pushState(null, "", "/YmFyLWE3azJtOQ");
    render(<CustomerApp />);

    await screen.findByRole("heading", { level: 1, name: "Sample Bar" });
    fireEvent.change(screen.getByLabelText("메뉴 검색"), { target: { value: "House" } });
    fireEvent.click(screen.getByRole("button", { name: /House Red/ }));

    vi.useFakeTimers();
    fireEvent.keyDown(window, { key: "H" });
    act(() => {
      vi.advanceTimersByTime(5 * 60 * 1000);
    });

    expect(window.location.pathname).toBe("/YmFyLWE3azJtOQ");
    expect(screen.getByLabelText("메뉴 검색")).toHaveValue("");
    expect(screen.getByRole("button", { name: /House Red/ })).toHaveAttribute("aria-expanded", "false");
  });

  it("shows not found and schema errors without internal links", async () => {
    mockFetch({}, 404);
    window.history.pushState(null, "", "/missing");
    render(<CustomerApp />);
    expect(await screen.findByRole("heading", { name: "메뉴판을 찾을 수 없습니다" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /관리자|로그인|주문|결제/ })).not.toBeInTheDocument();
  });

  it("renders preparing and network error states", async () => {
    mockFetch({ ...menuFixture, status: "preparing", categories: [] });
    window.history.pushState(null, "", "/YmFyLWE3azJtOQ");
    const { unmount } = render(<CustomerApp />);
    expect(await screen.findByText("첫 공개 전 준비 중인 메뉴판입니다.")).toBeInTheDocument();
    unmount();

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("network");
      })
    );
    window.history.pushState(null, "", "/network-error");
    render(<CustomerApp />);
    expect(await screen.findByRole("heading", { name: "메뉴판 오류" })).toBeInTheDocument();
  });
});
