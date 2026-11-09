// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BottomTabs } from "../bottom-tabs";
import { Sidebar } from "../sidebar";
import { MENU_LINKS, TABS } from "@/lib/nav";

vi.mock("next/navigation", () => ({ usePathname: () => "/gym/2026-11-10" }));
vi.mock("@/app/login/actions", () => ({ logout: vi.fn() }));

const labels = (nav: HTMLElement) => within(nav).getAllByRole("link").map((a) => a.textContent);

describe("phone bottom tabs and laptop sidebar", () => {
  it("show the same tabs in the same order", () => {
    const { unmount } = render(<BottomTabs />);
    const phone = labels(screen.getByRole("navigation", { name: "Main" }));
    unmount();
    render(<Sidebar />);
    const laptop = labels(screen.getByRole("navigation", { name: "Main" }));
    expect(phone).toEqual(TABS.map((t) => t.label));
    expect(laptop).toEqual(phone);
  });

  it("puts every menu link in the sidebar, because the top bar is hidden on a laptop", () => {
    render(<Sidebar />);
    expect(labels(screen.getByRole("navigation", { name: "More" }))).toEqual(MENU_LINKS.map((l) => l.label));
  });

  it("marks the current tab, including on its sub pages", () => {
    render(<Sidebar />);
    expect(screen.getByRole("link", { name: "Gym" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Home" })).not.toHaveAttribute("aria-current");
  });

  it("hides each one at the other's size", () => {
    const { container } = render(<><BottomTabs /><Sidebar /></>);
    expect(container.querySelector("nav.lg\\:hidden")).not.toBeNull();
    expect(container.querySelector("aside.hidden.lg\\:flex")).not.toBeNull();
  });
});
